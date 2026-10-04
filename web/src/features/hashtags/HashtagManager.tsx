import { use$ } from "applesauce-react/hooks/use-$";
import { type DragEvent, type FormEvent, useId, useMemo, useState } from "react";
import { t, useT } from "../../i18n";
import { formatAbsoluteTime } from "../../lib/time";
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
        return t("web_hashtags_no_base");
      case "stale":
        return t("web_hashtags_stale");
    }
  }
  // ネイティブ hashtags_save_failed
  return t("hashtags_save_failed");
}

/**
 * ハッシュタグの整理画面（ネイティブ HashtagManageScreen。#536）。設定「ハッシュタグ」の「開く」・
 * 投稿シートの「整理…」の両方から開くモーダル。ピン留め（並べ替え・削除・追加）は手元の下書きに溜め、
 * 「保存」で kind:30015（d=pinned）を再発行する。使ったことのあるタグの削除は端末ローカルで発行しない。
 */
export function HashtagManager({ onDismiss }: { onDismiss(): void }) {
  const t = useT();
  const me = useSession((s) => s.pubkey);
  if (!me) {
    return (
      <ModalSheet title={t("hashtags_manage_title")} onDismiss={onDismiss}>
        <p className={styles.desc}>{t("hashtags_unavailable")}</p>
      </ModalSheet>
    );
  }
  return <Manager me={me} onDismiss={onDismiss} />;
}

function Manager({ me, onDismiss }: { me: string; onDismiss(): void }) {
  const t = useT();
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
    edit(list.filter((other) => other !== tag));
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
    showToast(t("hashtags_used_deleted"));
  }

  async function save() {
    setSaving(true);
    try {
      await publishPinnedHashtags(me, list, draft === null ? (latest?.id ?? null) : basedOnId);
      setDraft(null);
      showToast(t("hashtags_saved"));
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
      <ModalSheet title={t("hashtags_manage_title")} onDismiss={attemptDismiss}>
        <div className={ownStyles.body}>
          {/* hashtags_note は設定 > ハッシュタグ側だけに出す（ネイティブと同じ。H1） */}
          <section className={styles.block} aria-label={t("hashtags_pinned_section")}>
            <h3 className={styles.caption}>{t("hashtags_pinned_section")}</h3>
            <p className={styles.desc}>{t("hashtags_pinned_hint")}</p>
            {list.length === 0 ? (
              <p className={styles.desc}>{t("hashtags_pinned_empty")}</p>
            ) : (
              <ol className={styles.relays} aria-label={t("web_hashtags_pinned_list_label")}>
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
          <section className={styles.block} aria-label={t("hashtags_used_section")}>
            <h3 className={styles.caption}>{t("hashtags_used_section")}</h3>
            <input
              className={styles.input}
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("hashtags_used_filter_hint")}
              aria-label={t("web_hashtags_used_filter_label")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {usedList.length === 0 ? (
              <p className={styles.desc}>{t("hashtags_used_empty")}</p>
            ) : filtered.length === 0 ? (
              <p className={styles.desc}>{t("hashtags_used_none_match")}</p>
            ) : (
              <ul className={styles.relays} aria-label={t("web_hashtags_used_list_label")}>
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
            {saving ? t("common_saving") : t("common_save")}
          </button>
        </div>
      </ModalSheet>
      {confirmClose && (
        <ConfirmDialog
          title={t("hashtags_discard_title")}
          text={t("hashtags_discard_text")}
          confirmLabel={t("hashtags_discard_confirm")}
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
  const t = useT();
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
        aria-label={t("web_hashtags_move_up", tag)}
        disabled={index === 0}
        onClick={onMoveUp}
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.textButton}
        aria-label={t("web_hashtags_move_down", tag)}
        disabled={index === total - 1}
        onClick={onMoveDown}
      >
        ↓
      </button>
      <button
        type="button"
        className={styles.textButton}
        aria-label={t("web_hashtags_remove_label", tag)}
        onClick={onRemove}
      >
        {t("web_hashtags_remove")}
      </button>
    </li>
  );
}

function AddPinnedForm({ list, onAdd }: { list: readonly string[]; onAdd(tag: string): void }) {
  const t = useT();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const tag = normalizeHashtag(value);
    if (!tag) {
      // ネイティブ hashtags_add_invalid
      setError(t("hashtags_add_invalid"));
      return;
    }
    if (list.includes(tag)) {
      // ネイティブ hashtags_add_duplicate
      setError(t("hashtags_add_duplicate"));
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
        {t("web_hashtags_add_label")}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={t("hashtags_add_hint")}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <button type="submit" className={styles.ghost} disabled={value.trim() === ""}>
        {t("common_add")}
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
  const t = useT();
  return (
    <li className={styles.relay}>
      <span className={styles.relayUrl}>{`#${entry.tag}`}</span>
      <span className={styles.relayMeta}>
        {t("hashtags_last_used_fmt", formatAbsoluteTime(entry.lastUsed))}
      </span>
      {pinned ? (
        // ネイティブ hashtags_pinned_badge
        <span className={styles.relayMeta}>{t("hashtags_pinned_badge")}</span>
      ) : (
        <button type="button" className={styles.textButton} onClick={onPin}>
          {t("tag_pin")}
        </button>
      )}
      <button
        type="button"
        className={styles.textButton}
        aria-label={t("web_hashtags_used_delete_label", entry.tag)}
        onClick={onDelete}
      >
        {t("hashtags_used_delete")}
      </button>
    </li>
  );
}
