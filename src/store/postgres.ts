// Postgres backend ("postgres" option), typically Supabase. One row per key:
// { key, v, expires_at }. expires_at is ms|null checked against the injected
// clock on read; a partial index supports optional GC. Access goes through
// PostgREST via @supabase/supabase-js (service role), which is serverless-safe
// (no sticky TCP pool). RLS is enabled with no policies — only the service
// role can read or write.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clock, Envelope, Store, StoreKey } from "./store.ts";
import { BackendUnavailableError, isLive } from "./store.ts";

export const KV_TABLE = "kv_entries";

const SEP = "~";

/** Reversible, collision-free, and prefix-ordered encoding of one key part. */
function encodePart(p: string): string {
  return encodeURIComponent(p).replace(/\./g, "%2E").replace(/~/g, "%7E").replace(/_/g, "%5F");
}

/** Full key → primary-key string. Reversible, collision-free, prefix-ordered. */
export function encodeKey(parts: string[]): string {
  return parts.map(encodePart).join(SEP);
}

export function decodeKey(key: string): string[] {
  return key.split(SEP).map((p) => decodeURIComponent(p));
}

/** Prefix for list(): children of `parts` (same rule as Dynamo/Firestore). */
export function encodeListPrefix(parts: string[]): string {
  return encodeKey(parts) + SEP;
}

type Row = { key: string; v: unknown; expires_at: number | null };

function toEnvelope(row: Row | null | undefined): Envelope<unknown> | null {
  if (!row) return null;
  return { v: row.v, expiresAt: row.expires_at ?? null };
}

// PostgREST/jsonb reject undefined; JSON round-trip drops it.
function plain<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isUnavailable(error: unknown): boolean {
  const status = (error as { status?: number; code?: string }).status;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? error);
  return (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "PGRST003" || // timeout
    /fetch failed|ECONNREFUSED|ETIMEDOUT|socket hang up|network/i.test(message)
  );
}

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    if (isUnavailable(error)) throw new BackendUnavailableError("postgres", error);
    throw error;
  }
}

export class PostgresStore implements Store {
  constructor(
    private readonly client: SupabaseClient,
    private readonly clock: Clock,
    private readonly table: string = KV_TABLE,
  ) {}

  private assertKey(key: StoreKey): void {
    if (key.length < 2) throw new Error("PostgresStore keys need a partition and at least one id part");
  }

  async get<T>(key: StoreKey): Promise<T | null> {
    this.assertKey(key);
    const encoded = encodeKey(key);
    const row = await guard(async () => {
      const { data, error } = await this.client.from(this.table).select("key, v, expires_at").eq("key", encoded).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    });
    const env = toEnvelope(row);
    return isLive(env, this.clock) ? (env.v as T) : null;
  }

  async set<T>(key: StoreKey, value: T, opts?: { ttlMs?: number }): Promise<void> {
    this.assertKey(key);
    const expires_at = opts?.ttlMs === undefined ? null : this.clock() + opts.ttlMs;
    const row: Row = { key: encodeKey(key), v: plain(value), expires_at };
    await guard(async () => {
      const { error } = await this.client.from(this.table).upsert(row, { onConflict: "key" });
      if (error) throw error;
    });
  }

  async delete(key: StoreKey): Promise<void> {
    this.assertKey(key);
    await guard(async () => {
      const { error } = await this.client.from(this.table).delete().eq("key", encodeKey(key));
      if (error) throw error;
    });
  }

  async take<T>(key: StoreKey): Promise<T | null> {
    this.assertKey(key);
    // DELETE … RETURNING via PostgREST: at most one concurrent caller gets the row.
    const row = await guard(async () => {
      const { data, error } = await this.client
        .from(this.table)
        .delete()
        .eq("key", encodeKey(key))
        .select("key, v, expires_at")
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    });
    const env = toEnvelope(row);
    return isLive(env, this.clock) ? (env.v as T) : null;
  }

  async list<T>(prefix: StoreKey): Promise<Array<{ key: StoreKey; value: T }>> {
    if (prefix.length < 1) throw new Error("PostgresStore list needs at least one prefix part");
    const like = encodeListPrefix(prefix) + "%";
    const rows = await guard(async () => {
      const { data, error } = await this.client.from(this.table).select("key, v, expires_at").like("key", like);
      if (error) throw error;
      return (data ?? []) as Row[];
    });
    const out: Array<{ key: StoreKey; value: T }> = [];
    for (const row of rows) {
      const env = toEnvelope(row);
      if (isLive(env, this.clock)) out.push({ key: decodeKey(row.key), value: env.v as T });
    }
    return out;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
