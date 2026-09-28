import type { RouteObject } from "react-router";
import { AppShell } from "./AppShell";
import { HashtagRoute } from "./HashtagRoute";
import { LoginGate } from "./LoginGate";
import type { RouteHandle } from "./navState";
import { OpenNostrRoute } from "./OpenNostrRoute";
import { RequireSession } from "./RequireSession";
import { ShareRoute } from "./ShareRoute";
import { RouteError } from "./screens/RouteError";

// basename は "/app"（パスはそれより下の部分）。
// 子ルートは element を持たず handle だけ（描画は AppShell が handle から決める）。/t/:tag だけは一時カラムを開く
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginGate /> },
      {
        path: "/",
        element: (
          <RequireSession>
            <AppShell />
          </RequireSession>
        ),
        children: [
          { index: true, handle: { dest: "home" } satisfies RouteHandle },
          { path: "search", handle: { dest: "search" } satisfies RouteHandle },
          { path: "messages/:peer?", handle: { dest: "messages" } satisfies RouteHandle },
          { path: "channels/:id?", handle: { dest: "channels" } satisfies RouteHandle },
          { path: "notifications", handle: { dest: "notifications" } satisfies RouteHandle },
          { path: "settings/:section?", handle: { dest: "settings" } satisfies RouteHandle },
          { path: "e/:ref", handle: { overlay: "thread" } satisfies RouteHandle },
          { path: "p/:ref", handle: { overlay: "profile" } satisfies RouteHandle },
          { path: "t/:tag", handle: { dest: "home" } satisfies RouteHandle, element: <HashtagRoute /> },
          // Share Target（#541）。本文を下書きに入れて投稿シートを開き、/ に置き換える
          { path: "share", handle: { dest: "home" } satisfies RouteHandle, element: <ShareRoute /> },
          // web+nostr: / nostr: の受け口（#541）。/p か /e に置き換え、読めなければ 404
          { path: "open", handle: { dest: "home" } satisfies RouteHandle, element: <OpenNostrRoute /> },
          { path: "*", handle: { dest: "notFound" } satisfies RouteHandle },
        ],
      },
    ],
  },
];
