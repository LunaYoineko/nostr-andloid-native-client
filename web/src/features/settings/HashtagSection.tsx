import { useSession } from "../../signer/session";
import { PINNED_MAX, usePinnedHashtags } from "../compose/storage";
import { openHashtagManager } from "../hashtags/hashtagManagerStore";
import styles from "./SettingsSections.module.css";

/**
 * ハッシュタグ（ネイティブ HashtagManageScreen への入口）。ピン留めの件数だけここに出し、
 * 並べ替え・追加・使用履歴は整理画面（HashtagManager）で行う。
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
