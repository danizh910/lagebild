"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Poi } from "@/lib/sources";

const SCHOOL = "#7B61FF";
const BUILD = "#F2711C";
const COLORS: Record<string, string> = {
  "ÖV-Haltestelle": "#2F5BFF", Schule: SCHOOL, "Kindergarten/Kita": SCHOOL, "Arzt/Apotheke": "#0891B2",
  "Soziale Einrichtung": "#0D9488", Einkauf: "#CA8A04", "Freizeit/Park": "#14A35A", Bar: "#C026D3", Club: "#9333EA",
  Baugesuch: BUILD,
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
  Karte: "ch.swisstopo.pixelkarte-grau",
  Satellit: "ch.swisstopo.swissimage",
} as const;
type Base = keyof typeof BASES;
const tileUrl = (id: string, ext = "jpeg") => `https://wmts.geo.admin.ch/1.0.0/${id}/default/current/3857/{z}/{x}/{y}.${ext}`;

export function SiteMap({ lat, lon, pois, label }: { lat: number; lon: number; pois: Poi[]; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").Layer | null>(null);
  const baseLayer = useRef<import("leaflet").TileLayer | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("keine");
  const [base, setBase] = useState<Base>("Karte");

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lon], 16);
      baseLayer.current = L.tileLayer(tileUrl(BASES.Karte), { maxZoom: 20, maxNativeZoom: 19, attribution: "© swisstopo" }).addTo(m);
      L.circle([lat, lon], { radius: 500, color: "#2F5BFF", opacity: 0.45, weight: 1.5, dashArray: "6 6", fillColor: "#2F5BFF", fillOpacity: 0.06 }).addTo(m);
      for (const p of pois) {
        const isBg = p.kind === "Baugesuch";
        const mk = L.circleMarker([p.lat, p.lon], {
          radius: isBg ? 7 : 5.5, color: "#fff", weight: 2, fillColor: COLORS[p.kind] ?? "#5B6480", fillOpacity: 1,
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
      // Address pin with label (built with textContent: the label is user-chosen)
      const pin = document.createElement("div");
      pin.style.cssText = "position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% + 8px));display:flex;flex-direction:column;align-items:center;pointer-events:none";
      const tag = document.createElement("div");
      tag.style.cssText = "background:#12151C;color:#fff;font:600 13px/1 var(--font-sans),system-ui,sans-serif;padding:8px 12px;border-radius:12px;white-space:nowrap";
      tag.textContent = label.split(",")[0];
      const stem = document.createElement("div");
      stem.style.cssText = "width:3px;height:14px;background:#12151C";
      const dot = document.createElement("div");
      dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2F5BFF;border:3px solid #fff;box-sizing:border-box";
      pin.append(tag, stem, dot);
      L.marker([lat, lon], { icon: L.divIcon({ html: pin, className: "lb-pin", iconSize: [0, 0], iconAnchor: [0, 0] }), keyboard: false, interactive: false }).addTo(m);
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [lat, lon, pois, label]);

  useEffect(() => {
    baseLayer.current?.setUrl(tileUrl(BASES[base]));
  }, [base]);

  useEffect(() => {
    import("leaflet").then((L) => {
      const m = map.current;
      if (!m) return;
      if (layer.current) m.removeLayer(layer.current);
      const id = OVERLAYS[overlay];
      layer.current = id ? L.tileLayer(tileUrl(id, "png"), { opacity: 0.6, maxZoom: 19 }).addTo(m) : null;
    });
  }, [overlay]);

  const hasBg = pois.some((p) => p.kind === "Baugesuch");
  const hasSchool = pois.some((p) => p.kind === "Schule" || p.kind === "Kindergarten/Kita");
  const others = [...new Set(pois.map((p) => p.kind))].filter((k) => !["Baugesuch", "Schule", "Kindergarten/Kita"].includes(k));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-[var(--r-inner)] bg-[#E3E8F0]">
        <div ref={el} className="h-[300px] w-full sm:h-[360px] print:h-[280px]" aria-label={`Karte rund um ${label}`} role="region" />

        <div className="absolute right-3 top-3 z-[1000] flex flex-wrap justify-end gap-2 print:hidden">
          <div role="group" aria-label="Kartenhintergrund" className="flex rounded-full bg-surface p-1 shadow-sm">
            {(Object.keys(BASES) as Base[]).map((b) => (
              <button key={b} type="button" onClick={() => setBase(b)} aria-pressed={base === b}
                className={`min-h-11 rounded-full px-3.5 text-xs font-semibold ${base === b ? "bg-ink text-white" : "text-ink-2"}`}>
                {b}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="map-overlay">Datenebene</label>
          <select id="map-overlay" value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)}
            className="min-h-11 rounded-full border-0 bg-surface px-4 text-xs font-semibold text-ink shadow-sm">
            {(Object.keys(OVERLAYS) as Overlay[]).map((o) => (
              <option key={o} value={o}>{o === "keine" ? "Keine Ebene" : o}</option>
            ))}
          </select>
        </div>

        <ul className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-2 text-xs font-semibold" aria-label="Legende">
          {hasBg && <Chip color={BUILD}>Baugesuche</Chip>}
          {hasSchool && <Chip color={SCHOOL}>Schulen &amp; Kitas</Chip>}
          <li className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5">
            <span className="size-2.5 rounded-full border-[1.5px] border-dashed border-blue" />Umkreis 500 m
          </li>
        </ul>
      </div>
      {others.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 text-xs text-ink-3" aria-label="Weitere Punkte auf der Karte">
          {others.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[k] ?? "#5B6480" }} />{k}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />{children}
    </li>
  );
}
