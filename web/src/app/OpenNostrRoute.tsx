import { decode } from "nostr-tools/nip19";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

// web+nostr: / nostr: のどちらも受ける（NIP-21）
const SCHEME = /^(?:web\+)?nostr:/i;

// "*" の catch-all ルートへ落として一般の 404 画面（NotFoundScreen）を出す
const NOT_FOUND_PATH = "/404";

/**
 * web+nostr:… / nostr:… の URI（NIP-19 の bech32）→ アプリ内のパス。
 * npub / nprofile は /p/、note / nevent / naddr は /e/。nsec 等は絶対に通さず、読めなければ null。
 */
export function resolveNostrUri(uri: string): string | null {
  const value = uri.trim().replace(SCHEME, "");
  try {
    const decoded = decode(value);
    switch (decoded.type) {
      case "npub":
      case "nprofile":
        return `/p/${value}`;
      case "note":
      case "nevent":
      case "naddr":
        return `/e/${value}`;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * /open?uri=<web+nostr: / nostr: の URI>（registerProtocolHandler の受け口。#541）。
 * 読めれば /p/:ref か /e/:ref に置き換え、読めなければ 404。履歴に /open を残さない
 * （HashtagRoute と同じ形。未ログインなら RequireSession の /login?next= で戻ってから開く）。
 */
export function OpenNostrRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const target = resolveNostrUri(params.get("uri") ?? "");
    void navigate(target ?? NOT_FOUND_PATH, { replace: true });
  }, [params, navigate]);

  return null;
}
