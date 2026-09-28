import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { map } from "rxjs";
import { displayRelayUrl, type RelayPref, relayPrefsFromEvent } from "../../nostr/outbox";
import { useRelays } from "../../nostr/pool";
import { type AuthPolicy, setAuthPolicy, useAuthPolicy } from "../../nostr/relayAuth";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { parseRelayInput, prefsFromRelaySet, publishRelayList, RelayListError } from "./relayList";
import {
  RELAY_PRESET_CATEGORY_LABEL,
  RELAY_PRESETS,
  type RelayPresetCategory,
  type RelayRec,
  relayRecs$,
} from "./relayRecs";
import styles from "./SettingsSections.module.css";

/**
 * history の state のキー。値のリレーを read + write で下書きに足した状態でリレー設定を開く
 * （プロフィールの使用リレーの「追加」。発行は「保存」で）
 */
export const ADD_RELAY_STATE = "settingsAddRelay";

/** state の ADD_RELAY_STATE の値（wss:// の URL として読めれば正規化した URL）。無ければ null */
function relayToAddOf(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const value = (state as Record<string, unknown>)[ADD_RELAY_STATE];
  return typeof value === "string" ? parseRelayInput(value) : null;
}

/** list に url を read + write で足す（既にあれば read + write にする） */
function withRelay(list: readonly RelayPref[], url: string): RelayPref[] {
  if (!list.some((p) => p.url === url)) return [...list, { url, read: true, write: true }];
  return list.map((p) => (p.url === url ? { url, read: true, write: true } : p));
}

/**
 * 自分のリレーの一覧（リレー設定に最初に出す内容）。自分の kind:10002 があればその内容、無ければ今のリレー集合。
 * latest は自分の kind:10002（無ければ null、読み込み前は undefined）
 */
export function useOwnRelayPrefs(): { latest: NostrEvent | null | undefined; current: RelayPref[] } {
  const me = useSession((s) => s.pubkey);
  const read = useRelays((s) => s.read);
  const write = useRelays((s) => s.write);
  const latest = use$(
    () =>
      me ? eventStore.timeline({ kinds: [10002], authors: [me] }).pipe(map(([e]) => e ?? null)) : undefined,
    [me],
  );
  const current = useMemo(
    () => (latest ? relayPrefsFromEvent(latest) : prefsFromRelaySet({ read, write })),
    [latest, read, write],
  );
  return { latest, current };
}

/** 保存の失敗の文言 */
function failureMessage(e: unknown): string {
  if (e instanceof RelayListError && e.reason === "no-relay-list") {
    return "最新のリレーリストを取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください";
  }
  if (e instanceof RelayListError && e.reason === "stale") {
    return "リレーリストが更新されていたため、公開しませんでした。最新の内容を表示したので、確認してもう一度編集してください";
  }
  return "公開に失敗しました（鍵を確認してください）";
}

/**
 * リレー（ネイティブ RelaySettings）。一覧の Read / Write・削除・追加・候補からの追加は手元の下書きで、
 * 「保存」で NIP-65（kind:10002）として公開する（直前に最新の kind:10002 を取り直し、取れなければ公開しない）。
 * history の state に ADD_RELAY_STATE があれば、そのリレーを下書きに足して開く。
 */
export function RelaySection() {
  const me = useSession((s) => s.pubkey);
  const source = useRelays((s) => s.source);
  // 自分の kind:10002 があればその内容、無ければ今のリレー集合
  const { latest, current } = useOwnRelayPrefs();
  const [draft, setDraft] = useState<RelayPref[] | null>(null);
  // 編集を始めた時点の自分の kind:10002（無ければ null）。保存の直前に取り直した版と違えば公開しない
  const [basedOnId, setBasedOnId] = useState<string | null>(null);
  const list = draft ?? current;
  function edit(next: RelayPref[]) {
    if (draft === null) setBasedOnId(latest?.id ?? null);
    setDraft(next);
  }
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // プロフィールの使用リレーの「追加」から来たら下書きに足し、state から外す（戻る・再読み込みで足し直さない）
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = relayToAddOf(location.state);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 届いた URL ごとに 1 度だけ（list・location は開いた時点の値）
  useEffect(() => {
    if (!incoming) return;
    edit(withRelay(list, incoming));
    const { [ADD_RELAY_STATE]: _, ...rest } = location.state as Record<string, unknown>;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: rest });
  }, [incoming]);

  async function save() {
    setConfirming(false);
    if (!me) return;
    setSaving(true);
    try {
      await publishRelayList(me, list, draft === null ? (latest?.id ?? null) : basedOnId);
      setDraft(null);
      showToast("リレーリストを公開しました");
    } catch (e) {
      // 最新版と食い違っていたら下書きを捨てて最新の内容を出し直す
      if (e instanceof RelayListError && e.reason === "stale") setDraft(null);
      showToast(failureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && list.some((p) => p.read || p.write);

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>取得・配信に使うリレー（NIP-65 Inbox/Outbox）</h3>
        <p className={styles.desc}>
          Read = Inbox（購読・取得に使う）/ Write = Outbox（投稿を送る）。編集して「保存」で kind:10002
          を公開します。
        </p>
        {source === "saved" && (
          <p className={styles.note}>
            この端末には接続先（nostrism.relays）が保存されているため、公開しても接続先はその保存値のままです。
          </p>
        )}
        <AddRelayForm list={list} onAdd={(url) => edit([...list, { url, read: true, write: true }])} />
      </div>
      <div className={styles.block}>
        <ul className={styles.relays} aria-label="リレーの一覧">
          {list.map((p) => (
            <RelayRow
              key={p.url}
              pref={p}
              onChange={(next) => edit(list.map((q) => (q.url === p.url ? next : q)))}
              onRemove={() => edit(list.filter((q) => q.url !== p.url))}
            />
          ))}
        </ul>
        {list.length === 0 && <p className={styles.desc}>リレーがありません</p>}
        <button
          type="button"
          className={`${styles.primary} ${styles.alignStart}`}
          disabled={!canSave}
          onClick={() => setConfirming(true)}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <RelayRecsBlock me={me} list={list} onAdd={(url) => edit(withRelay(list, url))} />
      </div>
      <AuthPolicyBlock />
      {confirming && (
        <ConfirmDialog
          title="リレーリストを公開しますか？"
          text="現在の Read / Write の設定を kind:10002 として署名し、Write リレーとインデクサへ送ります。ネットワークに公開される操作です。"
          confirmLabel="公開する"
          onConfirm={() => void save()}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </>
  );
}

const AUTH_CHOICES: readonly { policy: AuthPolicy; label: string }[] = [
  { policy: "dm", label: "DM/自分のリレーのみ" },
  { policy: "always", label: "常に応答" },
  { policy: "off", label: "無効" },
];

/** AUTH（NIP-42）の応答ポリシー（ネイティブ RelaySettings の末尾と同じ 3 択） */
function AuthPolicyBlock() {
  const policy = useAuthPolicy((s) => s.policy);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>AUTH（NIP-42）への応答</h3>
      <p className={styles.desc}>
        AUTH必須リレーからのDM等を受け取るための認証です。応答すると自分の公開鍵をそのリレーに証明します。
      </p>
      <div className={styles.choices}>
        {AUTH_CHOICES.map((choice) => (
          <button
            key={choice.policy}
            type="button"
            className={styles.choice}
            aria-pressed={policy === choice.policy}
            onClick={() => setAuthPolicy(choice.policy)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 候補から追加（ネイティブ RelaySettings の「▼ 候補から追加（おすすめ）」）。一覧の下に折りたたみで出し、
 * 開いたらフォロー中の kind:10002 を集計して使っている人の多い順に出す（1 度だけ。登録済みは出さない）。
 * 集計できなければ定番の候補（RELAY_PRESETS）。押すと下書きに read + write で足す（発行は「保存」で）。
 */
function RelayRecsBlock({
  me,
  list,
  onAdd,
}: {
  me: string | null;
  list: readonly RelayPref[];
  onAdd(url: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [recs, setRecs] = useState<RelayRec[] | null>(null);
  // 集計から外す登録済み（開いた時点の一覧）
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    if (!open || recs !== null) return;
    if (!me) {
      setRecs([]);
      return;
    }
    const registered = new Set(listRef.current.map((p) => p.url));
    const sub = relayRecs$(me, registered).subscribe((next) => setRecs(next));
    return () => sub.unsubscribe();
  }, [open, recs, me]);

  const registered = new Set(list.map((p) => p.url));
  const remaining = (recs ?? []).filter((r) => !registered.has(r.url));

  return (
    <>
      <button
        type="button"
        className={`${styles.link} ${styles.alignStart}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▲ 候補を閉じる" : "▼ 候補から追加（おすすめ）"}
      </button>
      {open &&
        (recs === null ? (
          <p className={styles.desc}>フォロー中のリレーリスト(NIP-65)を集計中…</p>
        ) : recs.length > 0 ? (
          remaining.length > 0 && (
            <>
              <p className={styles.desc}>フォロー中でよく使われているリレー</p>
              <ul className={styles.chips} aria-label="おすすめのリレー">
                {remaining.map((r) => (
                  <li key={r.url}>
                    <RelayChip url={r.url} note={`${r.count}人`} onAdd={onAdd} />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : (
          <>
            <p className={styles.desc}>集計できませんでした（フォローが無い等）。定番の候補:</p>
            <PresetChips registered={registered} onAdd={onAdd} />
          </>
        ))}
    </>
  );
}

const PRESET_CATEGORIES: readonly RelayPresetCategory[] = ["general", "japan", "paid"];

/** 定番の候補（カテゴリ順に見出し付き。登録済みは出さない） */
function PresetChips({ registered, onAdd }: { registered: ReadonlySet<string>; onAdd(url: string): void }) {
  const presets = RELAY_PRESETS.flatMap((p) => {
    const url = parseRelayInput(p.url);
    return url && !registered.has(url) ? [{ ...p, url }] : [];
  });
  return PRESET_CATEGORIES.map((category) => {
    const items = presets.filter((p) => p.category === category);
    if (items.length === 0) return null;
    const label = RELAY_PRESET_CATEGORY_LABEL[category];
    return (
      <div key={category} className={styles.presetGroup}>
        <p className={styles.presetCategory}>{label}</p>
        <ul className={styles.chips} aria-label={`定番の候補（${label}）`}>
          {items.map((p) => (
            <li key={p.url}>
              <RelayChip url={p.url} note={p.note} onAdd={onAdd} />
            </li>
          ))}
        </ul>
      </div>
    );
  });
}

/** 候補のチップ（ネイティブ PresetChip。「＋」+ ホスト名 + 補足）。押すと下書きに足す */
function RelayChip({ url, note, onAdd }: { url: string; note?: string; onAdd(url: string): void }) {
  const label = displayRelayUrl(url);
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={note ? `${label} を追加（${note}）` : `${label} を追加`}
      onClick={() => onAdd(url)}
    >
      <span className={styles.chipPlus} aria-hidden="true">
        ＋
      </span>
      {label}
      {note && <span className={styles.chipNote}>{note}</span>}
    </button>
  );
}

function AddRelayForm({ list, onAdd }: { list: readonly RelayPref[]; onAdd(url: string): void }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = parseRelayInput(value);
    if (!url) {
      setError("wss:// で始まるリレーの URL を入力してください");
      return;
    }
    if (list.some((p) => p.url === url)) {
      setError("このリレーは追加済みです");
      return;
    }
    onAdd(url);
    setValue("");
    setError(null);
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <label htmlFor={inputId} className="srOnly">
        追加するリレーの URL
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="wss://…"
        value={value}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <button type="submit" className={styles.ghost} disabled={value.trim() === ""}>
        追加
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RelayRow({
  pref,
  onChange,
  onRemove,
}: {
  pref: RelayPref;
  onChange(next: RelayPref): void;
  onRemove(): void;
}) {
  const label = displayRelayUrl(pref.url);
  return (
    <li className={styles.relay}>
      <span className={styles.relayUrl} title={pref.url}>
        {label}
      </span>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={pref.read}
          aria-label={`${label} の Read`}
          onChange={(e) => onChange({ ...pref, read: e.target.checked })}
        />
        Read
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={pref.write}
          aria-label={`${label} の Write`}
          onChange={(e) => onChange({ ...pref, write: e.target.checked })}
        />
        Write
      </label>
      <button type="button" className={styles.textButton} aria-label={`${label} を削除`} onClick={onRemove}>
        削除
      </button>
    </li>
  );
}
