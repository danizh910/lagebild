import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lagebild – Standort-Briefing für Immobilien",
  description: "Mehrere KI-Agenten bewerten jede Schweizer Adresse: Lage, Lärm, Verkehr, Risiken und Bauaktivität. Nachvollziehbar, mit Quellen.",
};

// Follow the OS colour scheme without a flash (no theme toggle needed in the MVP).
const themeScript = `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="print:hidden border-b">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-6 place-items-center rounded-sm bg-brand text-[13px] font-bold text-white">+</span>
              Lagebild
            </Link>
            <span className="text-xs text-muted-foreground">Standort-Briefing · Schweiz</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="print:hidden border-t py-6 text-center text-xs text-muted-foreground">
          Daten: geo.admin.ch (swisstopo, BAFU, ARE, BFS, BAG, BFE, BAK, BAV, BAZL) · © OpenStreetMap-Mitwirkende.
          Kein Gutachten und keine Preisbewertung.
        </footer>
      </body>
    </html>
  );
}
