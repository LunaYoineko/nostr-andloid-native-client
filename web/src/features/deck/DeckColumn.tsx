import { npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Virtuoso } from "react-virtuoso";
import {
  type ColumnKind,
  type ColumnSpec,
  type ColumnWidth,
  columnSubtitleFor,
  editTemplate,
  encodeReqFilter,
} from "../../lib/columns";
import {
  FEED_CATEGORIES,
  type FeedCategory,
  feedCatHiddenOf,
  isMutedRevealed,
  useDeck,
  widthOf,
} from "../../store/deck";
import { columnIcon, Icon } from "../../ui/icons";
import { MyReactionRow } from "../actions/MyReactionRow";
import { ConversationList } from "../dm/ConversationList";
import { startDecrypting } from "../dm/dmService";
import { NotificationList } from "../notifications/NotificationList";
import { NotificationRow } from "../notifications/NotificationRow";
import { NoteItem } from "../timeline/NoteItem";
import { Timeline } from "../timeline/Timeline";
import styles from "./DeckColumn.module.css";
import type { FeedRow } from "./followingMix";
import { useColumnFeed } from "./useColumnFeed";

/** Web 版でまだ描けない種別（REQ も張らない） */
const UNSUPPORTED_KINDS: ReadonlySet<ColumnKind> = new Set(["THREAD", "CHANNEL_LIST", "CHANNEL_ROOM"]);

const WIDTHS: readonly { width: ColumnWidth; label: string }[] = [
  { width: "S", label: "狭" },
  { width: "M", label: "標準" },
  { width: "L", label: "広" },
];

/** ⋯ の「タイムラインに混ぜる表示」の項目名（ネイティブ cat_*） */
const CATEGORY_LABEL: Record<FeedCategory, string> = {
  REACTIONS: "自分へのリアクション",
  REPLIES: "自分への返信・メンション",
  REPOSTS: "自分へのリポスト",
  MY_REACTIONS: "自分がしたリアクション",
  DMS: "未読のメッセージ",
};

/** デッキの 1 カラム。showHeader = カラムヘッダ（アイコン・タイトル・⋯）を出す */
export function DeckColumn({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) {
  if (UNSUPPORTED_KINDS.has(spec.kind)) return <UnsupportedColumn spec={spec} showHeader={showHeader} />;
  if (spec.kind === "DM") return <DmColumn spec={spec} showHeader={showHeader} />;
  return <FeedColumn spec={spec} showHeader={showHeader} />;
}

/** 同期などで入ってきた未対応の種別。⋯ から削除だけできる */
function UnsupportedColumn({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) {
  return (
    <section className={styles.column} aria-label={spec.title}>
      {showHeader && <ColumnHeader spec={spec} />}
      <p className={styles.empty}>この種類のカラムは Web 版ではまだ使えません</p>
    </section>
  );
}

/**
 * DM カラム（ネイティブ DmColumn #415）。会話の一覧を出し、行を押すとメッセージ画面をその相手で開く。
 * REQ は張らない（DM の購読は dmService）。表示したら復号を始める（NIP-07 / NIP-46 はここまで署名者を呼ばない）
 */
function DmColumn({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    startDecrypting();
  }, []);
  return (
    <section className={styles.column} aria-label={spec.title}>
      {showHeader && <ColumnHeader spec={spec} />}
      <div className={`${styles.body} ${styles.scroll}`}>
        <ConversationList
          selectedPeer={null}
          // カラムから会話を開くのは詳細を開くのと同じ扱い（履歴に積む）。戻るでデッキに戻れるように
          onSelect={(peer) => void navigate(`/messages/${npubEncode(peer)}`)}
          showBanners={false}
          showNewRow={false}
        />
      </div>
    </section>
  );
}

function FeedColumn({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) {
  const { loading, events, rows, loadingOlder, loadOlder, refresh } = useColumnFeed(spec);
  return (
    <section className={styles.column} aria-label={spec.title} aria-busy={loading}>
      {showHeader && <ColumnHeader spec={spec} onRefresh={refresh} />}
      <div className={styles.body}>
        {loading && <div className={styles.progress} role="progressbar" aria-label="読み込み中" />}
        {spec.kind === "FAVS" ? (
          <FavsList
            reactions={events}
            loading={loading}
            onEndReached={loadOlder}
            loadingOlder={loadingOlder}
          />
        ) : spec.kind === "NOTIFICATIONS" ? (
          <NotificationList events={events} loading={loading} columnId={spec.id} />
        ) : rows ? (
          // フォロー中カラム: 投稿に自分への反応・自分のリアクション・未読 DM を混ぜた行
          <Timeline
            key={encodeReqFilter(spec.filter)}
            events={rows}
            loading={loading}
            onEndReached={loadOlder}
            loadingOlder={loadingOlder}
            renderItem={renderFeedRow}
          />
        ) : (
          <Timeline
            // フィルターを変えたら中身が入れ替わるので、位置も先頭から
            key={encodeReqFilter(spec.filter)}
            events={events}
            loading={loading}
            onEndReached={loadOlder}
            loadingOlder={loadingOlder}
          />
        )}
      </div>
    </section>
  );
}

/** カラムヘッダ（ネイティブの ColumnHeader）。先頭 40px のアイコン、タイトル + 説明、末尾に ⋯ */
function ColumnHeader({ spec, onRefresh }: { spec: ColumnSpec; onRefresh?: () => void }) {
  return (
    <header className={styles.header}>
      <span className={styles.icon}>
        <Icon name={columnIcon(spec.kind)} size="lg" />
      </span>
      <div className={styles.titles}>
        <h2 className={styles.title}>{spec.title}</h2>
        <p className={styles.subtitle}>{columnSubtitleFor(spec)}</p>
      </div>
      <ColumnMenu spec={spec} onRefresh={onRefresh} />
    </header>
  );
}

/** フォロー中カラムの 1 行。通知は通知画面の行、自分のリアクションはふぁぼ欄の行と同じ */
function renderFeedRow(row: FeedRow) {
  switch (row.type) {
    case "post":
      return <NoteItem event={row.event} />;
    case "notice":
      return <NotificationRow item={row.item} />;
    case "myReaction":
      return <MyReactionRow reaction={row.reaction} />;
  }
}

type FooterContext = { loadingOlder: boolean };

function FavsFooter({ context }: { context?: FooterContext }) {
  return context?.loadingOlder ? <p className={styles.empty}>過去を読み込み中…</p> : null;
}

const FAVS_COMPONENTS = { Footer: FavsFooter };

/** ふぁぼ欄。自分のリアクション（kind:7）を 1 行ずつ要約して並べる（MyReactionRow） */
function FavsList({
  reactions,
  loading,
  onEndReached,
  loadingOlder,
}: {
  reactions: NostrEvent[];
  loading: boolean;
  onEndReached: () => void;
  loadingOlder: boolean;
}) {
  if (reactions.length === 0) {
    return <p className={styles.empty}>{loading ? "読み込み中…" : "ふぁぼした投稿はまだありません。"}</p>;
  }
  return (
    <Virtuoso
      className={styles.list}
      data={reactions}
      computeItemKey={(_, reaction) => reaction.id}
      endReached={onEndReached}
      components={FAVS_COMPONENTS}
      context={{ loadingOlder }}
      itemContent={(_, reaction) => <FavItem reaction={reaction} />}
    />
  );
}

function FavItem({ reaction }: { reaction: NostrEvent }) {
  return <MyReactionRow reaction={reaction} />;
}

/**
 * カラムの ⋯ メニュー（ネイティブの ColumnMenuButton）。移動 ◀ ▶ / フィルターを編集 / ミュートを表示・隠す /
 * 更新 / 固定する / タイムラインに混ぜる表示 / カラム幅 / カラムを削除。外側のクリックと Escape で閉じる。
 * onRefresh が無ければ「更新」を出さない。「ミュートを表示」は Web で描けるカラムだけ（描けない種別はミュートを当てていない）。
 * 「タイムラインに混ぜる表示」はフォロー中カラムだけ。
 */
export function ColumnMenu({ spec, onRefresh }: { spec: ColumnSpec; onRefresh?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const index = useDeck((s) => s.columns.findIndex((c) => c.id === spec.id));
  const count = useDeck((s) => s.columns.length);
  const width = useDeck((s) => widthOf(s, spec.id));
  const mutedRevealed = useDeck((s) => isMutedRevealed(s, spec.id));
  const hiddenCategories = useDeck((s) => feedCatHiddenOf(s, spec.id));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /** 押したらメニューを閉じる項目 */
  const act = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const deck = useDeck.getState;

  return (
    <div ref={root} className={styles.menuRoot}>
      <button
        ref={button}
        type="button"
        className={styles.iconButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="カラムメニュー"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="moreHoriz" size="md" />
      </button>
      {open && (
        <div role="menu" aria-label="カラムメニュー" className={styles.menu}>
          {/* 移動と幅はメニューを閉じない（続けて押せるように。ネイティブと同じ） */}
          <fieldset aria-label="移動" className={styles.menuRow}>
            <span className={styles.menuLabel}>移動</span>
            <button
              type="button"
              role="menuitem"
              className={styles.arrow}
              aria-label="左へ移動"
              disabled={index <= 0}
              onClick={() => deck().moveColumn(spec.id, -1)}
            >
              <Icon name="chevronLeft" size="lg" />
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.arrow}
              aria-label="右へ移動"
              disabled={index < 0 || index >= count - 1}
              onClick={() => deck().moveColumn(spec.id, 1)}
            >
              <Icon name="chevronRight" size="lg" />
            </button>
          </fieldset>
          {editTemplate(spec) !== null && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={act(() => deck().setEditing(spec.id))}
            >
              <Icon name="tune" size="md" />
              フィルターを編集
            </button>
          )}
          {!UNSUPPORTED_KINDS.has(spec.kind) && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={act(() => deck().setRevealMuted(spec.id, !mutedRevealed))}
            >
              <Icon name={mutedRevealed ? "visibilityOff" : "visibility"} size="md" />
              {mutedRevealed ? "ミュートを隠す" : "ミュートを表示"}
            </button>
          )}
          {onRefresh && (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={act(onRefresh)}>
              <Icon name="refresh" size="md" />
              更新
            </button>
          )}
          {!spec.pinned && (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={act(() => deck().pin(spec.id))}
            >
              <Icon name="pushPin" size="md" />
              固定する
            </button>
          )}
          {spec.kind === "FOLLOWING" && (
            // 種別のトグルはメニューを閉じない（続けて切り替えられるように。ネイティブと同じ）
            <fieldset aria-label="タイムラインに混ぜる表示" className={styles.menuGroup}>
              <span className={styles.menuHeading}>タイムラインに混ぜる表示</span>
              {FEED_CATEGORIES.map((category) => {
                const shown = !hiddenCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={shown}
                    className={styles.menuItem}
                    onClick={() => deck().setFeedCatHidden(spec.id, category, shown)}
                  >
                    <Icon name={shown ? "checkBox" : "checkBoxOutlineBlank"} size="md" />
                    {CATEGORY_LABEL[category]}
                  </button>
                );
              })}
            </fieldset>
          )}
          <fieldset aria-label="カラム幅" className={styles.menuRow}>
            <span className={styles.menuLabel}>カラム幅</span>
            {WIDTHS.map((w) => (
              <button
                key={w.width}
                type="button"
                role="menuitemradio"
                aria-checked={width === w.width}
                className={styles.chip}
                onClick={() => deck().setWidth(spec.id, w.width)}
              >
                {w.label}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={act(() => deck().removeColumn(spec.id))}
          >
            <Icon name="close" size="md" />
            カラムを削除
          </button>
        </div>
      )}
    </div>
  );
}
