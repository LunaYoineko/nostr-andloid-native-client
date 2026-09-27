import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../signer/session";
import { Loading } from "./Loading";

/** 未ログインなら /login?next=<今のパス> へ送る。復元中は待つ */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const { pathname } = useLocation();
  if (status === "loading") return <Loading />;
  if (status === "out") return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  return children;
}
