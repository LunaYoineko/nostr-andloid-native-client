import type { RouteObject } from "react-router";
import { Home } from "./Home";
import { LoginGate } from "./LoginGate";
import { RequireSession } from "./RequireSession";

// basename は "/app"（パスはそれより下の部分）
export const routes: RouteObject[] = [
  {
    path: "/",
    element: (
      <RequireSession>
        <Home />
      </RequireSession>
    ),
  },
  { path: "/login", element: <LoginGate /> },
];
