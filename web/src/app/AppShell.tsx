import { useEffect, useMemo, useState } from "react";
import { Outlet, useMatches, useNavigate, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ComposeHost } from "../features/compose/ComposeHost";
import { AddColumnDialog } from "../features/deck/AddColumnDialog";
import { EditColumnDialog } from "../features/deck/EditColumnDialog";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { notificationsColumnId, pinnedColumns, useDeck } from "../store/deck";
import { BottomNav } from "../ui/BottomNav";
import { ConnectionPill } from "../ui/ConnectionPill";
import { DetailOverlay } from "../ui/DetailOverlay";
import { NavRail } from "../ui/NavRail";
import { useLayoutMode } from "../ui/useLayoutMode";
import styles from "./AppShell.module.css";
import { DeckScreen } from "./deck/DeckScreen";
import { useCloseOverlay, useTransientHistory } from "./history";
import {
  bottomSelection,
  type Dest,
  isPinnedActive,
  isRailHomeActive,
  type OverlayKind,
  routeHandleOf,
} from "./navState";
import { ProfileOverlay } from "./overlays/ProfileOverlay";
import { ThreadOverlay } from "./overlays/ThreadOverlay";
import { MessagesPlaceholder } from "./screens/MessagesPlaceholder";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { SearchPlaceholder } from "./screens/SearchPlaceholder";
import { SettingsPlaceholder } from "./screens/SettingsPlaceholder";
import { useNavActions } from "./useNavActions";

function DestScreen({ dest }: { dest: Dest }) {
  switch (dest) {
    case "home":
      return <DeckScreen />;
    case "search":
      return <SearchPlaceholder />;
    case "messages":
      return <MessagesPlaceholder />;
    case "notifications":
      return <NotificationsScreen />;
    case "settings":
      return <SettingsPlaceholder />;
    case "notFound":
      return <NotFoundScreen />;
  }
}

/**
 * ログイン後の骨格（ネイティブ AppScaffold）。Compact = 内容 + 下部ナビ、Expanded = レール + 内容。
 * 宛先（URL のパス）の画面を内容領域に描き、詳細（/e /p）はその上に重ねる（背後は最後の宛先を描いたまま）。
 * 子の並び順は固定（条件付きの要素も同じ位置）= モードを切り替えても内容を作り直さない。
 */
export function AppShell() {
  const mode = useLayoutMode();
  const handle = routeHandleOf(useMatches());
  const params = useParams();
  const navigate = useNavigate();

  // 詳細の背後に描く宛先。直リンク・リロードで詳細から始まったらデッキ
  const [baseDest, setBaseDest] = useState<Dest>(handle && "dest" in handle ? handle.dest : "home");
  if (handle && "dest" in handle && handle.dest !== baseDest) setBaseDest(handle.dest);
  const dest: Dest = handle && "dest" in handle ? handle.dest : baseDest;
  const overlay: { kind: OverlayKind; ref: string } | null =
    handle && "overlay" in handle ? { kind: handle.overlay, ref: params.ref ?? "" } : null;
  const overlayKind = overlay?.kind ?? null;

  useTransientHistory();
  const closeOverlay = useCloseOverlay();
  const { open, openColumn } = useNavActions();

  const jumpTarget = useDeck((s) => s.jumpTarget);
  const visibleColumnId = useDeck((s) => s.visibleColumnId);
  const showAddColumn = useDeck((s) => s.showAddColumn);
  const editingColumnId = useDeck((s) => s.editingColumnId);
  const notifColumnId = useDeck(notificationsColumnId);
  const pinned = useDeck(useShallow(pinnedColumns));

  // 宛先の外で jump したら必ずデッキへ出す（ネイティブ #49。検索画面からカラム追加した場合など）
  useEffect(() => {
    if (jumpTarget !== null && (dest !== "home" || overlayKind !== null))
      void navigate("/", { replace: true });
  }, [jumpTarget, dest, overlayKind, navigate]);

  const selected = bottomSelection(dest, visibleColumnId, notifColumnId);
  const railPinned = useMemo(
    () =>
      pinned.map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        active: isPinnedActive(dest, visibleColumnId, c.id),
      })),
    [pinned, dest, visibleColumnId],
  );
  const pinnedIds = useMemo(() => pinned.map((c) => c.id), [pinned]);

  return (
    <div className={styles.shell} data-layout={mode}>
      {mode === "expanded" && (
        <NavRail
          selected={selected}
          homeActive={isRailHomeActive(dest, visibleColumnId, pinnedIds)}
          pinned={railPinned}
          showNotifications={notifColumnId === null}
          onSelect={open}
          onOpenColumn={openColumn}
          onAddColumn={() => useDeck.getState().setShowAddColumn(true)}
        />
      )}
      <main className={styles.content} id="main">
        <div className={styles.base} inert={overlay !== null}>
          <DestScreen dest={dest} />
        </div>
        {overlay && (
          <DetailOverlay
            kind={overlay.kind}
            label={overlay.kind === "thread" ? "スレッド" : "プロフィール"}
            onClose={closeOverlay}
          >
            {overlay.kind === "thread" ? (
              <ThreadOverlay refParam={overlay.ref} onBack={closeOverlay} />
            ) : (
              <ProfileOverlay refParam={overlay.ref} onBack={closeOverlay} />
            )}
          </DetailOverlay>
        )}
        <ComposeHost showFab={dest === "home" && overlay === null} />
        <ConnectionPill />
      </main>
      {mode === "compact" && <BottomNav selected={selected} onSelect={open} />}
      <Outlet />
      {showAddColumn && <AddColumnDialog />}
      {editingColumnId !== null && <EditColumnDialog />}
    </div>
  );
}
