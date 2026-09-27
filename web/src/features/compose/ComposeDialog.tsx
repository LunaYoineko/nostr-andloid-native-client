import { npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import {
  type DragEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { oneLine } from "../../lib/content/labels";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { PublishError, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { currentSigner, useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { CloseIcon, ImageIcon, PlayArrowIcon, ReplyIcon, VisibilityOffIcon } from "../../ui/icons";
import { EmojiInsertButton } from "../actions/EmojiInsertButton";
import { NoteContent } from "../timeline/NoteContent";
import { Avatar } from "../timeline/NoteItem";
import { type Attachment, createAttachment, humanSize, uploadAttachments } from "./attachments";
import { buildNote, buildQuote, buildReply, type PostContext, type PostMedia } from "./buildPost";
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
import { uploadServers, useMediaServer } from "./mediaServer";
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

/** 添付を選ぶ input の accept（スマホではカメラ / ギャラリーが開く） */
const ATTACH_ACCEPT = "image/*,video/*";

/** ドラッグ中のものにファイルが含まれるか */
function hasFiles(e: DragEvent<HTMLElement>): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * 投稿シート（ネイティブ ComposeSheet.kt の Web 版: 連投・ピン留め編集・添付の解像度の選択なし）。
 * 画面上端寄せのカードをモーダルで開く。本文・入力補完・添付（画像・動画）・返信先 / 引用元・センシティブ指定・送信。
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
  // 添付（選んだ時点で圧縮を始め、アップロードは送信時。ネイティブ ComposeSheet と同じ）
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** 圧縮が終わった添付のバイト数（添付の id → バイト数） */
  const [processedSizes, setProcessedSizes] = useState<ReadonlyMap<string, number>>(() => new Map());
  /** アップロードの完了数（失敗も数える） */
  const [uploadDone, setUploadDone] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaServer = useMediaServer((s) => s.server);
  /** まだ revoke していないプレビューの blob: URL（閉じたときにまとめて revoke する） */
  const previews = useRef(new Set<string>());

  /** 本文を変える（新規投稿は入力のたびに下書きへ保存） */
  function update(next: TextState, fromCode: boolean) {
    if (next === value) return;
    if (fromCode) moveCursor.current = true;
    setValue(next);
    if (mode === "new") saveDraft(next.text);
  }

  /** 閉じる操作の入口（✗・背景・Esc / 戻る）。書きかけ・添付ありなら確認を挟む。送信中は閉じない */
  function attemptClose() {
    if (sending) return;
    if (value.text.trim() !== "" || attachments.length > 0) setConfirmDiscard(true);
    else closeCompose();
  }
  const latestAttemptClose = useRef(attemptClose);
  useLayoutEffect(() => {
    latestAttemptClose.current = attemptClose;
  });

  /** 画像・動画を添付に足して圧縮を始める（それ以外のファイルは無視）。1 件でも足したら true */
  function addFiles(files: Iterable<File>): boolean {
    if (sending) return false;
    const added: Attachment[] = [];
    for (const file of files) {
      const attachment = createAttachment(file);
      if (attachment) added.push(attachment);
    }
    if (added.length === 0) return false;
    for (const attachment of added) {
      previews.current.add(attachment.preview);
      void attachment.processed.then((p) =>
        setProcessedSizes((sizes) => new Map(sizes).set(attachment.id, p.blob.size)),
      );
    }
    setAttachments((list) => [...list, ...added]);
    return true;
  }

  function removeAttachment(target: Attachment) {
    URL.revokeObjectURL(target.preview);
    previews.current.delete(target.preview);
    setAttachments((list) => list.filter((a) => a.id !== target.id));
  }

  // 閉じたらプレビューの blob: URL を解放する
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

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
  const canSend = !sending && (value.text.trim() !== "" || attachments.length > 0 || mode === "quote");

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
    const list = attachments;
    const ac = new AbortController();
    controller.current = ac;
    setSending(true);
    setSendError(null);
    setUploadDone(0);
    try {
      // 添付は先にアップロードする（1 件でも失敗したら投稿しない）
      let media: PostMedia[] = [];
      if (list.length > 0) {
        const signer = currentSigner();
        if (!signer) throw new Error("no signer");
        media = await uploadAttachments(list, {
          servers: uploadServers(mediaServer),
          signer,
          signal: ac.signal,
          onProgress: (done) => {
            if (!ac.signal.aborted) setUploadDone(done);
          },
        });
      }
      const draft =
        request.mode === "reply"
          ? buildReply(request.target, content, cw, ctx, media)
          : request.mode === "quote"
            ? buildQuote(request.target, content, cw, ctx, media)
            : buildNote(content, cw, ctx, media);
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

  /** 送信中の「キャンセル」: アップロード・署名待ちを打ち切って編集に戻る（本文・添付は残す） */
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
        // PC: ファイルのドラッグ & ドロップと貼り付けで添付する
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = sending ? "none" : "copy";
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          addFiles(Array.from(e.dataTransfer.files));
        }}
        onPaste={(e) => {
          if (addFiles(Array.from(e.clipboardData.files))) e.preventDefault();
        }}
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
            {attachments.length > 0 && (
              <AttachmentList
                attachments={attachments}
                processedSizes={processedSizes}
                removable={!sending}
                onRemove={removeAttachment}
              />
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
                <span className={styles.sendingText}>
                  {attachments.length > 0
                    ? `画像 ${uploadDone}/${attachments.length} アップロード中…`
                    : "投稿中…"}
                </span>
                <span className={styles.spacer} />
                <button type="button" className={styles.cancel} onClick={cancelSend}>
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <div className={styles.tools}>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label="画像・動画を添付"
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImageIcon className={styles.toolIcon} />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ATTACH_ACCEPT}
                    multiple
                    hidden
                    onChange={(e) => {
                      const input = e.currentTarget;
                      addFiles(Array.from(input.files ?? []));
                      // 同じファイルをもう一度選べるように空にする
                      input.value = "";
                    }}
                  />
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

/**
 * 添付の一覧（ネイティブ ImageCarousel / VideoCarousel。84px のサムネ + 右上の ✗ + 下に容量）。
 * 画像 → 動画の順に並べる（本文へ足す URL と同じ順）。
 */
function AttachmentList({
  attachments,
  processedSizes,
  removable,
  onRemove,
}: {
  attachments: readonly Attachment[];
  processedSizes: ReadonlyMap<string, number>;
  removable: boolean;
  onRemove(attachment: Attachment): void;
}) {
  const ordered = [
    ...attachments.filter((a) => a.kind === "image"),
    ...attachments.filter((a) => a.kind === "video"),
  ];
  return (
    <ul className={styles.attachments} aria-label="添付">
      {ordered.map((a) => {
        const original = a.file.size;
        const processed = processedSizes.get(a.id);
        const label =
          a.kind === "image" && processed === undefined
            ? "圧縮中…"
            : processed !== undefined && processed < original
              ? `${humanSize(original)}→${humanSize(processed)}`
              : humanSize(original);
        return (
          <li key={a.id} className={styles.attachment}>
            <div className={styles.thumb}>
              {a.kind === "image" ? (
                <img className={styles.thumbMedia} src={a.preview} alt="添付画像" decoding="async" />
              ) : (
                <>
                  <video
                    className={styles.thumbMedia}
                    src={a.preview}
                    aria-label="添付動画"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <PlayArrowIcon className={styles.thumbPlay} />
                </>
              )}
              {removable && (
                <button type="button" className={styles.remove} aria-label="削除" onClick={() => onRemove(a)}>
                  <CloseIcon className={styles.removeIcon} />
                </button>
              )}
            </div>
            <span className={styles.size}>{label}</span>
          </li>
        );
      })}
    </ul>
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
