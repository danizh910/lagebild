import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { HeaderAccount, MaybeClerk } from "@/components/account";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Lagebild – Standort-Briefing für Immobilien",
  description: "Mehrere KI-Agenten bewerten jede Schweizer Adresse: Lage, Lärm, Verkehr, Risiken und Bauaktivität. Nachvollziehbar, mit Quellen.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <MaybeClerk>
          {/* Hidden via CSS on report pages, which bring their own header with the profile switcher. */}
          <div className="site-header-global mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 sm:pt-6 print:hidden">
            <SiteHeader>
              <HeaderAccount />
            </SiteHeader>
          </div>
          <main className="flex-1">{children}</main>
          <footer className="mx-auto w-full max-w-[1360px] px-4 pb-8 pt-12 text-center text-xs leading-relaxed text-ink-3 sm:px-6 print:hidden">
            Daten: geo.admin.ch (swisstopo, BAFU, ARE, BFS, BAG, BFE, BAK, BAV, BAZL) · Kanton und Stadt Zürich (OGD) · © OpenStreetMap-Mitwirkende.
            <br />
            Kein Gutachten und keine Preisbewertung.
          </footer>
        </MaybeClerk>
      </body>
    </html>
  );
}
