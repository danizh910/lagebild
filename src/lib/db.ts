import { neon } from "@neondatabase/serverless";
import type { AgentResult, Profile, Verdict } from "./agents";
import type { Place } from "./geo";
import type { Building, DataPoint, Poi } from "./sources";

export type Analysis = {
  id: string;
  place: Place;
  profile: Profile;
  status: "running" | "done" | "failed";
  points: DataPoint[];
  pois: Poi[];
  building: Building | null;
  agents: AgentResult[];
  verdict: Verdict | null;
  created_at: string;
};

const sql = neon(process.env.DATABASE_URL!);

// ponytail: one table with jsonb columns; split into normalized tables (Datenpunkt, Agenten-Bewertung …)
// once we need cross-analysis queries (benchmarks, bank API).
let ready: Promise<unknown> | null = null;
const ensure = () =>
  (ready ??= sql`
    create table if not exists analyses (
      id text primary key,
      place jsonb not null,
      profile text not null,
      status text not null,
      points jsonb not null default '[]',
      pois jsonb not null default '[]',
      building jsonb,
      agents jsonb not null default '[]',
      verdict jsonb,
      created_at timestamptz not null default now()
    )`);

export async function saveAnalysis(a: Omit<Analysis, "created_at">) {
  await ensure();
  await sql`
    insert into analyses (id, place, profile, status, points, pois, building, agents, verdict)
    values (${a.id}, ${JSON.stringify(a.place)}, ${a.profile}, ${a.status}, ${JSON.stringify(a.points)},
            ${JSON.stringify(a.pois)}, ${JSON.stringify(a.building)}, ${JSON.stringify(a.agents)}, ${JSON.stringify(a.verdict)})
    on conflict (id) do update set status = excluded.status, points = excluded.points, pois = excluded.pois,
      building = excluded.building, agents = excluded.agents, verdict = excluded.verdict`;
}

export async function getAnalysis(id: string): Promise<Analysis | null> {
  await ensure();
  const rows = await sql`select * from analyses where id = ${id}`;
  return (rows[0] as Analysis) ?? null;
}

/** Recent finished analysis of the same spot, to reuse collected data (cache for a few weeks). */
export async function findRecent(e: number, n: number, days = 21): Promise<Analysis | null> {
  await ensure();
  const rows = await sql`
    select * from analyses
    where status = 'done' and (place->>'e')::float = ${e} and (place->>'n')::float = ${n}
      and created_at > now() - make_interval(days => ${days})
    order by created_at desc limit 1`;
  return (rows[0] as Analysis) ?? null;
}
