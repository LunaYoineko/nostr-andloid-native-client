import type { ChangeEvent } from "react";
import { useId, useState } from "react";
import { isDataSaver, setDataSaver } from "../../lib/imageProxy";
import { type NyanMode, setNyanMode, useNyanMode } from "../../ui/nyan";
import { type EmbedPrefs, setEmbedPref, useEmbedPrefs } from "../linkcard/embedPrefs";
import { ThemeSettings } from "../theme/ThemeSettings";
import { setDensity, useThemePrefs } from "../theme/themePrefs";
import styles from "./SettingsSections.module.css";

/**
 * 表示（ネイティブ設定 > 表示と同じ順: テーマ・種別の視覚表示・表示サイズ・文字サイズ・太字（#464。
 * ここまでは ThemeSettings）→ にゃんモード → 廃人モード（#674, Web 追加）→ 埋め込み表示 →
 * データセーバー（Web 追加、末尾のまま #587）。
 * 「デフォルトのリアクション」はネイティブと同じく独立セクション（ReactionSection）に戻した。
 */
export function DisplaySection() {
  return (
    <>
      <div className={styles.block}>
        <ThemeSettings />
      </div>
      <NyanModeBlock />
      <DensityBlock />
      <EmbedPrefsBlock />
      <DataSaverBlock />
    </>
  );
}

/**
 * [#540] にゃにゃにゃウイルス（ネイティブ SettingsScreen.kt の NyanModeSetting）。
 * 表示だけの猫化モード。localStorage のみで NIP-78 の同期には入れない。
 */
function NyanModeBlock() {
  const mode = useNyanMode((s) => s.mode);
  const choice = (value: NyanMode, label: string) => (
    <button
      type="button"
      className={styles.choice}
      aria-pressed={mode === value}
      onClick={() => setNyanMode(value)}
    >
      {label}
    </button>
  );
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>にゃにゃにゃウイルス</h3>
      <p className={styles.desc}>
        お遊びの猫化モード。アバターに猫耳が生え、本文の「な」が「にゃ」に化けます。この端末の表示だけの演出で、実際の投稿内容は変わりません。
      </p>
      <div className={styles.choices}>
        {choice("off", "オフ")}
        {choice("self", "自分のみ")}
        {choice("all", "全員")}
      </div>
    </div>
  );
}

/**
 * [#674] 廃人モード。情報量を詰め込む高密度の表示モード。localStorage のみで NIP-78 の同期には入れない
 * （settingsSync.ts のホワイトリストに追加していない）。
 */
function DensityBlock() {
  const id = useId();
  const density = useThemePrefs((s) => s.density);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>廃人モード</h3>
      <p className={styles.desc}>カラムの間隔・余白・行の高さを詰めて情報量を増やします</p>
      <label className={styles.check} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={density === "dense"}
          onChange={(e) => setDensity(e.target.checked ? "dense" : "normal")}
        />
        廃人モードを使う
      </label>
    </div>
  );
}

/** トグル 1 行分（ネイティブの EmbedSettingSwitch） */
function EmbedToggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * リンクの埋め込み表示（ネイティブ SettingsScreen.kt 1411–1431・nostr-core Embed.kt EmbedPrefs）。
 * 6 項目、既定はすべて ON。ogp が OFF の間は ogpImages を無効にする（ON にしても効かないため）。
 */
function EmbedPrefsBlock() {
  const prefs = useEmbedPrefs();
  const set =
    <K extends keyof EmbedPrefs>(key: K) =>
    (value: EmbedPrefs[K]) =>
      setEmbedPref(key, value);

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>リンクの埋め込み表示</h3>
      <p className={styles.desc}>
        本文中のリンクをカードやサムネイルで表示します。通信量が気になる場合はオフにできます。
      </p>
      <EmbedToggle label="動画（mp4 等）をインライン再生" checked={prefs.video} onChange={set("video")} />
      <EmbedToggle label="YouTube のサムネイルを表示" checked={prefs.youtube} onChange={set("youtube")} />
      <EmbedToggle label="Spotify のカードを表示" checked={prefs.spotify} onChange={set("spotify")} />
      <EmbedToggle label="その他リンクの OGP カードを表示" checked={prefs.ogp} onChange={set("ogp")} />
      <EmbedToggle
        label="OGP カードの画像を読み込む"
        checked={prefs.ogpImages}
        disabled={!prefs.ogp}
        onChange={set("ogpImages")}
      />
      <EmbedToggle
        label="カードを出したリンクのURLを本文から隠す"
        checked={prefs.hideCardedUrls}
        onChange={set("hideCardedUrls")}
      />
    </div>
  );
}

/** データセーバー（画像のプロキシを縮小・低画質にする。imageProxy の setDataSaver） */
function DataSaverBlock() {
  const id = useId();
  const [on, setOn] = useState(isDataSaver);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>データセーバー</h3>
      <p className={styles.desc}>
        オンの間は画像を小さく・低画質で読み込み、通信量を抑えます。再読み込みやブラウザのデータセーバー設定の変更で、ブラウザの設定に戻ります。
      </p>
      <label className={styles.check} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setDataSaver(e.target.checked);
            setOn(e.target.checked);
          }}
        />
        データセーバーを使う
      </label>
    </div>
  );
}
