import { npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { oneLine } from "../../lib/content/labels";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { PublishError, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { CloseIcon, ReplyIcon, VisibilityOffIcon } from "../../ui/icons";
import { EmojiInsertButton } from "../actions/EmojiInsertButton";
import { NoteContent } from "../timeline/NoteContent";
import { Avatar } from "../timeline/NoteItem";
import { buildNote, buildQuote, buildReply, type PostContext } from "./buildPost";
import styles from "./ComposeDialog.module.css";
import {
  activeEmoji,
  activeMention,
  activeTagPrefix,
  appendHashtag,
  completeHashtag,
  completeMention,
  insertAtCursor,
  insertEmojiShortcode,
  type TextState,
} from "./completion";
import { type ComposeRequest, closeCompose } from "./composeStore";
import { type CustomEmoji, useCustomEmojis } from "./customEmojis";
import { ProfileAvatar } from "./ProfileAvatar";
import { storeRelayHints } from "./relayHints";
import { type ProfileHit, searchProfiles } from "./searchProfiles";
import {
  clearDraft,
  loadDraft,
  loadUsedHashtags,
  recentHashtagChips,
  recordHashtags,
  saveDraft,
  tagSuggestions,
  usePinnedHashtags,
} from "./storage";

const DIALOG_LABELS = { new: "投稿", reply: "返信", quote: "引用" } as const;
const SEND_LABELS = { new: "送信", reply: "返信", quote: "引用" } as const;
const SEND_FAILED = "投稿に失敗しました。添付はそのままなので、もう一度お試しください。";
/** 連続入力中はメンションを探さない（ネイティブと同じ 120ms） */
const MENTION_DELAY_MS = 120;
/** 絵文字候補の件数（ネイティブと同じ） */
const EMOJI_SUGGEST_MAX = 12;

/** 候補のボタンを押しても本文のフォーカス（= ソフトキーボード）を外さない */
function keepFocus(e: MouseEvent) {
  e.preventDefault();
}

/**
 * 投稿シート（ネイティブ ComposeSheet.kt の M1 版: 添付・連投・ピン留め編集なし）。
 * 画面上端寄せのカードをモーダルで開く。本文・入力補完・返信先 / 引用元・センシティブ指定・送信。
 */
export function ComposeDialog({ request }: { request: ComposeRequest }) {
  const { mode } = request;
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState<TextState>(() => {
    const draft = mode === "new" ? loadDraft() : "";
    const text = draft.trim() === "" ? "" : draft;
    return { text, cursor: text.length };
  });
  const [sensitive, setSensitive] = useState(false);
  const [cwReason, setCwReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mentionHits, setMentionHits] = useState<ProfileHit[]>([]);
  const me = useSession((s) => s.pubkey);
  const profile = useProfile(me ?? undefined);
  const emojis = useCustomEmojis(me);
  const pinned = usePinnedHashtags(me);
  const [used] = useState(loadUsedHashtags);
  const controller = useRef<AbortController | null>(null);
  // コードで本文を変えたら、描画後にカーソルを合わせて本文へフォーカスを戻す
  const moveCursor = useRef(false);

  /** 本文を変える（新規投稿は入力のたびに下書きへ保存） */
  function update(next: TextState, fromCode: boolean) {
    if (next === value) return;
    if (fromCode) moveCursor.current = true;
    setValue(next);
    if (mode === "new") saveDraft(next.text);
  }

  /** 閉じる操作の入口（✗・背景・Esc / 戻る）。書きかけなら確認を挟む。送信中は閉じない */
  function attemptClose() {
    if (sending) return;
    if (value.text.trim() !== "") setConfirmDiscard(true);
    else closeCompose();
  }
  const latestAttemptClose = useRef(attemptClose);
  useLayoutEffect(() => {
    latestAttemptClose.current = attemptClose;
  });

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    const el = textarea.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  // カードの外（dialog 自身 = 背景）の押下
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClick = (e: globalThis.MouseEvent) => {
      if (e.target === d) latestAttemptClose.current();
    };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);

  // ソフトキーボードが出たら見えている高さにカードを収める
  useEffect(() => {
    const vv = window.visualViewport;
    const d = dialog.current;
    if (!vv || !d) return;
    const apply = () => d.style.setProperty("--compose-vvh", `${vv.height}px`);
    apply();
    vv.addEventListener("resize", apply);
    return () => vv.removeEventListener("resize", apply);
  }, []);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    if (moveCursor.current) {
      moveCursor.current = false;
      el.focus();
      el.setSelectionRange(value.cursor, value.cursor);
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // ---- 入力補完（カーソル直前のトークン。絵文字 > メンション > ハッシュタグの 1 種だけ出す） ----
  const before = value.text.slice(0, value.cursor);
  const emojiFrag = activeEmoji(before);
  const emojiHits = useMemo(() => {
    if (emojiFrag === null) return [];
    const frag = emojiFrag.toLowerCase();
    return emojis.filter((e) => e.shortcode.toLowerCase().startsWith(frag)).slice(0, EMOJI_SUGGEST_MAX);
  }, [emojis, emojiFrag]);
  const mentionFrag = activeMention(before);
  useEffect(() => {
    if (mentionFrag === null) {
      setMentionHits([]);
      return;
    }
    const timer = setTimeout(() => setMentionHits(searchProfiles(mentionFrag)), MENTION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mentionFrag]);
  const tagPrefix = activeTagPrefix(before);
  const suggestions = tagPrefix === null ? [] : tagSuggestions(tagPrefix, pinned, used);
  const recent = recentHashtagChips(used, pinned);

  /** ピン留め・最近のタグ: 入力中の #断片 に前方一致なら補完、でなければカーソル位置に足す */
  function insertTag(tag: string) {
    update(
      tagPrefix !== null && tag.startsWith(tagPrefix)
        ? completeHashtag(value, tag)
        : appendHashtag(value, tag),
      true,
    );
  }

  // ---- 送信 ----
  const canSend = !sending && (value.text.trim() !== "" || mode === "quote");

  async function send() {
    if (!canSend) return;
    if (me === null) {
      setSendError(SEND_FAILED);
      return;
    }
    const content = value.text.trim() === "" ? "" : value.text.trimEnd();
    const cw = sensitive ? cwReason.trim() : null;
    const ctx: PostContext = {
      me,
      emojis: new Map(emojis.map((e) => [e.shortcode, e.url])),
      hints: storeRelayHints(me),
      lookup: (id) => eventStore.getEvent(id),
    };
    const draft =
      request.mode === "reply"
        ? buildReply(request.target, content, cw, ctx)
        : request.mode === "quote"
          ? buildQuote(request.target, content, cw, ctx)
          : buildNote(content, cw, ctx);
    const ac = new AbortController();
    controller.current = ac;
    setSending(true);
    setSendError(null);
    try {
      const signed = await publishEvent(draft, { signal: ac.signal });
      // ネイティブと同じく、返信・引用の送信でも新規投稿の下書きを消す
      clearDraft();
      recordHashtags(content, signed.created_at);
      closeCompose();
    } catch (e) {
      // キャンセル済み（もう編集に戻っている）
      if (ac.signal.aborted || (e instanceof PublishError && e.reason === "aborted")) return;
      setSendError(SEND_FAILED);
      setSending(false);
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }

  /** 送信中の「キャンセル」: 署名待ちを打ち切って編集に戻る */
  function cancelSend() {
    controller.current?.abort();
    controller.current = null;
    setSending(false);
  }

  return (
    <>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={DIALOG_LABELS[mode]}
        onCancel={(e) => {
          e.preventDefault();
          attemptClose();
        }}
        // ブラウザが強制で閉じた場合（下書きは入力のたびに保存済み）
        onClose={() => closeCompose()}
      >
        <div className={styles.card}>
          <div className={styles.head}>
            {me !== null && <ProfileAvatar pubkey={me} size={22} />}
            <span className={styles.name}>{me !== null ? displayName(profile, me, "npub") : "あなた"}</span>
            <button
              type="button"
              className={styles.close}
              aria-label="閉じる"
              disabled={sending}
              onClick={attemptClose}
            >
              <CloseIcon className={styles.closeIcon} />
            </button>
          </div>
          <div className={styles.scroll}>
            <textarea
              ref={textarea}
              className={styles.body}
              aria-label="本文"
              placeholder="いまどうしてる？"
              value={value.text}
              onChange={(e) => {
                const el = e.currentTarget;
                update({ text: el.value, cursor: el.selectionStart ?? el.value.length }, false);
              }}
              onSelect={(e) => {
                const cursor = e.currentTarget.selectionStart;
                setValue((v) => (v.cursor === cursor ? v : { ...v, cursor }));
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (canSend) void send();
                }
              }}
            />
            {emojiHits.length > 0 ? (
              <>
                <p className={styles.hint}>絵文字候補</p>
                <div className={styles.chips}>
                  {emojiHits.map((emoji) => (
                    <EmojiChip
                      key={emoji.shortcode}
                      emoji={emoji}
                      onClick={() => update(insertEmojiShortcode(value, emoji.shortcode), true)}
                    />
                  ))}
                </div>
              </>
            ) : mentionHits.length > 0 ? (
              <>
                <p className={styles.hint}>メンション候補</p>
                <div className={styles.mentions}>
                  {mentionHits.map((hit) => (
                    <button
                      key={hit.pubkey}
                      type="button"
                      className={styles.mention}
                      onMouseDown={keepFocus}
                      onClick={() => update(completeMention(value, npubEncode(hit.pubkey)), true)}
                    >
                      <ProfileAvatar pubkey={hit.pubkey} size={28} />
                      <span className={styles.mentionText}>
                        <span className={styles.mentionName}>{hit.name || hit.handle}</span>
                        {hit.handle !== "" && <span className={styles.mentionHandle}>{hit.handle}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {suggestions.length > 0 && (
                  <>
                    <p className={styles.hint}>候補</p>
                    <div className={styles.chips}>
                      {suggestions.map((tag) => (
                        <TagChip
                          key={tag}
                          tag={tag}
                          onClick={() => update(completeHashtag(value, tag), true)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {pinned.length > 0 && (
                  <>
                    <p className={styles.hint}>📌 ピン留め</p>
                    <div className={styles.chips}>
                      {pinned.map((tag) => (
                        <TagChip key={tag} tag={tag} onClick={() => insertTag(tag)} />
                      ))}
                    </div>
                  </>
                )}
                {recent.length > 0 && (
                  <>
                    <p className={styles.hint}>最近のタグ</p>
                    <div className={styles.chips}>
                      {recent.map((tag) => (
                        <TagChip key={tag} tag={tag} onClick={() => insertTag(tag)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          {request.mode !== "new" && (
            <div className={styles.context}>
              {request.mode === "reply" ? (
                <ReplyTargetLine target={request.target} />
              ) : (
                <QuoteContextCard target={request.target} />
              )}
            </div>
          )}
          {sendError !== null && (
            <p role="alert" className={styles.error}>
              {sendError}
            </p>
          )}
          {sensitive && !sending && (
            <div className={styles.reason}>
              <input
                type="text"
                className={styles.reasonInput}
                aria-label="センシティブの理由"
                placeholder="理由（任意）"
                value={cwReason}
                onChange={(e) => setCwReason(e.currentTarget.value)}
              />
            </div>
          )}
          <div className={styles.bar}>
            {sending ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span className={styles.sendingText}>投稿中…</span>
                <span className={styles.spacer} />
                <button type="button" className={styles.cancel} onClick={cancelSend}>
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <div className={styles.tools}>
                  <EmojiInsertButton onInsert={(str) => update(insertAtCursor(value, str), true)} />
                  <button
                    type="button"
                    className={styles.tool}
                    aria-pressed={sensitive}
                    aria-label={sensitive ? "センシティブ: ON" : "センシティブ指定"}
                    onClick={() => setSensitive((v) => !v)}
                  >
                    <VisibilityOffIcon className={styles.toolIcon} />
                  </button>
                </div>
                <button type="button" className={styles.send} disabled={!canSend} onClick={() => void send()}>
                  {SEND_LABELS[mode]}
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
      {confirmDiscard && (
        <ConfirmDialog
          title="入力内容を破棄しますか？"
          text="作成中の本文と添付画像は保存されません。"
          confirmLabel="破棄する"
          destructive
          onConfirm={() => {
            // 返信・引用の破棄では新規投稿の下書きを消さない（ネイティブの onDispose と同じ）
            if (mode === "new") clearDraft();
            closeCompose();
          }}
          onDismiss={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

function TagChip({ tag, onClick }: { tag: string; onClick(): void }) {
  return (
    <button type="button" className={styles.chip} onMouseDown={keepFocus} onClick={onClick}>
      #{tag}
    </button>
  );
}

/** 絵文字候補のチップ（画像 + :code:）。プロキシが読めなければ元 URL で 1 度だけ取り直す */
function EmojiChip({ emoji, onClick }: { emoji: CustomEmoji; onClick(): void }) {
  const [src, setSrc] = useState<string | null>(() => proxied(emoji.url, 64, 80, true));

  function onError() {
    const origin = originOf(src);
    if (origin) {
      markProxyBlocked(origin);
      setSrc(origin);
    } else {
      setSrc(null);
    }
  }

  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={`:${emoji.shortcode}:`}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {src !== null && (
        <img
          className={styles.emoji}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onError}
        />
      )}
      :{emoji.shortcode}:
    </button>
  );
}

/** 返信先の 1 行「◁ (アバター) 名前: 本文…」 */
function ReplyTargetLine({ target }: { target: NostrEvent }) {
  const profile = useProfile(target.pubkey);
  const picture = pictureOf(profile);
  return (
    <p className={styles.replyLine}>
      <ReplyIcon className={styles.replyIcon} />
      <Avatar key={picture} url={picture} size="sm" seed={target.pubkey} />
      <span
        className={styles.replyText}
      >{`${displayName(profile, target.pubkey, "npub")}: ${oneLine(target.content)}`}</span>
    </p>
  );
}

/** 引用元のカード（見出し・作者・本文 2 行） */
function QuoteContextCard({ target }: { target: NostrEvent }) {
  const profile = useProfile(target.pubkey);
  return (
    <div className={styles.quote}>
      <p className={styles.quoteLabel}>引用元</p>
      <div className={styles.quoteAuthor}>
        <ProfileAvatar pubkey={target.pubkey} size={28} />
        <span className={styles.quoteName}>{displayName(profile, target.pubkey, "npub")}</span>
      </div>
      <div className={styles.quoteBody}>
        <NoteContent event={target} variant="quote" />
      </div>
    </div>
  );
}
