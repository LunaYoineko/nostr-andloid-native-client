import { useEffect, useId, useState } from "react";
import { CUSTOM_PRESETS, type CustomColors, contrastRatio, normalizeHex } from "./customPalette";
import type { NoteAccentStyle } from "./noteAccent";
import styles from "./ThemeSettings.module.css";
import {
  applyCustomColors,
  resetCustomColors,
  setBoldText,
  setCustomColor,
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

/** ネイティブ text_scale_small / medium / large */
const TEXT_SCALE_OPTIONS: readonly Option<TextScale>[] = [
  { value: "s", label: "小" },
  { value: "m", label: "中" },
  { value: "l", label: "大" },
];

/** ネイティブ ui_scale_small / medium / large */
const UI_SCALE_OPTIONS: readonly Option<UiScale>[] = [
  { value: "s", label: "標準" },
  { value: "m", label: "大きめ" },
  { value: "l", label: "最大" },
];

/** ネイティブ note_accent_none / line / bg */
const NOTE_ACCENT_OPTIONS: readonly Option<NoteAccentStyle>[] = [
  { value: "none", label: "なし" },
  { value: "line", label: "縦ライン" },
  { value: "bg", label: "背景色" },
];

/**
 * テーマ・文字サイズ・表示サイズ・太字・種別の視覚表示（ネイティブの 設定 > 表示 の同名項目）。
 * 選ぶとすぐ保存して反映する。設定画面（#463）の「表示」セクションに置く。
 */
export function ThemeSettings() {
  const mode = useThemePrefs((s) => s.mode);
  const textScale = useThemePrefs((s) => s.textScale);
  const uiScale = useThemePrefs((s) => s.uiScale);
  const bold = useThemePrefs((s) => s.bold);
  const noteAccent = useThemePrefs((s) => s.noteAccent);
  const id = useId();
  return (
    <div className={styles.settings}>
      <ThemeUndoBar />
      <ChoiceGroup
        legend="テーマ"
        name={`${id}-mode`}
        options={MODE_OPTIONS}
        value={mode}
        onChange={setThemeMode}
      />
      {mode === "custom" && <ThemeCustomize />}
      <ChoiceGroup
        legend="文字サイズ"
        name={`${id}-text-scale`}
        options={TEXT_SCALE_OPTIONS}
        value={textScale}
        onChange={setTextScale}
      />
      <ChoiceGroup
        legend="表示サイズ"
        desc="文字・アイコン・余白を含む画面全体の大きさ。"
        name={`${id}-ui-scale`}
        options={UI_SCALE_OPTIONS}
        value={uiScale}
        onChange={setUiScale}
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
      <ChoiceGroup
        legend="種別の視覚表示"
        desc="リポスト・引用・リプライ・リアクションを色で区別します。既定は「なし」（モノクロ基調のまま）。"
        name={`${id}-note-accent`}
        options={NOTE_ACCENT_OPTIONS}
        value={noteAccent}
        onChange={setNoteAccent}
      />
    </div>
  );
}

/** 適用直後の「元に戻す」（ネイティブ ThemeUndoBar）。モード・カスタム配色の変更でだけ出る */
function ThemeUndoBar() {
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

/** コントラスト比を小数第1位までの表示用文字列に */
function ratioLabel(ratio: number): string {
  return (Math.round(ratio * 10) / 10).toString();
}

function sameColors(a: CustomColors, b: CustomColors): boolean {
  return a.bg === b.bg && a.text === b.text && a.accent === b.accent;
}

/**
 * カスタムテーマの編集（ネイティブ ThemeSheet.kt ThemeCustomizePage 相当）。
 * プリセット・3色の編集・コントラスト警告・既定に戻す。選ぶたびに即座に適用する
 * （ネイティブの下書き+適用ボタンとは異なり、既存の ThemeSettings が即時反映のため合わせた）。
 */
function ThemeCustomize() {
  const custom = useThemePrefs((s) => s.custom);
  const textRatio = contrastRatio(custom.bg, custom.text);
  const accentRatio = contrastRatio(custom.bg, custom.accent);
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
            aria-pressed={sameColors(preset.colors, custom)}
            onClick={() => applyCustomColors(preset.colors, preset.name)}
          >
            <ThemeSwatch colors={preset.colors} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      <ColorField label="背景" value={custom.bg} onChange={(hex) => setCustomColor("bg", hex)} />
      <ColorField label="文字" value={custom.text} onChange={(hex) => setCustomColor("text", hex)} />
      <ColorField
        label="アクセント"
        value={custom.accent}
        onChange={(hex) => setCustomColor("accent", hex)}
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
      <button type="button" className={styles.reset} onClick={resetCustomColors}>
        既定に戻す
      </button>
    </div>
  );
}

/** プリセット行の見本（背景の上に文字サンプルとアクセントの小さな四角） */
function ThemeSwatch({ colors }: { colors: CustomColors }) {
  return (
    <span className={styles.swatch} style={{ background: colors.bg }} aria-hidden="true">
      <span style={{ color: colors.text }}>Aa</span>
      <span className={styles.swatchAccent} style={{ background: colors.accent }} />
    </span>
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
