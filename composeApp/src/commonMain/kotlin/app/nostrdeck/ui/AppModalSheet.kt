package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckDimens
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckSpace
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.common_close
import org.jetbrains.compose.resources.stringResource

/**
 * [#284] 設定系の全画面モーダル（Dialog ベース）。
 *
 * かつては [androidx.compose.material3.ModalBottomSheet] を使っていたが、シートは自身のドラッグ用に
 * nested-scroll 接続を持つため、**中身のスクロールとシートのドラッグが競合**する
 * （子が消費しきれなかったデルタがシートに渡り、下スワイプでシートごと閉じる／スクロールが
 * 引っかかる）。テーマ設定のようにモーダル内で編集する画面ではこれが実害になる。
 *
 * ここでは高さいっぱいのカードを Dialog で出す。ドラッグ機構が無いので中身のスクロールは
 * 素直に効き、閉じる操作は **× / 背景タップ / 戻る** で確保する。
 * 見た目（角丸カード・Surface 背景）はシート時代を踏襲する。
 *
 * @param title ヘッダーのタイトル。ヘッダー自体は固定で、[content] だけがスクロールする想定。
 * @param headerExtra タイトル行の下に置く固定要素（タブなど）。スクロールしない。
 */
@Composable
fun AppModalSheet(
    title: String,
    onDismiss: () -> Unit,
    headerExtra: @Composable (ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,   // 幅は自前で制御（大画面では中央に最大 560dp）
        ),
    ) {
        // [#196] Dialog は LocalDensity を再供給するので、老眼スケールを再適用する。
        DeckScaled {
            BoxWithConstraints(
                Modifier.fillMaxSize()
                    // カード外（オーバーレイ）のタップで閉じる。コンテンツが Dialog 全面を占めるため
                    // dismissOnClickOutside は発火せず、ここで自前に拾う（ComposeSheet と同じ作法）。
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onDismiss,
                    ),
                contentAlignment = Alignment.BottomCenter,
            ) {
                // [#226] セーフエリア（ステータスバー/ノッチ）と IME を避ける。
                Column(
                    Modifier.safeDrawingPadding()
                        .widthIn(max = 560.dp)
                        .heightIn(max = maxHeight - DeckSpace.Xl)
                        .clip(RoundedCornerShape(DeckRadius.Lg))
                        .background(DeckColors.Surface)
                        // カード内のタップはオーバーレイへ伝えない（閉じないように）。
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {},
                        )
                        .padding(horizontal = DeckSpace.Md),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TitleText(title, modifier = Modifier.weight(1f).padding(vertical = DeckSpace.Sm))
                        IconButton(onClick = onDismiss) {
                            Icon(
                                Icons.Outlined.Close,
                                contentDescription = stringResource(Res.string.common_close),
                                tint = DeckColors.Text3,
                                modifier = Modifier.size(DeckDimens.IconLg),
                            )
                        }
                    }
                    headerExtra?.invoke(this)
                    content()
                }
            }
        }
    }
}
