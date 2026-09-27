import { useState } from "react";
import { FollowError, toggleFollow } from "./follow";
import styles from "./ProfileHeaderCard.module.css";

/**
 * フォロー / 解除のボタン（ネイティブ FollowButton）。フォロー中 = ゴースト「フォロー中」、未フォロー = 主ボタン「フォロー」。
 * 押すと確認なしで切り替える。反映はリレーが受け付けた後（自分の kind:3 がストアに入って following が変わる）。
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
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await toggleFollow(me, target, following ? "unfollow" : "follow");
    } catch (e) {
      onError(
        e instanceof FollowError && e.reason === "no-contacts"
          ? "フォローリストを取得できませんでした。通信状態を確認してもう一度お試しください"
          : "フォローを更新できませんでした",
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
      {following ? "フォロー中" : "フォロー"}
    </button>
  );
}
