import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../signer/session";
import { Loading } from "./Loading";

/**
 * 未ログインなら /login?next=<今のパス> へ送る。復元中は待つ。
 * クエリも含める（#541: /share?title=… や /open?uri=… はクエリに中身があるため、ログイン後もそこへ戻す）。
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const { pathname, search } = useLocation();
  if (status === "loading") return <Loading />;
  if (status === "out")
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return children;
}
