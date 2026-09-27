import { useId } from "react";
import styles from "./ThemeSettings.module.css";
import {
  setBoldText,
  setTextScale,
  setThemeMode,
  type TextScale,
  type ThemeMode,
  useThemePrefs,
} from "./themePrefs";

type Option<T extends string> = { value: T; label: string };

/** ネイティブ theme_system / theme_light / theme_dark */
const MODE_OPTIONS: readonly Option<ThemeMode>[] = [
  { value: "system", label: "OSに合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

/** ネイティブ text_scale_small / medium / large */
const TEXT_SCALE_OPTIONS: readonly Option<TextScale>[] = [
  { value: "s", label: "小" },
  { value: "m", label: "中" },
  { value: "l", label: "大" },
];

/**
 * テーマ・文字サイズ・太字（ネイティブの 設定 > 表示 の同名項目）。選ぶとすぐ保存して反映する。
 * 設定画面（#463）の「表示」セクションに置く。カスタム 3 色・ノート種別の強調は #464 の残り。
 */
export function ThemeSettings() {
  const mode = useThemePrefs((s) => s.mode);
  const textScale = useThemePrefs((s) => s.textScale);
  const bold = useThemePrefs((s) => s.bold);
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
    </div>
  );
}

/** 排他選択のチップ（ネイティブ ChoiceChip）。中身はラジオ */
function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.caption}>{legend}</legend>
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
