import { useId, useState } from "react";
import { isDataSaver, proxied, setDataSaver } from "../../lib/imageProxy";
import { FavoriteIcon, MoodIcon, StarIcon } from "../../ui/icons";
import { ReactionPickerDialog } from "../actions/ReactionPickerDialog";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import { ThemeSettings } from "../theme/ThemeSettings";
import styles from "./SettingsSections.module.css";

/** 表示（テーマ・文字サイズ・太字（#464）、既定リアクション、データセーバー） */
export function DisplaySection() {
  return (
    <>
      <div className={styles.block}>
        <ThemeSettings />
      </div>
      <DefaultReactionBlock />
      <DataSaverBlock />
    </>
  );
}

/**
 * 既定リアクション（ネイティブ ReactionSettings）。ハート / スター / その他の絵文字（ピッカーで選ぶ）。
 * ♡ ボタンが送る内容と形が変わる（#459 の reactionPrefs）。
 */
function DefaultReactionBlock() {
  const content = useDefaultReaction((s) => s.content);
  const image = useDefaultReaction((s) => s.image);
  const [picking, setPicking] = useState(false);
  const isHeart = content === "+" || content === "❤️";
  const isStar = content === "⭐" || content === "★";
  const isOther = !isHeart && !isStar;

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>デフォルトのリアクション</h3>
      <p className={styles.desc}>
        各投稿のリアクションボタンの形を選べます。押すとこの内容で送信されます（絵文字ピッカーからは別の絵文字も付けられます）。
      </p>
      <div className={styles.choices}>
        <button
          type="button"
          className={styles.choice}
          aria-pressed={isHeart}
          onClick={() => setDefaultReaction("+", null)}
        >
          <FavoriteIcon className={styles.choiceIcon} />
          ハート
        </button>
        <button
          type="button"
          className={styles.choice}
          aria-pressed={isStar}
          onClick={() => setDefaultReaction("⭐", null)}
        >
          <StarIcon className={styles.choiceIcon} />
          スター
        </button>
        <button
          type="button"
          className={styles.choice}
          aria-pressed={isOther}
          onClick={() => setPicking(true)}
        >
          {isOther && image ? (
            <img
              className={styles.choiceEmoji}
              src={proxied(image, 64, 75, true)}
              alt={content}
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : isOther ? (
            <span aria-hidden="true">{content}</span>
          ) : (
            <MoodIcon className={styles.choiceIcon} />
          )}
          その他の絵文字
        </button>
      </div>
      {picking && (
        <ReactionPickerDialog
          onPick={(picked, imageUrl) => setDefaultReaction(picked, imageUrl)}
          onClose={() => setPicking(false)}
        />
      )}
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
