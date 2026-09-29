import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";
import { AboutSection } from "./AboutSection";

it("/about へ置き換える（#647。SettingsScreen への配線は別途）", async () => {
  const router = createMemoryRouter(
    [
      { path: "/settings/about", element: <AboutSection /> },
      { path: "/about", element: <p>LP</p> },
    ],
    { initialEntries: ["/settings/about"] },
  );
  render(<RouterProvider router={router} />);

  expect(await screen.findByText("LP")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/about");
});
