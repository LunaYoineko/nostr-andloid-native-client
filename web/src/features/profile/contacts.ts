import type { EventTemplate, NostrEvent } from "nostr-tools/pure";

const HEX64 = /^[0-9a-f]{64}$/i;

/** kind:3 の p タグの pubkey（64 桁 hex だけを小文字にし、出現順で重複を除く） */
export function followsFromContacts(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  const follows = new Set<string>();
  for (const t of event.tags) {
    if (t[0] === "p" && typeof t[1] === "string" && HEX64.test(t[1])) follows.add(t[1].toLowerCase());
  }
  return [...follows];
}

/**
 * フォロー / 解除後の kind:3。他のクライアントが作ったリストを壊さないよう、既存のタグ（リレーヒント・
 * ペットネーム付きの p、t など）は順序も中身もそのまま残し、content も引き継ぐ（ネイティブは p だけで作り直す）。
 * follow = 末尾に ["p", target] を足す、unfollow = 値が target の p タグをすべて除く。
 * 変える必要が無ければ null。target は小文字の hex。
 */
export function buildContactsTemplate(
  base: NostrEvent | null,
  target: string,
  action: "follow" | "unfollow",
  nowSec: number,
): EventTemplate | null {
  const tags = base?.tags ?? [];
  const isTarget = (t: string[]) => t[0] === "p" && t[1]?.toLowerCase() === target;
  const has = tags.some(isTarget);
  let next: string[][];
  if (action === "follow") {
    if (has) return null;
    next = [...tags, ["p", target]];
  } else {
    if (!has) return null;
    next = tags.filter((t) => !isTarget(t));
  }
  return {
    kind: 3,
    content: base?.content ?? "",
    tags: next,
    // 同じ秒に続けて押しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}
