// Smoke check against live APIs: npx tsx scripts/collect-check.ts "Langstrasse 4 Zürich"
import { searchAddress } from "../src/lib/geo";
import { collect } from "../src/lib/sources";
const [p] = await searchAddress(process.argv[2] ?? "Langstrasse 4 8004 Zürich");
console.assert(p && p.e > 2.4e6 && p.n > 1.0e6, "geocode failed", p);
const r = await collect(p, (m) => console.log("·", m));
console.table(r.points.map((d) => ({ key: d.key, value: d.value, unit: d.unit })));
console.log("building", r.building, "pois", r.pois.length);
