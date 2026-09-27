import { afterEach, expect, it } from "vitest";
import type { DmMessageRow } from "../../db/schema";
import { conversationsOf, messagesWith, useDm } from "./dmStore";

afterEach(() => {
  useDm.getState().reset(null);
});

function row(id: string, peer: string, createdAt: number, content = id): DmMessageRow {
  return { owner: "me", id, peer, sender: peer, content, tags: [], createdAt, proto: "nip17" };
}

it("conversationsOf: 相手ごとに最新の 1 件、新しい順（同時刻は id の昇順）", () => {
  const messages = [
    row("a1", "alice", 10),
    row("a2", "alice", 30),
    row("b1", "bob", 20),
    row("c1", "carol", 30),
    row("d2", "dave", 5),
    row("d1", "dave", 5),
  ];
  expect(conversationsOf(messages).map((c) => [c.peer, c.last.id])).toEqual([
    ["alice", "a2"],
    ["carol", "c1"],
    ["bob", "b1"],
    // 同じ相手で同時刻なら会話の一番下（id の大きい方）
    ["dave", "d2"],
  ]);
  expect(conversationsOf([])).toEqual([]);
});

it("messagesWith: 相手の分だけを古い順（同時刻は id の昇順）", () => {
  const messages = [
    row("a3", "alice", 30),
    row("b1", "bob", 1),
    row("a2", "alice", 10),
    row("a1", "alice", 10),
  ];
  expect(messagesWith(messages, "alice").map((m) => m.id)).toEqual(["a1", "a2", "a3"]);
  expect(messagesWith(messages, "nobody")).toEqual([]);
});

it("upsertMessages は同じ id を上書き、removeMessage で消す、reset で空に戻す", () => {
  const { upsertMessages, removeMessage, reset } = useDm.getState();
  reset("me");
  upsertMessages([row("x", "alice", 1, "old"), row("y", "bob", 2)]);
  upsertMessages([row("x", "alice", 1, "new")]);
  expect(useDm.getState().messages.x.content).toBe("new");
  expect(Object.keys(useDm.getState().messages).sort()).toEqual(["x", "y"]);

  removeMessage("y");
  expect(Object.keys(useDm.getState().messages)).toEqual(["x"]);

  useDm.setState({ loaded: true, pending: 3, paused: true, decrypting: true, nip17: "no-nip44" });
  reset(null);
  expect(useDm.getState()).toMatchObject({
    owner: null,
    messages: {},
    loaded: false,
    pending: 0,
    paused: false,
    decrypting: false,
    nip17: "ok",
    nip04: "ok",
  });
});
