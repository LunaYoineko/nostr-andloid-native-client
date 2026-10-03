import { useEffect } from "react";
import { t } from "../../i18n";
import { setPublishAccount, unconfirmed$ } from "../../nostr/publish";
import { useSession } from "../../signer/session";
import { EditIcon } from "../../ui/icons";
import { Toaster } from "../../ui/Toaster";
import { showToast } from "../../ui/toast";
import { ComposeDialog } from "./ComposeDialog";
import styles from "./ComposeHost.module.css";
import { openCompose, useCompose } from "./composeStore";

/**
 * 投稿まわり（AppShell から呼ぶ唯一の入口）: 投稿ボタン（FAB）・投稿シート・トースト。
 * ログイン中のアカウントを送信キューへ伝え、受理を確認できなかったらトーストを出す。
 */
export function ComposeHost({ showFab }: { showFab: boolean }) {
  const me = useSession((s) => s.pubkey);
  const request = useCompose((s) => s.request);

  useEffect(() => {
    if (me !== null) setPublishAccount(me);
  }, [me]);

  useEffect(() => {
    const subscription = unconfirmed$.subscribe(() => showToast(t("publish_unconfirmed")));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      {showFab && (
        <button
          type="button"
          className={styles.fab}
          aria-label="投稿"
          onClick={() => openCompose({ mode: "new" })}
        >
          <EditIcon className={styles.fabIcon} />
        </button>
      )}
      {request && (
        <ComposeDialog
          key={request.mode + (request.mode === "new" ? "" : request.target.id)}
          request={request}
        />
      )}
      <Toaster />
    </>
  );
}
