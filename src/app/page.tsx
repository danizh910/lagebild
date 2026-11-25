"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchAddress, type Place } from "@/lib/geo";

const PROFILES = [
  { id: "ausgewogen", label: "Ausgewogen" },
  { id: "familie", label: "Familie" },
  { id: "jung", label: "Junges Wohnen" },
  { id: "investor", label: "Investor" },
] as const;

const AGENT_NAMES = ["Umwelt & Lärm", "Mobilität", "Familie & Alltag", "Nachtleben & Störfaktoren", "Investor & Entwicklung", "Risiko", "Wohnqualität", "Quartier & Stimmung"];

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [profile, setProfile] = useState<(typeof PROFILES)[number]["id"]>("ausgewogen");
  const [steps, setSteps] = useState<string[]>([]);
  const [agentsDone, setAgentsDone] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (place || q.trim().length < 3) return setHits([]);
    timer.current = setTimeout(() => searchAddress(q).then(setHits).catch(() => setHits([])), 250);
  }, [q, place]);

  async function start() {
    if (!place) return;
    setRunning(true);
    setError(null);
    setSteps([]);
    setAgentsDone([]);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ place, profile }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Analyse fehlgeschlagen");
      if (!res.body) throw new Error();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const msg = JSON.parse(line);
          if (msg.step) setSteps((s) => [...s, msg.step]);
          if (msg.agentDone) setAgentsDone((a) => [...a, msg.agentDone]);
          if (msg.error) throw new Error(msg.error);
          if (msg.done) return router.push(`/r/${msg.done}`);
        }
      }
      throw new Error("Verbindung abgebrochen");
    } catch (e) {
      setError((e as Error).message || "Analyse fehlgeschlagen");
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand">Standort-Briefing</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Ist dieser Standort gut – und für wen?</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Acht KI-Agenten prüfen jede Schweizer Adresse aus ihrer Sicht: Lärm, Luft, ÖV, Familie, Nachtleben, Risiken, Stimmung im Quartier und
        Entwicklung. Jede Aussage mit Quelle und Datum.
      </p>

      <div className="mt-10 rounded-lg border bg-card p-5 shadow-sm">
        <label className="text-sm font-medium" htmlFor="addr">Adresse</label>
        <div className="relative mt-2">
          <Input
            id="addr"
            autoComplete="off"
            placeholder="z.B. Langstrasse 4, 8004 Zürich"
            value={place?.label ?? q}
            disabled={running}
            onChange={(e) => { setPlace(null); setQ(e.target.value); }}
            className="h-11 text-base"
          />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md" role="listbox">
              {hits.map((h) => (
                <li key={`${h.e}-${h.n}-${h.label}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => { setPlace(h); setHits([]); }}
                  >
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="mt-5" disabled={running}>
          <legend className="text-sm font-medium">Aus welcher Sicht?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROFILES.map((p) => (
              <label key={p.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${profile === p.id ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}>
                <input type="radio" name="profile" className="sr-only" checked={profile === p.id} onChange={() => setProfile(p.id)} />
                {p.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Die Sicht ändert nur die Gewichtung im Fazit, nicht die einzelnen Bewertungen.</p>
        </fieldset>

        <Button className="mt-6 h-11 w-full text-base" disabled={!place || running} onClick={start}>
          {running ? "Analyse läuft …" : "Standort analysieren"}
        </Button>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      </div>

      {running && (
        <div className="mt-6 grid gap-6 rounded-lg border p-5 sm:grid-cols-2" aria-live="polite">
          <div>
            <h2 className="text-sm font-medium">Daten</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-brand">✓</span>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-medium">Agenten</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {AGENT_NAMES.map((a) => (
                <li key={a} className={agentsDone.includes(a) ? "" : "animate-pulse text-muted-foreground"}>
                  {agentsDone.includes(a) ? "✓ " : "○ "}{a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
