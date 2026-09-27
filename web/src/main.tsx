import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startPersistence } from "./db";
import { useSession } from "./signer/session";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つからない");

// 保存済みセッションの復元は起動時に 1 度だけ（StrictMode の二重実行で拡張を 2 回呼ばない）
void useSession.getState().restore();
void startPersistence();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
