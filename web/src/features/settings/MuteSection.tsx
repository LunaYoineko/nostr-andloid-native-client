import { type FormEvent, useId, useState } from "react";
import { shortNpub } from "../../lib/npub";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { showToast } from "../../ui/toast";
import { type MuteCategory, type MuteEntry, useMute } from "../mute/muteList";
import { addMuteWord, MuteListError, removeMuteEntry } from "../mute/muteSync";
import styles from "./SettingsSections.module.css";

/** 種別の見出し（ネイティブ mute_cat_*）と並び */
const CATEGORY_LABELS: readonly { category: MuteCategory; label: string }[] = [
  { category: "p", label: "ユーザー" },
  { category: "word", label: "ワード" },
  { category: "t", label: "ハッシュタグ" },
  { category: "e", label: "スレッド" },
];

/** ネイティブ mute_locked */
const LOCKED_MESSAGE = "復号できない非公開項目があるため編集できません（上書きで失うのを防いでいます）";

/** 変更の失敗の文言 */
function failureMessage(e: unknown): string {
  if (e instanceof MuteListError) {
    switch (e.reason) {
      case "no-mute-list":
        return "最新のミュートリストを取得できなかったため、変更しませんでした。接続を確認してもう一度お試しください";
      case "stale":
        return "ミュートリストが更新されていたため、変更しませんでした。最新の内容を表示したので、確認してもう一度操作してください";
      case "locked":
        return LOCKED_MESSAGE;
    }
  }
  // ネイティブ mute_save_failed
  return "保存に失敗しました（鍵を確認してください）";
}

function privacyLabel(entry: MuteEntry): string {
  if (entry.isPublic && entry.isPrivate) return "公開・非公開";
  return entry.isPublic ? "公開" : "非公開";
}

/**
 * ミュート（ネイティブ MuteSettings。NIP-51 kind:10000 の公開 + 復号した非公開）。
 * 1 件ごとの解除・削除とワードの追加は、その場で kind:10000 を再発行する。表示している版と、発行の直前に
 * 取り直した最新版が違えば発行しない（muteSync.ts editMuteList）。非公開部分を復号できなければ編集しない。
 */
export function MuteSection() {
  const me = useSession((s) => s.pubkey);
  const list = useMute((s) => s.list);
  const [busy, setBusy] = useState(false);
  // RequireSession の内側なので pubkey は必ずある
  if (!me) return null;

  const editable = list !== null && !list.locked && !busy;

  async function run(
    action: (basedOnId: string | null) => Promise<"done" | "noop">,
    messages: { done: string; noop: string },
  ) {
    if (!list || list.locked) return;
    setBusy(true);
    try {
      const result = await action(list.eventId);
      showToast(result === "done" ? messages.done : messages.noop);
    } catch (e) {
      showToast(failureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(entry: MuteEntry) {
    if (!me) return;
    void run((basedOnId) => removeMuteEntry(me, entry.category, entry.value, basedOnId), {
      done: entry.category === "p" ? "ミュートを解除しました" : "ミュートリストを保存しました",
      noop: "ミュートリストを保存しました",
    });
  }

  function addWord(word: string) {
    if (!me) return;
    void run((basedOnId) => addMuteWord(me, word, basedOnId), {
      done: "ミュートワードを追加しました",
      noop: "追加できませんでした",
    });
  }

  const entries = list?.entries ?? [];

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>ミュートリスト（NIP-51 / kind:10000）</h3>
        <p className={styles.desc}>
          ミュートしたユーザー・ワード・ハッシュタグ・スレッドの投稿を表示しません。ワードは本文とハッシュタグに一致し、/正規表現/
          も使えます（非公開で保存）。変更はその場で kind:10000 を再発行します。
        </p>
        <AddWordForm entries={entries} disabled={!editable} onAdd={addWord} />
      </div>
      <div className={styles.block}>
        {list === null ? (
          <p className={styles.desc} role="status">
            リレーから取得中…
          </p>
        ) : (
          <>
            {list.locked && <p className={styles.note}>{LOCKED_MESSAGE}</p>}
            {entries.length === 0 ? (
              <p className={styles.desc}>ミュートしている項目はありません</p>
            ) : (
              CATEGORY_LABELS.map(({ category, label }) => (
                <MuteGroup
                  key={category}
                  label={label}
                  entries={entries.filter((e) => e.category === category)}
                  disabled={!editable}
                  onRemove={remove}
                />
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}

function AddWordForm({
  entries,
  disabled,
  onAdd,
}: {
  entries: readonly MuteEntry[];
  disabled: boolean;
  onAdd(word: string): void;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const word = value.trim();
    if (word === "" || disabled) return;
    if (entries.some((m) => m.category === "word" && m.value.toLowerCase() === word.toLowerCase())) {
      setError("このワードは追加済みです");
      return;
    }
    onAdd(word);
    setValue("");
    setError(null);
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <label htmlFor={inputId} className="srOnly">
        ミュートするワード
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ミュートするワード（/正規表現/ 可）"
        value={value}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <button type="submit" className={styles.ghost} disabled={disabled || value.trim() === ""}>
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

/** 種別ごとの一覧（見出しに件数。行の見た目はリレーの一覧と同じ） */
function MuteGroup({
  label,
  entries,
  disabled,
  onRemove,
}: {
  label: string;
  entries: readonly MuteEntry[];
  disabled: boolean;
  onRemove(entry: MuteEntry): void;
}) {
  if (entries.length === 0) return null;
  return (
    <section aria-label={label}>
      <h4 className={styles.caption}>{`${label} (${entries.length})`}</h4>
      <ul className={styles.relays}>
        {entries.map((entry) => (
          <MuteRow
            key={`${entry.category}:${entry.value}`}
            entry={entry}
            disabled={disabled}
            onRemove={() => onRemove(entry)}
          />
        ))}
      </ul>
    </section>
  );
}

function MuteRow({ entry, disabled, onRemove }: { entry: MuteEntry; disabled: boolean; onRemove(): void }) {
  const label = entryLabel(entry);
  const isWord = entry.category === "word";
  return (
    <li className={styles.relay}>
      {entry.category === "p" ? (
        <MutedUserLabel pubkey={entry.value} />
      ) : (
        <span className={styles.relayUrl} title={entry.value}>
          {label}
        </span>
      )}
      <span className={styles.relayMeta}>{privacyLabel(entry)}</span>
      <button
        type="button"
        className={styles.textButton}
        disabled={disabled}
        aria-label={isWord ? `${label} を削除` : `${label} のミュートを解除`}
        onClick={onRemove}
      >
        {isWord ? "削除" : "解除"}
      </button>
    </li>
  );
}

function entryLabel(entry: MuteEntry): string {
  switch (entry.category) {
    case "p":
      return shortNpub(entry.value);
    case "t":
      return `#${entry.value}`;
    case "e":
      return `${entry.value.slice(0, 16)}…`;
    case "word":
      return entry.value;
  }
}

/** ミュート中のユーザー（kind:0 の名前 + npub の先頭） */
function MutedUserLabel({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return (
    <span className={styles.relayUrl}>
      <span className={styles.name}>{displayName(profile, pubkey)}</span>
      <span className={styles.shortNpub}>{shortNpub(pubkey)}</span>
    </span>
  );
}
