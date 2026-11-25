"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Poi } from "@/lib/sources";

const COLORS: Record<string, string> = {
  "ÖV-Haltestelle": "#2563eb", Schule: "#16a34a", "Kindergarten/Kita": "#22c55e", "Arzt/Apotheke": "#0891b2",
  "Soziale Einrichtung": "#0d9488", Einkauf: "#ca8a04", "Freizeit/Park": "#65a30d", Bar: "#c026d3", Club: "#9333ea",
  Baugesuch: "#f97316",
};

const OVERLAYS = {
  keine: null,
  "Strassenlärm": "ch.bafu.laerm-strassenlaerm_tag",
  "Bahnlärm": "ch.bafu.laerm-bahnlaerm_tag",
  "ÖV-Güteklassen": "ch.are.gueteklassen_oev",
  "Stickstoffdioxid": "ch.bafu.luftreinhaltung-stickstoffdioxid",
  "Bauzonen": "ch.are.bauzonen",
} as const;
type Overlay = keyof typeof OVERLAYS;

const BASES = {
  Satellit: "ch.swisstopo.swissimage",
  Karte: "ch.swisstopo.pixelkarte-grau",
} as const;
type Base = keyof typeof BASES;

export function SiteMap({ lat, lon, pois }: { lat: number; lon: number; pois: Poi[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").Layer | null>(null);
  const baseLayer = useRef<import("leaflet").TileLayer | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("keine");
  const [base, setBase] = useState<Base>("Satellit");

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lon], 17);
      baseLayer.current = L.tileLayer(`https://wmts.geo.admin.ch/1.0.0/${BASES.Satellit}/default/current/3857/{z}/{x}/{y}.jpeg`, {
        maxZoom: 20, maxNativeZoom: 20, attribution: "© swisstopo (SWISSIMAGE)",
      }).addTo(m);
      L.circle([lat, lon], { radius: 400, color: "#888", weight: 1, fill: false, dashArray: "4 4" }).addTo(m);
      for (const p of pois) {
        const isBg = p.kind === "Baugesuch";
        const mk = L.circleMarker([p.lat, p.lon], {
          radius: isBg ? 7 : 5, color: isBg ? "#000" : "#fff", weight: isBg ? 1.5 : 1, fillColor: COLORS[p.kind] ?? "#666", fillOpacity: 0.9,
        });
        if (isBg) {
          const div = document.createElement("div");
          div.innerHTML = `<strong></strong><br><span></span><br><a target="_blank" rel="noopener">Im Amtsblatt öffnen</a>`;
          // textContent, not innerHTML: descriptions come from an external dataset
          div.querySelector("strong")!.textContent = `${p.category} · ${new Date(p.date!).toLocaleDateString("de-CH")}`;
          div.querySelector("span")!.textContent = `${p.name} (${p.address}, ${p.dist} m)`;
          div.querySelector("a")!.href = p.url!;
          mk.bindPopup(div);
        } else mk.bindTooltip(`${p.kind}: ${p.name} (${p.dist} m)`);
        mk.addTo(m);
      }
      L.circleMarker([lat, lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }).addTo(m);
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [lat, lon, pois]);

  useEffect(() => {
    baseLayer.current?.setUrl(`https://wmts.geo.admin.ch/1.0.0/${BASES[base]}/default/current/3857/{z}/{x}/{y}.jpeg`);
  }, [base]);

  useEffect(() => {
    import("leaflet").then((L) => {
      const m = map.current;
      if (!m) return;
      if (layer.current) m.removeLayer(layer.current);
      const id = OVERLAYS[overlay];
      layer.current = id
        ? L.tileLayer(`https://wmts.geo.admin.ch/1.0.0/${id}/default/current/3857/{z}/{x}/{y}.png`, { opacity: 0.6, maxZoom: 19 }).addTo(m)
        : null;
    });
  }, [overlay]);

  const kinds = [...new Set(pois.map((p) => p.kind))];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5 print:hidden">
        {(Object.keys(BASES) as Base[]).map((b) => (
          <button key={b} onClick={() => setBase(b)}
            className={`rounded border px-2 py-1 text-xs ${base === b ? "border-brand bg-brand text-white" : "hover:bg-accent"}`}>
            {b}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {(Object.keys(OVERLAYS) as Overlay[]).map((o) => (
          <button key={o} onClick={() => setOverlay(o)}
            className={`rounded border px-2 py-1 text-xs ${overlay === o ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}>
            {o === "keine" ? "Keine Ebene" : o}
          </button>
        ))}
      </div>
      <div ref={el} className="h-[420px] w-full overflow-hidden rounded-lg border print:h-[300px]" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {kinds.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[k] ?? "#666" }} />{k}
          </span>
        ))}
      </div>
    </div>
  );
}
