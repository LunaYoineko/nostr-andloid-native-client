import { decodePointer } from "applesauce-core/helpers/pointers";
import { tokenizeNostrContent } from "../../lib/content/tokenize";

/**
 * 投稿に付けるタグの組み立て（純関数）。ネイティブの Nip10.kt / Nip22.kt / Nip27.kt / RelayHints.kt と
 * EventRepository.kt の hashtagsIn / emojiTagsIn をそのまま移植する（applesauce の Factory は規則が違うので使わない）。
 */

/** 返信の p タグの上限（ネイティブ Nip10.MAX_P_TAGS）。返信先の作者は必ず残す */
export const MAX_P_TAGS = 16;

/** リレー URL の比較用（前後の空白と末尾の / を除く） */
export function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** 本文の #ハッシュタグ（小文字・重複除去・出現順）。URL 内の # も対象（ネイティブと同じ） */
export function hashtagsIn(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(/#([\p{L}\p{Nd}_]+)/gu)) out.add(m[1].toLowerCase());
  return [...out];
}

/** 本文の :shortcode: のうち known（shortcode → 画像 URL）にあるものを NIP-30 の emoji タグに（出現順） */
export function emojiTagsIn(content: string, known: ReadonlyMap<string, string>): string[][] {
  const codes = new Set<string>();
  for (const m of content.matchAll(/:([A-Za-z0-9_+-]+):/g)) codes.add(m[1]);
  const out: string[][] = [];
  for (const code of codes) {
    const url = known.get(code);
    if (url !== undefined) out.push(["emoji", code, url]);
  }
  return out;
}

/**
 * 本文のメンション（nostr:npub / nprofile。nostr: は任意）の pubkey（重複除去・出現順）。
 * 表示側と同じ tokenizeNostrContent（ネイティブ Nip27.kt 移植、裸の bech32 の境界規則込み）で判定するので、
 * URL の中や語中の bech32 は拾わない（挙動2.2: 発行時も表示と同じ規則にする）。
 */
export function mentionPubkeysIn(content: string): string[] {
  const out = new Set<string>();
  for (const token of tokenizeNostrContent(content)) {
    if (token.type !== "nostr") continue;
    let decoded: ReturnType<typeof decodePointer>;
    try {
      decoded = decodePointer(token.bech);
    } catch {
      continue;
    }
    if (decoded?.type === "npub") out.add(decoded.data);
    else if (decoded?.type === "nprofile") out.add(decoded.data.pubkey);
  }
  return [...out];
}

/** メンション先の p タグ。existing（継承済みの p 等）にあるものは足さない */
export function mentionPTags(content: string, existing: Iterable<string> = []): string[][] {
  const seen = new Set(existing);
  const out: string[][] = [];
  for (const pubkey of mentionPubkeysIn(content)) {
    if (seen.has(pubkey)) continue;
    seen.add(pubkey);
    out.push(["p", pubkey]);
  }
  return out;
}

function eTags(tags: readonly string[][]): string[][] {
  return tags.filter((t) => t.length >= 2 && t[0] === "e");
}

/** NIP-10 のルート（root マーカー → mention 以外の先頭の e）。無ければ null */
export function rootOf(tags: readonly string[][]): string | null {
  const es = eTags(tags);
  const root = es.find((t) => t.length >= 4 && t[3] === "root");
  if (root) return root[1];
  return es.find((t) => t.length < 4 || t[3] !== "mention")?.[1] ?? null;
}

/** marked "e" タグ。作者が分かるときだけ 5 番目に入れる。ヒントの枠は空（発行直前に fillRelayHints が埋める） */
function markedE(id: string, marker: string, author: string | null): string[] {
  return author ? ["e", id, "", marker, author] : ["e", id, "", marker];
}

/**
 * 返信（kind:1）の e / p タグ（ネイティブ Nip10.replyTags）。ルートへの直接返信は root の e 1 本、途中への返信は
 * root → reply の 2 本。p は返信先の p を継承（自分と返信先作者を除き MAX_P_TAGS - 1 まで）+ 末尾に返信先作者
 * （返信先が自分なら付けない）。
 */
export function nip10ReplyTags({
  targetId,
  targetPubkey,
  targetTags,
  rootAuthor,
  selfPubkey,
}: {
  targetId: string;
  targetPubkey: string;
  targetTags: readonly string[][];
  rootAuthor: string | null;
  selfPubkey: string | null;
}): string[][] {
  const root = rootOf(targetTags) ?? targetId;
  const es =
    root === targetId
      ? [markedE(root, "root", rootAuthor ?? targetPubkey)]
      : [markedE(root, "root", rootAuthor), markedE(targetId, "reply", targetPubkey)];

  const inherited = new Set<string>();
  for (const t of targetTags) if (t.length >= 2 && t[0] === "p") inherited.add(t[1]);
  inherited.delete(targetPubkey);
  if (selfPubkey !== null) inherited.delete(selfPubkey);
  const head = [...inherited].slice(0, MAX_P_TAGS - 1);
  const ps = targetPubkey === selfPubkey ? head : [...head, targetPubkey];
  return [...es, ...ps.map((p) => ["p", p])];
}

/** NIP-22 のルートを指す大文字タグ */
const NIP22_ROOT_KEYS: ReadonlySet<string> = new Set(["E", "A", "I", "K", "P"]);

/**
 * kind:1111 への返信のタグ（ネイティブ Nip22.replyTags）。親のルートタグを丸ごと継承し（無ければ親をルートに立てる）、
 * 親を小文字の e / k / p で指す。
 */
export function nip22ReplyTags(
  parentId: string,
  parentPubkey: string,
  parentTags: readonly string[][],
): string[][] {
  const roots = parentTags.filter((t) => t.length >= 2 && NIP22_ROOT_KEYS.has(t[0])).map((t) => [...t]);
  const rootPart =
    roots.length > 0
      ? roots
      : [
          ["E", parentId, "", parentPubkey],
          ["K", "1111"],
          ["P", parentPubkey],
        ];
  return [...rootPart, ["e", parentId, "", parentPubkey], ["k", "1111"], ["p", parentPubkey]];
}

/** Kotlin の String.toIntOrNull 相当（符号付きの 10 進整数だけ） */
function toIntOrNull(s: string): number | null {
  return /^[+-]?\d+$/.test(s) ? Number(s) : null;
}

/**
 * 他人に教えてよい公開リレーか（ネイティブ RelayHints.isPublic）。wss:// のみ、localhost / ループバック /
 * プライベートアドレス / mDNS を除く。
 */
export function isPublicRelay(url: string): boolean {
  if (!url.startsWith("wss://")) return false;
  const hostPort = url.slice("wss://".length).split("/")[0];
  const host = (hostPort.startsWith("[") ? hostPort.slice(1) : hostPort)
    .split("]")[0]
    .split(":")[0]
    .toLowerCase();
  if (host === "") return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return false;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))
    return false;
  const oct = host.split(".");
  const nums = oct.map(toIntOrNull);
  if (oct.length === 4 && nums.every((n) => n !== null && n >= 0 && n <= 255)) {
    const [a, b] = nums as number[];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

/**
 * ヒントを 1 本選ぶ（ネイティブ RelayHints.pick）。受信元 ∩ 著者の write → 著者の write の先頭 → 受信元。
 * excluded と非公開リレーはどの段でも除く。無ければ ""。
 */
export function pickRelayHint(
  seenOn: readonly string[],
  authorWrite: readonly string[],
  excluded: ReadonlySet<string>,
): string {
  const ok = (u: string) => u.trim() !== "" && !excluded.has(u) && isPublicRelay(u);
  const write = authorWrite.filter(ok);
  const seen = seenOn.filter(ok);
  const seenSet = new Set(seen);
  return write.find((u) => seenSet.has(u)) ?? write[0] ?? seen[0] ?? "";
}

const EVENT_HINT_KEYS: ReadonlySet<string> = new Set(["e", "q", "E"]);
const PUBKEY_HINT_KEYS: ReadonlySet<string> = new Set(["p", "P"]);

/**
 * タグ列の空いているヒント枠を埋める（ネイティブ RelayHints.fill）。e / q / E は eventHint、p / P は pubkeyHint。
 * 3 要素目が入っていれば触らない。2 要素のタグはヒントが "" でも 3 要素に伸ばす。
 */
export function fillRelayHints(
  tags: readonly string[][],
  eventHint: (id: string) => string,
  pubkeyHint: (pk: string) => string,
): string[][] {
  return tags.map((tag) => {
    if (tag.length < 2) return tag;
    const lookup = EVENT_HINT_KEYS.has(tag[0]) ? eventHint : PUBKEY_HINT_KEYS.has(tag[0]) ? pubkeyHint : null;
    if (!lookup) return tag;
    if (tag.length >= 3 && tag[2] !== "") return tag;
    const hint = lookup(tag[1]);
    return tag.length >= 3 ? [tag[0], tag[1], hint, ...tag.slice(3)] : [...tag, hint];
  });
}
