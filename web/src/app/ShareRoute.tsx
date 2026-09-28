import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { openCompose } from "../features/compose/composeStore";
import { loadDraft, saveDraft } from "../features/compose/storage";

/**
 * /share（PWA の Share Target。#541）。title・text・url を改行でつないだもの（空は省く）を新規投稿の
 * 下書きに入れ、投稿シートを開く。書きかけの下書きがあれば消さずに、空行を挟んで後ろへ足す。自動送信はしない。URL は / に置き換えて履歴に残さない
 * （HashtagRoute と同じ形。未ログインなら RequireSession の /login?next= で戻ってから開く）。
 */
export function ShareRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const text = [params.get("title"), params.get("text"), params.get("url")]
      .map((v) => v?.trim())
      .filter((v): v is string => !!v)
      .join("\n");
    if (text !== "") {
      const draft = loadDraft();
      saveDraft(draft.trim() === "" ? text : `${draft}\n\n${text}`);
    }
    openCompose({ mode: "new" });
    void navigate("/", { replace: true });
  }, [params, navigate]);

  return null;
}
