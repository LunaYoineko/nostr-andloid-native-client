import { type FormEvent, useEffect, useId, useState } from "react";
import {
  DEFAULT_LOW_DIM,
  DEFAULT_MID_DIM,
  DEFAULT_QUALITY,
  DIM_MAX,
  DIM_MIN,
  QUALITY_MAX,
  QUALITY_MIN,
  resetImageCompression,
  setImageCompression,
  useImageCompression,
} from "../compose/imageCompression";
import {
  DEFAULT_MEDIA_SERVERS,
  MEDIA_PRESETS,
  parseServerInput,
  setMediaServer,
  uploadServers,
  useMediaServer,
} from "../compose/mediaServer";
import styles from "./SettingsSections.module.css";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * メディアサーバー（ネイティブ MediaSettings の「アップロード先サーバー」+ 「アップロード時の圧縮」）。
 * 候補から選ぶか URL を入力して 1 つ選ぶ。選ばない間は既定の一覧を順に試す（ネイティブの初期状態と同じ）。
 */
export function MediaSection() {
  const server = useMediaServer((s) => s.server);
  const current = uploadServers(server)[0];
  const choices = [...new Set([...DEFAULT_MEDIA_SERVERS, ...MEDIA_PRESETS, ...(server ? [server] : [])])];
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = parseServerInput(value);
    if (!url) {
      setError("https:// で始まるサーバーの URL を入力してください");
      return;
    }
    setMediaServer(url);
    setValue("");
    setError(null);
  }

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>画像アップロード先（NIP-96 / 認証は NIP-98）</h3>
        <p className={styles.desc}>
          投稿に画像・動画を添付すると、選択中のサーバへアップロードします。
          {server === null &&
            `未選択の間は ${DEFAULT_MEDIA_SERVERS.map(hostOf).join(" → ")} の順に試します。`}
        </p>
        <div className={styles.choices}>
          {choices.map((url) => (
            <button
              key={url}
              type="button"
              className={styles.choice}
              aria-pressed={url === current}
              onClick={() => setMediaServer(url)}
            >
              {hostOf(url)}
            </button>
          ))}
        </div>
        <form className={styles.row} onSubmit={submit}>
          <label htmlFor={inputId} className="srOnly">
            アップロード先サーバーの URL
          </label>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://…"
            value={value}
            aria-invalid={error !== null}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className={styles.ghost} disabled={value.trim() === ""}>
            選択
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
        {server !== null && (
          <button
            type="button"
            className={`${styles.ghost} ${styles.alignStart}`}
            onClick={() => setMediaServer(null)}
          >
            既定に戻す
          </button>
        )}
      </div>
      <ImageCompressionBlock />
    </>
  );
}

/**
 * [#533] 画像アップロード時の圧縮（ネイティブ MediaCompressionSheet / ImageCompressionBlock）。
 * 「低 / 中」の長辺（px）と再エンコード品質（%）。「高」は縮小しないが、EXIF を消すため同じ品質で
 * 再エンコードする（プラポリ 4.4。ネイティブは「高」= 無加工だが Web はこちらを優先）。
 */
function ImageCompressionBlock() {
  const prefs = useImageCompression((s) => s.prefs);
  const [low, setLow] = useState(String(prefs.lowMaxDim));
  const [mid, setMid] = useState(String(prefs.midMaxDim));
  const [quality, setQuality] = useState(String(prefs.quality));

  // 他所（既定に戻す等）で値が変わったら入力欄も合わせる。保存時に丸めた値もここで反映する
  useEffect(() => {
    setLow(String(prefs.lowMaxDim));
    setMid(String(prefs.midMaxDim));
    setQuality(String(prefs.quality));
  }, [prefs]);

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>画像アップロードの圧縮</h3>
      <p className={styles.desc}>
        投稿画像は「低 / 中」選択時に下の長辺（px）へリサイズして再エンコードします（WebP。書けなければ
        JPEG）。「高」は縮小しませんが、位置情報などの EXIF を取り除くため同じ品質で再エンコードします。
        既定値: 低 = {DEFAULT_LOW_DIM}px・中 = {DEFAULT_MID_DIM}px・品質 ={` ${DEFAULT_QUALITY}%`}（範囲: 長辺{" "}
        {DIM_MIN}〜{DIM_MAX} / 品質 {QUALITY_MIN}〜{QUALITY_MAX}）。
      </p>
      <div className={styles.row}>
        <label className={styles.field}>
          「低」の長辺（px）
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={DIM_MIN}
            max={DIM_MAX}
            value={low}
            onChange={(e) => setLow(e.target.value)}
            onBlur={() => setImageCompression({ lowMaxDim: Number(low) || DEFAULT_LOW_DIM })}
          />
        </label>
        <label className={styles.field}>
          「中」の長辺（px）
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={DIM_MIN}
            max={DIM_MAX}
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            onBlur={() => setImageCompression({ midMaxDim: Number(mid) || DEFAULT_MID_DIM })}
          />
        </label>
        <label className={styles.field}>
          再エンコード品質（%）
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={QUALITY_MIN}
            max={QUALITY_MAX}
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            onBlur={() => setImageCompression({ quality: Number(quality) || DEFAULT_QUALITY })}
          />
        </label>
      </div>
      <button
        type="button"
        className={`${styles.ghost} ${styles.alignStart}`}
        aria-label="画像アップロードの圧縮を既定に戻す"
        onClick={() => resetImageCompression()}
      >
        既定に戻す
      </button>
    </div>
  );
}
