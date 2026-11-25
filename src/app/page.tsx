"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchAddress, type Place } from "@/lib/geo";
import { AGENT_META, PROFILES, type Profile } from "@/lib/scoring";

type Stage = "idle" | "collect" | "agents" | "moderator" | "done";
type AgentState = "wait" | "work" | "done";
const COLLECT_STEPS = 6; // number of step() calls in sources.collect()

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [profile, setProfile] = useState<Profile>("ausgewogen");
  const [stage, setStage] = useState<Stage>("idle");
  const [steps, setSteps] = useState<string[]>([]);
  const [agentsDone, setAgentsDone] = useState<string[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (place || q.trim().length < 3) return;
    timer.current = setTimeout(() => searchAddress(q).then(setHits).catch(() => setHits([])), 250);
  }, [q, place]);

  async function start() {
    if (!place) return;
    setStage("collect");
    setError(null);
    setSteps([]);
    setAgentsDone([]);
    setFromCache(false);
    window.scrollTo({ top: 0 });
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
          if (msg.step) {
            if (msg.agents) setStage("agents");
            else if (/^Moderator/.test(msg.step)) setStage("moderator");
            else if (/Zwischenspeicher/.test(msg.step)) setFromCache(true);
            setSteps((s) => [...s, msg.step]);
          }
          if (msg.agentDone) setAgentsDone((a) => [...a, msg.agentDone]);
          if (msg.error) throw new Error(msg.error);
          if (msg.done) {
            setStage("done");
            const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
            setTimeout(() => router.push(`/r/${msg.done}`), reduce ? 0 : 700);
            return;
          }
        }
      }
      throw new Error("Verbindung abgebrochen");
    } catch (e) {
      setError((e as Error).message || "Analyse fehlgeschlagen");
      setStage("idle");
    }
  }

  function pick(h: Place) {
    setPlace(h);
    setHits([]);
  }

  // Arrow keys move between input and suggestions.
  function onListKey(e: React.KeyboardEvent) {
    const items = [...(listRef.current?.querySelectorAll("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i <= 0 ? inputRef.current : items[i - 1])?.focus(); }
    if (e.key === "Escape") { setHits([]); inputRef.current?.focus(); }
  }

  const suggestions = place || q.trim().length < 3 ? [] : hits;
  const running = stage !== "idle";
  const doneCount = agentsDone.length;
  const progress =
    stage === "done" ? 100
    : stage === "moderator" ? 95
    : stage === "agents" ? 30 + Math.round((doneCount / AGENT_META.length) * 60)
    : fromCache ? 30 : Math.round((Math.min(steps.length, COLLECT_STEPS) / COLLECT_STEPS) * 30);
  const headline =
    stage === "done" ? `Fertig. Alle ${AGENT_META.length} haben geurteilt.`
    : stage === "moderator" ? "Der Moderator fasst zusammen …"
    : stage === "agents" ? "Die Agenten sind dran …"
    : "Daten werden gesammelt …";
  const agentState = (name: string): AgentState =>
    stage === "collect" ? "wait" : agentsDone.includes(name) ? "done" : "work";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 pb-8 sm:px-6">
      {!running && (
        <>
          <section className="flex flex-col items-center gap-[18px] pt-12 text-center sm:pt-16">
            <span className="rounded-full bg-surface px-3.5 py-2 text-[13px] font-bold text-blue-ink">Für jede Adresse in der Schweiz</span>
            <h1 className="max-w-[820px] text-[clamp(40px,6vw,76px)] font-extrabold leading-none tracking-[-0.045em]">
              Erst checken,
              <br />
              dann unterschreiben.
            </h1>
            <p className="max-w-[580px] text-lg leading-normal text-ink-2 sm:text-[19px]">
              Acht Agenten prüfen Lärm, ÖV, Schulen, Nachtleben, Risiken und was im Quartier gebaut wird. In einer Minute, jede Zahl mit Quelle.
            </p>
          </section>

          <section className="mx-auto mt-4 flex w-full max-w-[720px] flex-col gap-[22px] rounded-[32px] bg-surface p-5 shadow-[var(--shadow-lift)] sm:p-7">
            <div className="relative flex flex-col gap-2">
              <label htmlFor="addr" className="text-sm font-semibold">Adresse</label>
              <div className={`flex items-center gap-2.5 rounded-[18px] border-2 bg-surface-2 px-4 transition-colors ${place ? "border-blue" : "border-surface-2 focus-within:border-blue"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  id="addr"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="addr-list"
                  aria-autocomplete="list"
                  placeholder="z.B. Langstrasse 4, 8004 Zürich"
                  value={place?.label ?? q}
                  onChange={(e) => { setPlace(null); setQ(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); listRef.current?.querySelector("button")?.focus(); } }}
                  className="min-w-0 flex-1 bg-transparent py-4 text-[17px] text-ink outline-none placeholder:text-ink-3"
                  style={{ outline: "none" }}
                />
                {place && (
                  <button type="button" aria-label="Adresse löschen" onClick={() => { setPlace(null); setQ(""); inputRef.current?.focus(); }}
                    className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
              {suggestions.length > 0 && (
                <ul id="addr-list" ref={listRef} onKeyDown={onListKey} aria-label="Vorschläge"
                  className="absolute inset-x-0 top-[92px] z-20 rounded-[18px] bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(20,30,60,.35)]">
                  {suggestions.map((h) => (
                    <li key={`${h.e}-${h.n}-${h.label}`}>
                      <button type="button" onClick={() => pick(h)}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-left text-[15px] hover:bg-surface-2 focus-visible:bg-surface-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" aria-hidden="true" className="shrink-0">
                          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                        </svg>
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Wer zieht ein?</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROFILES.map((p) => {
                  const on = profile === p.id;
                  return (
                    <label key={p.id}
                      className={`flex min-h-16 cursor-pointer flex-col items-start gap-1 rounded-2xl border-2 px-3.5 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue ${on ? "border-blue bg-blue-tint" : "border-surface-2 bg-[#F7F8FB] hover:border-line"}`}>
                      <input type="radio" name="profile" className="sr-only" checked={on} onChange={() => setProfile(p.id)} />
                      <span className="text-[15px] font-bold">{p.id === "jung" ? "Junges Wohnen" : p.short}</span>
                      <span className="text-xs text-ink-3">{p.hint}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-ink-3">Das Profil ändert nur die Gewichtung im Fazit. Im Report kannst du jederzeit umschalten.</p>
            </fieldset>

            <button type="button" onClick={start} disabled={!place}
              className="min-h-14 rounded-[18px] text-[17px] font-bold transition-colors enabled:bg-blue enabled:text-white enabled:hover:bg-blue-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3">
              Standort analysieren
            </button>
            {!place && <p className="-mt-3 text-center text-xs text-ink-3">Wähle zuerst eine Adresse aus der Liste.</p>}
            {error && (
              <p role="alert" className="-mt-2 rounded-2xl bg-bad-tint px-4 py-3 text-sm font-medium text-bad-ink">{error}</p>
            )}
          </section>
        </>
      )}

      {running && (
        <>
          <section className="flex flex-col items-center gap-2.5 pt-12 text-center" aria-live="polite">
            <span className="text-sm font-semibold text-ink-3">{place?.label}</span>
            <h1 className="text-[clamp(32px,4.6vw,56px)] font-extrabold tracking-[-0.04em]">{headline}</h1>
            <div className="mt-2 h-2 w-80 max-w-[80%] overflow-hidden rounded-full bg-surface"
              role="progressbar" aria-label="Fortschritt der Analyse" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-blue transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="min-h-5 text-sm text-ink-3">{stage === "done" ? "Report wird geöffnet …" : steps.at(-1) ?? "Verbindung wird aufgebaut …"}</p>
          </section>

          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Status der Agenten">
            {AGENT_META.map((a) => {
              const st = agentState(a.name);
              return (
                <li key={a.id}
                  className={`flex flex-col gap-2 rounded-[22px] border-2 p-[18px] transition-all duration-300 ${st === "wait" ? "border-transparent bg-white/55" : st === "work" ? "border-blue bg-surface" : "border-transparent bg-surface"}`}>
                  <div className="flex items-center justify-between">
                    <StatusDot state={st} />
                    <span className={`text-xs font-semibold ${st === "done" ? "text-good-ink" : st === "work" ? "text-blue-ink" : "text-ink-3"}`}>
                      {st === "done" ? "Fertig" : st === "work" ? "Prüft …" : "Wartet"}
                    </span>
                  </div>
                  <span className="text-base font-bold">{a.name}</span>
                  <span className="text-[13px] leading-snug text-ink-3">{a.task}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: AgentState }) {
  if (state === "done")
    return (
      <span className="grid size-[22px] place-items-center rounded-full bg-good" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    );
  if (state === "work") return <span className="lb-spin size-[22px] rounded-full border-[3px] border-[#DCE3FF] border-t-blue" aria-hidden="true" />;
  return <span className="size-[22px] rounded-full border-2 border-dashed border-[#B8BFD0]" aria-hidden="true" />;
}
