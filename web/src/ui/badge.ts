/** 未読数のバッジの文字（99 まで。100 以上は 99+） */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}
