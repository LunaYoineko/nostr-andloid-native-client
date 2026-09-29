import { useSession } from "../signer/session";

/** initLpVisibility が使う分だけの router の形（createBrowserRouter の戻り値はこれを満たす） */
type LpRouter = {
  state: { location: { pathname: string } };
  subscribe(fn: () => void): () => void;
};

/**
 * LP（静的 #lp。旧 docs/index.html の本文）の表示・非表示と、CTA の出し分け（#467・#647）。
 * / はセッション復元中・未ログインの間だけ LP を出し、ログイン済みならデッキの下に隠す。/about は常に LP。
 * それ以外のルート（/login・/settings 等）は常に隠す（ログイン画面等の裏に LP を出さないため）。
 * CSP で inline script を禁止したため、旧 docs/index.html の inline script（localStorage 参照）に代えて
 * ここで React から document を直接触る（#lp は React の外＝静的 HTML なので React では描かない）。
 */
export function initLpVisibility(router: LpRouter) {
  const sync = () => {
    const { pathname } = router.state.location;
    const status = useSession.getState().status;
    const visible = pathname === "/about" || (pathname === "/" && status !== "in");
    const lp = document.getElementById("lp");
    if (lp) lp.hidden = !visible;
    document.documentElement.classList.toggle("signed-in", status === "in");
  };
  sync();
  router.subscribe(sync);
  useSession.subscribe(sync);
}
