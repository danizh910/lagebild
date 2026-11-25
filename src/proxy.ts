import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

// Basic-auth gate for /admin. Password comes from ADMIN_PASSWORD (user name is ignored).
// ponytail: single shared password; switch to a Clerk role once real admins exist.
function adminGate(req: NextRequest): NextResponse | undefined {
  if (!req.nextUrl.pathname.startsWith("/admin")) return undefined;
  const pw = process.env.ADMIN_PASSWORD;
  const [, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  const given = encoded ? atob(encoded).split(":").slice(1).join(":") : "";
  if (pw && given === pw) return undefined;
  return new NextResponse(pw ? "Anmeldung erforderlich" : "Admin-Bereich ist deaktiviert (ADMIN_PASSWORD fehlt).", {
    status: 401,
    headers: pw ? { "WWW-Authenticate": 'Basic realm="Lagebild Admin"' } : {},
  });
}

// Clerk only runs when keys are configured; otherwise the app stays fully anonymous.
const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export default clerkOn
  ? clerkMiddleware((_auth, req) => adminGate(req))
  : (req: NextRequest) => adminGate(req) ?? NextResponse.next();

export const config = {
  matcher: [
    // all pages except Next internals and static files, plus API routes (Clerk needs to see them for auth())
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
