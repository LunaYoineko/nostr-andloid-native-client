import { useState } from "react";
import { useT } from "../../i18n";
import { MoodIcon } from "../../ui/icons";
import styles from "./EmojiInsertButton.module.css";
import { ReactionPickerDialog } from "./ReactionPickerDialog";

/**
 * 投稿画面のツールバーの絵文字ボタン（ネイティブ ComposeSheet の Mood。ComposeDialog から呼ぶ入口）。
 * リアクションと同じピッカー（対象なし）で選んだものを onInsert に渡す。:code: は後ろに空白を付ける。
 * 「最近」には記録しない（ネイティブと同じ）。
 */
export function EmojiInsertButton({ onInsert }: { onInsert(text: string): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.tool}
        aria-label={t("compose_insert_emoji")}
        onClick={() => setOpen(true)}
      >
        <MoodIcon className={styles.icon} />
      </button>
      {open && (
        <ReactionPickerDialog
          onPick={(content) => onInsert(content.endsWith(":") ? `${content} ` : content)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
