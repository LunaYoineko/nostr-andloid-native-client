import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes";

// ルータは React ツリーの外で 1 度だけ作る（react-router の推奨）
const router = createBrowserRouter(routes, { basename: "/app" });

export function App() {
  return <RouterProvider router={router} />;
}
