package app.nostrdeck.crypto

import fr.acinq.secp256k1.Secp256k1
import kotlin.test.Test
import kotlin.test.assertEquals

/** [#7] NIP-04 encrypt/decrypt のラウンドトリップ（NWC が依存）。 */
class Nip04Test {
    private val secp = Secp256k1.get()

    private fun xOnlyPubkey(priv: ByteArray): String =
        secp.pubKeyCompress(secp.pubkeyCreate(priv)).copyOfRange(1, 33).toHex()

    @Test
    fun roundtrip() {
        val alice = ByteArray(32) { (it + 1).toByte() }
        val bob = ByteArray(32) { (it + 101).toByte() }
        val alicePub = xOnlyPubkey(alice)
        val bobPub = xOnlyPubkey(bob)

        val plain = """{"method":"pay_invoice","params":{"invoice":"lnbc1..."}} 日本語も🚀"""
        val payload = Nip04.encrypt(alice, bobPub, plain)
        // 相手側（bob）が alice の公開鍵で復号できる（ECDH の対称性）。
        assertEquals(plain, Nip04.decrypt(bob, alicePub, payload))
        // 同一ペアでも IV がランダムなので毎回異なる payload になる。
        val payload2 = Nip04.encrypt(alice, bobPub, plain)
        assertEquals(plain, Nip04.decrypt(bob, alicePub, payload2))
    }

    @Test
    fun emptyPlaintext() {
        val alice = ByteArray(32) { (it + 1).toByte() }
        val bob = ByteArray(32) { (it + 101).toByte() }
        val payload = Nip04.encrypt(alice, xOnlyPubkey(bob), "")
        assertEquals("", Nip04.decrypt(bob, xOnlyPubkey(alice), payload))
    }
}
