/**
 * NIP-57 Zap 受領（kind:9735）の解析（ネイティブの nostr-core Nip57.kt と EventRepository.kt zapSenderFrom の写し）。
 * 純関数。description タグ = Zap リクエスト（kind:9734）の JSON。
 */

const BOLT11_AMOUNT = /^ln(?:bc|tb|bcrt)(\d+)([munp]?)/i;
const HEX64 = /^[0-9a-f]{64}$/i;

/** bolt11 invoice の金額（sats）。`lnbc<数><m|u|n|p>`、金額が無い・読めなければ 0（割り算は切り捨て） */
export function bolt11Sats(invoice: string): number {
  const match = BOLT11_AMOUNT.exec(invoice.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isSafeInteger(n)) return 0;
  switch (match[2].toLowerCase()) {
    case "m":
      return n * 100_000;
    case "u":
      return n * 100;
    case "n":
      return Math.floor(n / 10);
    case "p":
      return Math.floor(n / 10_000);
    default:
      return n * 100_000_000;
  }
}

/** 最初の description タグの JSON（オブジェクトのときだけ）。無い・壊れていれば null */
export function zapRequestOf(tags: string[][]): Record<string, unknown> | null {
  const json = tags.find((t) => t[0] === "description")?.[1];
  if (json === undefined) return null;
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Zap の金額（sats）。Zap リクエストの amount（msat）を優先し、無ければ bolt11 から。どちらも無ければ 0 */
export function zapAmountSats(tags: string[][]): number {
  const requestTags = zapRequestOf(tags)?.tags;
  if (Array.isArray(requestTags)) {
    const amount = requestTags.find((t): t is unknown[] => Array.isArray(t) && t[0] === "amount")?.[1];
    const msat = typeof amount === "string" && /^\d+$/.test(amount) ? Number(amount) : 0;
    if (msat > 0) return Math.floor(msat / 1000);
  }
  const bolt11 = tags.find((t) => t[0] === "bolt11")?.[1];
  return bolt11 === undefined ? 0 : bolt11Sats(bolt11);
}

/** Zap した人（receipt の発行者 = LNURL サーバではない）。P タグ → Zap リクエストの pubkey。64 桁 hex のみ */
export function zapSenderOf(tags: string[][]): string | null {
  const tagged = tags.find((t) => t[0] === "P")?.[1];
  if (tagged !== undefined && HEX64.test(tagged)) return tagged.toLowerCase();
  const pubkey = zapRequestOf(tags)?.pubkey;
  if (typeof pubkey === "string" && HEX64.test(pubkey)) return pubkey.toLowerCase();
  return null;
}

/** Zap に添えたコメント（Zap リクエストの content）。無ければ "" */
export function zapCommentOf(tags: string[][]): string {
  const content = zapRequestOf(tags)?.content;
  return typeof content === "string" ? content : "";
}
