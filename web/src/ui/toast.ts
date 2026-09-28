import { create } from "zustand";

/** 1 件を出しておく時間（Android の Toast.LENGTH_SHORT） */
export const TOAST_MS = 2_000;

/** 表示待ちのトースト（先頭が表示中） */
export const useToast = create<{ queue: string[] }>()(() => ({ queue: [] }));

/** トーストを積む（表示中のものがあればその後に出る） */
export function showToast(message: string): void {
  useToast.setState((s) => ({ queue: [...s.queue, message] }));
}
