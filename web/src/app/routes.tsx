import type { RouteObject } from "react-router";
import { AppShell } from "./AppShell";
import { HashtagRoute } from "./HashtagRoute";
import { LoginGate } from "./LoginGate";
import type { RouteHandle } from "./navState";
import { RequireSession } from "./RequireSession";
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
          { path: "messages", handle: { dest: "messages" } satisfies RouteHandle },
          { path: "notifications", handle: { dest: "notifications" } satisfies RouteHandle },
          { path: "settings/:section?", handle: { dest: "settings" } satisfies RouteHandle },
          { path: "e/:ref", handle: { overlay: "thread" } satisfies RouteHandle },
          { path: "p/:ref", handle: { overlay: "profile" } satisfies RouteHandle },
          { path: "t/:tag", handle: { dest: "home" } satisfies RouteHandle, element: <HashtagRoute /> },
          { path: "*", handle: { dest: "notFound" } satisfies RouteHandle },
        ],
      },
    ],
  },
];
