import { useState } from "react";
import { useSession } from "../signer/session";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/** ログアウト（確認つき）。見た目は置き場所ごとに className で渡す（#463 の設定画面もこれを使う） */
export function LogoutButton({ className }: { className?: string }) {
  const method = useSession((s) => s.method);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setConfirming(true)}>
        ログアウト
      </button>
      {confirming && (
        <ConfirmDialog
          title="ログアウトしますか？"
          text={
            method === "local"
              ? "この端末のログイン情報を削除します。秘密鍵（nsec）はこのブラウザから消去され、Web 版では書き出せないため、別の場所に控えていなければ元に戻せません。"
              : "この端末のログイン情報を削除します。秘密鍵は拡張機能に残ります。"
          }
          confirmLabel="ログアウト"
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
