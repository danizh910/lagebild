// Re-run the keyword classifier over all stored Baugesuche (after changing categorize()).
// Usage: npx tsx --env-file=.env.local scripts/recategorize-baugesuche.mts
import { neon } from "@neondatabase/serverless";
import { categorize } from "../src/lib/baugesuche";

const sql = neon(process.env.DATABASE_URL!);
const rows = (await sql`select id, description, category from baugesuche`) as Array<{ id: string; description: string; category: string }>;
const changed = rows.map((r) => ({ id: r.id, category: categorize(r.description), old: r.category })).filter((r) => r.category !== r.old);
for (let i = 0; i < changed.length; i += 2000) {
  await sql`update baugesuche b set category = x->>'category'
    from jsonb_array_elements(${JSON.stringify(changed.slice(i, i + 2000))}::jsonb) x where b.id = x->>'id'`;
}
console.log(`${changed.length} von ${rows.length} neu kategorisiert`);
console.log(await sql`select category, count(*)::int from baugesuche group by 1 order by 2 desc`);
