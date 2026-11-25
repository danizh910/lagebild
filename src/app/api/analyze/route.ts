import { AGENTS, moderate, runAgent, type Profile } from "@/lib/agents";
import { findRecent, saveAnalysis, saveLogs } from "@/lib/db";
import type { Place } from "@/lib/geo";
import { collect, DATA_VERSION, type ApiLog } from "@/lib/sources";

export const maxDuration = 300;

const PROFILES: Profile[] = ["ausgewogen", "familie", "jung", "investor"];

/** Streams progress as NDJSON lines: {step} … then {done: id} or {error}. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const place = body?.place as Place | undefined;
  const profile: Profile = PROFILES.includes(body?.profile) ? body.profile : "ausgewogen";
  // Trust boundary: only accept plausible Swiss LV95 coordinates.
  if (!place || !(place.e > 2480000 && place.e < 2840000 && place.n > 1070000 && place.n < 1300000)) {
    return Response.json({ error: "Ungültige Adresse" }, { status: 400 });
  }
  const label = String(place.label ?? "").slice(0, 200);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const id = crypto.randomUUID().slice(0, 12);
      try {
        const logs: ApiLog[] = [];
        const log = (l: ApiLog) => logs.push(l);
        const cached = await findRecent(place.e, place.n);
        // Reuse only if OSM worked last time, otherwise try again for the missing amenities.
        // Also skip caches built by an older collector version (new sources added since).
        const osmOk = cached?.points.some((p) => p.key === "bars_300m" && p.value !== null);
        const fresh = cached?.points.some((p) => p.key === "data_version" && p.value === DATA_VERSION);
        const data = cached && osmOk && fresh
          ? (send({ step: "Daten aus Zwischenspeicher (weniger als 3 Wochen alt)" }), cached)
          : await collect({ ...place, label }, (step) => send({ step }));
        if ("logs" in data) logs.push(...data.logs);

        send({ step: "Agenten analysieren", agents: AGENTS.map((a) => a.name) });
        const agents = await Promise.all(
          AGENTS.map(async (def) => {
            const r = await runAgent(def, data.points, data.building, log);
            send({ agentDone: def.name });
            return r;
          }),
        );
        send({ step: "Moderator fasst zusammen" });
        const verdict = await moderate(agents, profile, label, log);
        await saveAnalysis({
          id, place: { ...place, label }, profile, status: "done",
          points: data.points, pois: data.pois, building: data.building, agents, verdict,
        });
        await saveLogs(id, logs).catch((err) => console.error("saving logs failed", err));
        send({ done: id });
      } catch (err) {
        console.error(err);
        send({ error: "Analyse fehlgeschlagen. Bitte später erneut versuchen." });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
