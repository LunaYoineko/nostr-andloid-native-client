import { npubEncode } from "nostr-tools/nip19";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { parseProfileRef } from "../../app/overlays/refs";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { useLayoutMode } from "../../ui/useLayoutMode";
import { ConversationList } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { startDecrypting } from "./dmService";
import styles from "./MessagesScreen.module.css";

/** 一覧から開いた会話の履歴エントリの印（Compact の「←」で戻れるか） */
const FROM_LIST = "dmFromList";

function openedFromList(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && (state as Record<string, unknown>)[FROM_LIST] === true
  );
}

/**
 * メッセージ（ネイティブ DmScreen + TwoPane）。URL は /messages/:peer?（npub。hex も受ける）。
 * Expanded = 左に会話の一覧・右に会話（未選択は「会話を選択」）、Compact = 一覧 → 会話（「←」で一覧へ）。
 * 表示したら DM の復号を始める（NIP-07 / NIP-46 はここまで署名者を呼ばない）。
 */
export function MessagesScreen() {
  const mode = useLayoutMode();
  const { peer: param } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // undefined = 未選択、null = 読めない
  const peer = useMemo(
    () => (param === undefined ? undefined : (parseProfileRef(param)?.pubkey ?? null)),
    [param],
  );

  useEffect(() => {
    startDecrypting();
  }, []);

  // Compact は戻る対象にする（一覧 → 会話）、Expanded は会話の切り替えなので置き換える
  function select(pubkey: string) {
    if (pubkey === peer) return;
    const path = `/messages/${npubEncode(pubkey)}`;
    if (mode === "compact") void navigate(path, { state: { [FROM_LIST]: true } });
    else void navigate(path, { replace: true });
  }

  function back() {
    if (openedFromList(location.state)) void navigate(-1);
    else void navigate("/messages", { replace: true });
  }

  if (mode === "compact") {
    return (
      <div className={styles.single}>
        {peer === undefined ? (
          <ListPane selectedPeer={null} onSelect={select} />
        ) : (
          <ConversationPane peer={peer} onBack={back} />
        )}
      </div>
    );
  }
  return (
    <div className={styles.twoPane}>
      <div className={styles.listPane}>
        <ListPane selectedPeer={peer ?? null} onSelect={select} />
      </div>
      <div className={styles.detailPane}>
        {peer === undefined ? (
          <p className={styles.placeholder}>会話を選択</p>
        ) : (
          <ConversationPane peer={peer} />
        )}
      </div>
    </div>
  );
}

function ListPane({ selectedPeer, onSelect }: { selectedPeer: string | null; onSelect(peer: string): void }) {
  return (
    <div className={styles.list}>
      <ScreenHeader title="メッセージ" />
      <div className={styles.listBody}>
        <ConversationList selectedPeer={selectedPeer} onSelect={onSelect} showBanners />
      </div>
    </div>
  );
}

/** 会話。相手が読めなければその旨（Compact は「←」つき） */
function ConversationPane({ peer, onBack }: { peer: string | null; onBack?: () => void }) {
  if (peer === null) {
    return (
      <div className={styles.invalid}>
        {onBack && <ScreenHeader title="メッセージ" onBack={onBack} />}
        <p className={styles.placeholder}>相手を読み取れません</p>
      </div>
    );
  }
  // 相手が替わったら表示件数を戻す
  return <ConversationView key={peer} peer={peer} onBack={onBack} />;
}
