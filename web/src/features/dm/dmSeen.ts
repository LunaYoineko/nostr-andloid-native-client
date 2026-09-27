import { create } from "zustand";
import { unixNow } from "../../lib/time";

/**
 * DM の既読（ネイティブ #416 の dm_seen:<pubkey> / dm_last_seen）。会話ごとの既読時刻を localStorage に置く。
 * 値 = {"first": 初回の時刻, "peers": {"<相手の hex>": 既読時刻}}（unix 秒）
 */
const SEEN_KEY_PREFIX = "nostrism.dm.seen.";

function seenKey(me: string): string {
  return `${SEEN_KEY_PREFIX}${me}`;
}

type Seen = { first: number; peers: Record<string, number> };

type DmSeenState = {
  /** 読み込んだアカウント。null = 未ログイン */
  me: string | null;
  /** 記録の無い相手の既読時刻（初回の時刻。これより前の DM は未読にしない） */
  first: number;
  /** 相手ごとの既読時刻 */
  peers: Record<string, number>;
};

/** DM の既読（メモリ上）。書き込みは loadSeen / markSeen / clearSeen、localStorage はその写し */
export const useDmSeen = create<DmSeenState>()(() => ({ me: null, first: 0, peers: {} }));

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 保存値。無い・壊れていれば null（相手ごとの値は読めるものだけ残す） */
function read(me: string): Seen | null {
  let value: unknown;
  try {
    const text = localStorage.getItem(seenKey(me));
    if (text === null) return null;
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { first, peers } = value as Record<string, unknown>;
  if (!isTime(first)) return null;
  if (typeof peers !== "object" || peers === null || Array.isArray(peers)) return null;
  const result: Record<string, number> = {};
  for (const [peer, at] of Object.entries(peers)) if (isTime(at)) result[peer] = at;
  return { first, peers: result };
}

function write(me: string, seen: Seen) {
  try {
    localStorage.setItem(seenKey(me), JSON.stringify(seen));
  } catch {
    // 保存できない環境（容量超過・プライベートモード等）はメモリ上の状態だけで続ける
  }
}

/** 保存値を読んでストアへ。無い（壊れている）ときは今を初回の時刻として書く（ネイティブ loadUnreadSeen） */
export function loadSeen(me: string, now = unixNow()): void {
  let seen = read(me);
  if (seen === null) {
    seen = { first: now, peers: {} };
    write(me, seen);
  }
  useDmSeen.setState({ me, first: seen.first, peers: seen.peers });
}

/**
 * 相手との会話を既読にする（ネイティブ markDmSeen）。基準は「今」と「相手の最新の発言」の大きい方
 * （相手の時計が進んでいても既読になる）。進むときだけ書く。me の既読を読み込んでいなければ何もしない。
 */
export function markSeen(me: string, peer: string, newestFromPeer: number, now = unixNow()): void {
  const state = useDmSeen.getState();
  if (state.me !== me) return;
  const mark = Math.max(now, newestFromPeer);
  if (mark <= (state.peers[peer] ?? 0)) return;
  const peers = { ...state.peers, [peer]: mark };
  useDmSeen.setState({ peers });
  write(me, { first: state.first, peers });
}

/** 保存値を消す（ログアウト・アカウントの切り替え。誰と DM しているかを残さない） */
export function clearSeen(me: string): void {
  try {
    localStorage.removeItem(seenKey(me));
  } catch {
    // 消せない環境は何もしない
  }
  if (useDmSeen.getState().me === me) useDmSeen.setState({ me: null, first: 0, peers: {} });
}
