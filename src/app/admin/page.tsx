import { Suspense } from "react";
import Link from "next/link";
import { llmProvider } from "@/lib/agents";
import { recentAnalyses, recentLogs, sourceStats } from "@/lib/db";

export const metadata = { title: "Admin – Lagebild" };

const dt = (s: string) => new Date(s).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Suspense fallback={<p className="mt-6 text-muted-foreground">Lade …</p>}>
        <Admin />
      </Suspense>
    </div>
  );
}

async function Admin() {
  const [stats, logs, analyses] = await Promise.all([sourceStats(7), recentLogs(80), recentAnalyses(20)]);
  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        KI-Anbieter: <strong>{llmProvider() ?? "keiner (nur Vorlagentexte)"}</strong> · Datenquellen der letzten 7 Tage
      </p>

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Datenquellen</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Quelle</th><th className="p-2">Erfolg</th><th className="p-2">Aufrufe</th><th className="p-2">Ø ms</th><th className="p-2">Letzter Aufruf</th><th className="p-2">Letzter Fehler</th></tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const rate = Math.round((s.ok_calls / s.calls) * 100);
                return (
                  <tr key={s.source} className="border-t">
                    <td className="p-2 font-mono text-xs">{s.source}</td>
                    <td className="p-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium text-white ${rate >= 95 ? "bg-emerald-600" : rate >= 60 ? "bg-amber-500" : "bg-rose-600"}`}>{rate}%</span>
                    </td>
                    <td className="p-2 tabular-nums">{s.calls}</td>
                    <td className="p-2 tabular-nums">{s.avg_ms}</td>
                    <td className="p-2 text-xs text-muted-foreground">{dt(s.last_call)}</td>
                    <td className="max-w-xs truncate p-2 text-xs text-rose-600" title={s.last_error ?? ""}>{s.last_error ?? ""}</td>
                  </tr>
                );
              })}
              {!stats.length && <tr><td className="p-3 text-muted-foreground" colSpan={6}>Noch keine Aufrufe protokolliert.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Letzte Analysen</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {analyses.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-2">
                <Link href={`/r/${a.id}`} className="truncate hover:underline">{a.label}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">{a.profile} · {a.score ?? "–"} · {dt(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Letzte API-Aufrufe</h2>
          <ul className="max-h-[480px] divide-y overflow-y-auto rounded-lg border font-mono text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-2 p-1.5">
                <span className={l.ok ? "text-emerald-600" : "text-rose-600"}>{l.ok ? "OK " : "ERR"}</span>
                <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{l.ms} ms</span>
                <span className="truncate" title={l.error ?? ""}>{l.source}{l.error ? ` – ${l.error}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
