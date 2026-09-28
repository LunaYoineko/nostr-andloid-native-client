import { type ReactNode, useId, useState } from "react";
import type { CustomColors } from "./customPalette";
import type { NoteAccentStyle } from "./noteAccent";
import { ThemeEditModal, type ThemeEditTab } from "./ThemeEditModal";
import styles from "./ThemeSettings.module.css";
import {
  setBoldText,
  setNoteAccent,
  setTextScale,
  setThemeMode,
  setUiScale,
  type TextScale,
  THEME_MODE_LABELS,
  type ThemeMode,
  type UiScale,
  undoTheme,
  useThemePrefs,
  useThemeUndo,
} from "./themePrefs";

type Option<T extends string> = { value: T; label: string };

/** ネイティブ theme_system / theme_light / theme_dark / theme_custom */
const MODE_OPTIONS: readonly Option<ThemeMode>[] = (["system", "light", "dark", "custom"] as const).map(
  (value) => ({ value, label: THEME_MODE_LABELS[value] }),
);

/** ネイティブ note_accent_none / line / bg */
const NOTE_ACCENT_OPTIONS: readonly Option<NoteAccentStyle>[] = [
  { value: "none", label: "なし" },
  { value: "line", label: "縦ライン" },
  { value: "bg", label: "背景色" },
];

/** ネイティブ ui_scale_small / medium / large */
const UI_SCALE_OPTIONS: readonly Option<UiScale>[] = [
  { value: "s", label: "標準" },
  { value: "m", label: "大きめ" },
  { value: "l", label: "最大" },
];

/** ネイティブ text_scale_small / medium / large */
const TEXT_SCALE_OPTIONS: readonly Option<TextScale>[] = [
  { value: "s", label: "小" },
  { value: "m", label: "中" },
  { value: "l", label: "大" },
];

/**
 * テーマ・種別の視覚表示・表示サイズ・文字サイズ・太字（ネイティブの 設定 > 表示 の同名項目。#587 で
 * 順序をネイティブに合わせた: テーマ → 種別の視覚表示 → 表示サイズ → 文字サイズ → 太字）。
 * カスタムを選ぶと、色の編集・テーマストアはここではなく上寄せモーダル（ThemeEditModal）へ導線を出す。
 */
export function ThemeSettings() {
  const mode = useThemePrefs((s) => s.mode);
  const custom = useThemePrefs((s) => s.custom);
  const noteAccent = useThemePrefs((s) => s.noteAccent);
  const uiScale = useThemePrefs((s) => s.uiScale);
  const textScale = useThemePrefs((s) => s.textScale);
  const bold = useThemePrefs((s) => s.bold);
  const undo = useThemeUndo();
  const [editTab, setEditTab] = useState<ThemeEditTab | null>(null);
  const id = useId();
  return (
    <div className={styles.settings}>
      <ChoiceGroup
        legend="テーマ"
        name={`${id}-mode`}
        options={MODE_OPTIONS}
        value={mode}
        onChange={setThemeMode}
      />
      {mode === "custom" && (
        <div className={styles.navRows}>
          <ThemeNavRow
            label="色をカスタマイズ"
            sublabel={`${custom.bg} / ${custom.text} / ${custom.accent}`}
            leading={<ThemeSwatch colors={custom} />}
            onClick={() => setEditTab("customize")}
          />
          <ThemeNavRow
            label="テーマストアから取得"
            sublabel="他の人が公開したテーマを探す"
            onClick={() => setEditTab("store")}
          />
          {/* [#264][#268] 取り消しはモーダルを閉じた後も効くようここにも出す。開いている間は二重に出さない */}
          {undo && editTab === null && <ThemeUndoBar />}
        </div>
      )}
      <ChoiceGroup
        legend="種別の視覚表示"
        desc="リポスト・引用・リプライ・リアクションを色で区別します。既定は「なし」（モノクロ基調のまま）。"
        name={`${id}-note-accent`}
        options={NOTE_ACCENT_OPTIONS}
        value={noteAccent}
        onChange={setNoteAccent}
      />
      <ChoiceGroup
        legend="表示サイズ"
        desc="文字・アイコン・余白を含む画面全体の大きさ。"
        name={`${id}-ui-scale`}
        options={UI_SCALE_OPTIONS}
        value={uiScale}
        onChange={setUiScale}
      />
      <ChoiceGroup
        legend="文字サイズ"
        name={`${id}-text-scale`}
        options={TEXT_SCALE_OPTIONS}
        value={textScale}
        onChange={setTextScale}
      />
      <fieldset className={styles.group}>
        <legend className={styles.caption}>文字を太くする</legend>
        <p className={styles.desc}>
          全体の文字を1段太くします。コントラストの低いテーマで読みやすくなります。
        </p>
        <label className={styles.check}>
          <input type="checkbox" checked={bold} onChange={(e) => setBoldText(e.target.checked)} />
          太い文字を使う
        </label>
      </fieldset>
      {editTab && <ThemeEditModal initialTab={editTab} onDismiss={() => setEditTab(null)} />}
    </div>
  );
}

/** 色をカスタマイズ / テーマストアから取得の導線行（ネイティブ SettingsNavRow） */
function ThemeNavRow({
  label,
  sublabel,
  leading,
  onClick,
}: {
  label: string;
  sublabel: string;
  leading?: ReactNode;
  onClick(): void;
}) {
  return (
    <button type="button" className={styles.navRow} onClick={onClick}>
      {leading}
      <span className={styles.navRowText}>
        <span className={styles.navRowLabel}>{label}</span>
        <span className={styles.navRowSub}>{sublabel}</span>
      </span>
    </button>
  );
}

/**
 * 適用直後の「元に戻す」（ネイティブ ThemeUndoBar）。モード・カスタム配色の変更でだけ出る。
 * テーマ編集モーダル（ThemeEditModal）でも、開いている間だけ同じバーを出すために export する。
 */
export function ThemeUndoBar() {
  const undo = useThemeUndo();
  if (!undo) return null;
  return (
    <div className={styles.undoBar}>
      <p className={styles.undoText}>「{undo.label}」を適用しました</p>
      <button type="button" className={styles.undoButton} onClick={undoTheme}>
        元に戻す
      </button>
    </div>
  );
}

/**
 * 3色の見本（背景の上に文字サンプルとアクセントの小さな四角。ネイティブ ThemeMiniCard / プリセットの
 * 見本と同じ見た目）。プリセット・テーマストアのミニカード・導線行の先頭に使うために export する。
 */
export function ThemeSwatch({ colors }: { colors: CustomColors }) {
  return (
    <span className={styles.swatch} style={{ background: colors.bg }} aria-hidden="true">
      <span style={{ color: colors.text }}>Aa</span>
      <span className={styles.swatchAccent} style={{ background: colors.accent }} />
    </span>
  );
}

/** 排他選択のチップ（ネイティブ ChoiceChip）。中身はラジオ */
function ChoiceGroup<T extends string>({
  legend,
  desc,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  desc?: string;
  name: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.caption}>{legend}</legend>
      {desc && <p className={styles.desc}>{desc}</p>}
      <div className={styles.chips}>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
