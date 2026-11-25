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
    <div className="flex items-center gap-3 text-[15px] font-medium">
      <Show when="signed-in">
        <Link href="/meine" className="flex min-h-11 items-center rounded-full px-3 text-ink-2 hover:text-ink">Meine Analysen</Link>
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="min-h-11 rounded-full bg-ink px-5 font-semibold text-white">Anmelden</button>
        </SignInButton>
      </Show>
    </div>
  );
}
