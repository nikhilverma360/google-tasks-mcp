// In-memory stand-in for the Supabase/PostgREST surface PostgresStore uses.
// Enough for the shared store suite without a live project.
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = { key: string; v: unknown; expires_at: number | null };

export class MemoryKvTable {
  private readonly rows = new Map<string, Row>();

  reset(): void {
    this.rows.clear();
  }

  client(table = "kv_entries"): SupabaseClient {
    const self = this;
    const from = (_table: string) => {
      let filters: Array<(row: Row) => boolean> = [];
      let likePrefix: string | null = null;
      let wantSingle = false;
      let returning = false;

      const api = {
        select(_cols?: string) {
          returning = true;
          return api;
        },
        eq(column: string, value: string) {
          filters.push((row) => (row as Record<string, unknown>)[column] === value);
          return api;
        },
        like(column: string, pattern: string) {
          if (column !== "key" || !pattern.endsWith("%")) {
            throw new Error(`MemoryKvTable only supports key LIKE 'prefix%'`);
          }
          likePrefix = pattern.slice(0, -1);
          return api;
        },
        maybeSingle() {
          wantSingle = true;
          return api.executeSelect();
        },
        async upsert(row: Row, _opts?: { onConflict?: string }) {
          self.rows.set(row.key, { key: row.key, v: row.v, expires_at: row.expires_at ?? null });
          return { data: row, error: null };
        },
        delete() {
          returning = false;
          const delApi = {
            eq(column: string, value: string) {
              filters.push((row) => (row as Record<string, unknown>)[column] === value);
              return delApi;
            },
            select(_cols?: string) {
              returning = true;
              return delApi;
            },
            maybeSingle() {
              wantSingle = true;
              return delApi.executeDelete();
            },
            async executeDelete() {
              const matches = [...self.rows.values()].filter((row) => filters.every((f) => f(row)));
              for (const row of matches) self.rows.delete(row.key);
              const first = matches[0] ?? null;
              return { data: wantSingle ? first : matches, error: null };
            },
            then(onfulfilled: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) {
              // await delete().eq(...) without select/maybeSingle
              return delApi.executeDelete().then(onfulfilled, onrejected);
            },
          };
          return delApi;
        },
        async executeSelect() {
          let matches = [...self.rows.values()].filter((row) => filters.every((f) => f(row)));
          if (likePrefix !== null) {
            matches = matches.filter((row) => row.key.startsWith(likePrefix!));
          }
          if (wantSingle) {
            return { data: matches[0] ?? null, error: null };
          }
          return { data: matches, error: null };
        },
        then(onfulfilled: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) {
          // Await without maybeSingle (list): run select.
          return api.executeSelect().then(onfulfilled, onrejected);
        },
      };
      return api;
    };

    return { from } as unknown as SupabaseClient;
  }
}
