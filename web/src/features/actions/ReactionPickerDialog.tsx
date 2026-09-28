import type { NostrEvent } from "nostr-tools/pure";
import { type ReactNode, useMemo, useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { ModalSheet } from "../../ui/ModalSheet";
import { useCustomEmojis } from "../compose/customEmojis";
import { ProfileAvatar } from "../compose/ProfileAvatar";
import { NoteContent } from "../timeline/NoteContent";
import { EMOJI_CATEGORIES, searchEmojis } from "./emojiCatalog";
import styles from "./ReactionPickerDialog.module.css";
import { loadRecentEmojis } from "./reactionPrefs";

/**
 * リアクションピッカー（ネイティブ ReactionPicker.kt + AppModalSheet）。画面上端寄せのカードをモーダルで開く。
 * 検索なし = 最近 → カスタム絵文字 → Unicode のカテゴリ、検索あり = カスタム → 絵文字。選ぶと onPick して閉じる。
 * target があれば対象の投稿（アバター・名前・本文 2 行）を上に出す（投稿画面の絵文字ボタンでは無し）。
 * [#587] 器は共通の ModalSheet（旧: 自前の dialog + card）。
 */
export function ReactionPickerDialog({
  target,
  onPick,
  onClose,
}: {
  target?: NostrEvent;
  onPick(content: string, imageUrl: string | null): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [recent] = useState(loadRecentEmojis);
  const me = useSession((s) => s.pubkey);
  const customs = useCustomEmojis(me);

  function pick(content: string, imageUrl: string | null) {
    onPick(content, imageUrl);
    onClose();
  }

  const q = query.trim();
  const matchedCustom = useMemo(() => {
    const lower = q.toLowerCase();
    return q === "" ? [] : customs.filter((c) => c.shortcode.toLowerCase().includes(lower));
  }, [customs, q]);
  const matchedUnicode = useMemo(() => searchEmojis(q), [q]);

  return (
    <ModalSheet title="リアクション" onDismiss={onClose}>
      {target && <TargetHeader target={target} />}
      <input
        type="search"
        className={styles.search}
        aria-label="絵文字を検索"
        placeholder="絵文字を検索（例: わらい / fire / 🔥）"
        enterKeyHint="search"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <div className={styles.scroll}>
        {q === "" ? (
          <>
            {recent.length > 0 && (
              <Section title="最近">
                {recent.map((r) =>
                  r.imageUrl ? (
                    <ImageCell
                      key={r.content}
                      label={r.content}
                      url={r.imageUrl}
                      onClick={() => pick(r.content, r.imageUrl)}
                    />
                  ) : (
                    <TextCell key={r.content} char={r.content} onClick={() => pick(r.content, null)} />
                  ),
                )}
              </Section>
            )}
            {customs.length > 0 && (
              <Section title="カスタム絵文字">
                {customs.map((c) => (
                  <ImageCell
                    key={c.shortcode}
                    label={`:${c.shortcode}:`}
                    url={c.url}
                    onClick={() => pick(`:${c.shortcode}:`, c.url)}
                  />
                ))}
              </Section>
            )}
            {EMOJI_CATEGORIES.map((category) => (
              <Section key={category.title} title={category.title}>
                {category.emojis.map((e) => (
                  <TextCell key={e.char} char={e.char} onClick={() => pick(e.char, null)} />
                ))}
              </Section>
            ))}
          </>
        ) : matchedCustom.length === 0 && matchedUnicode.length === 0 ? (
          <p className={styles.empty}>一致する絵文字がありません</p>
        ) : (
          <>
            {matchedCustom.length > 0 && (
              <Section title="カスタム">
                {matchedCustom.map((c) => (
                  <ImageCell
                    key={c.shortcode}
                    label={`:${c.shortcode}:`}
                    url={c.url}
                    onClick={() => pick(`:${c.shortcode}:`, c.url)}
                  />
                ))}
              </Section>
            )}
            {matchedUnicode.length > 0 && (
              <Section title="絵文字">
                {matchedUnicode.map((e) => (
                  <TextCell key={e.char} char={e.char} onClick={() => pick(e.char, null)} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </ModalSheet>
  );
}

/** 対象の投稿（アバター 32px + 名前 + 本文 2 行）と区切り線 */
function TargetHeader({ target }: { target: NostrEvent }) {
  const profile = useProfile(target.pubkey);
  return (
    <>
      <div className={styles.target}>
        <ProfileAvatar pubkey={target.pubkey} size={32} />
        <div className={styles.targetText}>
          <p className={styles.targetName}>{displayName(profile, target.pubkey)}</p>
          <div className={styles.targetBody}>
            <NoteContent event={target} variant="quote" />
          </div>
        </div>
      </div>
      <hr className={styles.divider} />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className={styles.section}>{title}</h3>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}

function TextCell({ char, onClick }: { char: string; onClick(): void }) {
  return (
    <button type="button" className={styles.cell} aria-label={char} onClick={onClick}>
      {char}
    </button>
  );
}

/** カスタム絵文字の画像。プロキシが読めなければ元 URL で 1 度だけ取り直し、それも読めなければ :code: の文字 */
function ImageCell({ label, url, onClick }: { label: string; url: string; onClick(): void }) {
  const [src, setSrc] = useState<string | null>(() => proxied(url, 64, 80, true));

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
    <button type="button" className={styles.cell} aria-label={label} onClick={onClick}>
      {src !== null ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onError}
        />
      ) : (
        <span className={styles.fallback}>{label}</span>
      )}
    </button>
  );
}
