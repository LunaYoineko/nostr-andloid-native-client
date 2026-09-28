import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { buildEIdListTemplate, EMPTY_EID_LIST, parseEIdList } from "./eidList";

const key = generateSecretKey();

it("kind:10003 / 10001 が無ければ EMPTY_EID_LIST", () => {
  expect(parseEIdList(null)).toEqual(EMPTY_EID_LIST);
});

it("e タグの id を出現順・重複なしで拾い、e 以外のタグは untouched で保つ", () => {
  const event = finalizeEvent(
    {
      kind: 10003,
      created_at: 1000,
      tags: [
        ["e", "a"],
        ["t", "nostr"],
        ["e", "b"],
        ["e", "a"], // 重複
        ["unknown", "x", "y"],
      ],
      content: "encrypted-private-part",
    },
    key,
  );
  const list = parseEIdList(event);
  expect(list.ids).toEqual(["a", "b"]);
  expect(list.otherTags).toEqual([
    ["t", "nostr"],
    ["unknown", "x", "y"],
  ]);
  expect(list.content).toBe("encrypted-private-part");
  expect(list.eventId).toBe(event.id);
  expect(list.createdAt).toBe(1000);
});

it("発行するタグは e タグ(ids 順) + otherTags、content は base のまま", () => {
  const base = {
    eventId: "prev",
    createdAt: 1000,
    ids: ["a", "b"],
    otherTags: [["t", "nostr"]],
    content: "encrypted-private-part",
  };
  const template = buildEIdListTemplate(base, 10003, ["b", "c"], 2000);
  expect(template).toEqual({
    kind: 10003,
    content: "encrypted-private-part",
    tags: [
      ["e", "b"],
      ["e", "c"],
      ["t", "nostr"],
    ],
    created_at: 2000,
  });
});

it("created_at は base より後（同じ秒に続けて発行しても新旧が崩れない）", () => {
  const base = { eventId: "prev", createdAt: 5000, ids: [], otherTags: [], content: "" };
  const template = buildEIdListTemplate(base, 10001, [], 4000);
  expect(template.created_at).toBe(5001);
});
