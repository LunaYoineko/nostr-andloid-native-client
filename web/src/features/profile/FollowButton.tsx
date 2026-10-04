import { useState } from "react";
import { useT } from "../../i18n";
import { FollowError, toggleFollow } from "./follow";
import styles from "./ProfileHeaderCard.module.css";

/**
 * フォロー / 解除のボタン（ネイティブ FollowButton）。フォロー中 = ゴースト「フォロー中」、未フォロー = 主ボタン「フォロー」。
 * 押すと確認なしで切り替える。反映は署名できた時点（送信キューが自分の kind:3 をストアに入れて following が変わる）。
 */
export function FollowButton({
  me,
  target,
  following,
  onError,
}: {
  me: string;
  target: string;
  following: boolean;
  onError: (message: string) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await toggleFollow(me, target, following ? "unfollow" : "follow");
    } catch (e) {
      onError(
        e instanceof FollowError && e.reason === "no-contacts"
          ? t("web_follow_no_list")
          : t("web_follow_update_failed"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.pill} ${following ? styles.ghost : styles.primary}`}
      aria-pressed={following}
      aria-busy={pending}
      disabled={pending}
      onClick={onClick}
    >
      {following ? t("tpl_following") : t("note_follow")}
    </button>
  );
}
