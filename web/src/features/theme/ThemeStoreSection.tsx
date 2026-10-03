import { use$ } from "applesauce-react/hooks/use-$";
import { useMemo, useState } from "react";
import { useT } from "../../i18n";
import { displayName, useProfile } from "../../nostr/loaders";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { followsFromContacts } from "../profile/contacts";
import settingsStyles from "../settings/SettingsSections.module.css";
import type { CustomColors } from "./customPalette";
import { ThemeSwatch } from "./ThemeSettings";
import styles from "./ThemeStoreSection.module.css";
import { decodeThemeCode, encodeThemeCode, type ThemeEntry } from "./themeEntry";
import { useThemePrefs } from "./themePrefs";
import {
  filterThemeEntries,
  requestDeleteTheme,
  sortThemeEntries,
  THEME_LIST_CAP,
  type ThemeStoreScope,
  type ThemeStoreSort,
  useThemeStoreEntries,
} from "./themeStore";

const SCOPE_OPTIONS: readonly { value: ThemeStoreScope; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "following", label: "フォロー中" },
  { value: "mine", label: "自分" },
];

const SORT_OPTIONS: readonly { value: ThemeStoreSort; label: string }[] = [
  { value: "newest", label: "新着" },
  { value: "name", label: "名前" },
];

function sameColors(a: CustomColors, b: CustomColors): boolean {
  return a.bg === b.bg && a.text === b.text && a.accent === b.accent;
}

/**
 * テーマストア（#539。#587 でテーマ編集モーダルの「ストア」タブへ）。他の人が公開したテーマ
 * （NIP-78 kind:30078 + t=nostrism-theme）を検索し、共有コードのコピー・取り込みもできる。
 * 行タップ・コード取り込みは呼び出し元（ThemeEditModal）の下書き（プレビュー）へ反映するだけで、
 * 適用は #464 の applyCustomColors（取り消しバー付き）をモーダルの「適用」ボタンが行う。
 */
export function ThemeStoreSection({
  draft,
  onSelect,
}: {
  /** 現在の下書き（プレビュー中の配色）。共有コードのコピーはこれを書き出す */
  draft: CustomColors;
  /** 行タップ・コード取り込みで下書きへ反映する */
  onSelect(colors: CustomColors, name: string | null): void;
}) {
  const t = useT();
  const me = useSession((s) => s.pubkey);
  const { loading, entries } = useThemeStoreEntries();
  const current = useThemePrefs((s) => s.custom);
  const contacts = use$(() => (me ? eventStore.replaceable({ kind: 3, pubkey: me }) : undefined), [me]);
  const follows = useMemo(() => new Set(followsFromContacts(contacts)), [contacts]);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ThemeStoreScope>("all");
  const [sort, setSort] = useState<ThemeStoreSort>("newest");
  const [deleteTarget, setDeleteTarget] = useState<ThemeEntry | null>(null);
  const [code, setCode] = useState("");
  const canPaste = typeof navigator.clipboard?.readText === "function";

  const filtered = useMemo(
    () => filterThemeEntries(entries, { query, scope, me, follows }),
    [entries, query, scope, me, follows],
  );
  const shown = useMemo(() => sortThemeEntries(filtered, sort), [filtered, sort]);

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const ok = await requestDeleteTheme(target);
    showToast(ok ? "削除リクエストを送信しました。" : "削除リクエストを送信できませんでした。");
  }

  async function copyCode() {
    const code = encodeThemeCode({ name: "MyTheme", colors: draft });
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      showToast("コピーできませんでした。");
      return;
    }
    showToast("この配色をコピーしました。");
  }

  async function pasteCode() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setCode(text);
    } catch {
      // 読めなければ何もしない（権限の拒否など）
    }
  }

  function importCode() {
    const decoded = decodeThemeCode(code);
    if (!decoded) {
      showToast("共有コードの形式が正しくありません。");
      return;
    }
    onSelect(decoded.colors, decoded.name);
    setCode("");
  }

  return (
    <div className={settingsStyles.block}>
      <p className={settingsStyles.desc}>
        他の人が公開したテーマ（NIP-78）。タップでプレビューし、「適用」で反映します。新しいアプリ版向けのテーマには印が付きますが、適用は可能です。
      </p>
      <label className="srOnly" htmlFor="theme-store-search">
        テーマ名・作者名で検索
      </label>
      <input
        id="theme-store-search"
        className={settingsStyles.input}
        type="text"
        placeholder="テーマ名・作者名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <fieldset className={styles.fieldset}>
        <legend className={settingsStyles.caption}>範囲</legend>
        <div className={settingsStyles.choices}>
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={settingsStyles.choice}
              aria-pressed={scope === o.value}
              onClick={() => setScope(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend className={settingsStyles.caption}>並び</legend>
        <div className={settingsStyles.choices}>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={settingsStyles.choice}
              aria-pressed={sort === o.value}
              onClick={() => setSort(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      {entries.length >= THEME_LIST_CAP && (
        <p className={settingsStyles.desc}>{`最大 ${THEME_LIST_CAP} 件まで表示します。`}</p>
      )}

      {entries.length === 0 ? (
        <p className={settingsStyles.desc}>
          {loading
            ? "テーマを取得中…"
            : "まだテーマが見つかりません。「カスタマイズ」タブから自分のテーマを公開するか、下の共有コードから取り込めます。"}
        </p>
      ) : shown.length === 0 ? (
        <p className={settingsStyles.desc}>条件に合うテーマがありません。</p>
      ) : (
        <ul className={styles.list} aria-label="テーマストアの一覧">
          {shown.map((entry) => (
            <ThemeStoreRow
              key={`${entry.author}:${entry.dTag}`}
              entry={entry}
              applied={sameColors(entry.colors, current)}
              selected={sameColors(entry.colors, draft)}
              onSelect={() => onSelect(entry.colors, entry.name)}
              onDelete={me && entry.author === me ? () => setDeleteTarget(entry) : null}
            />
          ))}
        </ul>
      )}

      <h3 className={settingsStyles.caption}>共有コード</h3>
      <div className={settingsStyles.row}>
        <input
          className={settingsStyles.input}
          type="text"
          placeholder="共有コード"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          className={settingsStyles.primary}
          disabled={code.trim() === ""}
          onClick={importCode}
        >
          取り込む
        </button>
      </div>
      <div className={settingsStyles.row}>
        {canPaste && (
          <button type="button" className={settingsStyles.ghost} onClick={() => void pasteCode()}>
            貼り付け
          </button>
        )}
        <button type="button" className={settingsStyles.ghost} onClick={() => void copyCode()}>
          この配色をコピー
        </button>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={t("theme_delete_title")}
          text={t("theme_delete_text")}
          confirmLabel={t("theme_delete")}
          destructive
          onConfirm={() => void confirmDelete()}
          onDismiss={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/**
 * ストア一覧の1行。ミニカード（ThemeSwatch）+ 名前・作者。[#587] タップは下書きへの取り込み（プレビュー）。
 * 適用中・プレビュー中を右端に表示する（ネイティブ ThemeStoreRow と同じ）。自分のテーマは削除できる
 */
function ThemeStoreRow({
  entry,
  applied,
  selected,
  onSelect,
  onDelete,
}: {
  entry: ThemeEntry;
  applied: boolean;
  selected: boolean;
  onSelect(): void;
  onDelete: (() => void) | null;
}) {
  const profile = useProfile(entry.author);
  const author = displayName(profile, entry.author, "npub");
  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowButton} onClick={onSelect}>
        <ThemeSwatch colors={entry.colors} />
        <span className={styles.info}>
          <span className={styles.name}>{entry.name}</span>
          <span className={settingsStyles.relayMeta}>{author}</span>
        </span>
        {applied ? (
          <span className={styles.badge}>適用中</span>
        ) : selected ? (
          <span className={styles.badge}>プレビュー中</span>
        ) : null}
      </button>
      {onDelete && (
        <button type="button" className={settingsStyles.textButton} onClick={onDelete}>
          削除をリクエスト
        </button>
      )}
    </li>
  );
}
