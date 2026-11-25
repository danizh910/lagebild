import { Suspense } from "react";
import Link from "next/link";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { deDE } from "@clerk/localizations";
import { authEnabled } from "@/lib/auth";

/** Wraps children in ClerkProvider only when login is configured. */
export function MaybeClerk({ children }: { children: React.ReactNode }) {
  return authEnabled() ? <ClerkProvider appearance={{ theme: shadcn }} localization={deDE}>{children}</ClerkProvider> : <>{children}</>;
}

export function HeaderAccount() {
  if (!authEnabled()) return null;
  // <Show> reads the request; with cacheComponents it must sit inside <Suspense>.
  return (
    <Suspense fallback={<div className="ml-auto" />}>
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
    </Suspense>
  );
}
