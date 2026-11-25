"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// ponytail: browser print-to-PDF via print CSS; switch to server-side PDF rendering if banks need pixel-identical files.
export function PrintButton({ copyOnly = false }: { copyOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={() => navigator.clipboard?.writeText(location.href).then(() => setCopied(true))}>
        {copied ? "Link kopiert ✓" : "Link kopieren"}
      </Button>
      {!copyOnly && <Button onClick={() => window.print()}>Als PDF speichern</Button>}
    </div>
  );
}
