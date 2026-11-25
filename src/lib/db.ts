import { neon } from "@neondatabase/serverless";
import type { AgentResult, Profile, Verdict } from "./agents";
import type { Place } from "./geo";
import type { ApiLog, Building, DataPoint, Poi } from "./sources";

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
  user_id?: string | null;
};

const sql = neon(process.env.DATABASE_URL!);

// ponytail: one table with jsonb columns; split into normalized tables (Datenpunkt, Agenten-Bewertung …)
// once we need cross-analysis queries (benchmarks, bank API).
let ready: Promise<unknown> | null = null;
const ensure = () =>
  (ready ??= Promise.all([
    sql`
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
    )`,
    sql`
    create table if not exists api_logs (
      id bigserial primary key,
      analysis_id text,
      source text not null,
      ok boolean not null,
      ms integer not null,
      error text,
      created_at timestamptz not null default now()
    )`,
  ]).then(() => sql`
    alter table analyses add column if not exists user_id text;
  `).then(() => sql`alter table analyses add column if not exists ip_hash text`)
    .then(() => sql`create index if not exists analyses_user on analyses (user_id, created_at desc)`));

export async function setOwner(id: string, userId: string | null, ipHash: string | null) {
  await ensure();
  await sql`update analyses set user_id = ${userId}, ip_hash = ${ipHash} where id = ${id}`;
}

/** Attach an anonymous analysis to a user ("Zu meinen Analysen hinzufügen"). Never steals someone else's. */
export async function claimAnalysis(id: string, userId: string) {
  await ensure();
  await sql`update analyses set user_id = ${userId} where id = ${id} and user_id is null`;
}

export async function countToday(by: { userId?: string; ipHash?: string }) {
  await ensure();
  const rows = by.userId
    ? await sql`select count(*)::int as c from analyses where user_id = ${by.userId} and created_at > now() - interval '1 day'`
    : await sql`select count(*)::int as c from analyses where user_id is null and ip_hash = ${by.ipHash ?? ""} and created_at > now() - interval '1 day'`;
  return (rows[0] as { c: number }).c;
}

export async function userAnalyses(userId: string) {
  await ensure();
  return (await sql`
    select id, place->>'label' as label, profile, (verdict->>'score')::int as score, created_at
    from analyses where user_id = ${userId} order by created_at desc limit 200`) as Array<{
    id: string; label: string; profile: string; score: number | null; created_at: string;
  }>;
}

export async function getAnalysesOf(ids: string[], userId: string) {
  await ensure();
  return (await sql`select * from analyses where id = any(${ids}) and user_id = ${userId}`) as Analysis[];
}

export async function saveLogs(analysisId: string, logs: ApiLog[]) {
  if (!logs.length) return;
  await ensure();
  await sql`
    insert into api_logs (analysis_id, source, ok, ms, error)
    select ${analysisId}, x->>'source', (x->>'ok')::boolean, (x->>'ms')::int, x->>'error'
    from jsonb_array_elements(${JSON.stringify(logs)}::jsonb) x`;
}

/** Per-source health over the last `days` days, for the admin page. */
export async function sourceStats(days = 7) {
  await ensure();
  return (await sql`
    select source, count(*)::int as calls, count(*) filter (where ok)::int as ok_calls,
      round(avg(ms))::int as avg_ms, max(created_at) as last_call,
      (array_agg(error order by created_at desc) filter (where not ok))[1] as last_error
    from api_logs where created_at > now() - make_interval(days => ${days})
    group by source order by (count(*) filter (where not ok))::float / count(*) desc, source`) as Array<{
    source: string; calls: number; ok_calls: number; avg_ms: number; last_call: string; last_error: string | null;
  }>;
}

export async function recentLogs(limit = 100) {
  await ensure();
  return (await sql`select * from api_logs order by id desc limit ${limit}`) as Array<ApiLog & { id: number; analysis_id: string; created_at: string }>;
}

export async function recentAnalyses(limit = 30) {
  await ensure();
  return (await sql`
    select id, place->>'label' as label, profile, verdict->>'score' as score, created_at
    from analyses order by created_at desc limit ${limit}`) as Array<{ id: string; label: string; profile: string; score: string; created_at: string }>;
}

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
