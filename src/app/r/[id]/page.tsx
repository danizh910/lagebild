import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PROFILE_LABEL, llmEnabled } from "@/lib/agents";
import { getAnalysis } from "@/lib/db";
import { SiteMap } from "@/components/site-map";
import { PrintButton } from "@/components/print-button";
import type { DataPoint, Poi } from "@/lib/sources";

function tone(score: number | null) {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-emerald-600 text-white";
  if (score >= 45) return "bg-amber-500 text-white";
  return "bg-rose-600 text-white";
}

function ScoreBadge({ score, big }: { score: number | null; big?: boolean }) {
  return (
    <span className={`inline-grid place-items-center rounded-md font-semibold tabular-nums ${tone(score)} ${big ? "size-20 text-3xl" : "size-11 text-base"}`}>
      {score ?? "–"}
    </span>
  );
}

const fmtVal = (p: DataPoint) =>
  p.value === null ? "nicht verfügbar" : p.value === true ? "ja" : p.value === false ? "nein" : `${p.value}${p.unit ? " " + p.unit : ""}`;

const CAT_COLOR: Record<string, string> = {
  Neubau: "bg-orange-600", "Aufstockung/Anbau": "bg-orange-500", Abbruch: "bg-rose-600",
  "Umbau/Sanierung": "bg-sky-600", Energie: "bg-emerald-600", "Kleinbauten/Umgebung": "bg-lime-600", Sonstiges: "bg-zinc-500",
};

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
    <section className="mt-10 break-inside-avoid">
      <h2 className="text-lg font-semibold">Bauaktivität im Umkreis</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Baugesuche im Umkreis von 500 m aus dem Amtsblatt des Kantons Zürich. Viele Neubau- und Aufstockungsgesuche zeigen, dass sich ein Quartier
        entwickelt, oft ein Frühindikator für steigende Preise. Ein Gesuch heisst nicht, dass auch gebaut wird.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        {kpis.map((p) => (
          <div key={p.key} className="rounded-lg border p-3">
            <div className="text-2xl font-semibold tabular-nums">{p.value ?? "–"}</div>
            <div className="text-xs text-muted-foreground">{p.label}</div>
          </div>
        ))}
      </div>
      {byCat.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {byCat.map(([c, k]) => (
            <span key={c} className="flex items-center gap-1.5 rounded border px-2 py-1">
              <span className={`size-2 rounded-full ${CAT_COLOR[c] ?? "bg-zinc-500"}`} />{c}: {k} <span className="text-muted-foreground">(24 Mt.)</span>
            </span>
          ))}
        </div>
      )}
      {list.length > 0 ? (
        <ul className="mt-4 divide-y rounded-lg border text-sm">
          {list.slice(0, 15).map((p) => (
            <li key={p.url} className="flex gap-3 p-3">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{new Date(p.date!).toLocaleDateString("de-CH")}</span>
              <span className={`mt-1 size-2 shrink-0 rounded-full ${CAT_COLOR[p.category!] ?? "bg-zinc-500"}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.category}</span> · {p.name}
                <span className="block text-xs text-muted-foreground">{p.address} · {p.dist} m</span>
              </span>
              <a href={p.url} target="_blank" rel="noopener" className="shrink-0 text-xs text-brand hover:underline print:hidden">Amtsblatt ↗</a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Keine Baugesuche mit Koordinaten im Umkreis gefunden.</p>
      )}
      {list.length > 15 && <p className="mt-2 text-xs text-muted-foreground">{list.length - 15} weitere auf der Karte (orange Punkte).</p>}
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
    <section className="mt-10 break-inside-avoid">
      <h2 className="text-lg font-semibold">Quartier-Analyse: {String(q.value)}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        So zufrieden sind die Bewohnerinnen und Bewohner selbst (Bevölkerungsbefragung Stadt Zürich 2023/25, Noten 1–6).
        Strich = Stadtschnitt, Pfeil = Veränderung seit 2019/21.
      </p>
      <div className="grid gap-x-8 gap-y-3 rounded-lg border p-5 sm:grid-cols-2">
        {rows.map((p) => {
          const v = p.value as number;
          const better = p.ref != null && v >= p.ref;
          return (
            <div key={p.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{p.label.replace("Zufriedenheit: ", "")}</span>
                <span className="tabular-nums">
                  <strong>{v}{p.unit === "%" ? "%" : ""}</strong>
                  {p.ref != null && <span className="text-xs text-muted-foreground"> / Stadt {p.ref}{p.unit === "%" ? "%" : ""}</span>}
                  {p.trend != null && p.trend !== 0 && (
                    <span className={`ml-1.5 text-xs ${p.trend > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {p.trend > 0 ? "▲" : "▼"} {Math.abs(p.trend)}
                    </span>
                  )}
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-muted">
                <div className={`h-2 rounded-full ${better ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${pct(p, v)}%` }} />
                {p.ref != null && <div className="absolute -top-0.5 h-3 w-0.5 bg-foreground" style={{ left: `${pct(p, p.ref)}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{rows[0].source.split(" · n=")[0]}</p>
    </section>
  );
}

export async function generateMetadata({ params }: PageProps<"/r/[id]">) {
  const a = await getAnalysis((await params).id);
  return { title: a ? `Lagebild: ${a.place.label}` : "Lagebild" };
}

export default function Page({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Report wird geladen …</div>}>
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
  const date = new Date(a.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
  const missing = a.points.filter((p) => p.value === null && p.category !== "meta");

  const timeline = [
    b?.baujahr && { year: String(b.baujahr), text: "Gebaut" },
    b?.heizungSeit && { year: b.heizungSeit.slice(-4), text: `Heizung erfasst: ${b.heizung ?? "unbekannt"}` },
    // Baugesuche for this parcel (within 30 m), oldest first
    ...a.pois.filter((p) => p.kind === "Baugesuch" && p.dist <= 30).sort((x, y) => (x.date! > y.date! ? 1 : -1))
      .map((p) => ({ year: p.date!.slice(0, 4), text: `Baugesuch: ${p.name.replace(/^BG Nr\. [^:]+:\s*/, "").slice(0, 70)}` })),
    { year: "heute", text: [b?.art, b?.geschosse && `${b.geschosse} Geschosse`, b?.wohnungen && `${b.wohnungen} Wohnungen`, b?.heizung].filter(Boolean).join(" · ") },
  ].filter(Boolean) as { year: string; text: string }[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand">Standort-Briefing</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{a.place.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Erstellt am {date} · Sicht: {PROFILE_LABEL[a.profile]} · Report-ID {a.id}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Fazit */}
      <section className="mt-8 grid gap-6 rounded-lg border bg-card p-6 md:grid-cols-[auto_1fr] break-inside-avoid">
        <div className="flex flex-col items-center gap-1">
          <ScoreBadge score={v.score} big />
          <span className="text-xs text-muted-foreground">Gesamt / 100</span>
        </div>
        <div>
          <h2 className="font-semibold">Fazit des Moderators</h2>
          <p className="mt-2 leading-relaxed">{v.summary}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {([["Chancen", v.chancen, "text-emerald-600"], ["Risiken", v.risiken, "text-rose-600"], ["Widersprüche", v.widersprueche, "text-amber-600"]] as const).map(([t, items, c]) => (
              <div key={t}>
                <h3 className={`text-sm font-medium ${c}`}>{t}</h3>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {items.length ? items.map((x, i) => <li key={i}>• {x}</li>) : <li>–</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!llmEnabled() && (
        <p className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground print:hidden">
          Hinweis: KI-Begründungen sind noch nicht aktiviert (kein Gemini- oder Anthropic-API-Schlüssel). Scores und Daten sind regelbasiert und vollständig.
        </p>
      )}

      {/* Karte */}
      <section className="mt-10 break-inside-avoid">
        <h2 className="mb-3 text-lg font-semibold">Karte</h2>
        <SiteMap lat={a.place.lat} lon={a.place.lon} pois={a.pois} />
      </section>

      <BaugesucheSection points={a.points} pois={a.pois} />

      <QuartierSection points={a.points} />

      {/* Agenten */}
      <section className="mt-10 print-break">
        <h2 className="mb-3 text-lg font-semibold">Die {a.agents.length} Sichten</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {a.agents.map((ag) => (
            <article key={ag.id} className="rounded-lg border p-5 break-inside-avoid">
              <div className="flex items-start gap-4">
                <ScoreBadge score={ag.score} />
                <div className="min-w-0">
                  <h3 className="font-semibold">{ag.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{ag.summary}</p>
                </div>
              </div>
              <details className="mt-3 text-sm" open>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground print:hidden">Details und Quellen</summary>
                <ul className="mt-2 space-y-1">
                  {ag.details.map((d, i) => <li key={i}>• {d}</li>)}
                </ul>
                <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                  {ag.usedKeys.map((k) => byKey[k] && (
                    <li key={k}><span className="font-mono">[{k}]</span> {byKey[k].label}: {fmtVal(byKey[k])} · {byKey[k].source}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      </section>

      {/* Gebäude */}
      <section className="mt-10 break-inside-avoid">
        <h2 className="mb-3 text-lg font-semibold">Gebäude-Historie</h2>
        {b ? (
          <div className="rounded-lg border p-5">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{t.year}</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              Quelle: Eidg. Gebäude- und Wohnungsregister (EGID {b.egid}{b.parzelle ? `, Parzelle ${b.parzelle}` : ""}
              {b.flaeche ? `, Grundfläche ${b.flaeche} m²` : ""}). Baugesuche (Kanton Zürich) ab Herbst 2024.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Kein Gebäude im Register an dieser Adresse gefunden.</p>
        )}
      </section>

      {/* Quellen */}
      <section className="mt-10 break-inside-avoid">
        <h2 className="mb-3 text-lg font-semibold">Alle Datenpunkte</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Datenpunkt</th><th className="p-2">Wert</th><th className="p-2">Quelle</th><th className="p-2">Abgerufen</th></tr>
            </thead>
            <tbody>
              {a.points.filter((p) => p.category !== "meta").map((p) => (
                <tr key={p.key} className="border-t">
                  <td className="p-2">{p.label}</td>
                  <td className={`p-2 tabular-nums ${p.value === null ? "text-muted-foreground italic" : ""}`}>{fmtVal(p)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{p.source}</td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(p.fetchedAt).toLocaleString("de-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">{missing.length} Datenpunkte waren beim Abruf nicht verfügbar und flossen nicht in die Bewertung ein.</p>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          Dieses Briefing ersetzt kein Gutachten und enthält bewusst keine Preisbewertung. Scores sind regelbasiert aus öffentlichen Daten berechnet.
        </p>
      </section>
    </div>
  );
}
