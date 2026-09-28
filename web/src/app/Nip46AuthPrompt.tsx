import { useNip46Auth } from "../signer/nip46";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/**
 * 署名アプリ（NIP-46）が承認ページ（auth_url）を求めたときの確認。ログイン画面でもログイン後でも出す。
 * 応答が来た非同期の時点で開くとポップアップを止められるので、利用者が押して開く。
 */
export function Nip46AuthPrompt() {
  const url = useNip46Auth((s) => s.url);
  if (!url) return null;
  const dismiss = () => useNip46Auth.setState({ url: null });
  return (
    <ConfirmDialog
      key={url}
      title="署名アプリでの承認が必要です"
      text={`開いたページで承認すると、処理が続きます。（接続先: ${hostOf(url)}）`}
      confirmLabel="承認ページを開く"
      dismissLabel="閉じる"
      onConfirm={() => {
        window.open(url, "_blank", "noopener,noreferrer");
        dismiss();
      }}
      onDismiss={dismiss}
    />
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
