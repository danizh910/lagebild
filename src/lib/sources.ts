import { identify, lv95ToWgs, rasterHit, rasterValue, type Place } from "./geo";
import survey from "@/data/zh-zufriedenheit.json";
import { DEVELOPMENT, detailUrl as bgDetailUrl, nearby, SOURCE as BG_SOURCE, type Baugesuch } from "./baugesuche";

type SurveyCell = { wert: number | null; n: number; trend: number | null };
const SURVEY = survey as { source: string; labels: Record<string, string>; areas: Record<string, Record<string, SurveyCell>> };
const SAFE_VAR = "A4001aa01";

/** Statistical quarter of the city of Zürich for a point (null outside the city). */
async function zhQuartier(e: number, n: number) {
  // Quick reject outside the city's bounding box, saves a request for the rest of Switzerland.
  if (e < 2676000 || e > 2690000 || n < 1241000 || n > 1255000) return null;
  const url = `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Statistische_Quartiere?service=WFS&version=1.1.0&request=GetFeature` +
    `&typename=adm_statistische_quartiere_v&outputFormat=GeoJSON&srsName=EPSG:2056&propertyName=qnr,qname,knr,kname&bbox=${e},${n},${e + 1},${n + 1},EPSG:2056`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`wfs ${res.status}`);
  const f = (await res.json()).features?.[0]?.properties;
  return f ? (f as { qnr: number; qname: string; knr: number; kname: string }) : null;
}

export type DataPoint = {
  key: string;
  category: string;
  label: string;
  value: number | string | boolean | null; // null = Datenquelle nicht verfügbar
  unit?: string;
  source: string;
  url?: string;
  ref?: number; // Vergleichswert (z.B. Schnitt der ganzen Stadt)
  trend?: number; // Veränderung gegenüber früherer Periode
  fetchedAt: string;
};

export type Poi = {
  kind: string; name: string; lat: number; lon: number; dist: number;
  // only for kind "Baugesuch"
  date?: string; category?: string; url?: string; address?: string;
};

export type Building = {
  egid?: string;
  baujahr?: number;
  bauperiode?: string;
  geschosse?: number;
  wohnungen?: number;
  flaeche?: number;
  art?: string;
  heizung?: string;
  heizungSeit?: string;
  parzelle?: string;
  egrid?: string;
  kanton?: string;
};

/** Bump when collect() gains or changes sources, so cached analyses are re-collected. */
export const DATA_VERSION = 3;

export type ApiLog = { source: string; ok: boolean; ms: number; error?: string };
export type Collected = { points: DataPoint[]; pois: Poi[]; building: Building | null; logs: ApiLog[] };

const GEO = "geo.admin.ch";
const OSM = "OpenStreetMap (ODbL)";
const now = () => new Date().toISOString();

const HEIZUNG: Record<number, string> = {
  7500: "Keine", 7501: "Wärmepumpe (Luft)", 7510: "Wärmepumpe (Erdwärme)", 7511: "Wärmepumpe (Erdwärmesonde)",
  7512: "Wärmepumpe (Erdregister)", 7513: "Wärmepumpe (Wasser)", 7520: "Gas", 7530: "Heizöl", 7540: "Holz",
  7541: "Holz (Stückholz)", 7542: "Holz (Pellets)", 7543: "Holz (Schnitzel)", 7550: "Abwärme", 7560: "Elektrizität",
  7570: "Sonne (thermisch)", 7580: "Fernwärme", 7581: "Fernwärme", 7582: "Fernwärme", 7598: "Unbestimmt", 7599: "Andere",
};
const GEBAEUDEKLASSE: Record<number, string> = {
  1110: "Einfamilienhaus", 1121: "Zweifamilienhaus", 1122: "Mehrfamilienhaus", 1130: "Wohngebäude für Gemeinschaften",
  1211: "Hotel", 1212: "Kurzfristige Beherbergung", 1220: "Bürogebäude", 1230: "Gross- und Einzelhandel",
  1251: "Industriegebäude", 1252: "Lager", 1261: "Kultur/Freizeit", 1263: "Schule/Bildung", 1264: "Spital",
};
const BAUPERIODE: Record<number, string> = {
  8011: "vor 1919", 8012: "1919–1945", 8013: "1946–1960", 8014: "1961–1970", 8015: "1971–1980", 8016: "1981–1985",
  8017: "1986–1990", 8018: "1991–1995", 8019: "1996–2000", 8020: "2001–2005", 8021: "2006–2010", 8022: "2011–2015",
  8023: "ab 2016",
};

// ---- OSM (Overpass) ----
const OVERPASS = [
  "https://overpass.osm.ch/api/interpreter", // Swiss instance (SOSM), much more reliable for CH than the global ones
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function osmKind(t: Record<string, string>): string | null {
  const a = t.amenity, s = t.shop, l = t.leisure;
  if (a === "school") return "Schule";
  if (a === "kindergarten" || a === "childcare") return "Kindergarten/Kita";
  if (a === "doctors" || a === "clinic" || a === "pharmacy" || a === "dentist") return "Arzt/Apotheke";
  if (a === "social_facility" || a === "community_centre") return "Soziale Einrichtung";
  if (s === "supermarket" || s === "convenience" || s === "bakery") return "Einkauf";
  if (l === "park" || l === "playground" || l === "sports_centre" || l === "pitch" || l === "swimming_pool") return "Freizeit/Park";
  if (a === "bar" || a === "pub") return "Bar";
  if (a === "nightclub") return "Club";
  return null;
}

async function fetchOsm(lat: number, lon: number, r = 600): Promise<Poi[]> {
  const around = `(around:${r},${lat},${lon})`;
  const q =
    `[out:json][timeout:15];(` +
    `nwr${around}[amenity~"^(school|kindergarten|childcare|doctors|clinic|pharmacy|dentist|social_facility|community_centre|bar|pub|nightclub)$"];` +
    `nwr${around}[shop~"^(supermarket|convenience|bakery)$"];` +
    `nwr${around}[leisure~"^(park|playground|sports_centre|pitch|swimming_pool)$"];` +
    `);out center tags;`;
  let lastErr: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: q }),
        headers: { "User-Agent": "lagebild/0.1" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const data = await res.json();
      const cos = Math.cos((lat * Math.PI) / 180);
      return (data.elements as Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>)
        .map((el) => {
          const kind = osmKind(el.tags ?? {});
          const pLat = el.lat ?? el.center?.lat;
          const pLon = el.lon ?? el.center?.lon;
          if (!kind || pLat == null || pLon == null) return null;
          const dist = Math.round(Math.hypot((pLon - lon) * cos * 111320, (pLat - lat) * 110540));
          return { kind, name: el.tags?.name ?? kind, lat: pLat, lon: pLon, dist };
        })
        .filter((p): p is Poi => p !== null);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ---- Main collector ----
export async function collect(place: Place, onStep?: (msg: string) => void): Promise<Collected> {
  const { e, n, lat, lon } = place;
  const points: DataPoint[] = [];
  const add = (p: Omit<DataPoint, "fetchedAt">) => points.push({ ...p, fetchedAt: now() });
  const step = (m: string) => onStep?.(m);
  const logs: ApiLog[] = [];
  /** Run one source fetch; on failure log it and mark the point unavailable instead of failing the analysis. */
  async function safe<T>(source: string, fn: () => Promise<T>): Promise<T | undefined> {
    const t0 = Date.now();
    try {
      const r = await fn();
      logs.push({ source, ok: true, ms: Date.now() - t0 });
      return r;
    } catch (err) {
      logs.push({ source, ok: false, ms: Date.now() - t0, error: String((err as Error).message).slice(0, 300) });
      return undefined;
    }
  }

  const raster = async (key: string, category: string, label: string, layer: string, unit: string) => {
    const v = await safe(layer, () => rasterValue(layer, e, n));
    // undefined = Quelle ausgefallen; null = kein Wert an diesem Punkt (z.B. unter Messschwelle)
    add({ key, category, label, value: v === undefined ? null : v === null ? 0 : Number(v), unit, source: `${GEO} · ${layer}` });
  };

  step("Lärm und Luftqualität");
  await Promise.all([
    raster("strassenlaerm_tag", "umwelt", "Strassenlärm tagsüber", "ch.bafu.laerm-strassenlaerm_tag", "dB(A)"),
    raster("strassenlaerm_nacht", "umwelt", "Strassenlärm nachts", "ch.bafu.laerm-strassenlaerm_nacht", "dB(A)"),
    raster("bahnlaerm_tag", "umwelt", "Bahnlärm tagsüber", "ch.bafu.laerm-bahnlaerm_tag", "dB(A)"),
    raster("no2", "umwelt", "Stickstoffdioxid (Jahresmittel)", "ch.bafu.luftreinhaltung-stickstoffdioxid", "µg/m³"),
    raster("pm25", "umwelt", "Feinstaub PM2.5 (Jahresmittel)", "ch.bafu.luftreinhaltung-feinstaub_pm2_5", "µg/m³"),
    (async () => {
      const hit = await safe("ch.bazl.laermbelastungskataster-zivilflugplaetze_klein-grossflugzeuge", () => rasterHit("ch.bazl.laermbelastungskataster-zivilflugplaetze_klein-grossflugzeuge", e, n));
      add({ key: "fluglaerm", category: "umwelt", label: "Im Fluglärm-Belastungsperimeter", value: hit ?? null, source: `${GEO} · BAZL Lärmbelastungskataster` });
    })(),
  ]);

  step("ÖV-Erschliessung und Haltestellen");
  const [oev, stops] = await Promise.all([
    safe("ch.are.gueteklassen_oev", () => identify("ch.are.gueteklassen_oev", e, n)),
    safe("ch.bav.haltestellen-oev", () => identify("ch.bav.haltestellen-oev", e, n, 400, true)),
  ]);
  const klasse = oev ? String(oev[0]?.attributes?.klasse_de ?? "keine Güteklasse") : null;
  add({ key: "oev_klasse", category: "mobilitaet", label: "ÖV-Güteklasse", value: klasse, source: `${GEO} · ARE ÖV-Güteklassen` });
  const stopPois: Poi[] = (stops ?? []).flatMap((s) => {
    const c = (s.geometry?.coordinates as number[][] | undefined)?.[0] ?? (s.geometry?.coordinates as number[] | undefined);
    if (!c || typeof c[0] !== "number") return [];
    const p = lv95ToWgs(c[0] as number, c[1] as number);
    return [{ kind: "ÖV-Haltestelle", name: String(s.attributes.name ?? "Haltestelle"), ...p, dist: Math.round(Math.hypot((c[0] as number) - e, (c[1] as number) - n)) }];
  });
  add({ key: "oev_haltestellen_400m", category: "mobilitaet", label: "ÖV-Haltestellen im Umkreis 400 m", value: stops ? stopPois.length : null, source: `${GEO} · BAV Haltestellen` });
  const nearestStop = stopPois.sort((a, b) => a.dist - b.dist)[0];
  if (nearestStop) add({ key: "oev_naechste", category: "mobilitaet", label: `Nächste Haltestelle (${nearestStop.name})`, value: nearestStop.dist, unit: "m", source: `${GEO} · BAV Haltestellen` });

  step("Bauzone, Gebäuderegister und Schutzinventare");
  const [zone, gwr, isos, radon, solar, hochwasser, abfluss] = await Promise.all([
    safe("ch.are.bauzonen", () => identify("ch.are.bauzonen", e, n)),
    safe("ch.bfs.gebaeude_wohnungs_register", () => identify("ch.bfs.gebaeude_wohnungs_register", e, n, 15)),
    safe("ch.bak.bundesinventar-schuetzenswerte-ortsbilder", async () => (await identify("ch.bak.bundesinventar-schuetzenswerte-ortsbilder", e, n)).length > 0),
    safe("ch.bag.radonkarte", () => identify("ch.bag.radonkarte", e, n)),
    safe("ch.bfe.solarenergie-eignung-daecher", () => identify("ch.bfe.solarenergie-eignung-daecher", e, n, 10)),
    safe("ch.bafu.aquaprotect_100", () => rasterHit("ch.bafu.aquaprotect_100", e, n)),
    safe("ch.bafu.gefaehrdungskarte-oberflaechenabfluss", () => rasterHit("ch.bafu.gefaehrdungskarte-oberflaechenabfluss", e, n)),
  ]);
  add({ key: "bauzone", category: "entwicklung", label: "Bauzone", value: zone ? String(zone[0]?.attributes?.ch_bez_d ?? "ausserhalb Bauzone") : null, source: `${GEO} · ARE Bauzonen` });
  add({ key: "isos", category: "risiko", label: "Im Bundesinventar schützenswerter Ortsbilder (ISOS)", value: isos ?? null, source: `${GEO} · BAK ISOS` });
  add({ key: "radon", category: "risiko", label: "Wahrscheinlichkeit erhöhter Radonwerte", value: radon ? Number(radon[0]?.attributes?.probability_prozent ?? 0) : null, unit: "%", source: `${GEO} · BAG Radonkarte` });
  add({ key: "hochwasser", category: "risiko", label: "Im Hochwasser-Gefahrenbereich (100-jährlich, Aquaprotect)", value: hochwasser ?? null, source: `${GEO} · BAFU Aquaprotect` });
  add({ key: "oberflaechenabfluss", category: "risiko", label: "Gefährdet durch Oberflächenabfluss", value: abfluss ?? null, source: `${GEO} · BAFU Gefährdungskarte Oberflächenabfluss` });

  // Solar: best roof surface of the building
  const roofs = (solar ?? []).map((r) => r.attributes ?? {});
  const bestRoof = roofs.sort((a, b) => Number(b.stromertrag ?? 0) - Number(a.stromertrag ?? 0))[0];
  add({ key: "solar_klasse", category: "wohnqualitaet", label: "Solar-Eignung beste Dachfläche (1–5)", value: solar ? Number(bestRoof?.klasse ?? 0) || null : null, source: `${GEO} · BFE sonnendach.ch` });
  add({ key: "solar_ertrag", category: "wohnqualitaet", label: "Stromertrag Dach total (Potenzial)", value: solar ? Math.round(roofs.reduce((s, r) => s + Number(r.stromertrag ?? 0), 0)) : null, unit: "kWh/Jahr", source: `${GEO} · BFE sonnendach.ch` });

  let building: Building | null = null;
  const g = gwr?.[0]?.attributes;
  if (g) {
    building = {
      egid: String(g.egid ?? ""),
      baujahr: g.gbauj ? Number(g.gbauj) : undefined,
      bauperiode: BAUPERIODE[Number(g.gbaup)],
      geschosse: g.gastw ? Number(g.gastw) : undefined,
      wohnungen: g.ganzwhg ? Number(g.ganzwhg) : undefined,
      flaeche: g.garea ? Number(g.garea) : undefined,
      art: GEBAEUDEKLASSE[Number(g.gklas)] ?? "Andere",
      heizung: HEIZUNG[Number(g.genh1)],
      heizungSeit: g.gwaerdath1 && g.gwaerdath1 !== "-" ? String(g.gwaerdath1) : undefined,
      parzelle: g.lparz ? String(g.lparz) : undefined,
      egrid: g.egrid ? String(g.egrid) : undefined,
      kanton: g.gdekt ? String(g.gdekt) : undefined,
    };
    const src = `${GEO} · BFS Gebäude- und Wohnungsregister`;
    if (building.baujahr) add({ key: "baujahr", category: "gebaeude", label: "Baujahr", value: building.baujahr, source: src });
    if (building.heizung) add({ key: "heizung", category: "gebaeude", label: "Energieträger Heizung", value: building.heizung, source: src });
    if (building.geschosse) add({ key: "geschosse", category: "gebaeude", label: "Geschosse", value: building.geschosse, source: src });
    add({ key: "gebaeudeart", category: "gebaeude", label: "Gebäudeart", value: building.art ?? null, source: src });
  }

  step("Schulen, Läden, Freizeit und Nachtleben (OpenStreetMap)");
  const osm = await safe("overpass (OpenStreetMap)", () => fetchOsm(lat, lon));
  const count = (kind: string, r: number) => (osm ? osm.filter((p) => p.kind === kind && p.dist <= r).length : null);
  const nearest = (kind: string) => (osm ? (osm.filter((p) => p.kind === kind).sort((a, b) => a.dist - b.dist)[0]?.dist ?? null) : null);
  const osmPoint = (key: string, category: string, label: string, value: number | null, unit?: string) =>
    add({ key, category, label, value, unit, source: OSM });
  osmPoint("schule_naechste", "familie", "Nächste Schule", nearest("Schule"), "m");
  osmPoint("kiga_600m", "familie", "Kindergärten/Kitas im Umkreis 600 m", count("Kindergarten/Kita", 600));
  osmPoint("arzt_600m", "familie", "Ärzte/Apotheken im Umkreis 600 m", count("Arzt/Apotheke", 600));
  osmPoint("einkauf_400m", "familie", "Einkaufsmöglichkeiten im Umkreis 400 m", count("Einkauf", 400));
  osmPoint("sozial_600m", "familie", "Soziale Einrichtungen im Umkreis 600 m", count("Soziale Einrichtung", 600));
  osmPoint("freizeit_600m", "wohnqualitaet", "Parks, Spielplätze, Sport im Umkreis 600 m", count("Freizeit/Park", 600));
  osmPoint("bars_300m", "nachtleben", "Bars/Pubs im Umkreis 300 m", count("Bar", 300));
  osmPoint("clubs_300m", "nachtleben", "Clubs im Umkreis 300 m", count("Club", 300));
  osmPoint("clubs_600m", "nachtleben", "Clubs im Umkreis 600 m", count("Club", 600));

  step("Baugesuche im Umkreis (Kanton Zürich)");
  // Rough Kanton ZH bbox as fallback when the building register gives no canton.
  const inZh = building?.kanton ? building.kanton === "ZH" : e > 2669000 && e < 2717000 && n > 1223000 && n < 1284000;
  const bgPois: Poi[] = [];
  if (inZh) {
    const bg = await safe("Baugesuche (Neon-Cache)", () => nearby(e, n, 500, 24));
    const months = (d: string) => (Date.now() - new Date(d).getTime()) / (30.44 * 864e5);
    const src = `${BG_SOURCE} · seit Herbst 2024`;
    const cnt = (f: (b: Baugesuch & { dist: number }) => boolean) => (bg ? bg.filter(f).length : null);
    add({ key: "bg_500m_12m", category: "entwicklung", label: "Baugesuche im Umkreis 500 m (12 Monate)", value: cnt((b) => months(b.pub_date) <= 12), source: src });
    add({ key: "bg_entwicklung_500m_12m", category: "entwicklung", label: "Davon Neubau, Aufstockung, Abbruch", value: cnt((b) => months(b.pub_date) <= 12 && DEVELOPMENT.includes(b.category)), source: src });
    add({ key: "bg_energie_500m_12m", category: "entwicklung", label: "Davon energetische Erneuerung (Wärmepumpe, Solar)", value: cnt((b) => months(b.pub_date) <= 12 && b.category === "Energie"), source: src });
    const recent = cnt((b) => months(b.pub_date) <= 6), before = cnt((b) => months(b.pub_date) > 6 && months(b.pub_date) <= 12);
    add({ key: "bg_trend", category: "entwicklung", label: "Baugesuche letzte 6 Monate vs. 6 Monate davor", value: recent == null || before == null ? null : `${recent} vs. ${before}`, source: src });
    add({ key: "bg_parzelle", category: "gebaeude", label: "Baugesuche für diese Adresse/Parzelle (24 Monate)", value: cnt((b) => b.dist <= 30), source: src });
    for (const b of bg ?? []) {
      if (b.e == null || b.n == null) continue;
      bgPois.push({
        kind: "Baugesuch", name: b.description.slice(0, 140), ...lv95ToWgs(b.e, b.n), dist: b.dist,
        date: b.pub_date, category: b.category, url: bgDetailUrl(b.id), address: b.address,
      });
    }
  }

  step("Quartier und Bevölkerungsbefragung");
  const quartier = await safe("Stadt Zürich · Statistische Quartiere", () => zhQuartier(e, n));
  if (quartier) {
    add({ key: "quartier", category: "quartier", label: "Statistisches Quartier (Stadt Zürich)", value: `${quartier.qname}, ${quartier.kname}`, source: "Stadt Zürich · Statistische Quartiere" });
    const area = SURVEY.areas[quartier.knr === 1 ? "Kreis 1" : quartier.qname];
    for (const [v, label] of Object.entries(SURVEY.labels)) {
      const r = area?.[v];
      if (!r) continue;
      const share = v === SAFE_VAR;
      add({
        key: `bvb_${v}`, category: "quartier", label: `Zufriedenheit: ${label}`,
        value: r.wert == null ? null : share ? Math.round(r.wert * 100) : r.wert,
        unit: share ? "%" : "von 6",
        source: `${SURVEY.source} · n=${r.n}`,
        ref: SURVEY.areas.stadt[v]?.wert == null ? undefined : share ? Math.round(SURVEY.areas.stadt[v].wert! * 100) : SURVEY.areas.stadt[v].wert!,
        trend: r.trend == null ? undefined : share ? Math.round(r.trend * 100) : r.trend,
      });
    }
  }

  add({ key: "data_version", category: "meta", label: "Version der Datensammlung", value: DATA_VERSION, source: "Lagebild" });
  return { points, pois: [...stopPois, ...(osm ?? []), ...bgPois], building, logs };
}
