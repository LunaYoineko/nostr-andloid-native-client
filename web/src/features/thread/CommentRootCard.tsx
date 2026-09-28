import type { AddressPointer } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "nostr-tools/pure";
import { Link } from "react-router";
import { hrefForEvent } from "../../lib/content/labels";
import { useEventByPointer } from "../../nostr/loaders";
import { ArticleCard, ArticleCardBody } from "../article/ArticleCard";
import articleStyles from "../article/ArticleCard.module.css";
import styles from "./CommentRootCard.module.css";

const HEX64 = /^[0-9a-f]{64}$/i;

/** 最初の name タグの値（空文字は無視） */
function firstTagValue(event: NostrEvent, name: string): string | null {
  return event.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1] !== "")?.[1] ?? null;
}

/** rootA（`kind:pubkey:d`）が記事（kind:30023）を指しているときの AddressPointer。形が崩れていれば null */
function articleAddressOf(rootA: string): AddressPointer | null {
  const [kind, pubkey, ...d] = rootA.split(":");
  if (kind !== "30023" || !pubkey || !HEX64.test(pubkey)) return null;
  return { kind: 30023, pubkey: pubkey.toLowerCase(), identifier: d.join(":") };
}

/**
 * NIP-22 コメント（kind:1111）のコメント対象（ネイティブの CommentRootCard.kt）。スレッドの先頭に 1 枚出す。
 * ルート A → 記事（kind:30023）なら記事カード（#591。押すと記事へ）・他は「kind N へのコメント」、ルート E →
 * 取得済みの kind 1 / 1111 は出さない（ツリーに出る）・記事（30023）なら同じく記事カード（#591）・他は
 * 「kind N へのコメント」、ルート I → 「<ホスト> へのコメント」+ URL。
 */
export function CommentRootCard({ focus }: { focus: NostrEvent }) {
  const rootA = firstTagValue(focus, "A");
  const eTag = focus.tags.find((t) => t[0] === "E" && typeof t[1] === "string" && t[1] !== "");
  const rootI = firstTagValue(focus, "I");
  const k = firstTagValue(focus, "K");
  const rootK = k !== null && /^\d+$/.test(k) ? k : null;

  if (rootA) {
    const addr = articleAddressOf(rootA);
    if (addr) {
      return (
        <div className={styles.wrap}>
          <ArticleCard addr={addr} />
        </div>
      );
    }
    const kind = rootA.split(":")[0];
    return <GenericRootCard label={`kind ${/^\d+$/.test(kind) ? kind : (rootK ?? "?")} へのコメント`} />;
  }
  if (eTag) {
    const hint = eTag[2]?.startsWith("wss://") ? eTag[2] : undefined;
    return <EventRootCard id={eTag[1]} hint={hint} rootK={rootK} />;
  }
  if (rootI) {
    const isUrl = /^https?:\/\//i.test(rootI);
    const label = `${isUrl ? hostOf(rootI) : rootI} へのコメント`;
    return isUrl ? (
      <GenericRootCard label={label} subtitle={rootI} externalHref={rootI} />
    ) : (
      <GenericRootCard label={label} />
    );
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function EventRootCard({ id, hint, rootK }: { id: string; hint: string | undefined; rootK: string | null }) {
  const root = useEventByPointer({ id, relays: hint ? [hint] : undefined });
  if (root) {
    if (root.kind === 1 || root.kind === 1111) return null;
    if (root.kind === 30023) {
      return (
        <div className={styles.wrap}>
          <Link className={articleStyles.card} to={hrefForEvent({ id })}>
            <ArticleCardBody event={root} />
          </Link>
        </div>
      );
    }
    return <GenericRootCard label={`kind ${root.kind} へのコメント`} to={hrefForEvent({ id })} />;
  }
  return <GenericRootCard label={rootK !== null ? `kind ${rootK} へのコメント` : "コメント対象を取得中…"} />;
}

/**
 * 汎用のカード（Surface2・角丸 Md）。to があればアプリ内リンク、externalHref があれば新しいタブで開く外部リンク。
 * ThreadScreen の「Web 版ではまだ表示できません」にも使う。
 */
export function GenericRootCard({
  label,
  subtitle,
  to,
  externalHref,
}: {
  label: string;
  subtitle?: string;
  to?: string;
  externalHref?: string;
}) {
  const content = (
    <>
      <p className={styles.label}>{label}</p>
      {subtitle && <p className={styles.sub}>{subtitle}</p>}
    </>
  );
  let card = <div className={styles.card}>{content}</div>;
  if (to) {
    card = (
      <Link className={styles.card} to={to}>
        {content}
      </Link>
    );
  } else if (externalHref) {
    card = (
      <a className={styles.card} href={externalHref} target="_blank" rel="noopener noreferrer nofollow ugc">
        {content}
      </a>
    );
  }
  return <div className={styles.wrap}>{card}</div>;
}
