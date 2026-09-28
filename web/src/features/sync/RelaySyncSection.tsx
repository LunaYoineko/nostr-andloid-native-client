import { useId, useState } from "react";
import { useSession } from "../../signer/session";
import { pinnedColumns, useDeck } from "../../store/deck";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { InfoDialog } from "../../ui/InfoDialog";
import sectionStyles from "../settings/SettingsSections.module.css";
import { applyColumnDiffs, type ColumnDiff, diffDeckColumns } from "./columnDiff";
import styles from "./RelaySyncSection.module.css";
import { loadRelaySync, publishRelaySync, RelaySyncError } from "./relaySyncIO";
import {
  applySyncSettingDiffs,
  diffSyncSettings,
  readCurrentSyncSettings,
  SETTINGS_SYNC_WHITELIST,
  type SettingDiff,
} from "./settingsSync";

/**
 * [#468] リレー同期（NIP-78 kind:30078）の設定セクションと差分確認ダイアログ。
 * ネイティブ RelaySyncSheet.kt の写し。
 *  - 「リレーへ保存」: 確認のうえ、設定スナップショットとカラム構成を手動発行（relaySyncIO.publishRelaySync）。
 *  - 「リレーから読み込む」: 一時 REQ で取得し、ローカル現在値との差分だけを一覧表示 →
 *    チェックした項目だけ適用する。常時購読・自動発行はしない。
 */

type RelaySyncDiffs = { settings: SettingDiff[]; columns: ColumnDiff[] };

function columnDiffKey(diff: ColumnDiff): string {
  switch (diff.type) {
    case "added":
      return `added:${diff.spec.id}`;
    case "removed":
      return `removed:${diff.spec.id}`;
    case "changed":
      return `changed:${diff.local.id}`;
    case "reordered":
      return "reordered";
  }
}

function columnDiffLabel(diff: ColumnDiff): string {
  switch (diff.type) {
    case "added":
      return `追加: ${diff.spec.title}`;
    case "removed":
      return `削除: ${diff.spec.title}`;
    case "changed":
      return `変更: ${diff.local.title}`;
    case "reordered":
      return "並び順の変更";
  }
}

/** 保存の失敗の文言（#478 の規則で止めたものは理由を案内する。それ以外は一般的な失敗） */
function saveFailureMessage(e: unknown): string {
  if (e instanceof RelaySyncError) {
    switch (e.reason) {
      case "stale":
        return "リレー上のデータが別の端末で更新されています。先に「リレーから読み込む」で差分を確認してください。";
      case "unreachable":
        return "リレーから最新のデータを取得できなかったため、上書きを避けて保存しませんでした。";
      case "unknown-format":
        return "リレー上のデータに、この Web 版が読めない形式が含まれているため、消さないように保存しませんでした。";
    }
  }
  return "リレーへの保存に失敗しました。";
}

export function RelaySyncSection() {
  const me = useSession((s) => s.pubkey);
  const [confirmSave, setConfirmSave] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyLoad, setBusyLoad] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<RelaySyncDiffs | null>(null);

  // RequireSession の内側なので pubkey は必ずある
  if (!me) return null;
  const busy = busySave || busyLoad;

  async function load() {
    if (!me) return;
    setMessage(null);
    setBusyLoad(true);
    try {
      const snapshot = await loadRelaySync(me);
      if (snapshot.settings === null && snapshot.columns === null) {
        setMessage("リレーに保存データが見つかりません。");
        return;
      }
      const settingDiffs =
        snapshot.settings !== null ? diffSyncSettings(readCurrentSyncSettings(), snapshot.settings) : [];
      const columnDiffs =
        snapshot.columns !== null ? diffDeckColumns(pinnedColumns(useDeck.getState()), snapshot.columns) : [];
      if (settingDiffs.length === 0 && columnDiffs.length === 0) {
        setMessage("差分はありません。");
      } else {
        setDiffs({ settings: settingDiffs, columns: columnDiffs });
      }
    } catch (e) {
      setMessage(
        e instanceof RelaySyncError && e.reason === "unreachable"
          ? "リレーから取得できませんでした。接続を確認して、もう一度お試しください。"
          : "リレーからの読み込みに失敗しました。",
      );
    } finally {
      setBusyLoad(false);
    }
  }

  async function save() {
    if (!me) return;
    setConfirmSave(false);
    setBusySave(true);
    try {
      await publishRelaySync(me);
      setMessage("リレーへ保存しました。");
    } catch (e) {
      setMessage(saveFailureMessage(e));
    } finally {
      setBusySave(false);
    }
  }

  return (
    <div className={sectionStyles.block}>
      <h3 className={sectionStyles.caption}>リレー同期</h3>
      <p className={sectionStyles.desc}>
        各種設定とカラム構成を
        kind:30078（NIP-78）としてリレーへ手動で保存します。読み込み時は最新のスナップショットを取得し、ローカルとの差分を確認して項目ごとに適用できます。自動では同期しません。
      </p>
      <div className={sectionStyles.row}>
        <button
          type="button"
          className={sectionStyles.primary}
          disabled={busy}
          onClick={() => {
            setMessage(null);
            setConfirmSave(true);
          }}
        >
          リレーへ保存
        </button>
        <button type="button" className={sectionStyles.ghost} disabled={busy} onClick={() => void load()}>
          リレーから読み込む
        </button>
      </div>
      {busyLoad && (
        <p className={sectionStyles.desc} role="status">
          リレーから読み込み中…
        </p>
      )}
      {message && (
        <p className={sectionStyles.desc} role="status">
          {message}
        </p>
      )}
      {confirmSave && (
        <ConfirmDialog
          title="リレーへ保存しますか？"
          text="設定とカラム構成の2イベント（kind:30078）を書き込みリレーへ発行し、以前のスナップショットを置き換えます。"
          confirmLabel="保存"
          onConfirm={() => void save()}
          onDismiss={() => setConfirmSave(false)}
        />
      )}
      {diffs && (
        <RelaySyncDiffDialog
          diffs={diffs}
          onApplied={() => {
            setDiffs(null);
            setMessage("適用しました。");
          }}
          onDismiss={() => setDiffs(null)}
        />
      )}
    </div>
  );
}

function RelaySyncDiffDialog({
  diffs,
  onApplied,
  onDismiss,
}: {
  diffs: RelaySyncDiffs;
  onApplied(): void;
  onDismiss(): void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of diffs.settings) initial[d.key] = true;
    for (const d of diffs.columns) initial[columnDiffKey(d)] = true;
    return initial;
  });

  function apply() {
    applySyncSettingDiffs(diffs.settings.filter((d) => checked[d.key] === true));
    const selectedColumns = diffs.columns.filter((d) => checked[columnDiffKey(d)] === true);
    if (selectedColumns.length > 0) {
      const next = applyColumnDiffs(pinnedColumns(useDeck.getState()), selectedColumns);
      useDeck.getState().applyPinnedColumns(next);
    }
    onApplied();
  }

  return (
    <InfoDialog title="差分の確認" action={{ label: "適用", onClick: apply }} onDismiss={onDismiss}>
      <p className={sectionStyles.desc}>チェックした項目だけを適用します。</p>
      {diffs.settings.length > 0 && (
        <>
          <h4 className={styles.group}>設定</h4>
          {diffs.settings.map((diff) => {
            const spec = SETTINGS_SYNC_WHITELIST.find((s) => s.key === diff.key);
            return (
              <DiffRow
                key={diff.key}
                label={spec?.label ?? diff.key}
                detail={
                  spec ? `${spec.display(diff.localValue)} → ${spec.display(diff.remoteValue)}` : undefined
                }
                checked={checked[diff.key] === true}
                onChange={(v) => setChecked((c) => ({ ...c, [diff.key]: v }))}
              />
            );
          })}
        </>
      )}
      {diffs.columns.length > 0 && (
        <>
          <h4 className={styles.group}>カラム構成</h4>
          {diffs.columns.map((diff) => {
            const key = columnDiffKey(diff);
            return (
              <DiffRow
                key={key}
                label={columnDiffLabel(diff)}
                checked={checked[key] === true}
                onChange={(v) => setChecked((c) => ({ ...c, [key]: v }))}
              />
            );
          })}
        </>
      )}
    </InfoDialog>
  );
}

function DiffRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  const id = useId();
  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={id}>
        <p className={styles.text}>{label}</p>
        {detail && <p className={styles.detail}>{detail}</p>}
      </label>
      <input
        id={id}
        className={styles.checkbox}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
