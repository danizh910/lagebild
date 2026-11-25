"use client";

import { Button } from "@/components/ui/button";

// ponytail: browser print-to-PDF via print CSS; switch to server-side PDF rendering if banks need pixel-identical files.
export function PrintButton() {
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={() => navigator.clipboard?.writeText(location.href)}>Link kopieren</Button>
      <Button onClick={() => window.print()}>Als PDF speichern</Button>
    </div>
  );
}
