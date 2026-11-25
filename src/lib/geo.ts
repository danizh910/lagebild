// Helpers for the federal geoportal (geo.admin.ch). All coordinates in LV95 (EPSG:2056) unless noted.

const API = "https://api3.geo.admin.ch/rest/services/api/MapServer";
const WMS = "https://wms.geo.admin.ch/";

/** Approximate LV95 -> WGS84 (swisstopo formula, ~1 m accuracy, good enough for map display). */
export function lv95ToWgs(e: number, n: number): { lat: number; lon: number } {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon =
    2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat =
    16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return { lat: (lat * 100) / 36, lon: (lon * 100) / 36 };
}

async function getJson(url: string, timeoutMs = 12000) {
  // No custom headers in the browser: they would trigger a CORS preflight.
  const headers = typeof window === "undefined" ? { "User-Agent": "lagebild/0.1" } : undefined;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Vector layer features at (or within radiusM of) a point. */
export async function identify(layer: string, e: number, n: number, radiusM = 5, geometry = false) {
  // 1 px = 1 m with this extent/display, so tolerance (px) == radius (m).
  const url =
    `${API}/identify?geometry=${e},${n}&geometryType=esriGeometryPoint&layers=all:${layer}` +
    `&tolerance=${radiusM}&mapExtent=${e - 1000},${n - 1000},${e + 1000},${n + 1000}` +
    `&imageDisplay=2000,2000,96&sr=2056&returnGeometry=${geometry}&geometryFormat=geojson&lang=de&limit=200`;
  const data = await getJson(url);
  // geojson format puts attributes under `properties`; normalize to `attributes`
  return (data.results ?? []).map((r: { attributes?: object; properties?: object }) => ({
    ...r,
    attributes: r.attributes ?? r.properties ?? {},
  })) as Array<{
    attributes: Record<string, unknown>;
    geometry?: { type: string; coordinates: number[] | number[][] };
  }>;
}

/** Raster layer value at a point via WMS GetFeatureInfo. Returns null if the point has no value. */
export async function rasterValue(layer: string, e: number, n: number): Promise<string | null> {
  const url =
    `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}` +
    `&CRS=EPSG:2056&BBOX=${e - 50},${n - 50},${e + 50},${n + 50}&WIDTH=101&HEIGHT=101&I=50&J=50` +
    `&INFO_FORMAT=application/json&FEATURE_COUNT=1`;
  const data = await getJson(url);
  const props = data.features?.[0]?.properties;
  if (!props) return null;
  return String(props.value_0 ?? Object.values(props)[0] ?? "") || null;
}

/** True if any feature of a (raster or vector) WMS layer covers the point. */
export async function rasterHit(layer: string, e: number, n: number): Promise<boolean> {
  const url =
    `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}` +
    `&CRS=EPSG:2056&BBOX=${e - 5},${n - 5},${e + 5},${n + 5}&WIDTH=11&HEIGHT=11&I=5&J=5` +
    `&INFO_FORMAT=application/json&FEATURE_COUNT=1`;
  const data = await getJson(url);
  return (data.features?.length ?? 0) > 0;
}

export type Place = { label: string; e: number; n: number; lat: number; lon: number };

/** Swiss address search (also used client-side for autocomplete). */
export async function searchAddress(text: string, limit = 6): Promise<Place[]> {
  const url =
    `${API.replace("/MapServer", "")}/SearchServer?searchText=${encodeURIComponent(text)}` +
    `&type=locations&origins=address&sr=2056&limit=${limit}`;
  const data = await getJson(url);
  return (data.results ?? []).map((r: { attrs: Record<string, number | string> }) => ({
    label: String(r.attrs.label).replace(/<[^>]+>/g, ""),
    // geo.admin returns y = easting, x = northing
    e: Number(r.attrs.y),
    n: Number(r.attrs.x),
    lat: Number(r.attrs.lat),
    lon: Number(r.attrs.lon),
  }));
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("geo.ts")) {
  // self-check: Zürich HB ~ 47.378, 8.540
  const p = lv95ToWgs(2683260, 1248110);
  console.assert(Math.abs(p.lat - 47.378) < 0.002 && Math.abs(p.lon - 8.540) < 0.002, "lv95ToWgs off", p);
  console.log("ok", p);
}
