// Pure transform: Postgres key encoding. Oracle: properties.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decodeKey, encodeKey, encodeListPrefix } from "../../src/store/postgres.ts";

const part = fc.string({ unit: "binary", minLength: 1, maxLength: 12 });
const key = fc.array(part, { minLength: 1, maxLength: 4 });

describe("encodeKey", () => {
  it("roundtrip", () => {
    fc.assert(
      fc.property(key, (k) => {
        expect(decodeKey(encodeKey(k))).toEqual(k);
      }),
    );
  });

  it("no_collisions", () => {
    fc.assert(
      fc.property(key, key, (a, b) => {
        fc.pre(JSON.stringify(a) !== JSON.stringify(b));
        expect(encodeKey(a)).not.toBe(encodeKey(b));
      }),
    );
  });

  it("list_prefix_matches_children_only", () => {
    fc.assert(
      fc.property(key, part, (p, extra) => {
        const child = encodeKey([...p, extra]);
        const prefix = encodeListPrefix(p);
        expect(child.startsWith(prefix)).toBe(true);
        expect(encodeKey(p).startsWith(prefix)).toBe(false);
      }),
    );
  });
});
