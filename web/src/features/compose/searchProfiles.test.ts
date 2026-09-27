import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { eventStore } from "../../nostr/store";
import { searchProfiles } from "./searchProfiles";

// ストアは全テストで共有なので、この試験だけに当たる接頭辞を使う
function profile(fields: Record<string, unknown> | string, createdAt: number): string {
  const key = generateSecretKey();
  const content = typeof fields === "string" ? fields : JSON.stringify(fields);
  eventStore.add(finalizeEvent({ kind: 0, created_at: createdAt, tags: [], content }, key));
  return getPublicKey(key);
}

it("名前 / NIP-05 の前方一致（大小無視）。名前ありが先・新しい順・8 件まで。壊れた kind:0 は無視", () => {
  const byName = Array.from({ length: 7 }, (_, i) => profile({ name: `Qzal${i}` }, 100 + i));
  const displayFirst = profile({ display_name: "qzAlice", name: "other" }, 50);
  const handleOnly = profile({ nip05: "qzal@example.com" }, 200);
  profile({ name: "qzbob" }, 300);
  profile("{broken", 400);

  const hits = searchProfiles("QZAL");
  expect(hits).toHaveLength(8);
  expect(hits.map((h) => h.pubkey)).toEqual([...byName.slice().reverse(), displayFirst]);
  expect(hits[7].name).toBe("qzAlice");
  expect(hits.some((h) => h.pubkey === handleOnly)).toBe(false);

  expect(searchProfiles("qzal", 20).at(-1)).toEqual({
    pubkey: handleOnly,
    name: "",
    handle: "qzal@example.com",
  });
  expect(searchProfiles("  ")).toEqual([]);
});
