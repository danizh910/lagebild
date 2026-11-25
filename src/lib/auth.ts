import { auth } from "@clerk/nextjs/server";

/** Login is optional: without Clerk keys the app runs fully anonymous. */
export const authEnabled = () => !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export async function currentUserId(): Promise<string | null> {
  if (!authEnabled()) return null;
  return (await auth()).userId ?? null;
}
