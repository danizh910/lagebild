import Link from "next/link";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";

/** Wraps children in ClerkProvider only when login is configured. */
export function MaybeClerk({ children }: { children: React.ReactNode }) {
  return authEnabled() ? <ClerkProvider>{children}</ClerkProvider> : <>{children}</>;
}

export function HeaderAccount() {
  if (!authEnabled()) return null;
  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <Show when="signed-in">
        <Link href="/meine" className="hover:underline">Meine Analysen</Link>
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="rounded-md border px-3 py-1.5 hover:bg-accent">Anmelden</button>
        </SignInButton>
      </Show>
    </div>
  );
}
