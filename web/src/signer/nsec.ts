import { decode } from "nostr-tools/nip19";
import { getPublicKey } from "nostr-tools/pure";

/** nsec の読み取り結果。format = nsec1 で始まらない、key = 秘密鍵として読めない（チェックサム違い・範囲外） */
export type NsecParse = { ok: true; secretKey: Uint8Array } | { ok: false; reason: "format" | "key" };

/**
 * 入力された nsec を 32 byte の秘密鍵にする（ネイティブの LocalSignerLogin の検証）。空白・改行は除く。
 * hex の秘密鍵は受け付けない。失敗の理由に入力の中身は含めない。
 */
export function parseNsec(input: string): NsecParse {
  const s = input.replace(/\s+/g, "");
  if (!s.startsWith("nsec1")) return { ok: false, reason: "format" };
  let data: Uint8Array | null = null;
  try {
    const decoded = decode(s);
    if (decoded.type !== "nsec") return { ok: false, reason: "key" };
    data = decoded.data;
    if (data.length !== 32) throw new Error("length");
    // 0・位数以上のスカラはここで例外になる
    getPublicKey(data);
    return { ok: true, secretKey: data };
  } catch {
    data?.fill(0);
    return { ok: false, reason: "key" };
  }
}

/** エラー表示用の入力の先頭（空白を除いた 8 文字。空なら「(空)」） */
export function nsecHead(input: string): string {
  const s = input.replace(/\s+/g, "");
  return s === "" ? "(空)" : s.slice(0, 8);
}
