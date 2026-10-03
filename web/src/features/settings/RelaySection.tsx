import { use$ } from "applesauce-react/hooks/use-$";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { map } from "rxjs";
import { useT } from "../../i18n";
import { displayRelayUrl } from "../../nostr/outbox";
import { addRelay, type RelayRow, removeRelay, setRelayReadWrite, useRelayRows } from "../../nostr/pool";
import { type AuthPolicy, setAuthPolicy, useAuthPolicy } from "../../nostr/relayAuth";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { parseRelayInput, publishRelayList, RelayListError } from "./relayList";
import {
  RELAY_PRESET_CATEGORY_LABEL,
  RELAY_PRESETS,
  type RelayPresetCategory,
  type RelayRec,
  relayRecs$,
} from "./relayRecs";
import styles from "./SettingsSections.module.css";

/** 各行の source のヒント文言（ネイティブ RelaySettings の HintText と同じ意味。#585） */
const SOURCE_LABEL: Record<RelayRow["source"], string> = { nip65: "NIP-65", manual: "手動", default: "既定" };

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
 * リレー（ネイティブ RelaySettings）。追加 / 削除 / Read・Write の切替は pool.ts のリレー表へ即反映し、
 * 接続先がすぐ変わる（#585）。「保存」は今の一覧を NIP-65（kind:10002）として公開するだけ
 * （直前に最新の kind:10002 を取り直し、取れなければ公開しない。basedOnId が食い違えば stale。#478）。
 */
export function RelaySection() {
  const t = useT();
  const me = useSession((s) => s.pubkey);
  const rows = useRelayRows();
  // 一覧はネイティブ allRelays（ORDER BY source ASC, url ASC）と同じ並び: 既定 → 手動 → NIP-65、URL 昇順
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.source.localeCompare(b.source) || a.url.localeCompare(b.url)),
    [rows],
  );
  // 保存の直前の取り直しと突き合わせる、今わかっている自分の kind:10002 の id
  const latest = use$(
    () =>
      me ? eventStore.timeline({ kinds: [10002], authors: [me] }).pipe(map(([e]) => e ?? null)) : undefined,
    [me],
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setConfirming(false);
    if (!me) return;
    setSaving(true);
    try {
      const prefs = rows.map(({ url, read, write }) => ({ url, read, write }));
      await publishRelayList(me, prefs, latest?.id ?? null);
      showToast("リレーリストを公開しました");
    } catch (e) {
      showToast(failureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && rows.some((r) => r.read || r.write);

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>取得・配信に使うリレー（NIP-65 Inbox/Outbox）</h3>
        <p className={styles.desc}>
          Read = Inbox（購読・取得に使う）/ Write = Outbox（投稿を送る）。追加・削除・切替はすぐに接続先へ
          反映します。「保存」で今の内容を kind:10002 として公開します。
        </p>
        <AddRelayForm list={rows} onAdd={(url) => addRelay(url)} />
        <button
          type="button"
          className={`${styles.primary} ${styles.alignStart}`}
          disabled={!canSave}
          onClick={() => setConfirming(true)}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <AuthPolicyBlock />
      <div className={styles.block}>
        <ul className={styles.relays} aria-label="リレーの一覧">
          {sortedRows.map((row) => (
            <RelayRowItem
              key={row.url}
              row={row}
              onChange={(read, write) => setRelayReadWrite(row.url, read, write)}
              onRemove={() => removeRelay(row.url)}
            />
          ))}
        </ul>
        {rows.length === 0 && <p className={styles.desc}>リレーがありません</p>}
        <RelayRecsBlock me={me} list={rows} onAdd={(url) => addRelay(url)} />
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("relays_publish_title")}
          text={t("web_relays_publish_text")}
          confirmLabel={t("relays_publish_confirm")}
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
 * 集計できなければ定番の候補（RELAY_PRESETS）。押すと即座にリレー表へ追加する（手動扱い。#585）。
 */
function RelayRecsBlock({
  me,
  list,
  onAdd,
}: {
  me: string | null;
  list: readonly RelayRow[];
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

/** 候補のチップ（ネイティブ PresetChip。「＋」+ ホスト名 + 補足）。押すと即座に足す */
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

function AddRelayForm({ list, onAdd }: { list: readonly RelayRow[]; onAdd(url: string): void }) {
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

function RelayRowItem({
  row,
  onChange,
  onRemove,
}: {
  row: RelayRow;
  onChange(read: boolean, write: boolean): void;
  onRemove(): void;
}) {
  const label = displayRelayUrl(row.url);
  return (
    <li className={styles.relay}>
      <span className={styles.relayUrl} title={row.url}>
        {label}
      </span>
      <span className={styles.relayMeta}>{SOURCE_LABEL[row.source]}</span>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={row.read}
          aria-label={`${label} の Read`}
          onChange={(e) => onChange(e.target.checked, row.write)}
        />
        Read
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={row.write}
          aria-label={`${label} の Write`}
          onChange={(e) => onChange(row.read, e.target.checked)}
        />
        Write
      </label>
      <button type="button" className={styles.textButton} aria-label={`${label} を削除`} onClick={onRemove}>
        削除
      </button>
    </li>
  );
}
