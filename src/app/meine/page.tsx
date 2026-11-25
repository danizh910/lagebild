import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { PROFILE_LABEL, type Profile } from "@/lib/agents";
import { authEnabled, currentUserId } from "@/lib/auth";
import { userAnalyses } from "@/lib/db";

export const metadata = { title: "Meine Analysen – Lagebild" };

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Meine Analysen</h1>
      <Suspense fallback={<p className="mt-6 text-muted-foreground">Lade …</p>}>
        <List />
      </Suspense>
    </div>
  );
}

function tone(s: number | null) {
  if (s == null) return "bg-muted text-muted-foreground";
  return s >= 70 ? "bg-emerald-600 text-white" : s >= 45 ? "bg-amber-500 text-white" : "bg-rose-600 text-white";
}

async function List() {
  await connection();
  if (!authEnabled()) return <p className="mt-6 text-muted-foreground">Die Anmeldung ist noch nicht eingerichtet.</p>;
  const userId = await currentUserId();
  if (!userId) {
    return (
      <div className="mt-6 rounded-lg border p-6">
        <p>Melde dich an, um deine Analysen zu speichern, als PDF zu exportieren und Standorte zu vergleichen.</p>
        <SignInButton mode="modal"><Button className="mt-4">Anmelden</Button></SignInButton>
      </div>
    );
  }
  const rows = await userAnalyses(userId);
  if (!rows.length) {
    return (
      <p className="mt-6 text-muted-foreground">
        Noch keine Analysen. <Link href="/" className="text-brand hover:underline">Jetzt eine Adresse prüfen</Link>.
      </p>
    );
  }
  return (
    // Native GET form: selected checkboxes become /vergleich?id=…&id=…
    <form action="/vergleich" className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Wähle 2–4 Standorte für den Vergleich.</p>
        <Button type="submit" size="sm">Vergleichen</Button>
      </div>
      <ul className="mt-3 divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-3">
            <input type="checkbox" name="id" value={r.id} aria-label={`${r.label} vergleichen`} className="size-4 accent-[var(--brand)]" />
            <span className={`grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold tabular-nums ${tone(r.score)}`}>{r.score ?? "–"}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/r/${r.id}`} className="block truncate font-medium hover:underline">{r.label}</Link>
              <span className="text-xs text-muted-foreground">
                {PROFILE_LABEL[r.profile as Profile] ?? r.profile} · {new Date(r.created_at).toLocaleDateString("de-CH")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}
