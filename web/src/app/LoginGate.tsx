import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { waitForNostr } from "../signer/nip07";
import { LoginError, useSession } from "../signer/session";
import { Loading } from "./Loading";
import styles from "./LoginGate.module.css";

type ExtensionState = "checking" | "found" | "missing";

const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * 未ログイン時のゲート（ネイティブの LoginGate に対応）。鍵は生成せず、ログイン方法を選ばせる。
 * ログイン済みなら ?next=（無ければ /）へ戻す。
 */
export function LoginGate() {
  const status = useSession((s) => s.status);
  const login = useSession((s) => s.login);
  const [params] = useSearchParams();
  const [extension, setExtension] = useState<ExtensionState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void waitForNostr().then((nostr) => {
      if (active) setExtension(nostr ? "found" : "missing");
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") return <Loading />;
  if (status === "in") return <Navigate to={safeNext(params.get("next"))} replace />;

  async function onLogin() {
    setBusy(true);
    setError(null);
    try {
      await login();
    } catch (e) {
      if (e instanceof LoginError && e.reason === "missing") setExtension("missing");
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.gate}>
      <h1 className={styles.title}>Nostrism</h1>
      <p className={styles.lead}>
        ブラウザの拡張機能（NIP-07）でログインします。秘密鍵を勝手に生成することはありません。
      </p>

      <button type="button" className={styles.primary} onClick={onLogin} disabled={busy}>
        {busy ? "拡張機能の応答を待っています…" : "拡張機能でログイン（NIP-07）"}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {extension === "missing" && (
        <section className={styles.help} aria-label="拡張機能の案内">
          <p className={styles.helpTitle}>NIP-07 に対応した拡張機能が見つかりません</p>
          <p>次のいずれかを入れてから、このページを再読み込みしてください。</p>
          <ul className={styles.helpList}>
            <li>
              PC（Chrome など）:{" "}
              <a
                href="https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp"
                {...EXTERNAL_LINK}
              >
                nos2x
              </a>{" "}
              /{" "}
              <a href="https://getalby.com/" {...EXTERNAL_LINK}>
                Alby
              </a>
            </li>
            <li>
              iPhone / iPad（Safari）:{" "}
              <a href="https://apps.apple.com/app/nostash/id6744309333" {...EXTERNAL_LINK}>
                Nostash
              </a>
            </li>
          </ul>
        </section>
      )}

      <details className={styles.more}>
        <summary>秘密鍵でログイン（準備中）</summary>
        <p>秘密鍵を直接入力するログインは今後のバージョンで追加します。</p>
      </details>
    </main>
  );
}

// アプリ内のパスだけを許す（//host 等で外へ飛ばさない）
function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function errorMessage(e: unknown): string {
  if (e instanceof LoginError && e.reason === "missing") {
    return "拡張機能が見つかりませんでした（タイムアウト）。拡張機能を有効にしてから再読み込みしてください。";
  }
  if (e instanceof LoginError) {
    return "ログインできませんでした。拡張機能で許可されなかった可能性があります。";
  }
  return "ログインできませんでした。";
}
