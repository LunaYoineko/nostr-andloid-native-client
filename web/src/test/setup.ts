import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals を有効にしていないので、描画した DOM の後始末を明示する
afterEach(() => {
  cleanup();
});
