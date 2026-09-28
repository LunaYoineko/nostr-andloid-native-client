import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it } from "vitest";
import { clearVisualViewport, mockVisualViewport, setVisualViewportHeight } from "../test/viewport";
import { useVisualViewportHeight } from "./useVisualViewportHeight";

function Probe() {
  const target = useRef<HTMLDivElement>(null);
  useVisualViewportHeight(target, "--vvh");
  return <div ref={target} data-testid="target" />;
}

afterEach(() => {
  clearVisualViewport();
});

it("visualViewport の resize でコンテナの高さ（CSS 変数）が変わる", () => {
  mockVisualViewport(800);
  const { getByTestId } = render(<Probe />);
  expect(getByTestId("target").style.getPropertyValue("--vvh")).toBe("800px");

  setVisualViewportHeight(480);
  expect(getByTestId("target").style.getPropertyValue("--vvh")).toBe("480px");
});

it("visualViewport が無ければ既定のまま（プロパティを設定しない）", () => {
  clearVisualViewport();
  const { getByTestId } = render(<Probe />);
  expect(getByTestId("target").style.getPropertyValue("--vvh")).toBe("");
});
