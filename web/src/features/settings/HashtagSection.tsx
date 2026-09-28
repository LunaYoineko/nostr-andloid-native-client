import { useSession } from "../../signer/session";
import { PINNED_MAX, usePinnedHashtags } from "../compose/storage";
import { openHashtagManager } from "../hashtags/hashtagManagerStore";
import styles from "./SettingsSections.module.css";

/**
 * ハッシュタグ（ネイティブ HashtagManageScreen への入口）。ピン留めのチップ（タップで整理画面へ。H3）と
 * 件数だけここに出し、並べ替え・追加・使用履歴は整理画面（HashtagManager）で行う。
 */
export function HashtagSection() {
  const me = useSession((s) => s.pubkey);
  const pinned = usePinnedHashtags(me);

  return (
    <div className={styles.block}>
      <p className={styles.desc}>
        ピン留めしたタグ（NIP-51
        kind:30015）は投稿画面とハッシュタグカラム作成のチップに常に表示され、端末をまたいで同期されます。使ったことのあるタグはこの端末で記憶され、#
        入力時の候補になります。
      </p>
      <p className={styles.caption}>ピン留め</p>
      {/* H3: 整理画面へのプレビュー。タップで整理画面を開く（ネイティブ TagChip と同じ） */}
      {pinned.length === 0 ? (
        <p className={styles.desc}>
          ピン留めはまだありません。下から追加するか、使ったことのあるタグをピン留めしてください。
        </p>
      ) : (
        <ul className={styles.chips} aria-label="ピン留めの一覧">
          {pinned.map((tag) => (
            <li key={tag}>
              <button type="button" className={styles.chip} onClick={() => openHashtagManager()}>
                #{tag}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.desc}>{`ピン留め ${pinned.length} / ${PINNED_MAX} 件`}</p>
      <button
        type="button"
        className={`${styles.ghost} ${styles.alignStart}`}
        onClick={() => openHashtagManager()}
      >
        ハッシュタグの整理画面を開く
      </button>
    </div>
  );
}
