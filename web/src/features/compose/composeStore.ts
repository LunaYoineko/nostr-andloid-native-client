import type { NostrEvent } from "nostr-tools/pure";
import { create } from "zustand";

/** 投稿シートを開く要求（新規・返信・引用） */
export type ComposeRequest =
  | { mode: "new" }
  | { mode: "reply"; target: NostrEvent }
  | { mode: "quote"; target: NostrEvent };

/** 開いている投稿シート（null = 閉じている） */
export const useCompose = create<{ request: ComposeRequest | null }>()(() => ({ request: null }));

/** 投稿シートを開く（FAB・返信ボタン・スレッド詳細 #456・引用リポスト #459 から） */
export function openCompose(req: ComposeRequest): void {
  useCompose.setState({ request: req });
}

export function closeCompose(): void {
  useCompose.setState({ request: null });
}
