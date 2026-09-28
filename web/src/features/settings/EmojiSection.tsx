import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { type FormEvent, useId, useMemo, useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { showToast } from "../../ui/toast";
import {
  type CustomEmoji,
  customEmojisFrom,
  EmojiListError,
  parseEmojiShortcode,
  parseEmojiUrl,
  publishEmojiList,
} from "../compose/customEmojis";
import styles from "./SettingsSections.module.css";

/** 保存の失敗の文言 */
function failureMessage(e: unknown): string {
  if (e instanceof EmojiListError) {
    switch (e.reason) {
      case "no-emoji-list":
        return "最新の絵文字リストを取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください";
      case "stale":
        return "絵文字リストが更新されていたため、公開しませんでした。最新の内容を表示したので、確認してもう一度編集してください";
    }
  }
  // ネイティブ emoji_save_failed
  return "絵文字リストを公開できませんでした。";
}

/** 自分の kind:10030 直下の emoji タグ（30030 セット由来は含まない。ネイティブ myEmojiListFlow 相当） */
function useOwnEmojiList(me: string | null): { latest: NostrEvent | undefined; current: CustomEmoji[] } {
  const latest = use$(() => (me ? eventStore.replaceable({ kind: 10030, pubkey: me }) : undefined), [me]);
  const current = useMemo(() => customEmojisFrom(latest, []), [latest]);
  return { latest, current };
}

/**
 * カスタム絵文字（ネイティブ EmojiEditorSettings。NIP-51 kind:10030 の emoji タグだけを編集）。
 * 編集は手元の下書きに溜め、「保存して公開」で kind:10030 を再発行する（保存のたびに発行しない）。
 * 30030 セット参照（a タグ）はそのまま維持し、ここには出さない。
 */
export function EmojiSection() {
  const me = useSession((s) => s.pubkey);
  const { latest, current } = useOwnEmojiList(me);
  const [draft, setDraft] = useState<CustomEmoji[] | null>(null);
  // 編集を始めた時点の自分の kind:10030（無ければ null）。保存の直前に取り直した版と違えば公開しない
  const [basedOnId, setBasedOnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = draft ?? current;

  function edit(next: CustomEmoji[]) {
    if (draft === null) setBasedOnId(latest?.id ?? null);
    setDraft(next);
  }

  async function save() {
    if (!me) return;
    setSaving(true);
    try {
      await publishEmojiList(me, list, draft === null ? (latest?.id ?? null) : basedOnId);
      setDraft(null);
      showToast("絵文字リストを公開しました。");
    } catch (e) {
      // 最新版と食い違っていたら下書きを捨てて最新の内容を出し直す
      if (e instanceof EmojiListError && e.reason === "stale") setDraft(null);
      showToast(failureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!me) return null;

  return (
    <>
      <div className={styles.block}>
        <p className={styles.desc}>
          自分のカスタム絵文字リスト（NIP-51）。リアクションピッカーに並び、本文でも :shortcode: で使えます。
          購読中の絵文字セット由来のものは別管理のためここには出ません。
        </p>
      </div>
      <div className={styles.block}>
        {list.length === 0 ? (
          <p className={styles.desc}>カスタム絵文字はまだありません。下から追加できます。</p>
        ) : (
          <ul className={styles.relays} aria-label="カスタム絵文字の一覧">
            {list.map((emoji) => (
              <EmojiRow
                key={emoji.shortcode}
                emoji={emoji}
                onRemove={() => edit(list.filter((e) => e.shortcode !== emoji.shortcode))}
              />
            ))}
          </ul>
        )}
        <AddEmojiForm list={list} onAdd={(emoji) => edit([...list, emoji])} />
        <button
          type="button"
          className={`${styles.primary} ${styles.alignStart}`}
          disabled={saving || draft === null}
          onClick={() => void save()}
        >
          {saving ? "公開中…" : "保存して公開"}
        </button>
      </div>
    </>
  );
}

function EmojiRow({ emoji, onRemove }: { emoji: CustomEmoji; onRemove(): void }) {
  const [src, setSrc] = useState<string | null>(() => proxied(emoji.url, 48, 80, true));

  function onError() {
    const origin = originOf(src);
    if (origin) {
      markProxyBlocked(origin);
      setSrc(origin);
    } else {
      setSrc(null);
    }
  }

  return (
    <li className={styles.relay}>
      {src !== null && (
        <img
          className={styles.emojiThumb}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onError}
        />
      )}
      <span className={styles.relayUrl}>{`:${emoji.shortcode}:`}</span>
      <button
        type="button"
        className={styles.textButton}
        aria-label={`:${emoji.shortcode}: を削除`}
        onClick={onRemove}
      >
        削除
      </button>
    </li>
  );
}

function AddEmojiForm({ list, onAdd }: { list: readonly CustomEmoji[]; onAdd(emoji: CustomEmoji): void }) {
  const codeId = useId();
  const urlId = useId();
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const shortcode = parseEmojiShortcode(code);
    const imageUrl = parseEmojiUrl(url);
    if (!shortcode || !imageUrl) {
      setError("ショートコードは英数字と _ - 、画像URLは https:// だけ使えます");
      return;
    }
    if (list.some((e) => e.shortcode === shortcode)) {
      setError("そのショートコードは追加済みです");
      return;
    }
    onAdd({ shortcode, url: imageUrl });
    setCode("");
    setUrl("");
    setError(null);
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <label htmlFor={codeId} className="srOnly">
        ショートコード
      </label>
      <input
        id={codeId}
        className={styles.input}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ショートコード（例: party_parrot）"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
      />
      <label htmlFor={urlId} className="srOnly">
        画像URL
      </label>
      <input
        id={urlId}
        className={styles.input}
        type="text"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="画像URL（https://…）"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
      />
      <button type="submit" className={styles.ghost} disabled={code.trim() === "" || url.trim() === ""}>
        追加
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
