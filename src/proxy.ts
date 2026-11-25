import { NextResponse, type NextRequest } from "next/server";

// Basic-auth gate for /admin. Password comes from ADMIN_PASSWORD (user name is ignored).
// ponytail: single shared password; move to Clerk roles once login exists (Etappe 4).
export function proxy(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  const [, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  const given = encoded ? atob(encoded).split(":").slice(1).join(":") : "";
  if (pw && given === pw) return NextResponse.next();
  return new NextResponse(pw ? "Anmeldung erforderlich" : "Admin-Bereich ist deaktiviert (ADMIN_PASSWORD fehlt).", {
    status: 401,
    headers: pw ? { "WWW-Authenticate": 'Basic realm="Lagebild Admin"' } : {},
  });
}

export const config = { matcher: "/admin/:path*" };
