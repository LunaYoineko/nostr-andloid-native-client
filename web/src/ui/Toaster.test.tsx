import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Toaster } from "./Toaster";
import { showToast, TOAST_MS, useToast } from "./toast";

afterEach(() => {
  vi.useRealTimers();
  useToast.setState({ queue: [] });
});

it("積んだ順に 1 件ずつ TOAST_MS ずつ出す（途中で積んでも表示中の時間は延びない）", () => {
  vi.useFakeTimers();
  render(<Toaster />);
  expect(screen.queryByRole("status")).toBeNull();

  act(() => showToast("1 件目"));
  expect(screen.getByRole("status")).toHaveTextContent("1 件目");
  act(() => vi.advanceTimersByTime(1_000));
  act(() => showToast("2 件目"));
  expect(screen.getByRole("status")).toHaveTextContent("1 件目");

  act(() => vi.advanceTimersByTime(TOAST_MS - 1_000));
  expect(screen.getByRole("status")).toHaveTextContent("2 件目");
  act(() => vi.advanceTimersByTime(TOAST_MS - 1));
  expect(screen.getByRole("status")).toHaveTextContent("2 件目");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
});

it("同じ文言が続いても 2 件として出す", () => {
  vi.useFakeTimers();
  render(<Toaster />);
  act(() => {
    showToast("同じ");
    showToast("同じ");
  });
  act(() => vi.advanceTimersByTime(TOAST_MS));
  expect(screen.getByRole("status")).toHaveTextContent("同じ");
  act(() => vi.advanceTimersByTime(TOAST_MS));
  expect(screen.queryByRole("status")).toBeNull();
});
