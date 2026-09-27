import type { NostrEvent } from "nostr-tools/pure";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { ExpandLessIcon, ExpandMoreIcon } from "../../ui/icons";
import styles from "./CollapsibleContent.module.css";

/**
 * 長い本文を 8 行で折りたたむ（ネイティブの CollapsibleText.kt）。
 * はみ出しているとき（または展開中）だけ「もっと見る」/「閉じる」を出す。開閉はこの投稿の間だけ覚える。
 */
export function CollapsibleContent({ event, children }: { event: NostrEvent; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  // 開いた投稿の id。別の投稿に差し替わったら閉じた状態に戻る
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = expandedId === event.id;
  const [overflowing, setOverflowing] = useState(false);

  // 折りたたみ中だけ測る（展開中はトグルを出しっぱなしにする）
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div>
      <div ref={body} className={expanded ? undefined : styles.clamp}>
        {children}
      </div>
      {(overflowing || expanded) && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          onClick={() => setExpandedId(expanded ? null : event.id)}
        >
          {expanded ? "閉じる" : "もっと見る"}
          {expanded ? (
            <ExpandLessIcon className={styles.chevron} />
          ) : (
            <ExpandMoreIcon className={styles.chevron} />
          )}
        </button>
      )}
    </div>
  );
}
