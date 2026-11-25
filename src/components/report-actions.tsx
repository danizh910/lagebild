import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { claim } from "@/app/r/[id]/actions";
import { authEnabled, currentUserId } from "@/lib/auth";

/** PDF and saving need an account (when login is configured); viewing a shared link never does. */
export async function ReportActions({ id, ownerId }: { id: string; ownerId: string | null | undefined }) {
  if (!authEnabled()) return <PrintButton />;
  const userId = await currentUserId();
  if (!userId) {
    return (
      <div className="flex gap-2 print:hidden">
        <PrintButton copyOnly />
        <SignInButton mode="modal"><Button>Anmelden für PDF</Button></SignInButton>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {ownerId === userId ? (
        <span className="px-2 text-xs font-semibold text-good-ink">In «Meine Analysen»</span>
      ) : !ownerId ? (
        <form action={claim.bind(null, id)}>
          <Button type="submit" variant="outline" className="border-0">Speichern</Button>
        </form>
      ) : null}
      <PrintButton />
    </div>
  );
}
