import { afterEach, describe, expect, it } from "vitest";
import { clearSeen, loadSeen, markSeen, useDmSeen } from "./dmSeen";

const ME = "a".repeat(64);
const ALICE = "b".repeat(64);
const KEY = `nostrism.dm.seen.${ME}`;

afterEach(() => {
  localStorage.clear();
  useDmSeen.setState({ me: null, first: 0, peers: {} });
});

function stored(): unknown {
  const text = localStorage.getItem(KEY);
  return text === null ? null : JSON.parse(text);
}

describe("loadSeen", () => {
  it("初回は first = 今を保存し、2 回目は保存値を使う", () => {
    loadSeen(ME, 1_000);
    expect(stored()).toEqual({ first: 1_000, peers: {} });
    expect(useDmSeen.getState()).toMatchObject({ me: ME, first: 1_000, peers: {} });

    localStorage.setItem(KEY, JSON.stringify({ first: 500, peers: { [ALICE]: 800 } }));
    loadSeen(ME, 2_000);
    expect(useDmSeen.getState()).toMatchObject({ me: ME, first: 500, peers: { [ALICE]: 800 } });
    expect(stored()).toEqual({ first: 500, peers: { [ALICE]: 800 } });
  });

  it("壊れた値は初回と同じ扱い（first = 今で書き直す）", () => {
    for (const broken of ["{broken", "[]", "null", '{"first":"x","peers":{}}', '{"first":1,"peers":[]}']) {
      localStorage.setItem(KEY, broken);
      loadSeen(ME, 3_000);
      expect(useDmSeen.getState()).toMatchObject({ me: ME, first: 3_000, peers: {} });
      expect(stored()).toEqual({ first: 3_000, peers: {} });
    }
  });

  it("相手ごとの値は読めるものだけ残す", () => {
    localStorage.setItem(KEY, JSON.stringify({ first: 1, peers: { [ALICE]: 5, bad: "x" } }));
    loadSeen(ME, 3_000);
    expect(useDmSeen.getState().peers).toEqual({ [ALICE]: 5 });
  });
});

describe("markSeen", () => {
  it("max(今, 相手の最新の発言) にする", () => {
    loadSeen(ME, 1_000);
    markSeen(ME, ALICE, 1_500, 1_200);
    expect(useDmSeen.getState().peers).toEqual({ [ALICE]: 1_500 });
    expect(stored()).toEqual({ first: 1_000, peers: { [ALICE]: 1_500 } });

    markSeen(ME, ALICE, 1_500, 1_600);
    expect(useDmSeen.getState().peers).toEqual({ [ALICE]: 1_600 });
  });

  it("進まないときは書かない", () => {
    loadSeen(ME, 1_000);
    markSeen(ME, ALICE, 0, 2_000);
    const before = useDmSeen.getState().peers;
    localStorage.removeItem(KEY);

    markSeen(ME, ALICE, 1_900, 1_950);
    expect(useDmSeen.getState().peers).toBe(before);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("読み込んでいないアカウントには書かない", () => {
    markSeen(ME, ALICE, 0, 2_000);
    expect(useDmSeen.getState().peers).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

it("clearSeen: 保存値を消し、ストアを空に戻す", () => {
  loadSeen(ME, 1_000);
  markSeen(ME, ALICE, 0, 2_000);
  clearSeen(ME);
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(useDmSeen.getState()).toMatchObject({ me: null, first: 0, peers: {} });
});
