import { create } from "zustand";
import { translateNote } from "./translate";

type Entry = { text: string; visible: boolean };

type TranslateState = {
  /** id ごとの翻訳結果。隠しても消さない（2 回目以降は訳し直さない。ネイティブと同じ） */
  entries: Record<string, Entry>;
  /** 翻訳の取得中（ブラウザのモデル取得を含む）の id */
  pending: ReadonlySet<string>;
};

export const useTranslateStore = create<TranslateState>()(() => ({ entries: {}, pending: new Set() }));

/** 投稿の翻訳の表示状態（null = まだ翻訳していない） */
export function useTranslation(id: string): Entry | null {
  return useTranslateStore((s) => s.entries[id] ?? null);
}

/** 翻訳を取得中か（本文の下にスピナー代わりの見出しを出す） */
export function useTranslationPending(id: string): boolean {
  return useTranslateStore((s) => s.pending.has(id));
}

function setPending(id: string, value: boolean): void {
  useTranslateStore.setState((s) => {
    const next = new Set(s.pending);
    if (value) next.add(id);
    else next.delete(id);
    return { pending: next };
  });
}

/**
 * ⋯「翻訳」。キャッシュ済みならそのまま表示に戻すだけ（訳し直さない）。無ければ translateNote を呼んで表示する。
 * 戻り値 false = 失敗（呼び出し側でトーストを出す）。取得中の二重押下は何もしない。
 */
export async function requestTranslation(id: string, text: string): Promise<boolean> {
  const cached = useTranslateStore.getState().entries[id];
  if (cached) {
    useTranslateStore.setState((s) => ({ entries: { ...s.entries, [id]: { ...cached, visible: true } } }));
    return true;
  }
  if (useTranslateStore.getState().pending.has(id)) return true;
  setPending(id, true);
  let result: string | null;
  try {
    result = await translateNote(text);
  } finally {
    setPending(id, false);
  }
  if (result === null) return false;
  useTranslateStore.setState((s) => ({ entries: { ...s.entries, [id]: { text: result, visible: true } } }));
  return true;
}

/** ⋯「翻訳を隠す」。結果は保持する（もう一度「翻訳」を押しても呼び直さない） */
export function hideTranslation(id: string): void {
  useTranslateStore.setState((s) => {
    const entry = s.entries[id];
    if (!entry?.visible) return s;
    return { entries: { ...s.entries, [id]: { ...entry, visible: false } } };
  });
}
