import { createBrowserRouter, RouterProvider } from "react-router";
import { APP_BASENAME, synthesizeBaseEntry } from "./history";
import { initLpVisibility } from "./lpVisibility";
import { Nip46AuthPrompt } from "./Nip46AuthPrompt";
import { routes } from "./routes";

// 詳細（/e /p /t）を直接開いたら、Router を作る前に下へデッキ（/）を敷く
synthesizeBaseEntry(window);

// ルータは React ツリーの外で 1 度だけ作る（react-router の推奨）
const router = createBrowserRouter(routes, { basename: APP_BASENAME });
// LP（#lp）の表示・非表示と CTA の出し分け（#647）。ルートとログイン状態を見て随時切り替える
initLpVisibility(router);

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Nip46AuthPrompt />
    </>
  );
}
