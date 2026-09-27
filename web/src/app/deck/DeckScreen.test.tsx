import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnSpec } from "../../lib/columns";
import { DEFAULT_COLUMNS } from "../../lib/columns";
import { useDeck } from "../../store/deck";
import { clearViewport, mockViewport, setBox, setViewportWidth } from "../../test/viewport";
import { DeckScreen } from "./DeckScreen";

const { mounts } = vi.hoisted(() => ({ mounts: new Map<string, number>() }));

// カラムの中身（購読・仮想リスト）は描かず、マウント回数だけ数える
vi.mock("../../features/deck/DeckColumn", async () => {
  const { useState } = await import("react");
  return {
    DeckColumn({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) {
      useState(() => mounts.set(spec.id, (mounts.get(spec.id) ?? 0) + 1));
      return <div data-testid={`col-${spec.id}`} data-header={String(showHeader)} />;
    },
    ColumnMenu: () => <button type="button">カラムメニュー</button>,
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mounts.clear();
  useDeck.setState({
    columns: structuredClone([...DEFAULT_COLUMNS]),
    widths: {},
    jumpTarget: null,
    visibleColumnId: null,
    editingColumnId: null,
    showAddColumn: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  clearViewport();
});

/** カラムを並べる横スクロールの要素 */
function strip() {
  const slot = screen.getByRole("region", { name: "フォロー中" });
  if (!slot.parentElement) throw new Error("strip が無い");
  return slot.parentElement;
}

/** scrollLeft を動かして scroll を送り、rAF まで進める */
function scrollTo(el: HTMLElement, left: number) {
  el.scrollLeft = left;
  fireEvent.scroll(el);
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

describe("compact", () => {
  beforeEach(() => {
    mockViewport(400);
  });

  it("カラムヘッダ無しで 3 カラム、タブ列と選択カラムの ⋯、カラム追加はタブ列の ＋ だけ", () => {
    render(<DeckScreen />);
    for (const id of ["c_following", "c_hashtag", "c_notif"]) {
      expect(screen.getByTestId(`col-${id}`)).toHaveAttribute("data-header", "false");
    }
    const tabs = screen.getByRole("navigation", { name: "カラム" });
    expect(screen.getByRole("button", { name: "カラムメニュー" })).toBeInTheDocument();
    const adds = screen.getAllByRole("button", { name: "カラム追加" });
    expect(adds).toHaveLength(1);
    expect(tabs).toContainElement(adds[0]);
  });

  it("スワイプでページが変わると visibleColumnId とタブの点灯が追従する", () => {
    render(<DeckScreen />);
    setBox(strip(), { clientWidth: 400 });

    scrollTo(strip(), 800);
    expect(useDeck.getState().visibleColumnId).toBe("c_notif");
    expect(screen.getByRole("button", { name: "通知" })).toHaveAttribute("aria-current", "true");
  });

  it("タブを押すと即座に点灯してそのページへスクロールし、着くまで途中の位置を反映しない", () => {
    render(<DeckScreen />);
    setBox(strip(), { clientWidth: 400 });

    fireEvent.click(screen.getByRole("button", { name: "#nostr" }));
    expect(useDeck.getState().visibleColumnId).toBe("c_hashtag");
    expect(strip().scrollLeft).toBe(400);
    expect(useDeck.getState().jumpTarget).toBeNull();

    scrollTo(strip(), 0);
    expect(useDeck.getState().visibleColumnId).toBe("c_hashtag");
  });

  it("見ているカラムを移動しても画面に残り、削除したらスクロール位置のカラムになる", () => {
    render(<DeckScreen />);
    setBox(strip(), { clientWidth: 400 });
    act(() => {
      useDeck.setState({ visibleColumnId: "c_hashtag" });
    });

    act(() => {
      useDeck.getState().moveColumn("c_hashtag", 1);
    });
    expect(strip().scrollLeft).toBe(800);
    expect(useDeck.getState().visibleColumnId).toBe("c_hashtag");

    act(() => {
      useDeck.getState().removeColumn("c_hashtag");
    });
    expect(useDeck.getState().visibleColumnId).toBe("c_notif");
  });
});

describe("expanded", () => {
  beforeEach(() => {
    mockViewport(1200);
  });

  it("カラムヘッダ付きで並べ、タブ列は無く、末尾のカラム追加でダイアログを開く。幅は widths どおり", () => {
    useDeck.setState({ widths: { c_hashtag: "S" } });
    render(<DeckScreen />);
    expect(screen.getByTestId("col-c_following")).toHaveAttribute("data-header", "true");
    expect(screen.queryByRole("navigation", { name: "カラム" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "#nostr" })).toHaveAttribute("data-width", "S");
    expect(screen.getByRole("region", { name: "フォロー中" })).toHaveAttribute("data-width", "M");
    expect(screen.getByRole("region", { name: "通知" })).toHaveAttribute("data-width", "M");

    fireEvent.click(screen.getByRole("button", { name: "カラム追加" }));
    expect(useDeck.getState().showAddColumn).toBe(true);
  });

  it("横スクロールしなければ visibleColumnId は null、スクロールすると左端のカラム。jump でそのカラムの位置へ", () => {
    useDeck.setState({ visibleColumnId: "c_notif" });
    render(<DeckScreen />);
    expect(useDeck.getState().visibleColumnId).toBeNull();

    const el = strip();
    setBox(el, { scrollWidth: 2000, clientWidth: 700 });
    ["フォロー中", "#nostr", "通知"].forEach((name, i) => {
      setBox(screen.getByRole("region", { name }), { offsetLeft: [0, 348, 696][i] });
    });
    scrollTo(el, 350);
    expect(useDeck.getState().visibleColumnId).toBe("c_hashtag");

    act(() => {
      useDeck.getState().jumpTo("c_notif");
    });
    expect(el.scrollLeft).toBe(696);
    expect(useDeck.getState().jumpTarget).toBeNull();
  });
});

it("幅が 600px をまたいで変わってもカラムを作り直さない", () => {
  mockViewport(1200);
  render(<DeckScreen />);
  setViewportWidth(400);
  expect(screen.getByRole("navigation", { name: "カラム" })).toBeInTheDocument();
  setViewportWidth(1200);
  expect(screen.queryByRole("navigation", { name: "カラム" })).not.toBeInTheDocument();

  expect(Object.fromEntries(mounts)).toEqual({ c_following: 1, c_hashtag: 1, c_notif: 1 });
  expect(screen.getByTestId("col-c_notif")).toHaveAttribute("data-header", "true");
});

it("カラムが 0 件なら案内を出す", () => {
  mockViewport(400);
  useDeck.setState({ columns: [] });
  render(<DeckScreen />);
  expect(screen.getByText(/カラムがありません/)).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "カラム" })).getAllByRole("button")).toHaveLength(1);
});
