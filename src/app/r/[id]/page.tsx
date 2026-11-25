import { Suspense } from "react";
import { notFound } from "next/navigation";
import { llmEnabled } from "@/lib/agents";
import { getAnalysis } from "@/lib/db";
import { HeaderAccount } from "@/components/account";
import { ReportActions } from "@/components/report-actions";
import { ReportView, type ViewAgent } from "@/components/report-view";
import type { DataPoint, Poi } from "@/lib/sources";

const CARD = "print-card rounded-[var(--r-card)] bg-surface p-6 sm:p-7";
const H2 = "text-2xl font-bold tracking-[-0.03em]";
const LEAD = "mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-3";

const fmtVal = (p: DataPoint) =>
  p.value === null ? "nicht verfügbar" : p.value === true ? "ja" : p.value === false ? "nein" : `${p.value}${p.unit ? " " + p.unit : ""}`;

const CAT_COLOR: Record<string, string> = {
  Neubau: "#F2711C", "Aufstockung/Anbau": "#F59E0B", Abbruch: "#E5484D",
  "Umbau/Sanierung": "#2F5BFF", Energie: "#14A35A", "Kleinbauten/Umgebung": "#84CC16", Sonstiges: "#5B6480",
};
const Dot = ({ c }: { c?: string }) => <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[c ?? ""] ?? "#5B6480" }} aria-hidden="true" />;

/** Bauaktivität im Umkreis 500 m als Frühindikator (nur Kanton Zürich). */
function BaugesucheSection({ points, pois }: { points: DataPoint[]; pois: Poi[] }) {
  const total = points.find((p) => p.key === "bg_500m_12m");
  if (!total) return null;
  const list = pois.filter((p) => p.kind === "Baugesuch").sort((x, y) => (y.date! > x.date! ? 1 : -1));
  const byCat = Object.entries(
    list.reduce<Record<string, number>>((acc, p) => ((acc[p.category!] = (acc[p.category!] ?? 0) + 1), acc), {}),
  ).sort((x, y) => y[1] - x[1]);
  const kpis = ["bg_500m_12m", "bg_entwicklung_500m_12m", "bg_energie_500m_12m", "bg_trend"].map((k) => points.find((p) => p.key === k)!).filter(Boolean);
  return (
    <section className={`${CARD} break-inside-avoid`} aria-labelledby="bg-h">
      <h2 id="bg-h" className={H2}>Baugesuche im Umkreis</h2>
      <p className={LEAD}>
        Baugesuche im Umkreis von 500 m aus dem Amtsblatt des Kantons Zürich. Viele Neubau- und Aufstockungsgesuche zeigen, dass sich ein Quartier
        entwickelt, oft ein Frühindikator für steigende Preise. Ein Gesuch heisst nicht, dass auch gebaut wird.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((p) => (
          <div key={p.key} className="rounded-[var(--r-inner)] bg-surface-2 p-4">
            <div className="text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{p.value ?? "–"}</div>
            <div className="mt-2 text-xs leading-snug text-ink-3">{p.label}</div>
          </div>
        ))}
      </div>
      {byCat.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Nach Kategorie, 24 Monate">
          {byCat.map(([c, k]) => (
            <li key={c} className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-ink-2">
              <Dot c={c} />{c}: {k}
            </li>
          ))}
          <li className="px-1 py-1.5 font-normal text-ink-3">(24 Monate)</li>
        </ul>
      )}
      {list.length > 0 ? (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[var(--r-inner)] border border-line text-sm">
          {list.slice(0, 15).map((p) => (
            <li key={p.url} className="flex items-start gap-3 p-3.5">
              <span className="w-[78px] shrink-0 pt-0.5 text-xs tabular-nums text-ink-3">{new Date(p.date!).toLocaleDateString("de-CH")}</span>
              <span className="pt-1.5"><Dot c={p.category} /></span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.category}</span> · {p.name}
                <span className="block text-xs text-ink-3">{p.address} · {p.dist} m</span>
              </span>
              <a href={p.url} target="_blank" rel="noopener" className="-my-2 flex min-h-11 shrink-0 items-center px-1 text-xs font-semibold text-blue-ink hover:underline print:hidden">
                Amtsblatt<span className="sr-only"> (öffnet neues Fenster)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-3">Keine Baugesuche mit Koordinaten im Umkreis gefunden.</p>
      )}
      {list.length > 15 && <p className="mt-2 text-xs text-ink-3">{list.length - 15} weitere auf der Karte (orange Punkte).</p>}
    </section>
  );
}

/** Bewohner-Zufriedenheit im Quartier vs. Stadtschnitt, mit Trend (nur Stadt Zürich). */
function QuartierSection({ points }: { points: DataPoint[] }) {
  const q = points.find((p) => p.key === "quartier");
  const rows = points.filter((p) => p.key.startsWith("bvb_") && typeof p.value === "number");
  if (!q || !rows.length) return null;
  const pct = (p: DataPoint, x: number) => (p.unit === "%" ? x : ((x - 1) / 5) * 100);
  return (
    <section className={`${CARD} break-inside-avoid`} aria-labelledby="q-h">
      <h2 id="q-h" className={H2}>Quartier: {String(q.value)}</h2>
      <p className={LEAD}>
        So zufrieden sind die Bewohnerinnen und Bewohner selbst (Bevölkerungsbefragung Stadt Zürich 2023/25, Noten 1–6).
        Strich = Stadtschnitt, Pfeil = Veränderung seit 2019/21.
      </p>
      <div className="mt-5 grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {rows.map((p) => {
          const v = p.value as number;
          const better = p.ref != null && v >= p.ref;
          return (
            <div key={p.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{p.label.replace("Zufriedenheit: ", "")}</span>
                <span className="shrink-0 tabular-nums">
                  <strong>{v}{p.unit === "%" ? "%" : ""}</strong>
                  {p.ref != null && <span className="text-xs text-ink-3"> / Stadt {p.ref}{p.unit === "%" ? "%" : ""}</span>}
                  {p.trend != null && p.trend !== 0 && (
                    <span className={`ml-1.5 text-xs font-semibold ${p.trend > 0 ? "text-good-ink" : "text-bad-ink"}`}>
                      {p.trend > 0 ? "▲" : "▼"} {Math.abs(p.trend)}<span className="sr-only">{p.trend > 0 ? " besser" : " schlechter"} als 2019/21</span>
                    </span>
                  )}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-empty">
                <div className={`h-2.5 rounded-full ${better ? "bg-good" : "bg-warn"}`} style={{ width: `${pct(p, v)}%` }} />
                {p.ref != null && <div className="absolute -top-1 h-[18px] w-[3px] rounded-full bg-ink" style={{ left: `${pct(p, p.ref)}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-3">{rows[0].source.split(" · n=")[0]}</p>
    </section>
  );
}

export async function generateMetadata({ params }: PageProps<"/r/[id]">) {
  const a = await getAnalysis((await params).id);
  return { title: a ? `Lagebild: ${a.place.label}` : "Lagebild" };
}

export default function Page({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1360px] px-6 py-16 text-center text-ink-3">Report wird geladen …</div>}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAnalysis((await params).id);
  if (!a) notFound();
  const v = a.verdict!;
  const byKey = Object.fromEntries(a.points.map((p) => [p.key, p]));
  const b = a.building;
  const date = new Date(a.created_at).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
  const missing = a.points.filter((p) => p.value === null && p.category !== "meta");

  const agents: ViewAgent[] = a.agents.map((ag) => ({
    id: ag.id, name: ag.name, score: ag.score, summary: ag.summary, details: ag.details,
    sources: ag.usedKeys.filter((k) => byKey[k]).map((k) => ({ key: k, label: byKey[k].label, value: fmtVal(byKey[k]), source: byKey[k].source })),
  }));

  const quartier = byKey.quartier?.value;
  const subline = [
    quartier ? `Quartier ${quartier}` : null,
    b?.kanton ? `Kanton ${b.kanton}` : null,
    b?.art,
    `Report ${a.id}`,
  ].filter(Boolean).join(" · ");

  const timeline = [
    b?.baujahr && { year: String(b.baujahr), text: "Gebaut" },
    b?.heizungSeit && { year: b.heizungSeit.slice(-4), text: `Heizung erfasst: ${b.heizung ?? "unbekannt"}` },
    // Baugesuche for this parcel (within 30 m), oldest first
    ...a.pois.filter((p) => p.kind === "Baugesuch" && p.dist <= 30).sort((x, y) => (x.date! > y.date! ? 1 : -1))
      .map((p) => ({ year: p.date!.slice(0, 4), text: `Baugesuch: ${p.name.replace(/^BG Nr\. [^:]+:\s*/, "").slice(0, 70)}` })),
    { year: "heute", text: [b?.art, b?.geschosse && `${b.geschosse} Geschosse`, b?.wohnungen && `${b.wohnungen} Wohnungen`, b?.heizung].filter(Boolean).join(" · ") },
  ].filter(Boolean) as { year: string; text: string }[];

  const facts = b ? ([
    ["Baujahr", b.baujahr ?? b.bauperiode],
    ["Geschosse", b.geschosse],
    ["Wohnungen", b.wohnungen],
    ["Grundfläche", b.flaeche && `${b.flaeche} m²`],
    ["Heizung", b.heizung],
    ["Gebäudeart", b.art],
  ] as const).filter(([, x]) => x != null && x !== "") : [];

  return (
    <ReportView
      label={a.place.label}
      lat={a.place.lat}
      lon={a.place.lon}
      pois={a.pois}
      subline={subline}
      analysedAt={`Analysiert am ${date}`}
      agents={agents}
      verdict={{ summary: v.summary, chancen: v.chancen, risiken: v.risiken, widersprueche: v.widersprueche }}
      initialProfile={a.profile}
      llmOff={!llmEnabled()}
      actions={<ReportActions id={a.id} ownerId={a.user_id} />}
      account={<HeaderAccount />}
    >
      <h2 className="px-2 pt-6 text-[28px] font-bold tracking-[-0.03em] sm:text-[32px] print-break">Hintergrund</h2>

      {/* Gebäude */}
      <section className={`${CARD} break-inside-avoid`} aria-labelledby="geb-h">
        <h2 id="geb-h" className={H2}>Gebäudedaten</h2>
        {b ? (
          <>
            {facts.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {facts.map(([k, x]) => (
                  <div key={k} className="rounded-[var(--r-inner)] bg-surface-2 p-4">
                    <dt className="text-xs text-ink-3">{k}</dt>
                    <dd className="mt-1 text-[17px] font-bold leading-tight">{String(x)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3 text-sm" aria-label="Gebäude-Historie">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-ink-3" aria-hidden="true">→</span>}
                  <span className="rounded-full bg-blue-tint px-2.5 py-1 text-xs font-bold tabular-nums text-blue-ink">{t.year}</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-ink-3">
              Quelle: Eidg. Gebäude- und Wohnungsregister (EGID {b.egid}{b.parzelle ? `, Parzelle ${b.parzelle}` : ""}). Baugesuche (Kanton Zürich) ab Herbst 2024.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Kein Gebäude im Register an dieser Adresse gefunden.</p>
        )}
      </section>

      <BaugesucheSection points={a.points} pois={a.pois} />

      <QuartierSection points={a.points} />

      {/* Quellen */}
      <section className={CARD} aria-labelledby="src-h">
        <h2 id="src-h" className={H2}>Alle Datenpunkte</h2>
        <p className={LEAD}>Jede Zahl im Report mit Quelle und Abrufzeit.</p>
        <div className="mt-5 overflow-x-auto rounded-[var(--r-inner)] border border-line" tabIndex={0} role="region" aria-label="Tabelle aller Datenpunkte">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-3">
              <tr><th className="p-3 font-semibold">Datenpunkt</th><th className="p-3 font-semibold">Wert</th><th className="p-3 font-semibold">Quelle</th><th className="p-3 font-semibold">Abgerufen</th></tr>
            </thead>
            <tbody>
              {a.points.filter((p) => p.category !== "meta").map((p) => (
                <tr key={p.key} className="border-t border-line break-inside-avoid">
                  <td className="p-3">{p.label}</td>
                  <td className={`p-3 tabular-nums ${p.value === null ? "italic text-ink-3" : "font-semibold"}`}>{fmtVal(p)}</td>
                  <td className="p-3 text-xs text-ink-3">{p.source}</td>
                  <td className="p-3 text-xs text-ink-3">{new Date(p.fetchedAt).toLocaleString("de-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <p className="mt-3 text-xs text-ink-3">{missing.length} Datenpunkte waren beim Abruf nicht verfügbar und flossen nicht in die Bewertung ein.</p>
        )}
        <p className="mt-5 text-xs text-ink-3">
          Dieses Briefing ersetzt kein Gutachten und enthält bewusst keine Preisbewertung. Scores sind regelbasiert aus öffentlichen Daten berechnet.
        </p>
      </section>
    </ReportView>
  );
}
