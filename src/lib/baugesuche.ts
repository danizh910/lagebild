import { neon } from "@neondatabase/serverless";
import { searchAddress } from "./geo";
import type { ApiLog } from "./sources";

// Baugesuche Kanton Zürich (OGD, Statistisches Amt ZH, täglich aktualisiert, seit Herbst 2024 gesammelt).
export const CSV_URL = "https://daten.statistik.zh.ch/ogd/daten/ressourcen/KTZH_00002982_00006183.csv";
export const SOURCE = "Kanton Zürich · Baugesuche (OGD/Amtsblatt)";
export const detailUrl = (id: string) => `https://amtsblatt.zh.ch/#!/search/publications/detail/${id}`;

const sql = neon(process.env.DATABASE_URL!);

export type Baugesuch = {
  id: string;
  pub_date: string;
  description: string;
  address: string;
  municipality: string;
  zone: string | null;
  category: Category;
  e: number | null;
  n: number | null;
};

export type Category = "Neubau" | "Aufstockung/Anbau" | "Abbruch" | "Umbau/Sanierung" | "Energie" | "Kleinbauten/Umgebung" | "Sonstiges";

const BUILDING = /mehrfamilien|einfamilien|mfh|efh|doppel|reihen|wohnhaus|wohnungen|wohnbau|überbauung|gewerbe|büro|geschäftshaus|schulhaus|sporthalle|hotel|alterszentrum|pflegezentrum/;
const SMALL = /pool|schwimmbad|velounterstand|unterstand|carport|garage|gartenhaus|pergola|sitzplatz|zaun|mauer|sichtschutz|umgebung|nebengebäude|kleinbaut|container|zelt|plakat|reklame|bushaltestelle|flurweg|parkpl|abstellpl/;

/** Keyword classification of the free-text project description. Order matters (first match wins). */
export function categorize(desc: string): Category {
  const d = desc.toLowerCase();
  if (/neubau|überbauung|erstellen (eines|einer|von)/.test(d) && BUILDING.test(d)) return "Neubau";
  // plain "erweiterung" is too broad ("Lifterweiterung"), so only building extensions count
  if (/aufstockung|\banbau|dachausbau|ausbau dach|gebäudeerweiterung|erweiterung (des|der|von) (wohn|mehrfamilien|einfamilien|gebäude|haus)/.test(d)) return "Aufstockung/Anbau";
  if (/abbruch|rückbau/.test(d) && !/neubau/.test(d)) return "Abbruch";
  if (/wärmepumpe|photovoltaik|pv-anlage|solaranlage|solar|erdsonde|fernwärme|heizungsersatz/.test(d)) return "Energie";
  if (/umbau|sanierung|renovation|umnutzung|fassade|fenster|innenausbau/.test(d)) return "Umbau/Sanierung";
  if (/neubau/.test(d) || SMALL.test(d)) return "Kleinbauten/Umgebung";
  return "Sonstiges";
}
export const DEVELOPMENT: Category[] = ["Neubau", "Aufstockung/Anbau", "Abbruch"];

let ready: Promise<unknown> | null = null;
export const ensureTable = () =>
  (ready ??= sql`
    create table if not exists baugesuche (
      id text primary key,
      pub_date date not null,
      description text not null,
      address text not null,
      municipality text not null default '',
      zone text,
      category text not null,
      e double precision,
      n double precision,
      geocode_tried boolean not null default false,
      created_at timestamptz not null default now()
    )`.then(() => sql`create index if not exists baugesuche_en on baugesuche (e, n)`));

export async function insertMany(rows: Baugesuch[], tried = false) {
  if (!rows.length) return;
  await ensureTable();
  await sql`
    insert into baugesuche (id, pub_date, description, address, municipality, zone, category, e, n, geocode_tried)
    select x->>'id', (x->>'pub_date')::date, x->>'description', x->>'address', x->>'municipality', x->>'zone', x->>'category',
      (x->>'e')::float, (x->>'n')::float, ${tried} or (x->>'e') is not null
    from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) x
    on conflict (id) do nothing`;
}

/** Applications within radius (m) of a point, newest first. Plain bbox + distance, no PostGIS needed. */
export async function nearby(e: number, n: number, radius: number, months = 24) {
  await ensureTable();
  return (await sql`
    select id, pub_date::text, description, address, category, e, n,
      round(sqrt(power(e - ${e}, 2) + power(n - ${n}, 2)))::int as dist
    from baugesuche
    where e between ${e - radius} and ${e + radius} and n between ${n - radius} and ${n + radius}
      and sqrt(power(e - ${e}, 2) + power(n - ${n}, 2)) <= ${radius}
      and pub_date > now() - make_interval(months => ${months})
    order by pub_date desc`) as Array<Baugesuch & { dist: number }>;
}

// ---- CSV import (daily cron) ----
/** Minimal RFC 4180 parser (quoted fields, escaped quotes, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function csvToRows(text: string): Baugesuch[] {
  const [head, ...data] = parseCsv(text.replace(/^﻿/, ""));
  const col = (name: string) => head.indexOf(name);
  const I = {
    id: col("id"), date: col("publicationDate"), desc: col("projectDescription"), street: col("projectLocation_address_street"),
    nr: col("projectLocation_address_houseNumber"), zip: col("projectLocation_address_swissZipCode"),
    town: col("projectLocation_address_town"), muni: col("municipality_name"), zone: col("districtCadastre_relation_buildingZone"),
  };
  return data.filter((r) => r[I.id] && r[I.date]).map((r) => {
    const street = [r[I.street], r[I.nr]].filter(Boolean).join(" ");
    return {
      id: r[I.id], pub_date: r[I.date], description: r[I.desc] ?? "",
      address: [street, [r[I.zip], r[I.town]].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      municipality: r[I.muni] || r[I.town] || "", zone: r[I.zone] || null,
      category: categorize(r[I.desc] ?? ""), e: null, n: null,
    };
  });
}

/** Import new applications from the CSV and geocode a batch of pending ones. */
export async function syncBaugesuche(geocodeLimit = 300): Promise<{ inserted: number; geocoded: number; pending: number; logs: ApiLog[] }> {
  await ensureTable();
  const logs: ApiLog[] = [];
  const t0 = Date.now();
  const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`csv ${res.status}`);
  const rows = csvToRows(await res.text());
  logs.push({ source: `${SOURCE} · CSV`, ok: true, ms: Date.now() - t0 });

  const known = new Set(((await sql`select id from baugesuche`) as Array<{ id: string }>).map((r) => r.id));
  const fresh = rows.filter((r) => !known.has(r.id));
  for (let i = 0; i < fresh.length; i += 500) await insertMany(fresh.slice(i, i + 500));

  const pending = (await sql`
    select id, address from baugesuche where e is null and not geocode_tried and address <> ''
    order by pub_date desc limit ${geocodeLimit}`) as Array<{ id: string; address: string }>;
  let geocoded = 0;
  const t1 = Date.now();
  // 8 parallel requests to stay polite towards geo.admin.ch
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    const hits = await Promise.all(batch.map((p) => searchAddress(p.address, 1).then((h) => h[0]).catch(() => undefined)));
    const updates = batch.map((p, j) => ({ id: p.id, e: hits[j]?.e ?? null, n: hits[j]?.n ?? null }));
    geocoded += updates.filter((u) => u.e != null).length;
    await sql`
      update baugesuche b set e = (x->>'e')::float, n = (x->>'n')::float, geocode_tried = true
      from jsonb_array_elements(${JSON.stringify(updates)}::jsonb) x where b.id = x->>'id'`;
  }
  if (pending.length) logs.push({ source: "geo.admin.ch · Geokodierung Baugesuche", ok: true, ms: Date.now() - t1 });
  const [{ count }] = (await sql`select count(*)::int as count from baugesuche where e is null and not geocode_tried`) as Array<{ count: number }>;
  return { inserted: fresh.length, geocoded, pending: count, logs };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("baugesuche.ts")) {
  console.assert(categorize("Ersatzneubau Mehrfamilienhaus mit Tiefgarage") === "Neubau");
  console.assert(categorize("Abbruch Garage") === "Abbruch");
  console.assert(categorize("Erstellen von drei Luft-Wasser-Wärmepumpen") === "Energie");
  console.assert(categorize("Aufstockung Wohnhaus") === "Aufstockung/Anbau");
  console.assert(categorize("Umbau und Sanierung EFH") === "Umbau/Sanierung");
  console.assert(categorize("Abbruch bestehender Werkstatt sowie Neubau Mehrfamilienhaus mit 7 Wohnungen") === "Neubau");
  console.assert(categorize("Neubau Velounterstand / 16 Fahrräder") === "Kleinbauten/Umgebung");
  console.assert(categorize("Sanierung Mehrfamilienhaus (Aussenwärmedämmung, Lifterweiterung)") === "Umbau/Sanierung");
  console.assert(categorize("Neubau beheizter Pool mit Wärmepumpe") === "Energie" || categorize("Neubau beheizter Pool mit Wärmepumpe") === "Kleinbauten/Umgebung");
  const rows = parseCsv('a,b\n"x, ""y""",2\r\n3,"multi\nline"\n');
  console.assert(rows.length === 3 && rows[1][0] === 'x, "y"' && rows[2][1] === "multi\nline", "csv", rows);
  console.log("baugesuche ok");
}
