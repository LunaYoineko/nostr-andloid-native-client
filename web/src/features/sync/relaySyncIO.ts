import type { Filter } from "applesauce-core/helpers/filter";
import type { NostrEvent } from "nostr-tools/pure";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { type ColumnSpec, DEFAULT_COLUMNS, decodeDeckColumns, encodeDeckColumns } from "../../lib/columns";
import { OwnReplaceableUnreachableError, refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { readRelays, requestOnce, writeRelays } from "../../nostr/pool";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { pinnedColumns, useDeck } from "../../store/deck";
import { decodeSettingsPayload, mergeSettingsContent, readCurrentSyncSettings } from "./settingsSync";

/**
 * [#468] リレー同期（NIP-78 kind:30078）のリレーとの行き来。ネイティブ EventRepository.kt の
 * fetchRelaySync / publishSettingsSync / publishDeckColumnsSync（840〜970行付近）の写しだが、
 * 発行の直前の安全確認（#478 の規則）は Web だけの追加。
 *
 * ここには「起動時に自動で読み込む・変更のたびに自動で保存する」処理は無い（ネイティブと同じ方針。
 * 設定画面の「リレーへ保存」「リレーから読み込む」からしか呼ばれない）。
 */

/** 設定スナップショットの d タグ（ネイティブ EventRepository.SETTINGS_SYNC_D と同じ）。 */
export const SETTINGS_SYNC_D = "nostrism-settings";
/** カラム構成の d タグ（ネイティブ EventRepository.DECK_COLUMNS_D と同じ）。 */
export const DECK_COLUMNS_D = "app.nostrdeck:deck-columns";

/** 「リレーから読み込む」の打ち切り（両方そろうか、この時間で終わる）。 */
export const RELAY_SYNC_LOAD_TIMEOUT_MS = 6_000;

/**
 * この端末が最後に読み込んだ・保存した版の id を控える localStorage キー（アカウントごと・d タグごと）。
 * 形は { "<pubkey>": { "<d タグ>": "<event id>" | null } }（別のアカウントの版と照合しない）。
 */
export const BASED_ON_KEY = "nostrism.sync.basedOn";

type BasedOnMap = Record<string, Record<string, string | null>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBasedOnMap(): BasedOnMap {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BASED_ON_KEY) ?? "{}");
    if (!isPlainObject(value)) return {};
    const map: BasedOnMap = {};
    for (const [pubkey, byD] of Object.entries(value)) {
      if (!isPlainObject(byD)) continue;
      map[pubkey] = {};
      for (const [d, id] of Object.entries(byD)) map[pubkey][d] = typeof id === "string" ? id : null;
    }
    return map;
  } catch {
    // 壊れた保存値は「一度も読み込み・保存していない」扱いへ
    return {};
  }
}

/** この端末がこのアカウントで最後に読み込んだ・保存した版の id（一度も無ければ null）。 */
export function basedOnIdFor(me: string, d: string): string | null {
  return readBasedOnMap()[me]?.[d] ?? null;
}

function writeBasedOn(me: string, d: string, eventId: string | null): void {
  const map = readBasedOnMap();
  map[me] = { ...map[me], [d]: eventId };
  try {
    localStorage.setItem(BASED_ON_KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても今回の発行は済んでいる（次回また取り直して比べるだけ）
  }
}

/** テスト専用: 保存済みの basedOn を消す。 */
export function clearBasedOnForTest(): void {
  try {
    localStorage.removeItem(BASED_ON_KEY);
  } catch {
    // noop
  }
}

function syncRelays(): string[] {
  return [...new Set([...readRelays(), ...writeRelays(), ...INDEXER_RELAYS])];
}

/** 取得したスナップショット。null のフィールド = リレーに未保存、または content の形が不正。 */
export type RelaySyncSnapshot = {
  settings: Record<string, string> | null;
  columns: ColumnSpec[] | null;
};

/**
 * 自分の 30078（設定 + カラム構成）を一時 REQ で取得する（手動ロード）。両方そろうか timeoutMs で打ち切り。
 * どのリレーからも応答が無ければ RelaySyncError("unreachable")。
 * 読み込めた版の id を basedOn へ控える（次の「リレーへ保存」の照合はここが基準になる）。
 */
export async function loadRelaySync(
  me: string,
  timeoutMs = RELAY_SYNC_LOAD_TIMEOUT_MS,
): Promise<RelaySyncSnapshot> {
  const filters: Filter[] = [
    { kinds: [30078], authors: [me], "#d": [SETTINGS_SYNC_D], limit: 1 },
    { kinds: [30078], authors: [me], "#d": [DECK_COLUMNS_D], limit: 1 },
  ];
  // complete = 少なくとも 1 つのリレーが応答した、error = どこからも応答が無かった
  const reached = await new Promise<boolean>((resolve) => {
    requestOnce(syncRelays(), filters, timeoutMs).subscribe({
      complete: () => resolve(true),
      error: () => resolve(false),
    });
  });
  // 「リレーに無い」と区別する。basedOn も控えない（手元の古い版を基準にしない）
  if (!reached) throw new RelaySyncError("unreachable");
  const settingsEvent = eventStore.getReplaceable(30078, me, SETTINGS_SYNC_D) ?? null;
  const columnsEvent = eventStore.getReplaceable(30078, me, DECK_COLUMNS_D) ?? null;
  writeBasedOn(me, SETTINGS_SYNC_D, settingsEvent?.id ?? null);
  writeBasedOn(me, DECK_COLUMNS_D, columnsEvent?.id ?? null);
  return {
    settings: settingsEvent ? (decodeSettingsPayload(settingsEvent.content)?.settings ?? null) : null,
    columns: columnsEvent ? decodeDeckColumns(columnsEvent.content) : null,
  };
}

/**
 * [#468] データ保護5: 固定カラムが既定（DEFAULT_COLUMNS）から1つも変えられていないか。
 * これが理由だけでカラム構成を発行しない（ネイティブの作り込んだ構成を、初回起動のままの
 * Web の既定で上書きしないため）。
 */
export function isDefaultColumnsUnchanged(columns: readonly ColumnSpec[]): boolean {
  return encodeDeckColumns(columns) === encodeDeckColumns(DEFAULT_COLUMNS);
}

/**
 * unreachable = 発行直前の取り直しでどのリレーからも応答が無かった（#478）。
 * stale = 取り直した最新版の id が、この端末が最後に読み込んだ・保存した版と違う
 * （別の端末で更新されている。上書きすると消えるので止めた）。
 * unknown-format = リレー上の版にこの Web が読めない形（新しい version・壊れた JSON・知らない種類のカラム）が
 * 含まれている（上書きするとその部分が消えるので止めた）。
 */
export type RelaySyncFailure = "unreachable" | "stale" | "unknown-format" | PublishFailure;

export class RelaySyncError extends Error {
  readonly reason: RelaySyncFailure;

  constructor(reason: RelaySyncFailure, options?: ErrorOptions) {
    super(`relay sync failed: ${reason}`, options);
    this.name = "RelaySyncError";
    this.reason = reason;
  }
}

export type PublishRelaySyncResult = { columnsPublished: boolean };

/** d タグを先頭に置き、取り直した版にあった他のタグ（Web が知らないもの）はそのまま後ろに残す（#478） */
function tagsKeeping(latest: NostrEvent | null, d: string): string[][] {
  return [["d", d], ...(latest?.tags.filter((t) => t[0] !== "d") ?? [])];
}

/** カラム構成の content を、1 行も落とさずに読めるか（知らない種類・壊れた行があれば false） */
function isFullyReadableColumns(content: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return false;
  }
  return Array.isArray(raw) && decodeDeckColumns(content)?.length === raw.length;
}

async function publishOrThrow(draft: {
  kind: number;
  content: string;
  tags: string[][];
}): Promise<NostrEvent> {
  try {
    return await publishEvent(draft);
  } catch (e) {
    if (e instanceof PublishError) throw new RelaySyncError(e.reason, { cause: e });
    throw e;
  }
}

/**
 * 設定スナップショットとカラム構成を kind:30078 として発行する（手動保存。ネイティブ
 * publishSettingsSync + publishDeckColumnsSync に相当）。
 *
 * 発行の直前に2つの d タグを read ∪ write ∪ INDEXER_RELAYS へ取り直し（refetchOwnReplaceable、
 * #478 の規則）、次のどれかなら 1 件も発行しない:
 *  - どのリレーからも応答が無い（unreachable）
 *  - 取り直した版の id が basedOn（このアカウントで最後に読み込んだ・保存した版）と違う（stale）
 *  - 取り直した版に Web が読めない形がある（unknown-format。上書きで消さない）
 *
 * 設定は、取り直したリモートの content を Web が知らない部分（キー・文字列でない値・トップレベルの項目）ごと
 * 残し、ホワイトリストの 5 キーだけを Web の現在値で上書きして発行する（データ保護3）。タグも d 以外を残す。
 * カラム構成は、既定からまったく変えていなければ、それだけを理由に発行しない（データ保護5）。
 */
export async function publishRelaySync(me: string): Promise<PublishRelaySyncResult> {
  let settingsLatest: NostrEvent | null;
  let columnsLatest: NostrEvent | null;
  try {
    settingsLatest = await refetchOwnReplaceable(me, 30078, SETTINGS_SYNC_D);
    columnsLatest = await refetchOwnReplaceable(me, 30078, DECK_COLUMNS_D);
  } catch (e) {
    if (e instanceof OwnReplaceableUnreachableError) throw new RelaySyncError("unreachable", { cause: e });
    throw e;
  }
  if ((settingsLatest?.id ?? null) !== basedOnIdFor(me, SETTINGS_SYNC_D)) throw new RelaySyncError("stale");
  if ((columnsLatest?.id ?? null) !== basedOnIdFor(me, DECK_COLUMNS_D)) throw new RelaySyncError("stale");

  const settingsContent = mergeSettingsContent(settingsLatest?.content ?? null, readCurrentSyncSettings());
  if (settingsContent === null) throw new RelaySyncError("unknown-format");
  const localColumns = pinnedColumns(useDeck.getState());
  const publishColumns = !isDefaultColumnsUnchanged(localColumns);
  if (publishColumns && columnsLatest && !isFullyReadableColumns(columnsLatest.content))
    throw new RelaySyncError("unknown-format");

  const settingsSigned = await publishOrThrow({
    kind: 30078,
    content: settingsContent,
    tags: tagsKeeping(settingsLatest, SETTINGS_SYNC_D),
  });
  writeBasedOn(me, SETTINGS_SYNC_D, settingsSigned.id);
  if (!publishColumns) return { columnsPublished: false };

  const columnsSigned = await publishOrThrow({
    kind: 30078,
    content: encodeDeckColumns(localColumns),
    tags: tagsKeeping(columnsLatest, DECK_COLUMNS_D),
  });
  writeBasedOn(me, DECK_COLUMNS_D, columnsSigned.id);
  return { columnsPublished: true };
}
