import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startPersistence } from "./db";
import { startMuteList } from "./features/mute/muteSync";
import { initTheme } from "./features/theme/themePrefs";
import { startOwnRelayList } from "./nostr/outbox";
import { startPublishQueue } from "./nostr/publish";
import { useSession } from "./signer/session";
import "./styles/global.css";

// 保存済みのテーマ・文字サイズ・太字を React の描画前に同期的に当てる（初回描画のちらつきを避ける。
// CSP で inline script は置けないので、ここが一番早い）
initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つからない");

// 保存済みセッションの復元は起動時に 1 度だけ（StrictMode の二重実行で拡張を 2 回呼ばない）
void useSession.getState().restore();
void startPersistence().then(() => startPublishQueue());
// ログイン中は自分の kind:10002 で読み書きリレーを決める
startOwnRelayList();
// ログイン中は自分の kind:10000（ミュート）を購読して表示から除く
startMuteList();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
