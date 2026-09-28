import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { unixNow } from "../../lib/time";
import { OwnReplaceableUnreachableError, refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";

/** 編集できる項目（kind:0 のキー。表示名は name に入れる。ネイティブ AccountSettings と同じ 7 つ） */
export const PROFILE_FIELDS = ["name", "about", "picture", "banner", "lud16", "nip05", "website"] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** 編集欄の値 */
export type ProfileFields = Record<ProfileField, string>;

/** 発行で差し替える項目（空文字 = キーを消す） */
export type ProfileChanges = Partial<ProfileFields>;

/** 表示名を持つキー（name 以外。土台が持っていれば name と同じ値にする。ネイティブ publishProfile） */
const DISPLAY_NAME_KEYS = ["display_name", "displayName"] as const;

/**
 * unreachable = 直前の取り直しでどのリレーからも応答が無かった（古い版で上書きしうるので止めた）。
 * stale = 編集を始めた時点の版と、取り直した最新版が違う（別の端末・クライアントでの変更を消すので止めた）。
 */
export type ProfileEditFailure = "unreachable" | "stale" | PublishFailure;

export class ProfileEditError extends Error {
  readonly reason: ProfileEditFailure;

  constructor(reason: ProfileEditFailure, options?: ErrorOptions) {
    super(`profile edit failed: ${reason}`, options);
    this.name = "ProfileEditError";
    this.reason = reason;
  }
}

/** kind:0 の content を JSON オブジェクトとして読む。読めなければ null */
function contentObject(event: NostrEvent | null): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const json: unknown = JSON.parse(event.content);
    return typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 編集欄の初期値。表示名 = display_name → displayName → name の最初の空でない値、他は同名のキー
 * （文字列でない値は空欄）。
 */
export function profileFieldsOf(event: NostrEvent | null): ProfileFields {
  const json = contentObject(event) ?? {};
  const name =
    [json.display_name, json.displayName, json.name].map(stringOf).find((v) => v.trim() !== "") ?? "";
  return {
    name,
    about: stringOf(json.about),
    picture: stringOf(json.picture),
    banner: stringOf(json.banner),
    lud16: stringOf(json.lud16),
    nip05: stringOf(json.nip05),
    website: stringOf(json.website),
  };
}

/** 初期値から変えた項目（前後の空白は比べない。値は前後の空白を落とす） */
export function changedFields(initial: ProfileFields, current: ProfileFields): ProfileChanges {
  const changed: ProfileChanges = {};
  for (const field of PROFILE_FIELDS) {
    const value = current[field].trim();
    if (initial[field].trim() !== value) changed[field] = value;
  }
  return changed;
}

/**
 * 発行する content。取り直した版（base）の JSON を土台に、変えた項目だけ上書きし、空欄にした項目はキーを消す
 * （未知のキーはそのまま）。表示名は name に入れ、土台が display_name / displayName を持っていればそれも
 * 同じ値にする（空欄なら消す。ネイティブ publishProfile と同じ）。
 */
export function buildProfileContent(base: NostrEvent | null, changed: ProfileChanges): string {
  const json: Record<string, unknown> = { ...(contentObject(base) ?? {}) };
  for (const field of PROFILE_FIELDS) {
    const value = changed[field]?.trim();
    if (value === undefined) continue;
    if (value === "") delete json[field];
    else json[field] = value;
  }
  const name = changed.name?.trim();
  if (name !== undefined) {
    for (const key of DISPLAY_NAME_KEYS) {
      if (!(key in json)) continue;
      if (name === "") delete json[key];
      else json[key] = name;
    }
  }
  return JSON.stringify(json);
}

/** 発行する kind:0。tags は取り直した版のまま（未知のタグ・カスタム絵文字を残す） */
export function buildProfileTemplate(
  base: NostrEvent | null,
  changed: ProfileChanges,
  nowSec: number,
): EventTemplate {
  return {
    kind: 0,
    content: buildProfileContent(base, changed),
    tags: (base?.tags ?? []).map((t) => [...t]),
    // 同じ秒に続けて保存しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}

/**
 * プロフィール（kind:0）を発行する。直前に自分の kind:0 をリレーとインデクサから取り直し（#478 の規則）、
 * どのリレーからも応答が無ければ発行せず ProfileEditError("unreachable")、編集を始めた時点の版（basedOnId）と
 * 取り直した最新版が違えば発行せず ProfileEditError("stale")（relayList.ts の publishRelayList と同じ）。
 * 取り直した最新版の content を土台に変えた項目だけ差し替える（応答はあったが kind:0 が無ければ変えた項目だけ）。
 * 署名の失敗は同じ reason の ProfileEditError。
 */
export async function publishProfile(
  me: string,
  changed: ProfileChanges,
  /** 編集を始めた時点で画面に出ていた自分の kind:0 の id（無かったら null） */
  basedOnId: string | null,
): Promise<void> {
  let base: NostrEvent | null;
  try {
    base = await refetchOwnReplaceable(me, 0);
  } catch (e) {
    if (e instanceof OwnReplaceableUnreachableError) throw new ProfileEditError("unreachable", { cause: e });
    throw e;
  }
  if ((base?.id ?? null) !== basedOnId) throw new ProfileEditError("stale");

  try {
    await publishEvent(buildProfileTemplate(base, changed, unixNow()));
  } catch (e) {
    if (e instanceof PublishError) throw new ProfileEditError(e.reason, { cause: e });
    throw e;
  }
}
