import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { EMPTY, throwError } from "rxjs";
import { beforeEach, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { FollowError, OWN_CONTACTS_TIMEOUT_MS, toggleFollow } from "./follow";
import { PublishError, signAndPublish } from "./publishMinimal";

// リレーには繋がない（自分の kind:3 の取り直しはテストごとに完了 / 失敗を返す）
vi.mock("../../nostr/pool", () => ({
  relays: ["wss://relay.example"],
  requestOnce: vi.fn(),
}));

vi.mock("./publishMinimal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./publishMinimal")>()),
  signAndPublish: vi.fn(async () => ({})),
}));

const A = "a".repeat(64);
const B = "b".repeat(64);

let meKey: Uint8Array;
let me: string;

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(signAndPublish).mockClear();
});

function addOwnContacts(tags: string[][]) {
  eventStore.add(finalizeEvent({ kind: 3, created_at: 1_000, tags, content: "" }, meKey));
}

it("直前に自分の kind:3 を取り直し、手元のリストに足して発行する", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  addOwnContacts([["p", A]]);

  await expect(toggleFollow(me, B, "follow")).resolves.toBe("done");

  expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
    ["wss://relay.example", ...INDEXER_RELAYS],
    [{ kinds: [3], authors: [me], limit: 1 }],
    OWN_CONTACTS_TIMEOUT_MS,
  );
  expect(vi.mocked(signAndPublish)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(signAndPublish).mock.calls[0][0]).toMatchObject({
    kind: 3,
    tags: [
      ["p", A],
      ["p", B],
    ],
  });
});

it("どのリレーからも応答が無く手元にも無ければ発行しない（no-contacts）", async () => {
  vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

  const error = await toggleFollow(me, B, "follow").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(FollowError);
  expect(error).toMatchObject({ reason: "no-contacts" });
  expect(vi.mocked(signAndPublish)).not.toHaveBeenCalled();
});

it("応答が無ければ手元に kind:3 があっても発行しない（古い版での上書きを防ぐ）", async () => {
  vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
  addOwnContacts([["p", A]]);

  const error = await toggleFollow(me, B, "follow").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(FollowError);
  expect(error).toMatchObject({ reason: "no-contacts" });
  expect(vi.mocked(signAndPublish)).not.toHaveBeenCalled();
});

it("リレーが応答して kind:3 が無ければ新規アカウントとしてその 1 人のリストを発行する", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);

  await expect(toggleFollow(me, B, "follow")).resolves.toBe("done");
  expect(vi.mocked(signAndPublish).mock.calls[0][0].tags).toEqual([["p", B]]);
});

it("既にフォロー中の相手に follow しても発行しない（noop）", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  addOwnContacts([["p", A]]);

  await expect(toggleFollow(me, A, "follow")).resolves.toBe("noop");
  expect(vi.mocked(signAndPublish)).not.toHaveBeenCalled();
});

it("unfollow は既存のタグと content を保ったままその人だけを外す", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  eventStore.add(
    finalizeEvent(
      {
        kind: 3,
        created_at: 1_000,
        tags: [
          ["p", A, "wss://r", "alice"],
          ["t", "nostr"],
          ["p", B],
        ],
        content: "{}",
      },
      meKey,
    ),
  );

  await expect(toggleFollow(me, A, "unfollow")).resolves.toBe("done");
  expect(vi.mocked(signAndPublish).mock.calls[0][0]).toMatchObject({
    kind: 3,
    content: "{}",
    tags: [
      ["t", "nostr"],
      ["p", B],
    ],
  });
});

it("送信の失敗は同じ reason の FollowError にする", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  vi.mocked(signAndPublish).mockRejectedValueOnce(new PublishError("not-accepted"));

  const error = await toggleFollow(me, B, "follow").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(FollowError);
  expect(error).toMatchObject({ reason: "not-accepted" });
});
