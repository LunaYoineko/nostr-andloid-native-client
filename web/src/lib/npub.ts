import { npubEncode } from "nostr-tools/nip19";

/** npub の先頭 12 文字 + 「…」（ヘッダや名前が無いときの表示用） */
export function shortNpub(pubkey: string): string {
  return `${npubEncode(pubkey).slice(0, 12)}…`;
}
