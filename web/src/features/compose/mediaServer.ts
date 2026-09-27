import { create } from "zustand";

// ---- アップロード先のメディアサーバー（NIP-96。ネイティブの media_server テーブル） ----

/** 値はサーバーの URL（https://…、末尾の / なし）。無ければ既定の一覧を順に試す */
export const MEDIA_SERVER_KEY = "nostrism.media.server";

/** 既定のメディアサーバー（ネイティブ EventRepository.DEFAULT_MEDIA_SERVERS）。この順に試し、最初に成功したものを使う */
export const DEFAULT_MEDIA_SERVERS: readonly string[] = ["https://nostrcheck.me", "https://nostr.build"];

/** 候補（ネイティブ Presets.kt の MEDIA_PRESETS と同じ順） */
export const MEDIA_PRESETS: readonly string[] = [
  "https://nostr.build",
  "https://nostrcheck.me",
  "https://nostpic.com",
  "https://nostrmedia.com",
  "https://files.sovbit.host",
];

/** 入力を https のサーバー URL（前後の空白と末尾の / を除く）にする。https の URL でなければ null */
export function parseServerInput(input: string): string | null {
  const value = input.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname === "") return null;
    return value;
  } catch {
    return null;
  }
}

function readServer(): string | null {
  try {
    const raw = localStorage.getItem(MEDIA_SERVER_KEY);
    return raw === null ? null : parseServerInput(raw);
  } catch {
    return null;
  }
}

/** 選んだアップロード先（null = 未設定 = 既定の一覧） */
export const useMediaServer = create<{ server: string | null }>()(() => ({ server: readServer() }));

/** アップロード先を変える。null で既定の一覧に戻す */
export function setMediaServer(server: string | null): void {
  useMediaServer.setState({ server });
  try {
    if (server === null) localStorage.removeItem(MEDIA_SERVER_KEY);
    else localStorage.setItem(MEDIA_SERVER_KEY, server);
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

/**
 * 試す順のサーバー。選んだものがあればそれだけ（ネイティブで 1 つを選ぶと他は無効になるのと同じ）、
 * 無ければ既定の一覧。
 */
export function uploadServers(server: string | null): string[] {
  return server === null ? [...DEFAULT_MEDIA_SERVERS] : [server];
}
