import { Link } from "react-router";
import { hrefForProfile } from "../../lib/content/labels";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { Avatar } from "../timeline/NoteItem";
import styles from "./ConversationList.module.css";
import { resumeDecrypting } from "./dmService";
import { type DmConversation, useConversations, useDm } from "./dmStore";

/**
 * 会話の一覧（ネイティブ DmConversationRows。メッセージ画面と DM カラムで使う）。新しい順。
 * 行 = アバター（プロフィールへ）・表示名・最後のメッセージ 1 行。行を押すと onSelect。
 * showBanners なら上に復号の状態（NIP-44 が無い・一時停止・復号中）を出す。
 */
export function ConversationList({
  selectedPeer,
  onSelect,
  showBanners,
}: {
  selectedPeer: string | null;
  onSelect(peer: string): void;
  showBanners: boolean;
}) {
  const conversations = useConversations();
  const loaded = useDm((s) => s.loaded);
  return (
    <div className={styles.root}>
      {showBanners && <Banners />}
      {conversations.length === 0 ? (
        <p className={styles.empty}>{loaded ? "まだ会話がありません" : "読み込み中…"}</p>
      ) : (
        <ul className={styles.rows}>
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.peer}
              conversation={conversation}
              selected={conversation.peer === selectedPeer}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const NO_NIP44 =
  "この拡張機能は NIP-44 に対応していないため、NIP-17 の DM を読めません（NIP-04 の DM だけ表示しています）";

function Banners() {
  const nip17 = useDm((s) => s.nip17);
  const paused = useDm((s) => s.paused);
  const pending = useDm((s) => s.pending);
  return (
    <>
      {nip17 === "no-nip44" && (
        <div role="status" className={styles.banner}>
          {NO_NIP44}
        </div>
      )}
      {paused ? (
        <div role="status" className={styles.banner}>
          <span className={styles.bannerText}>
            復号を一時停止しました（署名の要求が拒否されたか、応答がありません）
          </span>
          <button type="button" className={styles.bannerButton} onClick={resumeDecrypting}>
            再開
          </button>
        </div>
      ) : (
        pending > 0 && (
          <div role="status" className={styles.banner}>
            復号中（残り {pending} 件）
          </div>
        )
      )}
    </>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: DmConversation;
  selected: boolean;
  onSelect(peer: string): void;
}) {
  const { peer, last } = conversation;
  const profile = useProfile(peer);
  const picture = pictureOf(profile);
  const name = displayName(profile, peer);
  return (
    <li className={styles.item}>
      <Link className={styles.avatarLink} to={hrefForProfile(peer)} aria-label={`${name} のプロフィール`}>
        <Avatar key={picture} url={picture} size="lg" seed={name} />
      </Link>
      <button
        type="button"
        className={styles.row}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(peer)}
      >
        <span className={styles.name}>{name}</span>
        <span className={styles.last}>{last.content}</span>
      </button>
    </li>
  );
}
