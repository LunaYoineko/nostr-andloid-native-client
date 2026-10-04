import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * [#673] アクセント地（background: var(--accent)）に文字/アイコンを乗せるボタンは、
 * ダークで背景がほぼ白（#f2f2f5）になるため固定 #fff 等ではなく --on-accent を使う必要がある。
 * 主要なボタンの CSS を直接読んで、--on-accent を使っていることを確認する（tokens.test.ts の流儀）。
 *
 * ui/ConfirmDialog.module.css の主ボタンは対象外: ネイティブ DeckConfirmDialog の confirmButton は
 * DeckTextButton（背景なし、文字色のみ）で、アクセント地のボタンではない。web 側も
 * `.confirm { color: var(--text) }` で背景を持たず、この不具合の対象ではない。
 */
function readCss(relativePath: string): string {
  return readFileSync(join(process.cwd(), "src", relativePath), "utf8");
}

it("[#673] LoginGate の NIP-07 ボタン（.primary）は --on-accent を使う", () => {
  const css = readCss("app/LoginGate.module.css");
  expect(css).toMatch(/\.primary\s*{[^}]*background:\s*var\(--accent\);[^}]*color:\s*var\(--on-accent\);/s);
});

it("[#673] Compose の FAB（.fab）は --on-accent を使う", () => {
  const css = readCss("features/compose/ComposeHost.module.css");
  expect(css).toMatch(/\.fab\s*{[^}]*background:\s*var\(--accent\);[^}]*color:\s*var\(--on-accent\);/s);
});
