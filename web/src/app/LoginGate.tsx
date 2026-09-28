import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { waitForNostr } from "../signer/nip07";
import { nsecHead } from "../signer/nsec";
import { LoginError, type NewKey, type NostrConnectLogin, useSession } from "../signer/session";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { QrCode } from "../ui/QrCode";
import { Loading } from "./Loading";
import styles from "./LoginGate.module.css";

type ExtensionState = "checking" | "found" | "missing";
/** 処理中のログイン方法（どれかの処理中は他も押せない） */
type Busy = "nip07" | "nip46" | "nsec" | "new" | null;

const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

const UNAVAILABLE_MESSAGE =
  "このブラウザでは秘密鍵を安全に保存できません。拡張機能（NIP-07）でログインしてください。";

/**
 * 未ログイン時のゲート（ネイティブの LoginGate に対応）。鍵は勝手に生成せず、ログイン方法を選ばせる。
 * 並びは NIP-07 → リモート署名（NIP-46、折りたたみ）→ 秘密鍵（nsec、折りたたみ）→ 新規生成。
 * ログイン済みなら ?next=（無ければ /）へ戻す。
 */
export function LoginGate() {
  const status = useSession((s) => s.status);
  const login = useSession((s) => s.login);
  const generateNewKey = useSession((s) => s.generateNewKey);
  const [params] = useSearchParams();
  const [extension, setExtension] = useState<ExtensionState>("checking");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmNewKey, setConfirmNewKey] = useState(false);
  const [newKeyError, setNewKeyError] = useState<string | null>(null);
  // 生成した鍵の控え（表示は 1 回だけ。ログインを確定したら捨てる）
  const [newKey, setNewKey] = useState<NewKey | null>(null);

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
  if (newKey) return <NewKeyBackup newKey={newKey} onDone={() => setNewKey(null)} />;

  async function onLogin() {
    setBusy("nip07");
    setError(null);
    try {
      await login();
    } catch (e) {
      if (e instanceof LoginError && e.reason === "missing") setExtension("missing");
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onGenerate() {
    setBusy("new");
    setNewKeyError(null);
    try {
      setNewKey(await generateNewKey());
    } catch {
      setNewKeyError(UNAVAILABLE_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={styles.gate}>
      <h1 className={styles.title}>Nostrism へようこそ</h1>
      <p className={styles.lead}>
        ログイン方法を選んでください。秘密鍵を勝手に生成することはありません。アカウントをお持ちでない場合は、下の「新規生成」から新しい鍵を作れます。
      </p>

      <button type="button" className={styles.primary} onClick={onLogin} disabled={busy !== null}>
        {busy === "nip07" ? "拡張機能の応答を待っています…" : "拡張機能でログイン（NIP-07）"}
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
        <summary>リモート署名でログイン（NIP-46）</summary>
        <div className={styles.moreBody}>
          <Nip46LoginForm busy={busy !== null} onBusy={(b) => setBusy(b ? "nip46" : null)} />
        </div>
      </details>

      <details className={styles.more}>
        <summary>秘密鍵（nsec）でログイン</summary>
        <div className={styles.moreBody}>
          <NsecLoginForm busy={busy !== null} onBusy={(b) => setBusy(b ? "nsec" : null)} />
        </div>
      </details>

      <section className={styles.newKey} aria-labelledby="newkey-title">
        <p id="newkey-title" className={styles.newKeyTitle}>
          アカウントをお持ちでない場合
        </p>
        <button
          type="button"
          className={styles.ghost}
          disabled={busy !== null}
          onClick={() => setConfirmNewKey(true)}
        >
          新規生成
        </button>
        {newKeyError && (
          <p role="alert" className={styles.error}>
            {newKeyError}
          </p>
        )}
      </section>

      {confirmNewKey && (
        <ConfirmDialog
          title="新しい鍵を生成しますか？"
          text="新しい秘密鍵をこのブラウザで作り、暗号化して保存します。秘密鍵（nsec）は生成の直後に 1 回だけ表示します。Web 版では後から表示・書き出しできないため、控えておかないと、ブラウザのデータを消したり、長く使わずに消えたりしたとき、このアカウントには二度とログインできません。長く使うアカウントには、拡張機能（NIP-07）の利用をおすすめします。"
          confirmLabel="生成する"
          destructive
          onConfirm={() => {
            setConfirmNewKey(false);
            void onGenerate();
          }}
          onDismiss={() => setConfirmNewKey(false)}
        />
      )}
    </main>
  );
}

/**
 * リモート署名（NIP-46）で接続する（ネイティブの Nip46Login）。先に nostrconnect:// の QR・リンク、その下に bunker:// の貼り付け。
 * bunker:// は secret を含むので、NsecLoginForm と同じく value は React で持たない（DOM 属性に出さない）。
 * nostrconnect:// の URI も secret を含むので、文字列は画面に出さない（QR・リンク・コピーだけ）。
 */
function Nip46LoginForm({ busy, onBusy }: { busy: boolean; onBusy(busy: boolean): void }) {
  const loginWithBunker = useSession((s) => s.loginWithBunker);
  const startNostrConnectLogin = useSession((s) => s.startNostrConnectLogin);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // nostrconnect:// の承認待ち（QR を出している間だけ）
  const pending = useRef<NostrConnectLogin | null>(null);
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const canPaste = typeof navigator.clipboard?.readText === "function";

  // 画面を離れたら接続の待ちもやめる
  useEffect(
    () => () => {
      controller.current?.abort();
      pending.current?.cancel();
    },
    [],
  );

  async function onShowQr() {
    setConnectError(null);
    setCopied(null);
    let login: NostrConnectLogin;
    try {
      login = startNostrConnectLogin();
    } catch (err) {
      setConnectError(nostrConnectErrorMessage(err));
      return;
    }
    pending.current = login;
    onBusy(true);
    setConnectUri(login.uri);
    try {
      await login.done;
    } catch (err) {
      setConnectError(nostrConnectErrorMessage(err));
    } finally {
      if (pending.current === login) pending.current = null;
      setConnectUri(null);
      onBusy(false);
    }
  }

  async function onCopy() {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  function onInput(value: string) {
    setReady(value.trim().startsWith("bunker://"));
    setError(null);
  }

  async function onPaste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text && input.current) {
        input.current.value = text;
        onInput(text);
      }
    } catch {
      // 読めなければ何もしない（権限の拒否など）
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    const abort = new AbortController();
    controller.current = abort;
    onBusy(true);
    setConnecting(true);
    setError(null);
    try {
      await loginWithBunker(el.value, abort.signal);
      el.value = "";
      setReady(false);
    } catch (err) {
      setError(nip46ErrorMessage(err));
    } finally {
      if (controller.current === abort) controller.current = null;
      setConnecting(false);
      onBusy(false);
    }
  }

  return (
    <>
      <p>
        署名アプリ（Amber など）や nsec.app
        と接続します。秘密鍵は署名アプリ側に残り、このブラウザには置きません。
      </p>
      {connectUri ? (
        <div className={styles.connect}>
          <QrCode value={connectUri} label="署名アプリで読み取る接続用の QR コード" />
          <p>
            署名アプリ（Amber など）で QR
            を読み取るか、この端末に署名アプリがあれば下のリンクを開いて、接続を承認してください。
          </p>
          <div className={styles.actions}>
            <a href={connectUri} className={styles.openLink}>
              署名アプリで開く
            </a>
            <button type="button" className={styles.ghost} onClick={onCopy}>
              コピー
            </button>
          </div>
          {copied && (
            <p role="status" className={styles.note}>
              {copied === "ok" ? "コピーしました" : "コピーできませんでした"}
            </p>
          )}
          <div className={styles.actions}>
            <p role="status" className={styles.note}>
              承認待ち…
            </p>
            <button type="button" className={styles.ghost} onClick={() => pending.current?.cancel()}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.submit} onClick={onShowQr} disabled={busy}>
          接続用の QR を表示（Amber など）
        </button>
      )}
      {connectError && (
        <p role="alert" className={styles.error}>
          {connectError}
        </p>
      )}
      <form className={styles.moreBody} onSubmit={onSubmit}>
        <label htmlFor="bunker-input">または bunker:// を貼り付け</label>
        <div className={styles.field}>
          <input
            ref={input}
            id="bunker-input"
            name="bunker"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="bunker://…"
            onChange={(e) => onInput(e.target.value)}
            disabled={busy}
          />
          {canPaste && (
            <button type="button" className={styles.fieldAction} onClick={onPaste} disabled={busy}>
              貼り付け
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={busy || !ready} aria-busy={connecting}>
            {connecting ? "接続中…（署名アプリで承認してください）" : "接続"}
          </button>
          {connecting && (
            <button type="button" className={styles.ghost} onClick={() => controller.current?.abort()}>
              やめる
            </button>
          )}
        </div>
      </form>
    </>
  );
}

/**
 * 秘密鍵（nsec）の取り込み（ネイティブの LocalSignerLogin）。入力はマスクし、パスワードマネージャーの自動入力に載せる。
 * 入力値を DOM 属性に出さないよう value は React で持たない（制御すると value 属性に同期されるため）。
 */
function NsecLoginForm({ busy, onBusy }: { busy: boolean; onBusy(busy: boolean): void }) {
  const loginWithNsec = useSession((s) => s.loginWithNsec);
  const input = useRef<HTMLInputElement>(null);
  const [filled, setFilled] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPaste = typeof navigator.clipboard?.readText === "function";

  function onInput(value: string) {
    setFilled(value.trim() !== "");
    setError(null);
  }

  async function onPaste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text && input.current) {
        input.current.value = text;
        onInput(text);
      }
    } catch {
      // 読めなければ何もしない（権限の拒否など）
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    const value = el.value;
    onBusy(true);
    setError(null);
    try {
      await loginWithNsec(value);
      el.value = "";
      setFilled(false);
    } catch (err) {
      setError(nsecErrorMessage(err, value));
    } finally {
      onBusy(false);
    }
  }

  return (
    <>
      <div className={styles.warn}>
        <p>
          秘密鍵（nsec）を知っている人は、あなたのアカウントを完全に操作できます。できるだけ拡張機能（NIP-07）でログインしてください。
        </p>
        <p>
          取り込んだ秘密鍵は暗号化してこのブラウザにだけ保存します。Web 版では表示・書き出しはできません。
        </p>
      </div>
      <form className={styles.moreBody} onSubmit={onSubmit}>
        <label htmlFor="nsec-input" className="srOnly">
          秘密鍵（nsec）
        </label>
        <div className={styles.field}>
          <input
            ref={input}
            id="nsec-input"
            name="nsec"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="nsec を貼り付けて取り込み"
            onChange={(e) => onInput(e.target.value)}
            disabled={busy}
          />
          {canPaste && (
            <button type="button" className={styles.fieldAction} onClick={onPaste} disabled={busy}>
              貼り付け
            </button>
          )}
          <button
            type="button"
            className={styles.fieldAction}
            aria-pressed={reveal}
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? "隠す" : "表示"}
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={busy || !filled} aria-busy={busy}>
          取り込み
        </button>
      </form>
    </>
  );
}

/**
 * 生成した鍵の控え。生成の直後に 1 回だけ nsec を出し、「控えた」にチェックを入れるまで先へ進ませない。
 * 閉じる・再読み込みすると二度と表示しない（保管した鍵の表示・書き出しは作らない）。
 */
function NewKeyBackup({ newKey, onDone }: { newKey: NewKey; onDone(): void }) {
  const loginWithNewKey = useSession((s) => s.loginWithNewKey);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCopy = typeof navigator.clipboard?.writeText === "function";

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(newKey.nsec);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  async function onContinue() {
    setBusy(true);
    setError(null);
    try {
      await loginWithNewKey(newKey.pubkey);
      onDone();
    } catch {
      setError(UNAVAILABLE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.gate}>
      <h1 className={styles.title}>秘密鍵を控えてください</h1>
      <div className={styles.warn}>
        <p>控えてください。この画面を閉じると二度と表示されません。</p>
        <p>
          秘密鍵（nsec）は、このアカウントに再びログインするための唯一の手段です。知っている人はアカウントを完全に操作できるので、人に見せたり送ったりしないでください。
        </p>
      </div>
      <p className={styles.secret}>{newKey.nsec}</p>
      {canCopy && (
        <button type="button" className={styles.ghost} onClick={onCopy}>
          コピー
        </button>
      )}
      {copied && (
        <p role="status" className={styles.note}>
          {copied === "ok"
            ? "コピーしました。安全な場所に保存してください。"
            : "コピーできませんでした。表示された秘密鍵を選択して控えてください。"}
        </p>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        秘密鍵（nsec）を控えた
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.submit}
        disabled={!saved || busy}
        aria-busy={busy}
        onClick={onContinue}
      >
        次へ
      </button>
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

// 例外のメッセージは出さない（署名アプリの応答や bunker:// の secret を含むことがある）
function nip46ErrorMessage(e: unknown): string | null {
  if (!(e instanceof LoginError)) return "ログインできませんでした。";
  switch (e.reason) {
    case "invalid-uri":
      return "bunker://… の形式で、wss:// のリレーを含む接続先を貼り付けてください";
    case "timeout":
      return "署名アプリから応答がありませんでした。アプリで承認してから、もう一度お試しください";
    case "rejected":
      return "署名アプリに拒否されました";
    case "unavailable":
      return "このブラウザでは接続情報を保存できません。拡張機能（NIP-07）でログインしてください。";
    case "cancelled":
      return null;
    default:
      return "ログインできませんでした。";
  }
}

// nostrconnect:// の失敗。承認されないまま時間切れのときだけ文言が bunker:// と違う
function nostrConnectErrorMessage(e: unknown): string | null {
  if (e instanceof LoginError && e.reason === "timeout") {
    return "3 分以内に承認されませんでした。もう一度 QR を表示してください";
  }
  return nip46ErrorMessage(e);
}

// 例外のメッセージは出さない（bech32 のエラーは入力を丸ごと含むことがある）
function nsecErrorMessage(e: unknown, value: string): string {
  if (!(e instanceof LoginError)) return "ログインできませんでした。";
  switch (e.reason) {
    case "invalid-format":
      return `nsec1… で始まる秘密鍵を入力してください（入力の先頭: ${nsecHead(value)}）。自動入力で別の値が入っていないか「表示」で確認してください。`;
    case "invalid-key":
      return "nsec の取り込みに失敗: 秘密鍵として読み取れませんでした";
    case "unavailable":
      return UNAVAILABLE_MESSAGE;
    default:
      return "ログインできませんでした。";
  }
}
