"use client";

import { useState } from "react";
import { SiteMap } from "@/components/site-map";
import { SiteHeader } from "@/components/site-header";
import { band, overallScore, PROFILES, verdictLabel, type AgentId, type Profile } from "@/lib/scoring";
import type { Poi } from "@/lib/sources";

export type ViewAgent = {
  id: AgentId;
  name: string;
  score: number | null;
  summary: string;
  details: string[];
  sources: { key: string; label: string; value: string; source: string }[];
};

export type ViewVerdict = { summary: string; chancen: string[]; risiken: string[]; widersprueche: string[] };

type Props = {
  label: string;
  lat: number;
  lon: number;
  pois: Poi[];
  subline: string;
  analysedAt: string;
  agents: ViewAgent[];
  verdict: ViewVerdict;
  initialProfile: Profile;
  llmOff: boolean;
  actions: React.ReactNode;
  account: React.ReactNode;
  children: React.ReactNode;
};

const BAND_CLASS = {
  good: { text: "text-good-ink", tint: "bg-good-tint", bar: "bg-good" },
  warn: { text: "text-warn-ink", tint: "bg-warn-tint", bar: "bg-warn" },
  bad: { text: "text-bad-ink", tint: "bg-bad-tint", bar: "bg-bad" },
  none: { text: "text-ink-3", tint: "bg-surface-3", bar: "bg-empty" },
} as const;

export function ReportView(p: Props) {
  const [profile, setProfile] = useState<Profile>(p.initialProfile);
  const [open, setOpen] = useState<Set<AgentId>>(new Set());
  const [view, setView] = useState<"liste" | "stapel">("liste");
  const [idx, setIdx] = useState(0);

  const total = overallScore(p.agents, profile);
  const circ = 2 * Math.PI * 92;
  const profileMeta = PROFILES.find((x) => x.id === profile)!;
  const original = PROFILES.find((x) => x.id === p.initialProfile)!;
  const toggle = (id: AgentId) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const switcher = (
    <div role="group" aria-label="Profil für die Gewichtung"
      className="order-last flex w-full gap-1 overflow-x-auto rounded-full bg-surface-3 p-1 md:order-none md:w-auto print:hidden">
      {PROFILES.map((x) => (
        <button key={x.id} type="button" onClick={() => setProfile(x.id)} aria-pressed={profile === x.id}
          className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold sm:px-4 sm:text-sm transition-colors md:flex-none ${profile === x.id ? "bg-surface text-ink shadow-[0_2px_8px_rgba(20,30,60,.12)]" : "text-ink-2 hover:text-ink"}`}>
          {x.short}
        </button>
      ))}
    </div>
  );

  return (
    <div className="report-root mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
      <div className="print:hidden">
        <SiteHeader middle={switcher}>
          {p.actions}
          {p.account}
        </SiteHeader>
      </div>

      {/* Print-only title, the header is hidden in print */}
      <div className="hidden print:block">
        <p className="text-sm font-bold text-blue-ink">lagebild · Standort-Briefing</p>
        <p className="text-2xl font-extrabold">{p.label}</p>
        <p className="text-sm text-ink-3">{p.subline} · {p.analysedAt}</p>
      </div>

      {/* Hero: score + map */}
      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="verdict-h" className="lift print-card flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-[var(--r-card)] bg-surface p-6 sm:p-7 break-inside-avoid">
          <div className="flex items-center justify-between gap-2">
            <h2 id="verdict-h" className="text-lg font-semibold">Gesamturteil</h2>
            <span className="rounded-full bg-surface-3 px-2.5 py-1.5 text-xs font-semibold text-ink-2">{profileMeta.label}</span>
          </div>
          <div className="relative size-[200px] self-center sm:size-[220px]" role="img" aria-label={`Gesamtscore ${total} von 100: ${verdictLabel(total)}`}>
            <svg viewBox="0 0 220 220" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="110" cy="110" r="92" fill="none" stroke="var(--surface-3)" strokeWidth="18" />
              <circle cx="110" cy="110" r="92" fill="none" stroke="var(--accent)" strokeWidth="18" strokeLinecap="round"
                strokeDasharray={`${((circ * total) / 100).toFixed(1)} ${circ.toFixed(1)}`} style={{ transition: "stroke-dasharray .5s ease" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center" aria-live="polite">
              <div>
                <div className="text-[60px] font-extrabold leading-none tracking-[-0.05em] tabular-nums sm:text-[64px]">{total}</div>
                <div className="mt-1 text-[13px] font-medium text-ink-3">{verdictLabel(total)}</div>
              </div>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed text-ink-2">{p.verdict.summary}</p>
          {profile !== p.initialProfile && (
            <p className="rounded-2xl bg-blue-tint px-3.5 py-2.5 text-xs leading-snug text-ink-2 print:hidden">
              Score neu gewichtet für «{profileMeta.label}». Das Fazit oben hat der Moderator für «{original.label}» geschrieben.
            </p>
          )}
        </section>

        <section aria-label="Karte und Adresse" className="lift print-card flex min-w-0 flex-[2_1_600px] flex-col gap-2.5 rounded-[var(--r-card)] bg-surface p-2.5 break-inside-avoid">
          <SiteMap lat={p.lat} lon={p.lon} pois={p.pois} label={p.label} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 pb-2.5 pt-2">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold tracking-[-0.02em] sm:text-2xl">{p.label}</h1>
              <p className="mt-0.5 text-sm text-ink-3">{p.subline}</p>
            </div>
            <span className="rounded-full bg-surface-3 px-3 py-2 text-[13px] font-semibold text-ink-2">{p.analysedAt}</span>
          </div>
        </section>
      </div>

      {/* Moderator: Chancen, Risiken, Widersprüche */}
      <section aria-label="Chancen, Risiken und Widersprüche" className="print-card grid gap-6 rounded-[var(--r-card)] bg-surface p-6 sm:grid-cols-3 sm:p-7 break-inside-avoid">
        {([["Chancen", p.verdict.chancen, "text-good-ink", "bg-good"], ["Risiken", p.verdict.risiken, "text-bad-ink", "bg-bad"], ["Widersprüche", p.verdict.widersprueche, "text-warn-ink", "bg-warn"]] as const).map(([t, items, c, dot]) => (
          <div key={t}>
            <h3 className={`flex items-center gap-2 text-sm font-bold ${c}`}><span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />{t}</h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-snug text-ink-2">
              {items.length ? items.map((x, i) => <li key={i}>{x}</li>) : <li className="text-ink-3">Keine genannt.</li>}
            </ul>
          </div>
        ))}
      </section>

      {p.llmOff && (
        <p className="rounded-2xl border border-dashed border-line bg-white/50 p-3 text-xs text-ink-3 print:hidden">
          Hinweis: KI-Begründungen sind noch nicht aktiviert (kein Gemini- oder Anthropic-API-Schlüssel). Scores und Daten sind regelbasiert und vollständig.
        </p>
      )}

      {/* Agents */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-2 pt-4 print-break">
        <div>
          <h2 className="text-[28px] font-bold tracking-[-0.03em] sm:text-[32px]">Was die Agenten sagen</h2>
          <p className="mt-1 text-sm text-ink-3 print:hidden">Tippe auf einen Agenten für Begründung und Quellen.</p>
        </div>
        <div role="group" aria-label="Darstellung" className="flex rounded-full bg-surface-3 p-1 sm:hidden print:hidden">
          {(["liste", "stapel"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold capitalize ${view === v ? "bg-surface text-ink" : "text-ink-2"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 ${view === "stapel" ? "max-sm:hidden print:grid" : ""}`}>
        {p.agents.map((a) => (
          <AgentCard key={a.id} a={a} open={open.has(a.id)} onToggle={() => toggle(a.id)} profile={profile} />
        ))}
      </div>

      {view === "stapel" && (
        <div className="sm:hidden print:hidden">
          <AgentStack agents={p.agents} idx={idx} setIdx={setIdx} profile={profile} />
        </div>
      )}

      {p.children}
    </div>
  );
}

function Pills({ score, height = "h-[26px]" }: { score: number | null; height?: string }) {
  const n = score == null ? 0 : Math.round(score / 5);
  const b = BAND_CLASS[band(score).key];
  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={`${height} flex-1 rounded-[6px] ${i < n ? b.bar : "bg-empty"}`} />
      ))}
    </div>
  );
}

function NightNote({ a, profile }: { a: ViewAgent; profile: Profile }) {
  if (a.id !== "nachtleben" || profile !== "jung" || a.score == null) return null;
  return <p className="mt-2 text-xs text-ink-3">Für «Junges Wohnen» zählt viel Nachtleben als Plus ({100 - a.score} im Gesamtscore).</p>;
}

function Reasoning({ a }: { a: ViewAgent }) {
  return (
    <div className="flex flex-col gap-3 pt-4 text-left">
      <p className="text-[15px] leading-relaxed text-ink-2">{a.summary}</p>
      {a.details.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-snug text-ink-2">
          {a.details.map((d, i) => (
            <li key={i} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />{d}</li>
          ))}
        </ul>
      )}
      {a.sources.length > 0 && (
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs font-bold text-ink-2">Quellen</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-snug text-ink-3">
            {a.sources.map((s) => (
              <li key={s.key}><span className="font-medium text-ink-2">{s.label}:</span> {s.value} · {s.source}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AgentCard({ a, open, onToggle, profile }: { a: ViewAgent; open: boolean; onToggle: () => void; profile: Profile }) {
  const b = band(a.score);
  const cls = BAND_CLASS[b.key];
  const regionId = `agent-${a.id}`;
  return (
    <article className={`lift print-card rounded-[24px] border-2 bg-surface break-inside-avoid ${open ? "border-blue" : "border-surface"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={regionId}
        className="block w-full rounded-[22px] px-[22px] pb-[22px] pt-[22px] text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold">{a.name}</span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${cls.tint} ${cls.text}`}>{b.label}</span>
            <span className={`text-[26px] font-extrabold tabular-nums tracking-[-0.03em] ${cls.text}`}>
              {a.score ?? "–"}<span className="sr-only"> von 100</span>
            </span>
          </span>
        </span>
        <span className="mt-3.5 block"><Pills score={a.score} /></span>
        <span className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink-3 print:hidden">
          {open ? "Weniger" : "Begründung & Quellen"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"
            className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      <div id={regionId} className="lb-collapse" data-open={open}>
        <div className="px-[22px]" inert={!open}>
          <NightNote a={a} profile={profile} />
          <div className="pb-[22px]"><Reasoning a={a} /></div>
        </div>
      </div>
    </article>
  );
}

function AgentStack({ agents, idx, setIdx, profile }: { agents: ViewAgent[]; idx: number; setIdx: (i: number) => void; profile: Profile }) {
  const a = agents[idx];
  const b = band(a.score);
  const cls = BAND_CLASS[b.key];
  const go = (d: number) => setIdx((idx + d + agents.length) % agents.length);
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-lg font-bold" aria-live="polite">Agent {idx + 1} von {agents.length}</p>
      <div className="relative pb-3">
        <div className="absolute inset-x-5 bottom-0 top-4 rounded-[28px] bg-[#D7DCE8]" aria-hidden="true" />
        <div className="absolute inset-x-2.5 bottom-1.5 top-2 rounded-[28px] bg-surface-2" aria-hidden="true" />
        <article key={a.id} className="lb-rise relative flex flex-col gap-3.5 rounded-[28px] bg-surface p-6 shadow-[0_20px_40px_-24px_rgba(20,30,60,.4)]">
          <span className={`self-start rounded-full px-2.5 py-1.5 text-[13px] font-bold ${cls.tint} ${cls.text}`}>{b.label}</span>
          <h3 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{a.name}</h3>
          <div className="flex items-end gap-2">
            <span className={`text-[72px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums ${cls.text}`}>{a.score ?? "–"}</span>
            <span className="pb-2 text-[15px] text-ink-3">/ 100</span>
          </div>
          <Pills score={a.score} height="h-[22px]" />
          <NightNote a={a} profile={profile} />
          <Reasoning a={a} />
        </article>
      </div>
      <div className="flex gap-2.5 pt-2">
        <button type="button" onClick={() => go(-1)} aria-label="Vorheriger Agent"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-surface">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button type="button" onClick={() => go(1)}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-base font-bold text-white">
          Nächster Agent
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}
