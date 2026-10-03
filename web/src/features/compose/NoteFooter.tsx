import type { NostrEvent } from "nostr-tools/pure";
import type { ReactNode } from "react";
import { t } from "../../i18n";
import { retryUnsentNow, useIsUnsent } from "../../nostr/publish";
import { useSession } from "../../signer/session";
import { ReplyIcon } from "../../ui/icons";
import { MenuButton } from "../../ui/MenuButton";
import { showToast } from "../../ui/toast";
import { openCompose } from "./composeStore";
import styles from "./NoteFooter.module.css";
import { unsentToDraft } from "./storage";

/** アクション行のボタンの見た目（#459 のリポスト / ♡ 等も使う） */
export const ACTION_BUTTON_CLASS = styles.action;

/** アクション行のアイコンボタン（ネイティブ NoteItem の ActionButton） */
export function ActionButton({
  label,
  onClick,
  pressed,
  busy,
  className,
  children,
}: {
  label: string;
  onClick(): void;
  pressed?: boolean;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy}
      className={className ? `${styles.action} ${className}` : styles.action}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * 投稿の下の行（NoteItem から呼ぶ唯一の入口）: 自分の未送信なら「未送信」→ アクション行（返信 + children + more）。
 * children は #459 が リポスト / ♡ / 絵文字 を入れる。
 * [#683] 返信〜children（Zap まで）は .primaryActions に包んで行の幅に均等配置し、⋯（more）は
 * その外側に置いて行の右端に固定する（NoteActionButtons の NoteMoreMenu を渡す）。
 */
export function NoteFooter({
  event,
  more,
  children,
}: {
  event: NostrEvent;
  more?: ReactNode;
  children?: ReactNode;
}) {
  const me = useSession((s) => s.pubkey);
  const unsent = useIsUnsent(event.id);
  return (
    <div className={styles.footer}>
      {event.pubkey === me && unsent && <UnsentChip eventId={event.id} />}
      <fieldset aria-label="操作" className={styles.actions}>
        <div className={styles.primaryActions}>
          <ActionButton label="返信" onClick={() => openCompose({ mode: "reply", target: event })}>
            <ReplyIcon />
          </ActionButton>
          {children}
        </div>
        {more}
      </fieldset>
    </div>
  );
}

/** 「未送信」（ネイティブ UnsentChip）。押すと「再送」「下書きに戻す」 */
function UnsentChip({ eventId }: { eventId: string }) {
  return (
    <MenuButton
      label="未送信"
      triggerClassName={styles.unsent}
      entries={[
        { type: "item", label: "再送", onSelect: () => retryUnsentNow(eventId) },
        {
          type: "item",
          label: "下書きに戻す",
          onSelect: () => {
            if (unsentToDraft(eventId)) showToast(t("unsent_moved_to_draft"));
          },
        },
      ]}
    >
      未送信
    </MenuButton>
  );
}
