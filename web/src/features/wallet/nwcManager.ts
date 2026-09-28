import { create } from "zustand";
import { getNwcStore } from "../../signer/nwcStore";
import { useSession } from "../../signer/session";
import { NwcClient, type NwcConnection, NwcError, parseNwcUri } from "./nwc";

/** UI 表示用の接続状態（secret は含めない）。ネイティブ NwcState と同じ */
export type NwcConnectedInfo = {
  walletPubkey: string;
  relayUrl: string;
  lud16: string | null;
  /** ウォレットが広告する対応メソッド（info イベント）。未取得は null */
  methods: string | null;
};

type NwcStoreState = { connection: NwcConnectedInfo | null };

/** 接続状態（null=未接続）。設定画面と Zap ダイアログが購読する */
export const useNwc = create<NwcStoreState>()(() => ({ connection: null }));

let client: NwcClient | null = null;

function toInfo(conn: NwcConnection, methods: string | null): NwcConnectedInfo {
  return { walletPubkey: conn.walletPubkey, relayUrl: conn.relayUrl, lud16: conn.lud16, methods };
}

/**
 * [#537] 接続文字列で接続する。ウォレットの info イベント(kind:13194)が届き、pay_invoice に対応することを
 * 確認してから永続化する（ネイティブ NwcManager.connect と同じ）。失敗は NwcError
 */
export async function connectNwc(uri: string): Promise<NwcConnectedInfo> {
  const conn = parseNwcUri(uri);
  if (!conn) throw new NwcError("invalid-uri");
  const next = new NwcClient(conn);
  next.start();
  const methods = await next.awaitInfo();
  if (methods === null) {
    next.stop();
    throw new NwcError("no-info");
  }
  if (!methods.split(/\s+/).includes("pay_invoice")) {
    next.stop();
    throw new NwcError("unsupported", methods);
  }
  try {
    await getNwcStore().save(uri);
  } catch (cause) {
    next.stop();
    throw new NwcError("unavailable", undefined, { cause });
  }
  client?.stop();
  client = next;
  const info = toInfo(conn, methods);
  useNwc.setState({ connection: info });
  return info;
}

/**
 * 起動時復元。保存済み接続があれば張り直す（ネイティブ NwcManager.restore と同じ:
 * info の到着は待たない＝オフライン起動を妨げない）。保存が無い・壊れていれば何もしない
 */
export async function restoreNwc(): Promise<boolean> {
  const uri = await getNwcStore().load();
  if (!uri) return false;
  const conn = parseNwcUri(uri);
  if (!conn) {
    await getNwcStore().clear();
    return false;
  }
  const next = new NwcClient(conn);
  next.start();
  client?.stop();
  client = next;
  useNwc.setState({ connection: toInfo(conn, null) });
  // info が届いたら methods を反映（バックグラウンド・失敗しても接続は維持）
  void next.awaitInfo(20_000).then((methods) => {
    if (methods === null || client !== next) return;
    useNwc.setState((s) => (s.connection ? { connection: { ...s.connection, methods } } : s));
  });
  return true;
}

/** 接続を解除する（保管した接続情報も消す）。「接続を解除」ボタンとログアウトの両方から呼ぶ */
export function disconnectNwc(): void {
  client?.stop();
  client = null;
  void getNwcStore().clear();
  useNwc.setState({ connection: null });
}

/** invoice を支払う（Zap ダイアログの確認後に呼ぶ）。未接続なら NwcError("unavailable") */
export async function payInvoiceWithNwc(invoice: string): Promise<void> {
  const current = client;
  if (!current) throw new NwcError("unavailable", "NWC not connected");
  await current.payInvoice(invoice);
}

// [#537] Web は共用 PC のブラウザを想定し、ログアウトでウォレットを動かせる接続情報を残さない
// （保存はログアウト側でも消す。ここではメモリ上の接続も切る）
useSession.subscribe((state, prev) => {
  if (prev.status === "in" && state.status !== "in") disconnectNwc();
});

// 起動時に保存済み接続があれば張り直す（アプリのブートストラップに触れずに済むよう、この
// モジュールが最初に読み込まれた時点＝設定画面か Zap の受け口のどちらかが使われた時点で行う）
void restoreNwc();
