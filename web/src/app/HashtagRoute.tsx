import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useDeck } from "../store/deck";
import { DECK_TRANSIENT } from "./history";

/**
 * /t/:tag。ハッシュタグの一時カラムを開き（同じタグのカラムがあればそこへ jump）、URL は / に置き換えて
 * 履歴に一時カラムの印を残す（戻る = そのカラムを閉じる）。何も描かない。
 * StrictMode の二重実行でも openHashtag は既存へ jump するだけなので重複しない。
 */
export function HashtagRoute() {
  const { tag } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const id = tag ? useDeck.getState().openHashtag(tag) : null;
    void navigate("/", { replace: true, state: id ? { [DECK_TRANSIENT]: id } : null });
  }, [tag, navigate]);

  return null;
}
