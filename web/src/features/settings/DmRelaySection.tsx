import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { map } from "rxjs";
import { t, useT } from "../../i18n";
import { displayRelayUrl } from "../../nostr/outbox";
import { useRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
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

/** 公開の失敗の文言（relayList.ts の failureMessage と同じ考え方） */
function failureMessage(e: unknown): string {
  if (e instanceof DmRelayListError && e.reason === "no-relay-list") {
    return t("web_dmrelays_no_base");
  }
  if (e instanceof DmRelayListError && e.reason === "stale") {
    return t("web_dmrelays_stale");
  }
  return t("relays_publish_failed");
}

/**
 * DMリレー（ネイティブ DmRelaySettings。NIP-17 / kind:10050）。追加・削除・「現在の受信リレーから作成」・
 * おすすめからの追加は、その場で kind:10050 を再発行する（保存ボタン・確認ダイアログは無い。#586）。
 * 発行の直前に自分の最新版を取り直し、画面が直前に見ていた版（latest.id）と違えば発行しない（#478 の規則。
 * publishDmRelayList が持つ）。取り直した最新版は EventStore に入るので、一覧は自動でそれに戻る。
 */
export function DmRelaySection() {
  const t = useT();
  const me = useSession((s) => s.pubkey);
  const read = useRelays((s) => s.read);
  const { latest, urls } = useOwnDmRelays();
  const [busy, setBusy] = useState(false);

  async function run(next: string[]) {
    if (!me || busy) return;
    setBusy(true);
    try {
      await publishDmRelayList(me, next, latest?.id ?? null);
      showToast(t("web_dmrelays_published"));
    } catch (e) {
      showToast(failureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const reads = useMemo(() => dmRelaysFromReads(read), [read]);

  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>{t("dmrelay_title")}</h3>
        <p className={styles.desc}>{t("dmrelay_desc")}</p>
        <AddDmRelayForm list={urls} disabled={busy} onAdd={(url) => void run([...urls, url])} />
      </div>
      <div className={styles.block}>
        {urls.length === 0 ? (
          <>
            <p className={styles.desc}>{t("dmrelay_unset")}</p>
            {reads.length > 0 && (
              <button
                type="button"
                className={`${styles.ghost} ${styles.alignStart}`}
                disabled={busy}
                onClick={() => void run(reads)}
              >
                {t("dmrelay_create_from_reads")}
              </button>
            )}
          </>
        ) : (
          <ul className={styles.relays} aria-label={t("web_settings_dmrelay_list_label")}>
            {urls.map((url) => (
              <li key={url} className={styles.relay}>
                <span className={styles.relayUrl} title={url}>
                  {displayRelayUrl(url)}
                </span>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy}
                  aria-label={t("web_settings_relay_remove_label", displayRelayUrl(url))}
                  onClick={() => void run(urls.filter((u) => u !== url))}
                >
                  {t("common_delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <DmRelayRecsBlock
          me={me}
          list={urls}
          disabled={busy}
          onAdd={(url) => void run(urls.includes(url) ? urls : [...urls, url])}
        />
      </div>
    </>
  );
}

/** DM リレーの追加フォーム（RelaySection.tsx の AddRelayForm と同じ体裁） */
function AddDmRelayForm({
  list,
  disabled,
  onAdd,
}: {
  list: readonly string[];
  disabled: boolean;
  onAdd(url: string): void;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const url = parseRelayInput(value);
    if (!url) {
      setError(t("web_settings_relay_url_invalid"));
      return;
    }
    if (list.includes(url)) {
      setError(t("web_settings_relay_already_added"));
      return;
    }
    onAdd(url);
    setValue("");
    setError(null);
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <label htmlFor={inputId} className="srOnly">
        {t("web_settings_dmrelay_url_label")}
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
      <button type="submit" className={styles.ghost} disabled={disabled || value.trim() === ""}>
        {t("common_add")}
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
 * 押すとその場で発行する（#586）。
 */
function DmRelayRecsBlock({
  me,
  list,
  disabled,
  onAdd,
}: {
  me: string | null;
  list: readonly string[];
  disabled: boolean;
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
        {open ? t("recs_close") : t("recs_open")}
      </button>
      {open &&
        (recs === null ? (
          <p className={styles.desc}>{t("dmrelay_recs_loading")}</p>
        ) : recs.length > 0 ? (
          remaining.length > 0 && (
            <>
              <p className={styles.desc}>{t("dmrelay_recs_title")}</p>
              <ul className={styles.chips} aria-label={t("web_settings_dmrelay_recs_label")}>
                {remaining.map((r) => (
                  <li key={r.url}>
                    <DmRelayChip
                      url={r.url}
                      note={t("presets_users_fmt", r.count)}
                      disabled={disabled}
                      onAdd={onAdd}
                    />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : (
          <p className={styles.desc}>{t("dmrelay_recs_empty")}</p>
        ))}
    </>
  );
}

/** 候補のチップ（RelaySection.tsx の RelayChip と同じ体裁） */
function DmRelayChip({
  url,
  note,
  disabled,
  onAdd,
}: {
  url: string;
  note: string;
  disabled: boolean;
  onAdd(url: string): void;
}) {
  const label = displayRelayUrl(url);
  return (
    <button
      type="button"
      className={styles.chip}
      disabled={disabled}
      aria-label={t("web_settings_relay_add_label_note", label, note)}
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
