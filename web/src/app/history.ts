import { useCallback, useEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigate, useNavigationType } from "react-router";
import { useDeck } from "../store/deck";

/** アプリの配信パス（Router の basename） */
export const APP_BASENAME = "/app";

/** 直リンクで開いたとき下にデッキを敷くパス（詳細 /e /p と、一時カラムになる /t） */
const DETAIL_PATH = /^\/app\/(e|p|t)\/[^/]+\/?$/;

function stateObject(state: unknown): Record<string, unknown> | null {
  return typeof state === "object" && state !== null ? (state as Record<string, unknown>) : null;
}

/**
 * アプリ内に戻れる履歴があるか。react-router の history.state.idx（最初のエントリが 0、push ごとに +1）に依存する。
 * react-router 8.4.0 の lib/router/history.js で確認済み。メジャー更新時に見直す。
 */
export function canGoBackInApp(state: unknown = window.history.state): boolean {
  const idx = stateObject(state)?.idx;
  return typeof idx === "number" && idx > 0;
}

/**
 * 履歴の先頭で /e /p /t を開いたら、下に /app/ を 1 つ敷く（Router を作る前に 1 回だけ呼ぶ）。
 * 共有リンクから開いても「戻る = 詳細を閉じてデッキ」、もう一度戻る = アプリを出る（ネイティブと同じ順）。
 */
export function synthesizeBaseEntry(win: Window = window): boolean {
  const { pathname, search, hash } = win.location;
  if (!DETAIL_PATH.test(pathname) || canGoBackInApp(win.history.state)) return false;
  const url = pathname + search + hash;
  const usr = stateObject(win.history.state)?.usr ?? null;
  win.history.replaceState({ usr: null, key: "default", idx: 0 }, "", `${APP_BASENAME}/`);
  win.history.pushState({ usr, key: "synthbase", idx: 1 }, "", url);
  return true;
}

/** 一時カラムを開いた履歴エントリの印（location.state のキー。値はカラム id） */
export const DECK_TRANSIENT = "deckTransient";

export function transientIdOf(state: unknown): string | null {
  const id = stateObject(state)?.[DECK_TRANSIENT];
  return typeof id === "string" ? id : null;
}

/** 詳細を閉じる（「←」・スクリム・Esc）。アプリ内に戻れれば戻る、無ければデッキへ置き換える */
export function useCloseOverlay(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBackInApp()) void navigate(-1);
    else void navigate("/", { replace: true });
  }, [navigate]);
}

/**
 * 一時カラムの印を持つエントリから戻ったら、そのカラムを閉じる（ネイティブの DeckState.back()）。
 * 固定済み・既に無いカラムには何もしない。
 */
export function useTransientHistory(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prev = useRef(location);

  useEffect(() => {
    const before = prev.current;
    prev.current = location;
    if (navigationType !== NavigationType.Pop || before === location) return;
    const id = transientIdOf(before.state);
    if (id === null || id === transientIdOf(location.state)) return;
    const s = useDeck.getState();
    const col = s.columns.find((c) => c.id === id);
    if (col && !col.pinned) s.back();
  }, [location, navigationType]);
}
