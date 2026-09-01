package app.nostrdeck.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nostrdeck.data.ColumnDiff
import app.nostrdeck.data.EventRepository
import app.nostrdeck.data.SETTINGS_SYNC_WHITELIST
import app.nostrdeck.data.SettingDiff
import app.nostrdeck.data.SyncValueLabel
import app.nostrdeck.data.applyColumnDiffs
import app.nostrdeck.data.diffDeckColumns
import app.nostrdeck.data.diffSyncSettings
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType
import app.nostrdeck.theme.DeckWeight
import kotlinx.coroutines.launch
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.common_cancel
import nostr_deck_client.composeapp.generated.resources.sync_apply
import nostr_deck_client.composeapp.generated.resources.sync_applied
import nostr_deck_client.composeapp.generated.resources.sync_col_added_fmt
import nostr_deck_client.composeapp.generated.resources.sync_col_changed_fmt
import nostr_deck_client.composeapp.generated.resources.sync_col_removed_fmt
import nostr_deck_client.composeapp.generated.resources.sync_col_reordered
import nostr_deck_client.composeapp.generated.resources.sync_desc
import nostr_deck_client.composeapp.generated.resources.sync_diff_desc
import nostr_deck_client.composeapp.generated.resources.sync_diff_title
import nostr_deck_client.composeapp.generated.resources.sync_group_columns
import nostr_deck_client.composeapp.generated.resources.sync_group_settings
import nostr_deck_client.composeapp.generated.resources.sync_load
import nostr_deck_client.composeapp.generated.resources.sync_loading
import nostr_deck_client.composeapp.generated.resources.sync_no_data
import nostr_deck_client.composeapp.generated.resources.sync_no_diff
import nostr_deck_client.composeapp.generated.resources.sync_save
import nostr_deck_client.composeapp.generated.resources.sync_save_confirm
import nostr_deck_client.composeapp.generated.resources.sync_save_confirm_text
import nostr_deck_client.composeapp.generated.resources.sync_save_confirm_title
import nostr_deck_client.composeapp.generated.resources.sync_save_done
import nostr_deck_client.composeapp.generated.resources.sync_save_failed
import nostr_deck_client.composeapp.generated.resources.sync_title
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

/**
 * [#374] リレー同期（NIP-78 kind:30078）の設定セクションと差分確認ダイアログ。
 *  - 「リレーへ保存」: 確認のうえ、設定スナップショットとカラム構成の2イベントを手動発行。
 *  - 「リレーから読み込む」: 一時REQで取得 → ローカル現在値との差分だけを一覧表示 →
 *    チェックした項目だけ適用（設定は各 setter、カラムは applySyncedColumns 経由で反映）。
 */

/** 取得済みスナップショットとローカルの差分（ダイアログ表示用）。 */
private data class RelaySyncDiffs(
    val settings: List<SettingDiff>,
    val columns: List<ColumnDiff>,
)

@Composable
fun RelaySyncSection() {
    val repo = LocalRepository.current ?: return
    val scope = rememberCoroutineScope()
    val loggedIn = repo.loggedInPubkey().collectAsState(null).value != null

    var confirmSave by remember { mutableStateOf(false) }
    var busySave by remember { mutableStateOf(false) }
    var busyLoad by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<StringResource?>(null) }
    var diffs by remember { mutableStateOf<RelaySyncDiffs?>(null) }

    Text(stringResource(Res.string.sync_title), color = DeckColors.Text, fontSize = DeckType.Sub, fontWeight = DeckWeight.Strong)
    Spacer(Modifier.size(DeckSpace.Xs))
    Text(
        stringResource(Res.string.sync_desc),
        color = DeckColors.Text2, fontSize = DeckType.Caption, lineHeight = 17.sp,
    )
    Spacer(Modifier.size(DeckSpace.Md))
    Row {
        DeckButton(
            stringResource(Res.string.sync_save),
            enabled = loggedIn && !busySave && !busyLoad,
            onClick = { message = null; confirmSave = true },
        )
        Spacer(Modifier.width(DeckSpace.Sm))
        DeckGhostButton(
            stringResource(Res.string.sync_load),
            enabled = loggedIn && !busySave && !busyLoad,
            onClick = {
                message = null
                busyLoad = true
                scope.launch {
                    try {
                        val snap = repo.fetchRelaySync()
                        if (snap == null || (snap.settings == null && snap.columns == null)) {
                            message = Res.string.sync_no_data
                            return@launch
                        }
                        val settingDiffs = snap.settings?.let { diffSyncSettings(repo.currentSyncSettings(), it) }.orEmpty()
                        val columnDiffs = snap.columns?.let { diffDeckColumns(repo.loadPinnedColumns(), it) }.orEmpty()
                        if (settingDiffs.isEmpty() && columnDiffs.isEmpty()) {
                            message = Res.string.sync_no_diff
                        } else {
                            diffs = RelaySyncDiffs(settingDiffs, columnDiffs)
                        }
                    } finally {
                        busyLoad = false
                    }
                }
            },
        )
    }
    if (busyLoad) {
        Spacer(Modifier.size(DeckSpace.Sm))
        Text(stringResource(Res.string.sync_loading), color = DeckColors.Text3, fontSize = DeckType.Caption)
    }
    message?.let {
        Spacer(Modifier.size(DeckSpace.Sm))
        Text(stringResource(it), color = DeckColors.Accent, fontSize = DeckType.Caption)
    }

    if (confirmSave) {
        DeckConfirmDialog(
            title = stringResource(Res.string.sync_save_confirm_title),
            text = stringResource(Res.string.sync_save_confirm_text),
            confirmLabel = stringResource(Res.string.sync_save_confirm),
            onConfirm = {
                confirmSave = false
                busySave = true
                scope.launch {
                    try {
                        val ok = repo.publishSettingsSync() && repo.publishDeckColumnsSync()
                        message = if (ok) Res.string.sync_save_done else Res.string.sync_save_failed
                    } finally {
                        busySave = false
                    }
                }
            },
            onDismiss = { confirmSave = false },
        )
    }

    diffs?.let { d ->
        RelaySyncDiffDialog(
            repo = repo, diffs = d,
            onApplied = { diffs = null; message = Res.string.sync_applied },
            onDismiss = { diffs = null },
        )
    }
}

/**
 * 差分一覧ダイアログ。1行=1差分（チェックボックス・初期ON）で、
 * 「適用」でチェックされた項目だけをローカルへ反映する。
 */
@Composable
private fun RelaySyncDiffDialog(
    repo: EventRepository,
    diffs: RelaySyncDiffs,
    onApplied: () -> Unit,
    onDismiss: () -> Unit,
) {
    // チェック状態（key = 設定キー / "col:<index>"）。初期は全部ON。
    val checked = remember(diffs) {
        mutableStateMapOf<String, Boolean>().apply {
            diffs.settings.forEach { put(it.key, true) }
            diffs.columns.forEachIndexed { i, _ -> put("col:$i", true) }
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DeckColors.Surface,
        shape = RoundedCornerShape(DeckRadius.Lg),
        title = { DeckScaled { TitleText(stringResource(Res.string.sync_diff_title)) } },
        text = {
            DeckScaled {
                Column(
                    Modifier.fillMaxWidth().heightIn(max = 440.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    Text(
                        stringResource(Res.string.sync_diff_desc),
                        color = DeckColors.Text3, fontSize = DeckType.Caption,
                    )
                    Spacer(Modifier.size(DeckSpace.Sm))
                    if (diffs.settings.isNotEmpty()) {
                        DiffGroupHeader(stringResource(Res.string.sync_group_settings))
                        diffs.settings.forEach { diff ->
                            val spec = SETTINGS_SYNC_WHITELIST.first { it.key == diff.key }
                            DiffRow(
                                label = stringResource(spec.nameRes),
                                detail = "${labelText(spec.display(diff.localValue))} → ${labelText(spec.display(diff.remoteValue))}",
                                checked = checked[diff.key] == true,
                                onChange = { checked[diff.key] = it },
                            )
                        }
                    }
                    if (diffs.columns.isNotEmpty()) {
                        if (diffs.settings.isNotEmpty()) Spacer(Modifier.size(DeckSpace.Sm))
                        DiffGroupHeader(stringResource(Res.string.sync_group_columns))
                        diffs.columns.forEachIndexed { i, diff ->
                            DiffRow(
                                label = columnDiffLabel(diff),
                                detail = null,
                                checked = checked["col:$i"] == true,
                                onChange = { checked["col:$i"] = it },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            DeckScaled {
                DeckTextButton(
                    stringResource(Res.string.sync_apply),
                    onClick = {
                        // 設定: チェックされたキーだけ、ホワイトリストの apply（各 setter 経由）で反映。
                        diffs.settings.filter { checked[it.key] == true }.forEach { diff ->
                            SETTINGS_SYNC_WHITELIST.firstOrNull { it.key == diff.key }
                                ?.apply?.invoke(repo, diff.remoteValue)
                        }
                        // カラム: チェックされた操作だけをローカル構成へ適用して DeckState へ反映。
                        val selectedCols = diffs.columns.filterIndexed { i, _ -> checked["col:$i"] == true }
                        if (selectedCols.isNotEmpty()) {
                            repo.applySyncedColumns(applyColumnDiffs(repo.loadPinnedColumns(), selectedCols))
                        }
                        onApplied()
                    },
                )
            }
        },
        dismissButton = {
            DeckScaled { DeckTextButton(stringResource(Res.string.common_cancel), onClick = onDismiss, color = DeckColors.Text3) }
        },
    )
}

@Composable
private fun DiffGroupHeader(title: String) {
    Text(title, color = DeckColors.Text3, fontSize = DeckType.Label)
    Spacer(Modifier.size(DeckSpace.Xs))
}

/** 差分1行（ラベル + 任意の詳細 + 右端チェックボックス）。 */
@Composable
private fun DiffRow(label: String, detail: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = DeckSpace.Xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = DeckColors.Text, fontSize = DeckType.Sub)
            if (detail != null) {
                Text(detail, color = DeckColors.Text2, fontSize = DeckType.Caption, lineHeight = 16.sp)
            }
        }
        Checkbox(
            checked = checked, onCheckedChange = onChange,
            colors = CheckboxDefaults.colors(
                checkedColor = DeckColors.Accent, uncheckedColor = DeckColors.Text3,
                checkmarkColor = DeckColors.Bg,
            ),
        )
    }
    HorizontalDivider(color = DeckColors.Border)
}

@Composable
private fun labelText(label: SyncValueLabel): String = when (label) {
    is SyncValueLabel.Text -> label.value
    is SyncValueLabel.Resource -> stringResource(label.res)
}

@Composable
private fun columnDiffLabel(diff: ColumnDiff): String = when (diff) {
    is ColumnDiff.Added -> stringResource(Res.string.sync_col_added_fmt, diff.spec.title)
    is ColumnDiff.Removed -> stringResource(Res.string.sync_col_removed_fmt, diff.spec.title)
    is ColumnDiff.Changed -> stringResource(Res.string.sync_col_changed_fmt, diff.local.title)
    is ColumnDiff.Reordered -> stringResource(Res.string.sync_col_reordered)
}
