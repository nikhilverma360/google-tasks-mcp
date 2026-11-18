import { describe, expect, it } from "vitest";
import { PostgresStore } from "../../src/store/postgres.ts";
import { buildDeps } from "../../src/deps.ts";
import { StaticCipher } from "../../src/crypto/static.ts";
import { testConfig } from "../support/test-server.ts";
import { MemoryKvTable } from "../support/memory-supabase.ts";
import { runStoreSuite } from "./store.suite.ts";
import { PLANTED_KEY_MATERIAL } from "../support/planted.ts";

const memory = new MemoryKvTable();

runStoreSuite(
  "PostgresStore (memory supabase)",
  async (clock) => {
    memory.reset();
    return new PostgresStore(memory.client(), clock.now);
  },
  {
    persistent: true,
    reopen: async (clock) => new PostgresStore(memory.client(), clock.now),
    modelRuns: 50,
  },
);

describe("buildDeps (postgres option)", () => {
  it("config_postgres_builds", async () => {
    // buildDeps creates a real supabase-js client; point it at a throwaway URL.
    // We only assert the Store/Cipher types and that construction succeeds.
    const deps = await buildDeps(
      testConfig({
        STORAGE: "postgres",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        CIPHER: "static",
        ENCRYPTION_SECRET: PLANTED_KEY_MATERIAL,
      }),
    );
    try {
      expect(deps.store).toBeInstanceOf(PostgresStore);
      expect(deps.cipher).toBeInstanceOf(StaticCipher);
    } finally {
      await deps.store.close();
    }
  });
});
