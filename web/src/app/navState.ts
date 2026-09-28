import type { UIMatch } from "react-router";

/** 宛先（URL のパス）。messages = DM、channels = パブリックチャット（どちらもナビの「メッセージ」）。notFound = どのナビも選択しない */
export type Dest = "home" | "search" | "messages" | "channels" | "notifications" | "settings" | "notFound";

/** 宛先の上に重ねる詳細 */
export type OverlayKind = "thread" | "profile";

/** 子ルートの handle。描画は AppShell がこれで決める */
export type RouteHandle = { dest: Dest } | { overlay: OverlayKind };

function isRouteHandle(handle: unknown): handle is RouteHandle {
  if (typeof handle !== "object" || handle === null) return false;
  const h = handle as Record<string, unknown>;
  return typeof h.dest === "string" || typeof h.overlay === "string";
}

/** 一番深いルートの handle */
export function routeHandleOf(matches: UIMatch[]): RouteHandle | null {
  const handle = matches.at(-1)?.handle;
  return isRouteHandle(handle) ? handle : null;
}

export type NavKey = "home" | "search" | "messages" | "notifications" | "settings";

/** 下部ナビの順（ネイティブ BottomBar と同じ） */
export const NAV_ORDER: readonly NavKey[] = ["home", "search", "messages", "notifications", "settings"];

export const NAV_LABEL: Record<NavKey, string> = {
  home: "ホーム",
  search: "検索",
  messages: "メッセージ",
  notifications: "通知",
  settings: "設定",
};

export const NAV_PATH: Record<NavKey, string> = {
  home: "/",
  search: "/search",
  messages: "/messages",
  notifications: "/notifications",
  settings: "/settings",
};

/** 通知が選択中か。通知画面、またはデッキで通知カラムを見ているとき（ネイティブ #405） */
export function isNotificationsActive(
  dest: Dest,
  visibleColumnId: string | null,
  notifColumnId: string | null,
): boolean {
  return (
    dest === "notifications" ||
    (dest === "home" && visibleColumnId !== null && visibleColumnId === notifColumnId)
  );
}

/** 下部ナビの選択状態 */
export function bottomSelection(
  dest: Dest,
  visibleColumnId: string | null,
  notifColumnId: string | null,
): Record<NavKey, boolean> {
  const notifications = isNotificationsActive(dest, visibleColumnId, notifColumnId);
  return {
    home: dest === "home" && !notifications,
    search: dest === "search",
    messages: dest === "messages" || dest === "channels",
    notifications,
    settings: dest === "settings",
  };
}

/** レールのホーム。デッキ表示中で、見ているカラムが目次（ピン留め）に無いとき（ネイティブ #409） */
export function isRailHomeActive(
  dest: Dest,
  visibleColumnId: string | null,
  pinnedIds: readonly string[],
): boolean {
  return dest === "home" && (visibleColumnId === null || !pinnedIds.includes(visibleColumnId));
}

/** レールの目次の 1 件が選択中か */
export function isPinnedActive(dest: Dest, visibleColumnId: string | null, id: string): boolean {
  return dest === "home" && id === visibleColumnId;
}
