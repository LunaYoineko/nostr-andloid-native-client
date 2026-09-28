import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { clientNameOf } from "../../lib/content/tags";
import { displayName, useProfile } from "../../nostr/loaders";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import {
  AddReactionIcon,
  BoltIcon,
  FavoriteBorderIcon,
  FavoriteIcon,
  MoreHorizIcon,
  RepeatIcon,
  StarBorderIcon,
  StarIcon,
} from "../../ui/icons";
import { MenuButton } from "../../ui/MenuButton";
import { showToast } from "../../ui/toast";
import { openCompose } from "../compose/composeStore";
import { ACTION_BUTTON_CLASS, ActionButton } from "../compose/NoteFooter";
import { useMuteMatcher } from "../mute/muteList";
import { MuteListError, muteUser, unmuteUser } from "../mute/muteSync";
import { followsFromContacts } from "../profile/contacts";
import { FollowError, toggleFollow } from "../profile/follow";
import { useZapSats } from "../zap/useZapReceipts";
import { formatSats } from "../zap/zapTotals";
import { moreMenuEntries } from "./moreMenu";
import styles from "./NoteActionButtons.module.css";
import { copyText, noteLinksOf, plainTextOf } from "./noteLinks";
import { ReactionPickerDialog } from "./ReactionPickerDialog";
import { ReportDialog } from "./ReportDialog";
import { useDefaultReaction } from "./reactionPrefs";
import {
  ensureMyReactionsSubscribed,
  publishReaction,
  publishRepost,
  reactWithDefault,
  reportNote,
  requestDelete,
  useIsReacted,
  useIsReposted,
} from "./reactions";

/** ♡ を押してから自分の kind:7 が来なければ押下を戻すまで（ネイティブと同じ 6 秒） */
export const REACTION_PENDING_MS = 6_000;

/** 発行の失敗は画面に出さない（ネイティブと同じ） */
function warn(message: string) {
  return (e: unknown) => console.warn(`[actions] ${message}`, e);
}

/**
 * 投稿のアクション行の「返信」の後ろ（NoteItem から NoteFooter の children として呼ぶ唯一の入口）:
 * リポスト → 既定リアクション（♡ / ☆）→ 絵文字 → ⚡ → 余白 → ⋯。数は Zap の合計だけ出す（他は押下状態だけ）。
 */
export function NoteActionButtons({ event }: { event: NostrEvent }) {
  const me = useSession((s) => s.pubkey);
  useEffect(() => {
    if (me) ensureMyReactionsSubscribed(me);
  }, [me]);
  return (
    <>
      <RepostButton event={event} />
      <DefaultReactionButton event={event} />
      <EmojiReactionButton event={event} />
      <ZapAction event={event} />
      <span className={styles.spacer} aria-hidden="true" />
      <MoreMenu event={event} />
    </>
  );
}

/** リポスト。押すと「リポスト」「引用リポスト」。自分がリポスト済みなら緑 */
function RepostButton({ event }: { event: NostrEvent }) {
  const reposted = useIsReposted(event.id);
  return (
    <MenuButton
      label="リポスト"
      triggerClassName={reposted ? `${ACTION_BUTTON_CLASS} ${styles.reposted}` : ACTION_BUTTON_CLASS}
      entries={[
        {
          type: "item",
          label: "リポスト",
          onSelect: () => void publishRepost(event).catch(warn("リポストに失敗")),
        },
        {
          type: "item",
          label: "引用リポスト",
          onSelect: () => openCompose({ mode: "quote", target: event }),
        },
      ]}
    >
      <RepeatIcon />
    </MenuButton>
  );
}

/**
 * 既定リアクション（ネイティブ DefaultReactionButton）。⭐ / ★ なら ☆、それ以外は ♡。
 * 押すと楽観的に押下 + 署名待ちのスピナー、自分の kind:7 が来たら確定、来なければ 6 秒で戻す。
 * 付与済みを押すと確認してから取り消す（kind:5）。
 */
function DefaultReactionButton({ event }: { event: NostrEvent }) {
  const content = useDefaultReaction((s) => s.content);
  const isStar = content === "⭐" || content === "★";
  const active = useIsReacted(event.id);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (active) setPending(false);
  }, [active]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), REACTION_PENDING_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const on = active || pending;
  const busy = pending && !active;
  const Glyph = isStar ? (on ? StarIcon : StarBorderIcon) : on ? FavoriteIcon : FavoriteBorderIcon;

  function onClick() {
    if (active) {
      setConfirming(true);
      return;
    }
    // 署名待ちの間の連打で二重に送らない
    if (pending) return;
    setPending(true);
    reactWithDefault(event).catch((e) => {
      warn("リアクションに失敗")(e);
      setPending(false);
    });
  }

  return (
    <>
      <ActionButton label="リアクション" pressed={on} busy={busy} onClick={onClick}>
        <span
          className={on ? `${styles.glyph} ${isStar ? styles.star : styles.heart}` : styles.glyph}
          data-shape={isStar ? "star" : "heart"}
        >
          {busy ? <span className={styles.spinner} aria-hidden="true" /> : <Glyph />}
        </span>
      </ActionButton>
      {confirming && (
        <ConfirmDialog
          title="リアクションを取り消しますか？"
          text="削除イベント（kind:5）を発行してリアクションを取り消します。リレーによっては削除が反映されない場合があります。"
          confirmLabel="取り消す"
          destructive
          onConfirm={() => {
            setConfirming(false);
            reactWithDefault(event).catch(warn("リアクションの取り消しに失敗"));
          }}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/** 絵文字でリアクション（ピッカーを開き、選んだものを送る） */
function EmojiReactionButton({ event }: { event: NostrEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionButton label="絵文字でリアクション" onClick={() => setOpen(true)}>
        <AddReactionIcon />
      </ActionButton>
      {open && (
        <ReactionPickerDialog
          target={event}
          onPick={(c, url) => void publishReaction(event, c, url).catch(warn("リアクションに失敗"))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * ⚡ Zap（ネイティブ ZapAction）。作者の kind:0 に lud16 があるか、受領の合計が 0 より大きいときだけ出す。
 * 合計 > 0 なら右に金額（formatSats）を --zap で、0 なら --text-3。送金（#524）が入るまでは表示だけで押せない。
 */
function ZapAction({ event }: { event: NostrEvent }) {
  const author = useProfile(event.pubkey);
  const hasLud16 = typeof author?.lud16 === "string" && author.lud16.trim() !== "";
  const sats = useZapSats(event.id);
  if (!hasLud16 && sats === 0) return null;
  const label = sats > 0 ? `Zap ${formatSats(sats)} sats` : "Zap";
  return (
    <span
      className={sats > 0 ? `${styles.zap} ${styles.zapped}` : styles.zap}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className={styles.zapIcon}>
        <BoltIcon />
      </span>
      {sats > 0 && <span className={styles.zapAmount}>{formatSats(sats)}</span>}
    </span>
  );
}

/** ミュート・解除の失敗の文言 */
function muteFailureMessage(e: unknown): string {
  if (e instanceof MuteListError && e.reason === "no-mute-list") {
    return "最新のミュートリストを取得できなかったため、変更しませんでした。接続を確認してもう一度お試しください";
  }
  if (e instanceof MuteListError && e.reason === "no-cipher") {
    return "この署名方式は暗号化に対応していないため、非公開でミュートできません（公開では追加しません）";
  }
  // ネイティブ note_mute_locked
  return "ミュートリストが変更できません（ロック中の可能性）";
}

/** ⋯ メニュー（並びは moreMenuEntries）と、そこから開く確認・通報のダイアログ */
function MoreMenu({ event }: { event: NostrEvent }) {
  const me = useSession((s) => s.pubkey);
  const author = useProfile(event.pubkey);
  const contacts = use$(() => (me ? eventStore.replaceable({ kind: 3, pubkey: me }) : undefined), [me]);
  const isMine = event.pubkey === me;
  // 自分の kind:3 が未取得の間は null（フォロー項目を出さない。空のリストで上書きしないため）
  const isFollowing = contacts ? followsFromContacts(contacts).includes(event.pubkey) : null;
  const links = useMemo(() => noteLinksOf(event), [event]);
  const isMuted = useMuteMatcher().users.has(event.pubkey);
  const [dialog, setDialog] = useState<"unfollow" | "mute" | "delete" | "report" | null>(null);

  function follow(action: "follow" | "unfollow") {
    if (!me) return;
    toggleFollow(me, event.pubkey, action).catch((e) => {
      showToast(
        e instanceof FollowError && e.reason === "no-contacts"
          ? "フォローリストを取得できませんでした。通信状態を確認してもう一度お試しください"
          : "フォローを更新できませんでした",
      );
    });
  }

  function mute(action: "mute" | "unmute") {
    if (!me) return;
    const run = action === "mute" ? muteUser(me, event.pubkey) : unmuteUser(me, event.pubkey);
    run.then(
      () => showToast(action === "mute" ? "ミュートしました" : "ミュートを解除しました"),
      (e) => showToast(muteFailureMessage(e)),
    );
  }

  const entries = moreMenuEntries({
    clientName: clientNameOf(event),
    isMine,
    isFollowing,
    isMuted,
    note1: links.note1,
    nevent: links.nevent,
    on: {
      follow: () => follow("follow"),
      unfollow: () => setDialog("unfollow"),
      requestDelete: () => setDialog("delete"),
      mute: () => setDialog("mute"),
      unmute: () => mute("unmute"),
      report: () => setDialog("report"),
      copyText: () => void copyText(plainTextOf(event)),
      copyLink: () => void copyText(links.njump),
      copyId: () => void copyText(event.id),
      copyNote1: () => void copyText(links.note1),
      copyNevent: () => void copyText(links.nevent),
    },
  });

  return (
    <>
      <MenuButton label="その他の操作" triggerClassName={ACTION_BUTTON_CLASS} entries={entries}>
        <MoreHorizIcon />
      </MenuButton>
      {dialog === "unfollow" && (
        <ConfirmDialog
          title="フォローを解除しますか？"
          text={`${displayName(author, event.pubkey)} のフォローを解除します。`}
          confirmLabel="解除する"
          destructive
          onConfirm={() => {
            setDialog(null);
            follow("unfollow");
          }}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog === "mute" && (
        <ConfirmDialog
          title="このユーザーをミュートしますか？"
          text="この人の投稿と通知を表示しなくなります。設定 → ミュート でいつでも解除できます。"
          confirmLabel="ミュート"
          destructive
          onConfirm={() => {
            setDialog(null);
            mute("mute");
          }}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title="この投稿の削除をリクエストしますか？"
          text="削除イベント(kind:5)を発行します。リレーが応じるとは限らず、すでに取得済みのクライアントでは表示が残ることがあります。この端末からは消えます。"
          confirmLabel="リクエストする"
          destructive
          onConfirm={() => {
            setDialog(null);
            void requestDelete(event).then((ok) =>
              showToast(ok ? "削除をリクエストしました" : "削除をリクエストできませんでした"),
            );
          }}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog === "report" && (
        <ReportDialog
          onPick={(type) => {
            setDialog(null);
            reportNote(event, type).catch(warn("通報に失敗"));
          }}
          onDismiss={() => setDialog(null)}
        />
      )}
    </>
  );
}
