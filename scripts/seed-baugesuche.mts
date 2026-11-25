// One-off seed: CSV rows + parcel centroids from the GeoPackage, then geocode the rest in batches.
// Usage: npx tsx --env-file=.env.local scripts/seed-baugesuche.mts <bg.csv> <centroids.json>
import { readFileSync } from "node:fs";
import { csvToRows, insertMany, syncBaugesuche } from "../src/lib/baugesuche";

const rows = csvToRows(readFileSync(process.argv[2], "utf-8"));
const cent: Record<string, [number, number]> = JSON.parse(readFileSync(process.argv[3], "utf-8"));
for (const r of rows) if (cent[r.id]) [r.e, r.n] = cent[r.id];
console.log(rows.length, "rows,", rows.filter((r) => r.e != null).length, "with coordinates");
for (let i = 0; i < rows.length; i += 1000) await insertMany(rows.slice(i, i + 1000));
for (;;) {
  const r = await syncBaugesuche(400);
  console.log(`inserted ${r.inserted}, geocoded ${r.geocoded}, pending ${r.pending}`);
  if (!r.pending) break;
}
