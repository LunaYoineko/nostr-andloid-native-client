import { npubEncode } from "nostr-tools/nip19";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { parseProfileRef } from "../../app/overlays/refs";
import { badgeText } from "../../ui/badge";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { type LayoutMode, useLayoutMode } from "../../ui/useLayoutMode";
import { ChannelList } from "../chat/ChannelList";
import { ChannelRoom, RoomHeader } from "../chat/ChannelRoom";
import { type Channel, ensureChannels, useChannel, useChannels } from "../chat/channels";
import { channelHref } from "../chat/chatMessage";
import { pinRoom, usePinnedRoomIds } from "../chat/pin";
import { type MessagesSegment, SEGMENT_PATH, saveSegment } from "../chat/segment";
import { ConversationList } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { startDecrypting } from "./dmService";
import { useDmUnreadTotal } from "./dmStore";
import styles from "./MessagesScreen.module.css";

/** 一覧から開いた会話の履歴エントリの印（Compact の「←」で戻れるか） */
const FROM_LIST = "dmFromList";

function openedFromList(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && (state as Record<string, unknown>)[FROM_LIST] === true
  );
}

/**
 * メッセージ（ネイティブ DmScreen / PublicChatScreen + TwoPane）。一覧の上に「DM | チャット」の切り替え（#422）。
 * segment = dm: URL は /messages/:peer?（npub。hex も受ける）、chat: /channels/:id?（チャンネルの id）。
 * Expanded = 左に一覧・右に会話 / ルーム（未選択は「会話を選択」「チャンネルを選択」）、Compact = 一覧 → 会話 / ルーム
 * （「←」で一覧へ）。表示したら DM の復号を始める（NIP-07 / NIP-46 はここまで署名者を呼ばない。DM 側の未読数にも使う）。
 */
export function MessagesScreen({ segment = "dm" }: { segment?: MessagesSegment }) {
  const mode = useLayoutMode();
  useEffect(() => {
    startDecrypting();
  }, []);
  return segment === "chat" ? <ChannelsPanes mode={mode} /> : <DmPanes mode={mode} />;
}

function DmPanes({ mode }: { mode: LayoutMode }) {
  const { peer: param } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // undefined = 未選択、null = 読めない
  const peer = useMemo(
    () => (param === undefined ? undefined : (parseProfileRef(param)?.pubkey ?? null)),
    [param],
  );

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
      <SegmentBar current="dm" />
      <div className={styles.listBody}>
        <ConversationList selectedPeer={selectedPeer} onSelect={onSelect} showBanners showNewRow />
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

/**
 * 「DM | チャット」（ネイティブ MessagesSegmentBar）。幅いっぱいの 2 分割、DM 側にだけ未読数。
 * 押すと最後に使った側として覚え、その側の一覧へ置き換える（宛先の切替は戻る対象にしない）。
 */
function SegmentBar({ current }: { current: MessagesSegment }) {
  const navigate = useNavigate();
  const unread = useDmUnreadTotal();

  function select(segment: MessagesSegment) {
    saveSegment(segment);
    if (segment !== current) void navigate(SEGMENT_PATH[segment], { replace: true });
  }

  return (
    <div className={styles.segmentBar}>
      <div className={styles.segments} role="tablist" aria-label="メッセージの種類">
        <button
          type="button"
          role="tab"
          className={styles.segment}
          aria-selected={current === "dm"}
          aria-label={unread > 0 ? `DM（未読 ${unread} 件）` : undefined}
          onClick={() => select("dm")}
        >
          DM
          {unread > 0 && (
            <span className={styles.segmentBadge} aria-hidden="true">
              {badgeText(unread)}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          className={styles.segment}
          aria-selected={current === "chat"}
          onClick={() => select("chat")}
        >
          チャット
        </button>
      </div>
    </div>
  );
}

const HEX64 = /^[0-9a-f]{64}$/i;

/** URL のチャンネル id（64 桁の hex）。読めなければ null */
function parseChannelId(param: string): string | null {
  return HEX64.test(param) ? param.toLowerCase() : null;
}

/** パブリックチャット（ネイティブ PublicChatScreen）。一覧 → ルーム。「ピン留め」でデッキの固定カラムへ */
function ChannelsPanes({ mode }: { mode: LayoutMode }) {
  const { id: param } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // undefined = 未選択、null = 読めない
  const channelId = param === undefined ? undefined : parseChannelId(param);
  const pinnedIds = usePinnedRoomIds();

  function select(channel: Channel) {
    if (channel.id === channelId) return;
    const path = channelHref(channel.id);
    if (mode === "compact") void navigate(path, { state: { [FROM_LIST]: true } });
    else void navigate(path, { replace: true });
  }

  function back() {
    if (openedFromList(location.state)) void navigate(-1);
    else void navigate(SEGMENT_PATH.chat, { replace: true });
  }

  const list = (
    <div className={styles.list}>
      <ScreenHeader title="メッセージ" />
      <SegmentBar current="chat" />
      <div className={styles.listBody}>
        <ChannelList selectedId={channelId ?? null} pinnedIds={pinnedIds} onSelect={select} onPin={pinRoom} />
      </div>
    </div>
  );

  if (mode === "compact") {
    return (
      <div className={styles.single}>
        {channelId === undefined ? list : <RoomPane channelId={channelId} onBack={back} />}
      </div>
    );
  }
  return (
    <div className={styles.twoPane}>
      <div className={styles.listPane}>{list}</div>
      <div className={styles.detailPane}>
        {channelId === undefined ? (
          <p className={styles.placeholder}>チャンネルを選択</p>
        ) : (
          <RoomPane channelId={channelId} />
        )}
      </div>
    </div>
  );
}

/**
 * ルーム。一覧を取っている間は「チャンネルを読み込み中…」。一覧に無いチャンネルでも（取れた・失敗した後は）ルームを開く
 * （名前は「パブリックチャット」）。
 */
function RoomPane({ channelId, onBack }: { channelId: string | null; onBack?: () => void }) {
  const channel = useChannel(channelId);
  const listLoading = useChannels((s) => s.channels === null && !s.failed);
  useEffect(() => {
    ensureChannels();
  }, []);

  if (channelId === null || (!channel && listLoading)) {
    return (
      <div className={styles.invalid}>
        {onBack && <ScreenHeader title="メッセージ" onBack={onBack} />}
        <p className={styles.placeholder}>
          {channelId === null ? "チャンネルを読み取れません" : "チャンネルを読み込み中…"}
        </p>
      </div>
    );
  }
  const title = channel?.name || "パブリックチャット";
  const about = channel?.about ?? "";
  return (
    <ChannelRoom
      key={channelId}
      channelId={channelId}
      title={title}
      mode="screen"
      header={
        <RoomHeader
          title={title}
          subtitle={about.trim() === "" ? "NIP-28 · kind:42" : about}
          picture={channel?.picture ?? null}
          onBack={onBack}
        />
      }
    />
  );
}
