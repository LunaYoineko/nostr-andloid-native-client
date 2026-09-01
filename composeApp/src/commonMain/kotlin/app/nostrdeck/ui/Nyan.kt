package app.nostrdeck.ui

import androidx.compose.runtime.mutableStateOf
import app.nostrdeck.model.NyanMode

/**
 * [#378] にゃにゃにゃウイルスの適用判定。
 * DeckWeight のパレットと同じく snapshot state で持ち、非 Composable
 * （noteAnnotated 等）からも読めるようにする（CompositionLocal にはできない）。
 * 読みはコンポジション中なら自動で追従する。App が設定 Flow から [apply] する。
 *
 * **表示専用**。発行（publish）系のコードからは絶対に参照しないこと。
 */
object Nyan {
    private val mode = mutableStateOf(NyanMode.OFF)
    private val myPubkey = mutableStateOf<String?>(null)

    /** App が設定 Flow から呼ぶ。値が変わる時のみ代入（DeckWeight.apply と同じ作法）。 */
    fun apply(m: NyanMode, me: String?) {
        if (mode.value != m) mode.value = m
        if (myPubkey.value != me) myPubkey.value = me
    }

    /**
     * [pubkey]（hex。不明なら null）の表示を猫化するか。
     *  - 全員   : 常に true（pubkey 不明の表示箇所にも効く）
     *  - 自分のみ: ログイン中の自分の pubkey と一致するときだけ true
     *  - オフ   : false
     * 自分のみモードでは pubkey が渡らない表示箇所（seed が表示名のアバター等）は猫化されない。
     */
    fun appliesTo(pubkey: String?): Boolean = when (mode.value) {
        NyanMode.OFF -> false
        NyanMode.ALL -> true
        NyanMode.SELF -> pubkey != null && pubkey == myPubkey.value
    }
}
