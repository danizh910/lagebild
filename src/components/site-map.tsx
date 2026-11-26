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

// `time`: WMTS timestamp. Most layers use "current"; yearly layers (air quality) need a year, else every tile 400s.
// `maxNative`: highest zoom the server delivers (NO2 is a coarse grid); Leaflet upscales beyond it.
// ponytail: year and zooms hard-coded; read them from layersConfig if they go stale.
const OVERLAYS = [
  { key: "keine", label: "Keine Ebene", hint: "Nur Karte und Punkte", id: null, time: "current", maxNative: 18, legend: null },
  { key: "strasse", label: "Strassenlärm", hint: "Tagsüber, dB(A)", id: "ch.bafu.laerm-strassenlaerm_tag", time: "current", maxNative: 18, legend: ["leise", "laut", "linear-gradient(90deg,#c7e9b4,#fed976,#fd8d3c,#e31a1c,#800026)"] },
  { key: "bahn", label: "Bahnlärm", hint: "Tagsüber, dB(A)", id: "ch.bafu.laerm-bahnlaerm_tag", time: "current", maxNative: 18, legend: ["leise", "laut", "linear-gradient(90deg,#c7e9b4,#fed976,#fd8d3c,#e31a1c,#800026)"] },
  { key: "no2", label: "Stickstoffdioxid", hint: "Jahresmittel 2025, µg/m³", id: "ch.bafu.luftreinhaltung-stickstoffdioxid", time: "2025", maxNative: 13, legend: ["sauber", "belastet", "linear-gradient(90deg,#7fd6ea,#4fc36e,#f1e04a,#f08a3c,#d7301f)"] },
  { key: "oev", label: "ÖV-Güteklassen", hint: "A = sehr gut erschlossen", id: "ch.are.gueteklassen_oev", time: "current", maxNative: 18, legend: ["A", "D", "linear-gradient(90deg,#7b2d8e,#c051a6,#e9a3c9,#f6d5e8)"] },
  { key: "zonen", label: "Bauzonen", hint: "Wohn-, Misch-, Arbeitszonen", id: "ch.are.bauzonen", time: "current", maxNative: 18, legend: null },
] as const;
type Overlay = (typeof OVERLAYS)[number];

const BASES = {
  Karte: "ch.swisstopo.pixelkarte-grau",
  Satellit: "ch.swisstopo.swissimage",
} as const;
type Base = keyof typeof BASES;
const tileUrl = (id: string, ext = "jpeg", time = "current") => `https://wmts.geo.admin.ch/1.0.0/${id}/default/${time}/3857/{z}/{x}/{y}.${ext}`;

export function SiteMap({ lat, lon, pois, label }: { lat: number; lon: number; pois: Poi[]; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").Layer | null>(null);
  const baseLayer = useRef<import("leaflet").TileLayer | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(OVERLAYS[0]);
  const [base, setBase] = useState<Base>("Karte");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the layer menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

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
      layer.current = overlay.id ? L.tileLayer(tileUrl(overlay.id, "png", overlay.time), { opacity: 0.65, maxZoom: 20, maxNativeZoom: overlay.maxNative }).addTo(m) : null;
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
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
              className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold shadow-sm transition-colors ${overlay.id ? "bg-ink text-white" : "bg-surface text-ink"}`}>
              <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M8 1.8 1.8 5 8 8.2 14.2 5 8 1.8Z" /><path d="m1.8 8 6.2 3.2L14.2 8" /><path d="m1.8 11 6.2 3.2 6.2-3.2" />
              </svg>
              {overlay.id ? overlay.label : "Ebenen"}
              <svg aria-hidden viewBox="0 0 12 12" className={`size-3 transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 4.5 3 3 3-3" /></svg>
            </button>
            {menuOpen && (
              <div role="menu" aria-label="Datenebene"
                className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-2xl bg-surface p-1.5 shadow-[0_12px_32px_rgba(18,21,28,0.16)] ring-1 ring-black/5">
                {OVERLAYS.map((o) => {
                  const active = o.key === overlay.key;
                  return (
                    <button key={o.key} type="button" role="menuitemradio" aria-checked={active}
                      onClick={() => { setOverlay(o); setMenuOpen(false); }}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${active ? "bg-blue-tint" : "hover:bg-[#F3F5F9]"}`}>
                      <span aria-hidden className="h-5 w-5 shrink-0 rounded-md ring-1 ring-black/10"
                        style={{ background: o.legend ? o.legend[2] : o.id ? "repeating-linear-gradient(45deg,#e9d5ff 0 4px,#fde68a 4px 8px)" : "#fff" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">{o.label}</span>
                        <span className="block text-[11px] text-ink-3">{o.hint}</span>
                      </span>
                      {active && <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-blue" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3.5 8.5 3 3 6-7" /></svg>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ul className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-2 text-xs font-semibold" aria-label="Legende">
          {overlay.legend && (
            <li className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5">
              <span className="text-ink-3">{overlay.legend[0]}</span>
              <span className="h-2 w-16 rounded-full" style={{ background: overlay.legend[2] }} />
              <span className="text-ink-3">{overlay.legend[1]}</span>
            </li>
          )}
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
