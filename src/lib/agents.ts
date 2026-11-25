import Anthropic from "@anthropic-ai/sdk";
import type { Building, DataPoint } from "./sources";

export type AgentId = "investor" | "familie" | "mobilitaet" | "umwelt" | "nachtleben" | "risiko" | "wohnqualitaet";
export type Profile = "ausgewogen" | "familie" | "jung" | "investor";

export type AgentResult = {
  id: AgentId;
  name: string;
  score: number | null; // null = zu wenig Daten
  summary: string;
  details: string[];
  usedKeys: string[]; // Verweise auf Datenpunkte
};

export type Verdict = {
  score: number;
  summary: string;
  chancen: string[];
  risiken: string[];
  widersprueche: string[];
};

// Scores are rule-based and deterministic: same data -> same score. That keeps them reproducible
// and explainable (important for banks later). The LLM only writes the reasoning text.
type Def = {
  id: AgentId;
  name: string;
  role: string;
  categories: string[];
  score: (v: Values) => number | null;
};

type Values = Record<string, DataPoint["value"]>;
const n = (v: DataPoint["value"]) => (typeof v === "number" ? v : null);
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
/** Linear map: `good` -> 100, `bad` -> 0. */
const lin = (x: number | null, good: number, bad: number) => (x == null ? null : clamp(((x - bad) / (good - bad)) * 100));
const avg = (xs: Array<number | null>, w?: number[]) => {
  let s = 0, t = 0;
  xs.forEach((x, i) => { if (x != null) { s += x * (w?.[i] ?? 1); t += w?.[i] ?? 1; } });
  return t ? clamp(s / t) : null;
};
const OEV: Record<string, number> = { A: 100, B: 80, C: 60, D: 40 };

export const AGENTS: Def[] = [
  {
    id: "umwelt", name: "Umwelt & Lärm", role: "Du bewertest Lärm- und Luftbelastung aus Sicht der Gesundheit und Wohnruhe.",
    categories: ["umwelt"],
    score: (v) => avg([
      lin(n(v.strassenlaerm_tag), 45, 70), lin(n(v.strassenlaerm_nacht), 35, 60), lin(n(v.bahnlaerm_tag), 45, 70),
      lin(n(v.no2), 10, 40), lin(n(v.pm25), 5, 15), v.fluglaerm === true ? 30 : v.fluglaerm === false ? 100 : null,
    ], [3, 2, 1, 2, 2, 1]),
  },
  {
    id: "mobilitaet", name: "Mobilität", role: "Du bewertest, wie gut der Standort ohne Auto erschlossen ist.",
    categories: ["mobilitaet"],
    score: (v) => avg([
      typeof v.oev_klasse === "string" ? OEV[v.oev_klasse[0]] ?? 15 : null,
      n(v.oev_haltestellen_400m) == null ? null : clamp(n(v.oev_haltestellen_400m)! * 12),
      lin(n(v.oev_naechste), 100, 800),
    ], [3, 1, 2]),
  },
  {
    id: "familie", name: "Familie & Alltag", role: "Du bewertest den Standort aus Sicht einer Familie mit Kindern: Schulen, Kitas, Ärzte, Einkauf, sicheres Umfeld.",
    categories: ["familie", "umwelt"],
    // Without the OSM amenities the noise term alone would dominate and mislead -> no score.
    score: (v) => v.kiga_600m == null ? null : avg([
      lin(n(v.schule_naechste), 300, 1500),
      n(v.kiga_600m) == null ? null : clamp(n(v.kiga_600m)! * 35),
      n(v.arzt_600m) == null ? null : clamp(n(v.arzt_600m)! * 25),
      n(v.einkauf_400m) == null ? null : clamp(n(v.einkauf_400m)! * 30),
      lin(n(v.strassenlaerm_tag), 45, 70),
    ], [2, 2, 1, 1, 1]),
  },
  {
    id: "nachtleben", name: "Nachtleben & Störfaktoren",
    role: "Du bewertest Nachtleben und mögliche Störungen. Score = Ruhe (100 = keine Störung). Erkläre ausdrücklich, dass viel Nachtleben für junge Leute ein Plus und für Familien ein Minus ist.",
    categories: ["nachtleben"],
    score: (v) => n(v.bars_300m) == null ? null : clamp(100 - n(v.bars_300m)! * 8 - (n(v.clubs_300m) ?? 0) * 25 - (n(v.clubs_600m) ?? 0) * 5),
  },
  {
    id: "investor", name: "Investor & Entwicklung",
    role: "Du bewertest das Entwicklungs- und Wertsteigerungspotenzial: Bauzone, Nachfragetreiber wie ÖV, Gebäudezustand (alte Heizung/altes Baujahr = Sanierungsbedarf, aber auch Potenzial).",
    categories: ["entwicklung", "gebaeude", "mobilitaet"],
    score: (v) => {
      if (v.bauzone == null && v.oev_klasse == null) return null;
      let s = 50;
      const z = String(v.bauzone ?? "");
      if (/Zentrum|Misch|Wohn/.test(z)) s += 15;
      if (/ausserhalb/.test(z)) s -= 15;
      const k = typeof v.oev_klasse === "string" ? v.oev_klasse[0] : "";
      if (k === "A" || k === "B") s += 15; else if (k === "C") s += 5;
      if (typeof v.heizung === "string" && /Heizöl|Gas/.test(v.heizung)) s += 5; // Sanierungshebel
      return clamp(s);
    },
  },
  {
    id: "risiko", name: "Risiko", role: "Du bist der Skeptiker. Du suchst Risiken: Naturgefahren, Radon, Schutzinventare (Einschränkungen bei Umbauten). Benenne auch, welche Risiken mangels Daten nicht geprüft werden konnten (z.B. kantonale Altlasten).",
    categories: ["risiko"],
    score: (v) => {
      const known = [v.radon, v.hochwasser, v.oberflaechenabfluss, v.isos].some((x) => x != null);
      if (!known) return null;
      let s = 100;
      if (v.hochwasser === true) s -= 35;
      if (v.oberflaechenabfluss === true) s -= 15;
      if (v.isos === true) s -= 10;
      const r = n(v.radon);
      if (r != null) s -= r >= 20 ? 20 : r >= 10 ? 10 : 0;
      return clamp(s);
    },
  },
  {
    id: "wohnqualitaet", name: "Wohnqualität", role: "Du bewertest Besonnung/Solarpotenzial und Grün- und Freizeitflächen in der Nähe.",
    categories: ["wohnqualitaet"],
    score: (v) => avg([
      n(v.solar_klasse) == null ? null : clamp(n(v.solar_klasse)! * 20),
      n(v.freizeit_600m) == null ? null : clamp(n(v.freizeit_600m)! * 12),
    ]),
  },
];

export const PROFILE_WEIGHTS: Record<Profile, Record<AgentId, number>> = {
  ausgewogen: { investor: 1, familie: 1, mobilitaet: 1, umwelt: 1, nachtleben: 1, risiko: 1, wohnqualitaet: 1 },
  familie: { investor: 0.5, familie: 3, mobilitaet: 1, umwelt: 2, nachtleben: 2, risiko: 1.5, wohnqualitaet: 1.5 },
  jung: { investor: 0.5, familie: 0.3, mobilitaet: 2.5, umwelt: 0.8, nachtleben: 0.2, risiko: 1, wohnqualitaet: 1 },
  investor: { investor: 3, familie: 1, mobilitaet: 1.5, umwelt: 1, nachtleben: 0.5, risiko: 2, wohnqualitaet: 0.8 },
};
export const PROFILE_LABEL: Record<Profile, string> = {
  ausgewogen: "Ausgewogen", familie: "Eigennutzer Familie", jung: "Junges Wohnen", investor: "Investor",
};

export function overallScore(results: AgentResult[], profile: Profile) {
  const w = PROFILE_WEIGHTS[profile];
  // "jung" sees nightlife as a plus, so invert the quiet score for that profile.
  return avg(
    results.map((r) => (r.score == null ? null : profile === "jung" && r.id === "nachtleben" ? 100 - r.score : r.score)),
    results.map((r) => w[r.id]),
  ) ?? 50;
}

// ---------------- LLM layer ----------------
const AGENT_MODEL = "claude-sonnet-5-5";
const MODERATOR_MODEL = "claude-opus-5-5";
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const llmEnabled = () => client !== null;

const fmt = (p: DataPoint) =>
  `- [${p.key}] ${p.label}: ${p.value === null ? "NICHT VERFÜGBAR" : `${p.value}${p.unit ? " " + p.unit : ""}`} (Quelle: ${p.source})`;

const RULES =
  "Antworte auf Deutsch in Schweizer Schreibweise (ss statt ß). Erfinde keine Fakten: Nutze nur die gelieferten Datenpunkte. " +
  "Fehlt ein Datenpunkt, sag das offen. Gib KEINE Preisschätzung in CHF ab. Antworte ausschliesslich mit JSON, ohne Markdown.";

async function askJson<T>(model: string, system: string, user: string): Promise<T> {
  const res = await client!.messages.create({
    model,
    max_tokens: 1500,
    system: [{ type: "text", text: `${system}\n\n${RULES}`, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
}

function templateText(def: Def, points: DataPoint[], score: number | null) {
  const have = points.filter((p) => p.value !== null);
  const missing = points.filter((p) => p.value === null);
  return {
    summary: score == null
      ? "Zu wenig Daten für eine Bewertung."
      : `Regelbasierte Bewertung aus ${have.length} Datenpunkten (KI-Begründung inaktiv, kein API-Schlüssel).`,
    details: [
      ...have.map((p) => `${p.label}: ${p.value === true ? "ja" : p.value === false ? "nein" : p.value}${p.unit ? " " + p.unit : ""}`),
      ...missing.map((p) => `${p.label}: Datenquelle nicht verfügbar`),
    ],
  };
}

export async function runAgent(def: Def, all: DataPoint[], building: Building | null): Promise<AgentResult> {
  const points = all.filter((p) => def.categories.includes(p.category));
  const values = Object.fromEntries(all.map((p) => [p.key, p.value]));
  const score = def.score(values);
  const usedKeys = points.map((p) => p.key);
  let text = templateText(def, points, score);
  if (client && score != null) {
    try {
      text = await askJson<{ summary: string; details: string[] }>(
        AGENT_MODEL,
        `Du bist der Agent „${def.name}“ in einem Standort-Briefing für Immobilien in der Schweiz. ${def.role}`,
        `Der Score (0–100) wurde regelbasiert berechnet: ${score}. Begründe ihn.\n` +
          `Datenpunkte:\n${points.map(fmt).join("\n")}\n` +
          (building && def.id === "investor" ? `Gebäude: ${JSON.stringify(building)}\n` : "") +
          `\nJSON-Format: {"summary": "1–2 Sätze Kernaussage", "details": ["3–5 kurze Punkte, jeweils mit Bezug auf einen Datenpunkt in eckigen Klammern, z.B. [no2]"]}`,
      );
    } catch (err) {
      console.warn(`agent ${def.id} llm failed`, err);
    }
  }
  return { id: def.id, name: def.name, score, ...text, usedKeys };
}

export async function moderate(results: AgentResult[], profile: Profile, address: string): Promise<Verdict> {
  const score = overallScore(results, profile);
  const scored = results.filter((r) => r.score != null);
  const fallback: Verdict = {
    score,
    summary: `Gesamtbewertung ${score}/100 aus Sicht „${PROFILE_LABEL[profile]}“, basierend auf ${scored.length} von ${results.length} Sichten.`,
    chancen: scored.filter((r) => r.score! >= 70).map((r) => `${r.name}: ${r.score}/100`),
    risiken: scored.filter((r) => r.score! < 45).map((r) => `${r.name}: ${r.score}/100`),
    widersprueche: [],
  };
  if (!client) return fallback;
  try {
    const out = await askJson<Omit<Verdict, "score">>(
      MODERATOR_MODEL,
      "Du bist der Moderator eines Standort-Briefings. Mehrere Fach-Agenten haben einen Standort bewertet. " +
        "Fasse ihre Sichten zusammen, gewichte sie gemäss Nutzerprofil und benenne Widersprüche zwischen den Agenten ausdrücklich " +
        "(z.B. gute ÖV-Anbindung, aber hoher Lärm). Schreibe klar und verständlich für Laien.",
      `Adresse: ${address}\nNutzerprofil: ${PROFILE_LABEL[profile]}\nGesamtscore (regelbasiert, gewichtet): ${score}\n\n` +
        results.map((r) => `## ${r.name} – Score ${r.score ?? "n/a"}\n${r.summary}\n${r.details.join("\n")}`).join("\n\n") +
        `\n\nJSON-Format: {"summary": "3–4 Sätze Fazit", "chancen": ["..."], "risiken": ["..."], "widersprueche": ["..."]}`,
    );
    return { score, ...out };
  } catch (err) {
    console.warn("moderator llm failed", err);
    return fallback;
  }
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("agents.ts")) {
  const v: Values = { strassenlaerm_tag: 45, strassenlaerm_nacht: 35, bahnlaerm_tag: 45, no2: 10, pm25: 5, fluglaerm: false };
  console.assert(AGENTS[0].score(v) === 100, "quiet place should be 100");
  console.assert(AGENTS[0].score({ ...v, strassenlaerm_tag: 70, strassenlaerm_nacht: 60, bahnlaerm_tag: 70, no2: 40, pm25: 15, fluglaerm: true })! < 15, "loud place should be low");
  console.assert(AGENTS[0].score({}) === null, "no data -> null");
  console.log("agents ok");
}
