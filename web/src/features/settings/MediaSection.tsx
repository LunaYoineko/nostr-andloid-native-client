import { type FormEvent, useId, useState } from "react";
import {
  DEFAULT_MEDIA_SERVERS,
  MEDIA_PRESETS,
  parseServerInput,
  setMediaServer,
  uploadServers,
  useMediaServer,
} from "../compose/mediaServer";
import styles from "./SettingsSections.module.css";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * メディアサーバー（ネイティブ MediaSettings の「アップロード先サーバー」）。
 * 候補から選ぶか URL を入力して 1 つ選ぶ。選ばない間は既定の一覧を順に試す（ネイティブの初期状態と同じ）。
 */
export function MediaSection() {
  const server = useMediaServer((s) => s.server);
  const current = uploadServers(server)[0];
  const choices = [...new Set([...DEFAULT_MEDIA_SERVERS, ...MEDIA_PRESETS, ...(server ? [server] : [])])];
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = parseServerInput(value);
    if (!url) {
      setError("https:// で始まるサーバーの URL を入力してください");
      return;
    }
    setMediaServer(url);
    setValue("");
    setError(null);
  }

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>画像アップロード先（NIP-96 / 認証は NIP-98）</h3>
      <p className={styles.desc}>
        投稿に画像・動画を添付すると、選択中のサーバへアップロードします。
        {server === null && `未選択の間は ${DEFAULT_MEDIA_SERVERS.map(hostOf).join(" → ")} の順に試します。`}
      </p>
      <div className={styles.choices}>
        {choices.map((url) => (
          <button
            key={url}
            type="button"
            className={styles.choice}
            aria-pressed={url === current}
            onClick={() => setMediaServer(url)}
          >
            {hostOf(url)}
          </button>
        ))}
      </div>
      <form className={styles.row} onSubmit={submit}>
        <label htmlFor={inputId} className="srOnly">
          アップロード先サーバーの URL
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://…"
          value={value}
          aria-invalid={error !== null}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <button type="submit" className={styles.ghost} disabled={value.trim() === ""}>
          選択
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
      {server !== null && (
        <button
          type="button"
          className={`${styles.ghost} ${styles.alignStart}`}
          onClick={() => setMediaServer(null)}
        >
          既定に戻す
        </button>
      )}
    </div>
  );
}
