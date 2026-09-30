import type { NostrEvent } from "nostr-tools/pure";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { ModalSheet } from "../../ui/ModalSheet";
import { useCustomEmojis } from "../compose/customEmojis";
import { ProfileAvatar } from "../compose/ProfileAvatar";
import { NoteContent } from "../timeline/NoteContent";
import { EMOJI_CATEGORIES, type EmojiCategory, loadEmojiCatalog, searchEmojis } from "./emojiCatalog";
import styles from "./ReactionPickerDialog.module.css";
import { loadRecentEmojis } from "./reactionPrefs";

/**
 * リアクションピッカー（ネイティブ ReactionPicker.kt + AppModalSheet）。画面上端寄せのカードをモーダルで開く。
 * 検索なし = 最近 → カスタム絵文字 → Unicode のカテゴリタブ + グリッド、検索あり = カスタム → 絵文字。
 * 選ぶと onPick して閉じる。target があれば対象の投稿（アバター・名前・本文 2 行）を上に出す（投稿画面の絵文字ボタンでは無し）。
 * [#587] 器は共通の ModalSheet（旧: 自前の dialog + card）。
 * [#684] 開いたら emojibase-data（標準の絵文字全部）を動的 import。読み込み中は厳選リストのまま使え、
 * 終わったら全カテゴリに差し替わる。カテゴリは最大でも数百件なので、タブで選んだカテゴリだけ描画して仮想化の代わりにする。
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
  const [categories, setCategories] = useState<readonly EmojiCategory[]>(EMOJI_CATEGORIES);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    let alive = true;
    loadEmojiCatalog().then((full) => {
      if (!alive) return;
      setCategories(full);
      setActiveTab(0);
    });
    return () => {
      alive = false;
    };
  }, []);

  function pick(content: string, imageUrl: string | null) {
    onPick(content, imageUrl);
    onClose();
  }

  const q = query.trim();
  const matchedCustom = useMemo(() => {
    const lower = q.toLowerCase();
    return q === "" ? [] : customs.filter((c) => c.shortcode.toLowerCase().includes(lower));
  }, [customs, q]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: categories は catalog 差し替えのキー（loadEmojiCatalog 完了で全絵文字に切り替わったら再検索するため）
  const matchedUnicode = useMemo(() => searchEmojis(q), [q, categories]);
  const activeCategory = categories[activeTab] ?? categories[0];

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
            {activeCategory && (
              <>
                <div role="tablist" aria-label="絵文字のカテゴリ" className={styles.tabs}>
                  {categories.map((category, i) => (
                    <button
                      key={category.title}
                      type="button"
                      role="tab"
                      aria-selected={i === activeTab}
                      className={styles.tab}
                      onClick={() => setActiveTab(i)}
                    >
                      {category.title}
                    </button>
                  ))}
                </div>
                <Section title={activeCategory.title}>
                  {activeCategory.emojis.map((e) => (
                    <TextCell key={e.char} char={e.char} onClick={() => pick(e.char, null)} />
                  ))}
                </Section>
              </>
            )}
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
