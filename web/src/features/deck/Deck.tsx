import { useEffect, useRef } from "react";
import { useDeck } from "../../store/deck";
import { AddColumnDialog } from "./AddColumnDialog";
import styles from "./Deck.module.css";
import { DeckColumn } from "./DeckColumn";
import { EditColumnDialog } from "./EditColumnDialog";

/**
 * デッキ（暫定。レイアウトは #453 で置き換える）。全カラムを固定幅で横に並べ、はみ出しは横スクロール。
 */
export function Deck() {
  const columns = useDeck((s) => s.columns);
  const jumpTarget = useDeck((s) => s.jumpTarget);
  const showAddColumn = useDeck((s) => s.showAddColumn);
  const editingColumnId = useDeck((s) => s.editingColumnId);
  const slots = useRef(new Map<string, HTMLElement>());

  // ジャンプ要求のカラムを左端へ寄せて消費する
  useEffect(() => {
    if (jumpTarget === null) return;
    slots.current.get(jumpTarget)?.scrollIntoView?.({ inline: "start", block: "nearest" });
    useDeck.getState().consumeJump();
  }, [jumpTarget]);

  return (
    <>
      <div className={styles.deck}>
        {columns.map((spec) => (
          <div
            key={spec.id}
            className={styles.slot}
            ref={(el) => {
              if (!el) return;
              slots.current.set(spec.id, el);
              return () => {
                slots.current.delete(spec.id);
              };
            }}
          >
            <DeckColumn spec={spec} showHeader />
          </div>
        ))}
      </div>
      {showAddColumn && <AddColumnDialog />}
      {editingColumnId !== null && <EditColumnDialog />}
    </>
  );
}
