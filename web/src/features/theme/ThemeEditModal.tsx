import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useSession } from "../../signer/session";
import { ModalSheet } from "../../ui/ModalSheet";
import { showToast } from "../../ui/toast";
import {
  CUSTOM_PRESETS,
  type CustomColors,
  contrastRatio,
  customPalette,
  DEFAULT_CUSTOM_COLORS,
  normalizeHex,
} from "./customPalette";
import styles from "./ThemeEditModal.module.css";
import { ThemeSwatch, ThemeUndoBar } from "./ThemeSettings";
import { ThemeStoreSection } from "./ThemeStoreSection";
import { applyCustomColors, THEME_MODE_LABELS, useThemePrefs, useThemeUndo } from "./themePrefs";
import { publishTheme, ThemePublishError } from "./themeStore";

export type ThemeEditTab = "customize" | "store";

function sameColors(a: CustomColors, b: CustomColors): boolean {
  return a.bg === b.bg && a.text === b.text && a.accent === b.accent;
}

/**
 * テーマ編集モーダル（ネイティブ ThemeSheet。#587）。「色をカスタマイズ」「テーマストアから取得」の
 * どちらからも開く、タブ（カスタマイズ/ストア）付きの上寄せモーダル。選択はすべて下書き（draft）と
 * 上部のプレビューカードにのみ反映し、「適用」を押して初めて applyCustomColors で全体へ反映する。
 */
export function ThemeEditModal({ initialTab, onDismiss }: { initialTab: ThemeEditTab; onDismiss(): void }) {
  const current = useThemePrefs((s) => s.custom);
  const undo = useThemeUndo();
  const [tab, setTab] = useState<ThemeEditTab>(initialTab);
  const [draft, setDraft] = useState<CustomColors>(current);
  const [draftName, setDraftName] = useState<string | null>(null);

  // 適用・取り消しで全体の色が変わったら下書きも追従させる（ネイティブ LaunchedEffect(current)）
  useEffect(() => {
    setDraft(current);
    setDraftName(null);
  }, [current]);

  function select(colors: CustomColors, name: string | null) {
    setDraft(colors);
    setDraftName(name);
  }

  const dirty = !sameColors(draft, current);

  return (
    <ModalSheet title="テーマ" onDismiss={onDismiss}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={styles.tab}
          aria-pressed={tab === "customize"}
          onClick={() => setTab("customize")}
        >
          カスタマイズ
        </button>
        <button
          type="button"
          className={styles.tab}
          aria-pressed={tab === "store"}
          onClick={() => setTab("store")}
        >
          ストア
        </button>
      </div>

      <p className={styles.previewLabel}>プレビュー — 「適用」を押すまで全体には反映されません。</p>
      <ThemePreviewCard colors={draft} />

      <div className={styles.page}>
        {tab === "customize" ? (
          <ThemeCustomizeTab draft={draft} onDraft={select} />
        ) : (
          <ThemeStoreSection draft={draft} onSelect={select} />
        )}
      </div>

      {undo && <ThemeUndoBar />}
      <button
        type="button"
        className={styles.apply}
        disabled={!dirty}
        onClick={() => applyCustomColors(draft, draftName ?? THEME_MODE_LABELS.custom)}
      >
        適用
      </button>
    </ModalSheet>
  );
}

/**
 * 下書き3色のライブプレビュー（ネイティブ ThemePreviewCard）。実際の導出パレット（customPalette）で
 * 投稿カードのモックを描き、面・補助文字・アクセントまで適用後の見た目を伝える。
 */
function ThemePreviewCard({ colors }: { colors: CustomColors }) {
  const p = customPalette(colors);
  return (
    <div className={styles.previewCard} style={{ background: p.bg, borderColor: p.border }}>
      <div className={styles.previewRow} style={{ background: p.surface }}>
        <span className={styles.previewAvatar} style={{ background: p.surface3 }} />
        <div className={styles.previewBody}>
          <div className={styles.previewHead}>
            <span style={{ color: p.text }}>Nostrism</span>
            <span style={{ color: p.text3 }}>· 1m</span>
          </div>
          <p className={styles.previewText} style={{ color: p.text2 }}>
            サンプル投稿です。配色の見え方をここで確認できます。
          </p>
          <div className={styles.previewFoot}>
            <span className={styles.previewAction} style={{ background: p.accent, color: p.bg }}>
              ボタン
            </span>
            <span className={styles.previewBar} style={{ background: p.accentWeak }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * カスタマイズタブ: プリセットと3色の編集（hex + ブラウザ標準のカラーピッカー）。すべて下書きにのみ反映。
 * （ネイティブ ThemeCustomizePage 相当）
 */
function ThemeCustomizeTab({
  draft,
  onDraft,
}: {
  draft: CustomColors;
  onDraft(colors: CustomColors, name: string | null): void;
}) {
  const textRatio = contrastRatio(draft.bg, draft.text);
  const accentRatio = contrastRatio(draft.bg, draft.accent);
  const me = useSession((s) => s.pubkey);
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <div className={styles.customize}>
      <p className={styles.desc}>
        背景・文字・アクセントの3色を選ぶと、面・境界線・補助文字は自動で導出されます。
      </p>
      <div className={styles.presets}>
        {CUSTOM_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className={styles.preset}
            aria-pressed={sameColors(preset.colors, draft)}
            onClick={() => onDraft(preset.colors, preset.name)}
          >
            <ThemeSwatch colors={preset.colors} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      <ColorField label="背景" value={draft.bg} onChange={(hex) => onDraft({ ...draft, bg: hex }, null)} />
      <ColorField
        label="文字"
        value={draft.text}
        onChange={(hex) => onDraft({ ...draft, text: hex }, null)}
      />
      <ColorField
        label="アクセント"
        value={draft.accent}
        onChange={(hex) => onDraft({ ...draft, accent: hex }, null)}
      />
      {textRatio < 4.5 && (
        <p className={styles.warn}>
          コントラストが低いです（{ratioLabel(textRatio)}:1）。読みにくい可能性があります — 4.5:1 以上を推奨。
        </p>
      )}
      {accentRatio < 3.0 && (
        <p className={styles.warn}>
          アクセントのコントラストが低いです（{ratioLabel(accentRatio)}
          :1）。ボタンやリンクが見えにくい可能性があります — 3:1 以上を推奨。
        </p>
      )}
      <button type="button" className={styles.reset} onClick={() => onDraft(DEFAULT_CUSTOM_COLORS, null)}>
        既定に戻す
      </button>
      {me && (
        <>
          <hr className={styles.divider} />
          <p className={styles.desc}>
            この配色をテーマストアに公開すると、他の人が探して使えるようになります。同じ名前で再公開すると更新されます。
          </p>
          <button type="button" className={styles.reset} onClick={() => setPublishOpen(true)}>
            テーマストアに公開
          </button>
        </>
      )}
      {publishOpen && me && (
        <PublishThemeDialog me={me} colors={draft} onDismiss={() => setPublishOpen(false)} />
      )}
    </div>
  );
}

/** コントラスト比を小数第1位までの表示用文字列に */
function ratioLabel(ratio: number): string {
  return (Math.round(ratio * 10) / 10).toString();
}

/** 発行の失敗を文言へ（#478 の規則。理由ごとにネイティブと揃えた文言） */
function themePublishFailureMessage(e: unknown): string {
  if (e instanceof ThemePublishError) {
    switch (e.reason) {
      case "no-theme":
        return "最新の状態を取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください";
      case "stale":
        return "別の端末で更新されていたため、公開しませんでした。もう一度お試しください";
    }
  }
  // ネイティブ theme_publish_failed
  return "テーマを公開できませんでした。";
}

/**
 * 公開ダイアログ（ネイティブ DeckInputDialog 相当）。名前だけ聞いて公開する（配色は編集中の下書きをそのまま使う）。
 * #478 の規則（取り直し・食い違いチェック）は publishTheme 側で行う。
 */
function PublishThemeDialog({
  me,
  colors,
  onDismiss,
}: {
  me: string;
  colors: CustomColors;
  onDismiss(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    try {
      await publishTheme(me, trimmed, colors);
      showToast("テーマを公開しました。");
      onDismiss();
    } catch (err) {
      showToast(themePublishFailureMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      // [#587] 外側の ModalSheet（テーマ編集モーダル）の dialog を一緒に閉じないよう止める
      // （React は cancel を親へ伝える。ReactionPickerDialog と同じ作法）
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!busy) onDismiss();
      }}
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id={titleId} className={styles.dialogTitle}>
          テーマストアに公開
        </h2>
        <label htmlFor={inputId} className="srOnly">
          テーマ名
        </label>
        <input
          id={inputId}
          className={styles.dialogInput}
          type="text"
          placeholder="テーマ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <div className={styles.dialogButtons}>
          <button
            type="button"
            className={`${styles.dialogButton} ${styles.dialogDismiss}`}
            onClick={onDismiss}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${styles.dialogButton} ${styles.dialogConfirm}`}
            disabled={name.trim() === "" || busy}
          >
            {busy ? "公開中…" : "公開"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * 1色分の編集行: ブラウザ標準のカラーピッカー（input type="color"）+ hex 入力。
 * hex は完全な値になった時だけ反映する（入力途中で戻さない。ネイティブ ColorEditRow と同じ）。
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  // プリセット選択・既定に戻すなど外部から値が変わったら入力欄も合わせる
  useEffect(() => setText(value), [value]);
  return (
    <div className={styles.colorField}>
      <label htmlFor={id} className={styles.caption}>
        {label}
      </label>
      <div className={styles.colorRow}>
        <input
          type="color"
          aria-label={`${label}の色を選ぶ`}
          value={value.toLowerCase()}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          type="text"
          className={styles.hexInput}
          value={text}
          placeholder="#RRGGBB"
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const normalized = normalizeHex(next);
            if (normalized) onChange(normalized);
          }}
        />
      </div>
    </div>
  );
}
