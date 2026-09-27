import { use$ } from "applesauce-react/hooks/use-$";
import { type FormEvent, useId, useMemo, useState } from "react";
import { map } from "rxjs";
import { displayRelayUrl, type RelayPref, relayPrefsFromEvent } from "../../nostr/outbox";
import { useRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { parseRelayInput, prefsFromRelaySet, publishRelayList, RelayListError } from "./relayList";
import styles from "./SettingsSections.module.css";

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
 * リレー（ネイティブ RelaySettings）。一覧の Read / Write・削除・追加は手元の下書きで、
 * 「保存」で NIP-65（kind:10002）として公開する（直前に最新の kind:10002 を取り直し、取れなければ公開しない）。
 */
export function RelaySection() {
  const me = useSession((s) => s.pubkey);
  const read = useRelays((s) => s.read);
  const write = useRelays((s) => s.write);
  const source = useRelays((s) => s.source);
  const latest = use$(
    () =>
      me ? eventStore.timeline({ kinds: [10002], authors: [me] }).pipe(map(([e]) => e ?? null)) : undefined,
    [me],
  );
  // 自分の kind:10002 があればその内容、無ければ今のリレー集合
  const current = useMemo(
    () => (latest ? relayPrefsFromEvent(latest) : prefsFromRelaySet({ read, write })),
    [latest, read, write],
  );
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
      </div>
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
