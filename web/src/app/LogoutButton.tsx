import { useState } from "react";
import { useT } from "../i18n";
import { useSession } from "../signer/session";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/** ログアウト（確認つき）。見た目は置き場所ごとに className で渡す（#463 の設定画面もこれを使う） */
export function LogoutButton({ className }: { className?: string }) {
  const t = useT();
  const method = useSession((s) => s.method);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setConfirming(true)}>
        {t("logout")}
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("logout_title")}
          text={
            method === "local"
              ? t("web_logout_text_local")
              : method === "nip46"
                ? t("web_logout_text_nip46")
                : t("web_logout_text_nip07")
          }
          confirmLabel={t("logout")}
          destructive
          onConfirm={() => {
            setConfirming(false);
            useSession.getState().logout();
          }}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </>
  );
}
