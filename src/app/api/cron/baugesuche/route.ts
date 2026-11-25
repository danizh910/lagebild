import { syncBaugesuche, SOURCE } from "@/lib/baugesuche";
import { saveLogs } from "@/lib/db";

export const maxDuration = 300;

/** Daily Vercel cron: import new Baugesuche (Kanton ZH) and geocode pending ones. */
export async function GET(req: Request) {
  // Vercel sends "Authorization: Bearer $CRON_SECRET" for cron invocations.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const r = await syncBaugesuche(800);
    await saveLogs("cron", r.logs);
    return Response.json({ inserted: r.inserted, geocoded: r.geocoded, pending: r.pending });
  } catch (err) {
    await saveLogs("cron", [{ source: `${SOURCE} · Cron`, ok: false, ms: 0, error: String((err as Error).message).slice(0, 300) }]);
    return Response.json({ error: "sync failed" }, { status: 500 });
  }
}
