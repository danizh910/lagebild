// Pure scoring helpers without server dependencies, so client components (profile switcher,
// analysis progress) can use them. agents.ts re-exports everything from here.

export type AgentId = "investor" | "familie" | "mobilitaet" | "umwelt" | "nachtleben" | "risiko" | "wohnqualitaet" | "quartier";
export type Profile = "ausgewogen" | "familie" | "jung" | "investor";

/** Display order and short task description, used on the start page while the agents run. */
export const AGENT_META: { id: AgentId; name: string; task: string }[] = [
  { id: "umwelt", name: "Umwelt & Lärm", task: "Lärmkataster und Luftwerte prüfen" },
  { id: "mobilitaet", name: "Mobilität", task: "ÖV-Güteklasse und Haltestellen" },
  { id: "familie", name: "Familie & Alltag", task: "Schulen, Kitas, Ärzte und Einkauf" },
  { id: "nachtleben", name: "Nachtleben & Störfaktoren", task: "Bars und Clubs im Umkreis" },
  { id: "investor", name: "Investor & Entwicklung", task: "Bauzone, Gebäude und Baugesuche" },
  { id: "risiko", name: "Risiko", task: "Naturgefahren, Radon, Schutzinventare" },
  { id: "wohnqualitaet", name: "Wohnqualität", task: "Sonne und Grünflächen" },
  { id: "quartier", name: "Quartier & Stimmung", task: "Bevölkerungsbefragung auswerten" },
];
export const AGENT_NAME = Object.fromEntries(AGENT_META.map((a) => [a.id, a.name])) as Record<AgentId, string>;

export const PROFILES: { id: Profile; label: string; short: string; hint: string }[] = [
  { id: "ausgewogen", label: "Ausgewogen", short: "Ausgewogen", hint: "Alles gleich wichtig" },
  { id: "familie", label: "Eigennutzer Familie", short: "Familie", hint: "Schule, Ruhe, Sicherheit" },
  { id: "jung", label: "Junges Wohnen", short: "Jung", hint: "ÖV, Ausgang, Quartier" },
  { id: "investor", label: "Investor", short: "Investor", hint: "Entwicklung, Risiko" },
];

export const PROFILE_WEIGHTS: Record<Profile, Record<AgentId, number>> = {
  ausgewogen: { investor: 1, familie: 1, mobilitaet: 1, umwelt: 1, nachtleben: 1, risiko: 1, wohnqualitaet: 1, quartier: 1 },
  familie: { investor: 0.5, familie: 3, mobilitaet: 1, umwelt: 2, nachtleben: 2, risiko: 1.5, wohnqualitaet: 1.5, quartier: 1.5 },
  jung: { investor: 0.5, familie: 0.3, mobilitaet: 2.5, umwelt: 0.8, nachtleben: 0.2, risiko: 1, wohnqualitaet: 1, quartier: 1 },
  investor: { investor: 3, familie: 1, mobilitaet: 1.5, umwelt: 1, nachtleben: 0.5, risiko: 2, wohnqualitaet: 0.8, quartier: 1.5 },
};
export const PROFILE_LABEL = Object.fromEntries(PROFILES.map((p) => [p.id, p.label])) as Record<Profile, string>;

export const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
export const avg = (xs: Array<number | null>, w?: number[]) => {
  let s = 0, t = 0;
  xs.forEach((x, i) => { if (x != null) { s += x * (w?.[i] ?? 1); t += w?.[i] ?? 1; } });
  return t ? clamp(s / t) : null;
};

export function overallScore(results: { id: AgentId; score: number | null }[], profile: Profile) {
  const w = PROFILE_WEIGHTS[profile];
  // "jung" sees nightlife as a plus, so invert the quiet score for that profile.
  return avg(
    results.map((r) => (r.score == null ? null : profile === "jung" && r.id === "nachtleben" ? 100 - r.score : r.score)),
    results.map((r) => w[r.id]),
  ) ?? 50;
}

/** Traffic-light band for a score. Always shown together with a text label, never colour alone. */
export function band(score: number | null) {
  if (score == null) return { key: "none", label: "Keine Daten" } as const;
  if (score >= 70) return { key: "good", label: "Stark" } as const;
  if (score >= 45) return { key: "warn", label: "Okay" } as const;
  return { key: "bad", label: "Achtung" } as const;
}

export function verdictLabel(score: number) {
  return score >= 75 ? "Starker Standort" : score >= 60 ? "Solide, mit Haken" : score >= 45 ? "Mit Vorbehalten" : "Nur für Mutige";
}
