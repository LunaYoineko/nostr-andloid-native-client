import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { map } from "rxjs";
import { displayRelayUrl } from "../../nostr/outbox";
import { useRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { dmRelaysFromEvent } from "../dm/dmRelays";
import { DmRelayListError, dmRelaysFromReads, publishDmRelayList } from "./dmRelayList";
import { type DmRelayRec, dmRelayRecs$ } from "./dmRelayRecs";
import { parseRelayInput } from "./relayList";
import styles from "./SettingsSections.module.css";

/**
 * 自分の DM リレー（kind:10050）の一覧（DM リレー設定に最初に出す内容）。無ければ空（自動作成はここでは
 * しない。dmRelays.ts の ownDmRelaysOrSeed の仕事）。latest は自分の kind:10050（無ければ null、読み込み前は undefined）
 */
export function useOwnDmRelays(): { latest: NostrEvent | null | undefined; urls: string[] } {
  const me = useSession((s) => s.pubkey);
  const latest = use$(
    () =>
      me ? eventStore.timeline({ kinds: [10050], authors: [me] }).pipe(map(([e]) => e ?? null)) : undefined,
    [me],
  );
  const urls = useMemo(() => (latest ? dmRelaysFromEvent(latest) : []), [latest]);
  return { latest, urls };
}

/** 保存の失敗の文言（relayList.ts の failureMessage と同じ考え方） */
function failureMessage(e: unknown): string {
  if (e instanceof DmRelayListError && e.reason === "no-relay-list") {
    return "最新のDMリレーを取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください";
  }
  if (e instanceof DmRelayListError && e.reason === "stale") {
    return "DMリレーが更新されていたため、公開しませんでした。最新の内容を表示したので、確認してもう一度編集してください";
  }
  return "公開に失敗しました（鍵を確認してください）";
}

/**
 * DMリレー（ネイティブ DmRelaySettings。NIP-17 / kind:10050）。一覧の削除・追加・「現在の受信リレーから作成」・
 * おすすめからの追加は手元の下書きで、「保存」で公開する（直前に最新の kind:10050 を取り直し、
 * どのリレーからも応答が無い・取り直した版が編集開始時と違えば公開しない。#478 の規則）。
 */
export function DmRelaySection() {
  const me = useSession((s) => s.pubkey);
  const read = useRelays((s) => s.read);
  const { latest, urls } = useOwnDmRelays();
  const [draft, setDraft] = useState<string[] | null>(null);
  // 編集を始めた時点の自分の kind:10050（無ければ null）。保存の直前に取り直した版と違えば公開しない
  const [basedOnId, setBasedOnId] = useState<string | null>(null);
  const list = draft ?? urls;
  function edit(next: string[]) {
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
      await publishDmRelayList(me, list, draft === null ? (latest?.id ?? null) : basedOnId);
      setDraft(null);
      showToast("DMリレーを公開しました");
    } catch (e) {
      // 最新版と食い違っていたら下書きを捨てて最新の内容を出し直す
      if (e instanceof DmRelayListError && e.reason === "stale") setDraft(null);
      showToast(failureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const reads = useMemo(() => dmRelaysFromReads(read), [read]);

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>DMの受信リレー（NIP-17 / kind:10050）</h3>
        <p className={styles.desc}>
          ここに宣言したリレーへ相手からのDMが届きます。プライバシー保護のため少数の専用リレーを推奨。未設定なら初回送信時に受信リレーから自動作成します。
        </p>
        <AddDmRelayForm list={list} onAdd={(url) => edit([...list, url])} />
      </div>
      <div className={styles.block}>
        {list.length === 0 ? (
          <>
            <p className={styles.desc}>未設定です。</p>
            {reads.length > 0 && (
              <button
                type="button"
                className={`${styles.ghost} ${styles.alignStart}`}
                onClick={() => edit(reads)}
              >
                現在の受信リレーから作成
              </button>
            )}
          </>
        ) : (
          <ul className={styles.relays} aria-label="DMリレーの一覧">
            {list.map((url) => (
              <li key={url} className={styles.relay}>
                <span className={styles.relayUrl} title={url}>
                  {displayRelayUrl(url)}
                </span>
                <button
                  type="button"
                  className={styles.textButton}
                  aria-label={`${displayRelayUrl(url)} を削除`}
                  onClick={() => edit(list.filter((u) => u !== url))}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={`${styles.primary} ${styles.alignStart}`}
          disabled={saving}
          onClick={() => setConfirming(true)}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <DmRelayRecsBlock
          me={me}
          list={list}
          onAdd={(url) => edit(list.includes(url) ? list : [...list, url])}
        />
      </div>
      {confirming && (
        <ConfirmDialog
          title="DMリレーを公開しますか？"
          text="宣言した受信リレーを kind:10050 として署名し、Write リレーとインデクサへ送ります。ネットワークに公開される操作です。"
          confirmLabel="公開する"
          onConfirm={() => void save()}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/** DM リレーの追加フォーム（RelaySection.tsx の AddRelayForm と同じ体裁） */
function AddDmRelayForm({ list, onAdd }: { list: readonly string[]; onAdd(url: string): void }) {
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
    if (list.includes(url)) {
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
        追加するDMリレーの URL
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

/**
 * 候補から追加（ネイティブ DmRelaySettings の「▼ 候補から追加（おすすめ）」）。折りたたみで出し、
 * 開いたらフォロー中の kind:10050 を集計して使っている人の多い順に出す（1 度だけ。登録済みは出さない）。
 * 静的なフォールバックは置かない（DM リレーは AUTH 等の適性が要り、未検証の一覧を出すのは危険なため）。
 * 押すと下書きに足す（発行は「保存」で）。
 */
function DmRelayRecsBlock({
  me,
  list,
  onAdd,
}: {
  me: string | null;
  list: readonly string[];
  onAdd(url: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [recs, setRecs] = useState<DmRelayRec[] | null>(null);
  // 集計から外す登録済み（開いた時点の一覧）
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    if (!open || recs !== null) return;
    if (!me) {
      setRecs([]);
      return;
    }
    const registered = new Set(listRef.current);
    const sub = dmRelayRecs$(me, registered).subscribe((next) => setRecs(next));
    return () => sub.unsubscribe();
  }, [open, recs, me]);

  const registered = new Set(list);
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
          <p className={styles.desc}>フォロー中のDMリレー(kind:10050)を集計中…</p>
        ) : recs.length > 0 ? (
          remaining.length > 0 && (
            <>
              <p className={styles.desc}>フォロー中がDM受信に使っているリレー</p>
              <ul className={styles.chips} aria-label="おすすめのDMリレー">
                {remaining.map((r) => (
                  <li key={r.url}>
                    <DmRelayChip url={r.url} note={`${r.count}人`} onAdd={onAdd} />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : (
          <p className={styles.desc}>
            集計できませんでした（フォローが無い・kind:10050 を公開している人がいない等）。
          </p>
        ))}
    </>
  );
}

/** 候補のチップ（RelaySection.tsx の RelayChip と同じ体裁） */
function DmRelayChip({ url, note, onAdd }: { url: string; note: string; onAdd(url: string): void }) {
  const label = displayRelayUrl(url);
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={`${label} を追加（${note}）`}
      onClick={() => onAdd(url)}
    >
      <span className={styles.chipPlus} aria-hidden="true">
        ＋
      </span>
      {label}
      <span className={styles.chipNote}>{note}</span>
    </button>
  );
}
