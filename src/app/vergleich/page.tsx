import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { AGENTS, PROFILE_LABEL } from "@/lib/agents";
import { authEnabled, currentUserId } from "@/lib/auth";
import { getAnalysesOf } from "@/lib/db";
import type { DataPoint } from "@/lib/sources";

export const metadata = { title: "Vergleich – Lagebild" };

// Key facts shown side by side (keys from sources.ts).
const FACTS = [
  "strassenlaerm_tag", "no2", "oev_klasse", "oev_naechste", "schule_naechste", "einkauf_400m", "bars_300m",
  "bg_500m_12m", "bg_entwicklung_500m_12m", "baujahr", "heizung", "radon", "hochwasser", "bvb_A2002aa01", "bvb_A3016ai01",
];

export default function Page({ searchParams }: PageProps<"/vergleich">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vergleich</h1>
        <Link href="/meine" className="text-sm text-brand hover:underline print:hidden">← Meine Analysen</Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted-foreground">Lade …</p>}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function tone(s: number | null | undefined) {
  if (s == null) return "bg-muted text-muted-foreground";
  return s >= 70 ? "bg-emerald-600 text-white" : s >= 45 ? "bg-amber-500 text-white" : "bg-rose-600 text-white";
}

const fmt = (p?: DataPoint) =>
  !p || p.value === null ? "–" : p.value === true ? "ja" : p.value === false ? "nein" : `${p.value}${p.unit ? " " + p.unit : ""}`;

async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (!authEnabled()) return <p className="mt-6 text-muted-foreground">Die Anmeldung ist noch nicht eingerichtet.</p>;
  const userId = await currentUserId();
  if (!userId) {
    return (
      <div className="mt-6 rounded-lg border p-6">
        <p>Der Vergleich ist mit einem Konto verfügbar.</p>
        <SignInButton mode="modal"><Button className="mt-4">Anmelden</Button></SignInButton>
      </div>
    );
  }
  const raw = (await searchParams).id;
  const ids = [...new Set([raw].flat().filter((x): x is string => !!x))].slice(0, 4);
  // Only the user's own analyses can be compared.
  const list = (await getAnalysesOf(ids, userId)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (list.length < 2) return <p className="mt-6 text-muted-foreground">Bitte wähle mindestens zwei deiner Analysen aus.</p>;

  const point = (i: number, key: string) => list[i].points.find((p) => p.key === key);
  const labelOf = (key: string) => list.map((a) => a.points.find((p) => p.key === key)?.label).find(Boolean);

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left align-bottom">
            <th className="w-56 p-3" />
            {list.map((a) => (
              <th key={a.id} className="p-3 font-medium">
                <Link href={`/r/${a.id}`} className="hover:underline">{a.place.label}</Link>
                <div className="text-xs font-normal text-muted-foreground">{PROFILE_LABEL[a.profile]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-3 font-semibold">Gesamt</td>
            {list.map((a) => (
              <td key={a.id} className="p-3">
                <span className={`inline-grid size-11 place-items-center rounded-md text-base font-semibold tabular-nums ${tone(a.verdict?.score)}`}>{a.verdict?.score ?? "–"}</span>
              </td>
            ))}
          </tr>
          {AGENTS.map((def) => (
            <tr key={def.id} className="border-b">
              <td className="p-3">{def.name}</td>
              {list.map((a) => {
                const s = a.agents.find((x) => x.id === def.id)?.score;
                return (
                  <td key={a.id} className="p-3">
                    <span className={`inline-grid h-7 min-w-9 place-items-center rounded px-1.5 text-xs font-semibold tabular-nums ${tone(s)}`}>{s ?? "–"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
          {FACTS.filter((k) => labelOf(k)).map((k) => (
            <tr key={k} className="border-b last:border-0">
              <td className="p-3 text-muted-foreground">{labelOf(k)}</td>
              {list.map((a, i) => <td key={a.id} className="p-3 tabular-nums">{fmt(point(i, k))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
