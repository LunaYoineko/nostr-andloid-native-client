import { createBrowserRouter, RouterProvider } from "react-router";
import { APP_BASENAME, synthesizeBaseEntry } from "./history";
import { Nip46AuthPrompt } from "./Nip46AuthPrompt";
import { routes } from "./routes";

// 詳細（/e /p /t）を直接開いたら、Router を作る前に下へデッキ（/app/）を敷く
synthesizeBaseEntry(window);

// ルータは React ツリーの外で 1 度だけ作る（react-router の推奨）
const router = createBrowserRouter(routes, { basename: APP_BASENAME });

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Nip46AuthPrompt />
    </>
  );
}
