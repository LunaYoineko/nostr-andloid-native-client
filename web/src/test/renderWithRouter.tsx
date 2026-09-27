import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

/** Link を含む部品を、どのパスでも ui を描くメモリ上のルータの中で描画する */
export function renderWithRouter(ui: ReactElement, { path = "/" }: { path?: string } = {}) {
  const router = createMemoryRouter([{ path: "*", element: ui }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}
