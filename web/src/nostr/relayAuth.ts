import { normalizeURL } from "applesauce-core/helpers/url";
import type { AuthSigner } from "applesauce-relay/types";
import {
  combineLatest,
  distinctUntilChanged,
  map,
  Observable,
  of,
  Subscription,
  shareReplay,
  switchMap,
} from "rxjs";
import { create } from "zustand";
import { currentSigner, useSession } from "../signer/session";
import { pool, type RelaySet, useRelays } from "./pool";
import { eventStore } from "./store";

/** AUTH（NIP-42）に応答する範囲。値は NIP-78 同期（#468）のキー nip42_auth_policy と同じ形 */
export const AUTH_POLICY_KEY = "nostrism.nip42AuthPolicy";

/** dm = 自分のリレーと DM リレー（kind:10050）だけ、always = すべて、off = 応答しない（ネイティブ AuthPolicy） */
export type AuthPolicy = "dm" | "always" | "off";

/** 既定はネイティブと同じ dm（応答先を最小にする） */
export const DEFAULT_AUTH_POLICY: AuthPolicy = "dm";

function readAuthPolicy(): AuthPolicy {
  try {
    const raw = localStorage.getItem(AUTH_POLICY_KEY);
    return raw === "dm" || raw === "always" || raw === "off" ? raw : DEFAULT_AUTH_POLICY;
  } catch {
    return DEFAULT_AUTH_POLICY;
  }
}

/** AUTH の応答ポリシー（設定 > リレー） */
export const useAuthPolicy = create<{ policy: AuthPolicy }>()(() => ({ policy: readAuthPolicy() }));

export function setAuthPolicy(policy: AuthPolicy): void {
  useAuthPolicy.setState({ policy });
  try {
    localStorage.setItem(AUTH_POLICY_KEY, policy);
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

function normalized(url: string): string | null {
  try {
    return normalizeURL(url);
  } catch {
    return null;
  }
}

/**
 * AUTH（NIP-42）のチャレンジを一度でも送ってきたリレー（正規化 URL）。挙動1.7: nevent / nprofile の
 * リレーヒントから、AUTH を要求してくるリレーを除く（`relayHints.ts` の `excluded` に足す）ための集合。
 * 応答したかどうかは問わない（チャレンジが来た時点で記録する）。
 */
const requestedAuth = new Set<string>();

/** requestedAuth の読み取り専用ビュー */
export function authRequestedRelays(): ReadonlySet<string> {
  return requestedAuth;
}

/**
 * この URL の AUTH の要求に応答するか（ネイティブ shouldAuth）。dm = 自分の read / write リレーか
 * 自分の kind:10050 のリレー（正規化して比べる）
 */
export function shouldAuth(
  url: string,
  policy: AuthPolicy,
  ownRelays: readonly string[],
  dmRelays: readonly string[],
): boolean {
  if (policy === "off") return false;
  if (policy === "always") return true;
  const key = normalized(url);
  if (key === null) return false;
  return [...ownRelays, ...dmRelays].some((relay) => normalized(relay) === key);
}

/** AUTH に使うリレーの部分（applesauce-relay の Relay。テストでは偽物に差し替える） */
export type AuthRelay = {
  url: string;
  challenge$: Observable<string | null>;
  connected$: Observable<boolean>;
  authenticate(signer: AuthSigner): Promise<unknown>;
};

/** 判定に使う状態。変わったら、まだ応答していないリレーを判定し直す（ログイン・kind:10050 の到着など） */
type AuthContext = { policy: AuthPolicy; own: readonly string[]; dm: readonly string[] };

/** zustand のストアの値の変化（購読した時点の値から流す） */
function storeValue$<S, T>(
  store: { getState(): S; subscribe(listener: (state: S) => void): () => void },
  select: (state: S) => T,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    subscriber.next(select(store.getState()));
    return store.subscribe((state) => subscriber.next(select(state)));
  }).pipe(distinctUntilChanged());
}

function ownRelaysOf(set: RelaySet): readonly string[] {
  return [...set.read, ...set.write];
}

function authContext$(): Observable<AuthContext> {
  const me$ = storeValue$(useSession, (s) => (s.status === "in" ? s.pubkey : null));
  // 自分の kind:10050 の relay タグ（判定のときに正規化する）
  const dm$ = me$.pipe(
    switchMap((me) =>
      me
        ? eventStore
            .replaceable({ kind: 10050, pubkey: me })
            .pipe(
              map((event) =>
                event
                  ? event.tags.filter((t) => t[0] === "relay" && typeof t[1] === "string").map((t) => t[1])
                  : [],
              ),
            )
        : of([]),
    ),
  );
  return combineLatest({
    policy: storeValue$(useAuthPolicy, (s) => s.policy),
    own: storeValue$(useRelays, ownRelaysOf),
    dm: dm$,
    // ログインしたら判定し直す（署名者ができる）
    me: me$,
  }).pipe(map(({ policy, own, dm }) => ({ policy, own, dm })));
}

/**
 * 1 つのリレーのチャレンジに応答する。同じリレーへの署名は接続ごとに 1 回だけ（同じチャレンジの再送・
 * 判定のし直しでは署名しない。NIP-07 の承認を連打させない）。切断したら応答済みを忘れる（ネイティブ ensureRelay の DISCONNECTED）。
 * 署名者が無ければ応答済みにしない（ログイン後に応答する）。署名・送信の失敗は無視する
 */
function watchOne(relay: AuthRelay, context$: Observable<AuthContext>): Subscription {
  let answered = false;
  const subscription = new Subscription();
  subscription.add(
    relay.connected$.subscribe((connected) => {
      if (!connected) answered = false;
    }),
  );
  subscription.add(
    combineLatest([relay.challenge$, context$]).subscribe(([challenge, context]) => {
      if (!challenge) return;
      const key = normalized(relay.url);
      if (key !== null) requestedAuth.add(key);
      if (answered) return;
      if (!shouldAuth(relay.url, context.policy, context.own, context.dm)) return;
      const signer = currentSigner();
      if (!signer) return;
      answered = true;
      // kind:22242（relay / challenge タグ、content ""）を applesauce-relay が組み立てて送る。
      // authenticate はチャレンジが無いと同期で投げるので Promise の中で呼ぶ
      Promise.resolve()
        .then(() => relay.authenticate({ signEvent: (template) => signer.signEvent(template) }))
        .catch(() => {});
    }),
  );
  return subscription;
}

/**
 * プールの各リレーの AUTH のチャレンジに、ポリシーが許すときだけ currentSigner() で応答する。
 * 成立後の購読の張り直しは pool.ts（liveReq）が行う。戻り値で監視をやめる
 */
export function watchRelayAuth(target: { relays$: Observable<ReadonlyMap<string, AuthRelay>> }): () => void {
  const context$ = authContext$().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  const watching = new Map<AuthRelay, Subscription>();
  const outer = target.relays$.subscribe((relays) => {
    const current = new Set(relays.values());
    for (const relay of current) {
      if (!watching.has(relay)) watching.set(relay, watchOne(relay, context$));
    }
    for (const [relay, subscription] of watching) {
      if (current.has(relay)) continue;
      subscription.unsubscribe();
      watching.delete(relay);
    }
  });
  return () => {
    outer.unsubscribe();
    for (const subscription of watching.values()) subscription.unsubscribe();
    watching.clear();
  };
}

/** 起動時に 1 度: アプリのプールで AUTH に応答する（NIP-46 の専用プールは nip46.ts が別に応答する） */
export function startRelayAuth(): () => void {
  return watchRelayAuth(pool);
}
