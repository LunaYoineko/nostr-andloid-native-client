import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../signer/session";
import { Loading } from "./Loading";

/**
 * 未ログインなら /login?next=<今のパス> へ送る。復元中は待つ。
 * クエリも含める（#541: /share?title=… や /open?uri=… はクエリに中身があるため、ログイン後もそこへ戻す）。
 * ただし / だけは例外（#647）: 復元中・未ログインの間は何も描かず、静的な LP（#lp）を出したままにする
 * （React だけで描かず、初期 HTML に残した LP を見せる）。ログイン済みなら通常どおり children（AppShell）を描く。
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const { pathname, search } = useLocation();
  const isHome = pathname === "/";
  if (status === "loading") return isHome ? null : <Loading />;
  if (status === "out") {
    if (isHome) return null;
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return children;
}
