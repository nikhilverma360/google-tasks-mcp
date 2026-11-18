-- Key-value store for google-tasks-mcp (STORAGE=postgres).
-- One row per Store key; application code checks expires_at against its clock.
-- RLS on, no policies: the anon/authenticated roles cannot access this table.
-- The Vercel function uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

create table if not exists public.kv_entries (
  key text primary key,
  v jsonb not null,
  expires_at bigint null
);

comment on table public.kv_entries is
  'MCP server KV (grants, clients, sessions, rate limits). Service role only.';

comment on column public.kv_entries.expires_at is
  'Unix epoch milliseconds; null means no expiry. Reads treat past values as absent.';

create index if not exists kv_entries_expires_at_idx
  on public.kv_entries (expires_at)
  where expires_at is not null;

alter table public.kv_entries enable row level security;

-- Intentionally no CREATE POLICY: deny all for anon/authenticated.
-- service_role bypasses RLS and is the only intended client.

revoke all on table public.kv_entries from anon, authenticated;
grant select, insert, update, delete on table public.kv_entries to service_role;
