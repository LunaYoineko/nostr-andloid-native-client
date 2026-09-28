import { use$ } from "applesauce-react/hooks/use-$";
import { type DragEvent, type FormEvent, useId, useMemo, useState } from "react";
import { relativeTime } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ModalSheet } from "../../ui/ModalSheet";
import { showToast } from "../../ui/toast";
import {
  loadUsedHashtagsDetailed,
  PINNED_MAX,
  pinnedHashtagsFrom,
  removeUsedHashtag,
  type UsedHashtag,
} from "../compose/storage";
import styles from "../settings/SettingsSections.module.css";
import ownStyles from "./HashtagManager.module.css";
import {
  normalizeHashtag,
  PinnedHashtagsError,
  pinLimitMessage,
  publishPinnedHashtags,
} from "./pinnedHashtags";

/** 保存の失敗の文言 */
function failureMessage(e: unknown): string {
  if (e instanceof PinnedHashtagsError) {
    switch (e.reason) {
      case "no-pinned-list":
        return "最新のピン留めを取得できなかったため、保存しませんでした。接続を確認してもう一度お試しください";
      case "stale":
        return "ピン留めが更新されていたため、保存しませんでした。最新の内容を表示したので、確認してもう一度編集してください";
    }
  }
  // ネイティブ hashtags_save_failed
  return "ピン留めを保存できませんでした";
}

/**
 * ハッシュタグの整理画面（ネイティブ HashtagManageScreen。#536）。設定「ハッシュタグ」の「開く」・
 * 投稿シートの「整理…」の両方から開くモーダル。ピン留め（並べ替え・削除・追加）は手元の下書きに溜め、
 * 「保存」で kind:30015（d=pinned）を再発行する。使ったことのあるタグの削除は端末ローカルで発行しない。
 */
export function HashtagManager({ onDismiss }: { onDismiss(): void }) {
  const me = useSession((s) => s.pubkey);
  if (!me) {
    return (
      <ModalSheet title="ハッシュタグの整理" onDismiss={onDismiss}>
        <p className={styles.desc}>ピン留めを管理するにはログインしてください。</p>
      </ModalSheet>
    );
  }
  return <Manager me={me} onDismiss={onDismiss} />;
}

function Manager({ me, onDismiss }: { me: string; onDismiss(): void }) {
  const latest = use$(() => eventStore.replaceable({ kind: 30015, pubkey: me, identifier: "pinned" }), [me]);
  const current = useMemo(() => pinnedHashtagsFrom(latest), [latest]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [basedOnId, setBasedOnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [usedList, setUsedList] = useState<UsedHashtag[]>(loadUsedHashtagsDetailed);
  const [filter, setFilter] = useState("");
  const list = draft ?? current;
  const dirty = draft !== null;

  function edit(next: string[]) {
    if (draft === null) setBasedOnId(latest?.id ?? null);
    setDraft(next);
  }

  function removePinned(tag: string) {
    edit(list.filter((t) => t !== tag));
  }

  function movePinned(from: number, to: number) {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    edit(next);
  }

  /** 使ったことのあるタグの一覧からピン留めする（上限なら発行せずトースト） */
  function pinUsed(tag: string) {
    if (list.length >= PINNED_MAX) {
      showToast(pinLimitMessage());
      return;
    }
    edit([...list, tag]);
  }

  function deleteUsed(tag: string) {
    removeUsedHashtag(tag);
    setUsedList((u) => u.filter((x) => x.tag !== tag));
    showToast("履歴から削除しました");
  }

  async function save() {
    setSaving(true);
    try {
      await publishPinnedHashtags(me, list, draft === null ? (latest?.id ?? null) : basedOnId);
      setDraft(null);
      showToast("ピン留めを保存しました");
    } catch (e) {
      // 最新版と食い違っていたら下書きを捨てて最新の内容を出し直す
      if (e instanceof PinnedHashtagsError && e.reason === "stale") setDraft(null);
      showToast(failureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function attemptDismiss() {
    if (dirty) setConfirmClose(true);
    else onDismiss();
  }

  const needle = filter.trim().toLowerCase();
  const filtered = needle === "" ? usedList : usedList.filter((u) => u.tag.includes(needle));

  return (
    <>
      <ModalSheet title="ハッシュタグの整理" onDismiss={attemptDismiss}>
        <div className={ownStyles.body}>
          <p className={styles.desc}>
            ピン留めしたタグ（NIP-51
            kind:30015）は投稿画面とハッシュタグカラム作成のチップに常に表示され、端末をまたいで同期されます。使ったことのあるタグはこの端末で記憶され、#
            入力時の候補になります。
          </p>
          <section className={styles.block} aria-label="ピン留め">
            <h3 className={styles.caption}>ピン留め</h3>
            <p className={styles.desc}>
              長押ししてドラッグで並べ替え。ここでの順番がチップの順番になります。
            </p>
            {list.length === 0 ? (
              <p className={styles.desc}>
                ピン留めはまだありません。下から追加するか、使ったことのあるタグをピン留めしてください。
              </p>
            ) : (
              <ol className={styles.relays} aria-label="ピン留めの一覧">
                {list.map((tag, i) => (
                  <PinnedRow
                    key={tag}
                    tag={tag}
                    index={i}
                    total={list.length}
                    onMoveUp={() => movePinned(i, i - 1)}
                    onMoveDown={() => movePinned(i, i + 1)}
                    onDropFrom={(from) => movePinned(from, i)}
                    onRemove={() => removePinned(tag)}
                  />
                ))}
              </ol>
            )}
            <AddPinnedForm list={list} onAdd={(tag) => edit([...list, tag])} />
          </section>
          <section className={styles.block} aria-label="使ったことのあるタグ">
            <h3 className={styles.caption}>使ったことのあるタグ</h3>
            <input
              className={styles.input}
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="絞り込み"
              aria-label="使ったことのあるタグを絞り込み"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {usedList.length === 0 ? (
              <p className={styles.desc}>まだ使ったタグがありません。</p>
            ) : filtered.length === 0 ? (
              <p className={styles.desc}>一致するタグがありません。</p>
            ) : (
              <ul className={styles.relays} aria-label="使ったことのあるタグの一覧">
                {filtered.map((u) => (
                  <UsedRow
                    key={u.tag}
                    entry={u}
                    pinned={list.includes(u.tag)}
                    onPin={() => pinUsed(u.tag)}
                    onDelete={() => deleteUsed(u.tag)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className={ownStyles.footer}>
          <button
            type="button"
            className={ownStyles.save}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </ModalSheet>
      {confirmClose && (
        <ConfirmDialog
          title="変更を破棄しますか？"
          text="ピン留めの変更はまだ保存されていません。"
          confirmLabel="破棄する"
          destructive
          onConfirm={onDismiss}
          onDismiss={() => setConfirmClose(false)}
        />
      )}
    </>
  );
}

/** ピン留めの 1 行。ドラッグ（ポインタ）と ↑ / ↓ ボタン（キーボード）の両方で並べ替えられる */
function PinnedRow({
  tag,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDropFrom,
  onRemove,
}: {
  tag: string;
  index: number;
  total: number;
  onMoveUp(): void;
  onMoveDown(): void;
  onDropFrom(from: number): void;
  onRemove(): void;
}) {
  function onDragStart(e: DragEvent<HTMLLIElement>) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }
  function onDragOver(e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isInteger(from)) onDropFrom(from);
  }

  return (
    <li className={styles.relay} draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>
      <span className={styles.relayUrl}>{`#${tag}`}</span>
      <button
        type="button"
        className={styles.textButton}
        aria-label={`#${tag} を上へ移動`}
        disabled={index === 0}
        onClick={onMoveUp}
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.textButton}
        aria-label={`#${tag} を下へ移動`}
        disabled={index === total - 1}
        onClick={onMoveDown}
      >
        ↓
      </button>
      <button type="button" className={styles.textButton} aria-label={`#${tag} を外す`} onClick={onRemove}>
        外す
      </button>
    </li>
  );
}

function AddPinnedForm({ list, onAdd }: { list: readonly string[]; onAdd(tag: string): void }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const tag = normalizeHashtag(value);
    if (!tag) {
      // ネイティブ hashtags_add_invalid
      setError("タグに使えるのは文字・数字・_ だけです。");
      return;
    }
    if (list.includes(tag)) {
      // ネイティブ hashtags_add_duplicate
      setError("そのタグはすでにピン留めされています。");
      return;
    }
    if (list.length >= PINNED_MAX) {
      setError(pinLimitMessage());
      return;
    }
    onAdd(tag);
    setValue("");
    setError(null);
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <label htmlFor={inputId} className="srOnly">
        タグを追加
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="タグを追加（例: nostr）"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <button type="submit" className={styles.ghost} disabled={value.trim() === ""}>
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

function UsedRow({
  entry,
  pinned,
  onPin,
  onDelete,
}: {
  entry: UsedHashtag;
  pinned: boolean;
  onPin(): void;
  onDelete(): void;
}) {
  return (
    <li className={styles.relay}>
      <span className={styles.relayUrl}>{`#${entry.tag}`}</span>
      <span className={styles.relayMeta}>{`最終使用 ${relativeTime(entry.lastUsed)}`}</span>
      {pinned ? (
        // ネイティブ hashtags_pinned_badge
        <span className={styles.relayMeta}>ピン留め中</span>
      ) : (
        <button type="button" className={styles.textButton} onClick={onPin}>
          ピン留め
        </button>
      )}
      <button
        type="button"
        className={styles.textButton}
        aria-label={`#${entry.tag} を履歴から削除`}
        onClick={onDelete}
      >
        履歴から削除
      </button>
    </li>
  );
}
