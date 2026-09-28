import { create } from "zustand";

/** ハッシュタグの整理画面が開いているか（#536。設定「ハッシュタグ」・投稿シートの「整理…」の両方から開く） */
export const useHashtagManager = create<{ open: boolean }>()(() => ({ open: false }));

export function openHashtagManager(): void {
  useHashtagManager.setState({ open: true });
}

export function closeHashtagManager(): void {
  useHashtagManager.setState({ open: false });
}
