import { useId, useState } from "react";
import { t, useT } from "../../i18n";
import { columnLabel } from "../../lib/columns";
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
      return t("sync_col_added_fmt", columnLabel(diff.spec));
    case "removed":
      return t("sync_col_removed_fmt", columnLabel(diff.spec));
    case "changed":
      return t("sync_col_changed_fmt", columnLabel(diff.local));
    case "reordered":
      return t("sync_col_reordered");
  }
}

/** 保存の失敗の文言（#478 の規則で止めたものは理由を案内する。それ以外は一般的な失敗） */
function saveFailureMessage(e: unknown): string {
  if (e instanceof RelaySyncError) {
    switch (e.reason) {
      case "stale":
        return t("web_sync_stale");
      case "unreachable":
        return t("web_sync_unreachable");
      case "unknown-format":
        return t("web_sync_unknown_format");
    }
  }
  return t("sync_save_failed");
}

export function RelaySyncSection() {
  const t = useT();
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
        setMessage(t("sync_no_data"));
        return;
      }
      const settingDiffs =
        snapshot.settings !== null ? diffSyncSettings(readCurrentSyncSettings(), snapshot.settings) : [];
      const columnDiffs =
        snapshot.columns !== null ? diffDeckColumns(pinnedColumns(useDeck.getState()), snapshot.columns) : [];
      if (settingDiffs.length === 0 && columnDiffs.length === 0) {
        setMessage(t("sync_no_diff"));
      } else {
        setDiffs({ settings: settingDiffs, columns: columnDiffs });
      }
    } catch (e) {
      setMessage(
        e instanceof RelaySyncError && e.reason === "unreachable"
          ? t("web_sync_load_unreachable")
          : t("web_sync_load_failed"),
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
      setMessage(t("sync_save_done"));
    } catch (e) {
      setMessage(saveFailureMessage(e));
    } finally {
      setBusySave(false);
    }
  }

  return (
    <div className={sectionStyles.block}>
      <h3 className={sectionStyles.caption}>{t("sync_title")}</h3>
      <p className={sectionStyles.desc}>{t("sync_desc")}</p>
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
          {t("sync_save")}
        </button>
        <button type="button" className={sectionStyles.ghost} disabled={busy} onClick={() => void load()}>
          {t("sync_load")}
        </button>
      </div>
      {busyLoad && (
        <p className={sectionStyles.desc} role="status">
          {t("sync_loading")}
        </p>
      )}
      {message && (
        <p className={sectionStyles.desc} role="status">
          {message}
        </p>
      )}
      {confirmSave && (
        <ConfirmDialog
          title={t("sync_save_confirm_title")}
          text={t("sync_save_confirm_text")}
          confirmLabel={t("common_save")}
          onConfirm={() => void save()}
          onDismiss={() => setConfirmSave(false)}
        />
      )}
      {diffs && (
        <RelaySyncDiffDialog
          diffs={diffs}
          onApplied={() => {
            setDiffs(null);
            setMessage(t("sync_applied"));
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
  const t = useT();
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
    <InfoDialog
      title={t("sync_diff_title")}
      action={{ label: t("sync_apply"), onClick: apply }}
      onDismiss={onDismiss}
    >
      <p className={sectionStyles.desc}>{t("sync_diff_desc")}</p>
      {diffs.settings.length > 0 && (
        <>
          <h4 className={styles.group}>{t("sync_group_settings")}</h4>
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
          <h4 className={styles.group}>{t("sync_group_columns")}</h4>
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
