import { baseLocale } from "./locale";

/** 件数などの桁区切り（言語に合わせる） */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(baseLocale()).format(n);
}

/** 日時の title 用（言語に合わせたローカル表記） */
export function formatDateTimeLocal(date: Date): string {
  return date.toLocaleString(baseLocale());
}
