import type { EventPointer } from "applesauce-core/helpers/pointers";
import { getEventPointerFromETag, isEventPointer } from "applesauce-core/helpers/pointers";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { createAddressLoader } from "applesauce-loaders/loaders/address-loader";
import { createEventLoader } from "applesauce-loaders/loaders/event-loader";
import { use$ } from "applesauce-react/hooks/use-$";
import { type NostrEvent, verifyEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { catchError, type Observable, of } from "rxjs";
import { shortNpub } from "../lib/npub";
import { pool, readRelays$ } from "./pool";
import { eventStore, verifiedStoreActions } from "./store";

/**
 * 置換可能イベント（kind:0 プロフィール等）のバッチローダ。
 * 既定の 1,000ms / 200 件で溜めて 1 つの REQ にまとめ、結果は EventStore へ入る。
 */
export const addressLoader = createAddressLoader(pool, {
  eventStore: verifiedStoreActions,
  extraRelays: readRelays$,
});

/** ID 指定のイベント（リポスト元など）のバッチローダ。e タグのリレーヒントにも問い合わせる */
export const eventLoader = createEventLoader(pool, {
  eventStore: verifiedStoreActions,
  extraRelays: readRelays$,
});

// EventStore に無いものを読みに行く口。profile() / event() がストアに無いとき 1 度だけ呼ばれる
eventStore.eventLoader = (pointer) =>
  isEventPointer(pointer) ? eventLoader(pointer) : addressLoader(pointer);

/** pubkey のプロフィール（kind:0）。ストアに無ければ addressLoader でまとめて取りに行く */
export function useProfile(pubkey: string | undefined): ProfileContent | undefined {
  return use$(() => {
    if (!pubkey) return undefined;
    // 壊れた kind:0 で解析が例外を投げても、画面は「プロフィール無し」として描く
    return eventStore
      .profile(pubkey)
      .pipe(catchError<ProfileContent | undefined, Observable<undefined>>(() => of(undefined)));
  }, [pubkey]);
}

/**
 * 表示名（display_name → name の順）。無ければ hex の先頭 10 字（ネイティブの toNoteUi / profileFor と同じ）。
 * fallback = "npub" は npub の短縮（ネイティブのリアクションした人の一覧・投稿画面と同じ）。
 * kind:0 の中身は任意の JSON なので、文字列でない値は無視する。
 */
export function displayName(
  profile: ProfileContent | undefined,
  pubkey: string,
  fallback: "hex" | "npub" = "hex",
): string {
  for (const value of [profile?.display_name, profile?.displayName, profile?.name]) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return fallback === "npub" ? shortNpub(pubkey) : pubkey.slice(0, 10);
}

/** プロフィール画像の URL（文字列でなければ undefined） */
export function pictureOf(profile: ProfileContent | undefined): string | undefined {
  const picture: unknown = profile?.picture;
  return typeof picture === "string" && picture.trim() !== "" ? picture : undefined;
}

const embeddedCache = new WeakMap<NostrEvent, NostrEvent | null>();

/**
 * リポスト（kind:6/16）の content に埋め込まれた元投稿。
 * JSON として読めて、e タグの ID と一致し、署名が正しいものだけを使う。
 */
function embeddedRepost(repost: NostrEvent, pointer: EventPointer | null): NostrEvent | null {
  const cached = embeddedCache.get(repost);
  if (cached !== undefined) return cached;
  let result: NostrEvent | null = null;
  try {
    const value: unknown = repost.content ? JSON.parse(repost.content) : null;
    if (isEventShape(value) && (!pointer || value.id === pointer.id) && verifyEvent(value)) result = value;
  } catch {
    // 壊れた JSON は e タグでの解決に回す
  }
  embeddedCache.set(repost, result);
  return result;
}

function isEventShape(value: unknown): value is NostrEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.pubkey === "string" &&
    typeof e.sig === "string" &&
    typeof e.kind === "number" &&
    typeof e.created_at === "number" &&
    typeof e.content === "string" &&
    Array.isArray(e.tags)
  );
}

/**
 * pointer の投稿（引用元・返信先など）。ストアに無ければ eventLoader がリレーへ取りに行き、届くまでは undefined。
 * 購読は id で張り直す（同じ id の新しい pointer オブジェクトでは張り直さない）。
 */
export function useEventByPointer(pointer: EventPointer | null): NostrEvent | undefined {
  return use$(() => (pointer ? eventStore.event(pointer) : undefined), [pointer?.id]);
}

/**
 * リポスト元の投稿。content の JSON を優先し、無ければ e タグの ID を EventStore から引く
 * （ストアに無ければ eventLoader がリレーへ取りに行く）。解決できるまでは undefined。
 */
export function useRepostedEvent(repost: NostrEvent): NostrEvent | undefined {
  const pointer = useMemo(() => {
    const tag = repost.tags.find((t) => t[0] === "e");
    return tag ? getEventPointerFromETag(tag) : null;
  }, [repost]);
  const embedded = useMemo(() => embeddedRepost(repost, pointer), [repost, pointer]);
  const loaded = use$(
    () => (embedded || !pointer ? undefined : eventStore.event(pointer)),
    [embedded, pointer],
  );
  return embedded ?? loaded;
}
