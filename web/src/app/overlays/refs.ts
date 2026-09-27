import { decode, type EventPointer, type ProfilePointer } from "nostr-tools/nip19";

const HEX64 = /^[0-9a-f]{64}$/i;

function stripScheme(ref: string): string {
  return ref.trim().replace(/^nostr:/i, "");
}

/** /e/:ref の ref（note1… / nevent1… / 64 桁 hex、先頭の nostr: は除く）→ イベントの指し先。読めなければ null */
export function parseEventRef(ref: string): EventPointer | null {
  const value = stripScheme(ref);
  if (HEX64.test(value)) return { id: value.toLowerCase() };
  try {
    const decoded = decode(value);
    if (decoded.type === "note") return { id: decoded.data };
    if (decoded.type === "nevent") return decoded.data;
  } catch {
    // bech32 として読めない
  }
  return null;
}

/** /p/:ref の ref（npub1… / nprofile1… / 64 桁 hex）→ プロフィールの指し先。読めなければ null */
export function parseProfileRef(ref: string): ProfilePointer | null {
  const value = stripScheme(ref);
  if (HEX64.test(value)) return { pubkey: value.toLowerCase() };
  try {
    const decoded = decode(value);
    if (decoded.type === "npub") return { pubkey: decoded.data };
    if (decoded.type === "nprofile") return decoded.data;
  } catch {
    // bech32 として読めない
  }
  return null;
}
