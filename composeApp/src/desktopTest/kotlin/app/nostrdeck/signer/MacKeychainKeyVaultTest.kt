package app.nostrdeck.signer

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * [#221] macOS Keychain 保管のラウンドトリップ。実 Keychain を使うが、
 * 専用の service/account 名で隔離し、終了時に必ず消す。macOS 以外では何もしない。
 */
class MacKeychainKeyVaultTest {
    @Test
    fun roundtrip() {
        if (!System.getProperty("os.name").orEmpty().lowercase().contains("mac")) return
        val vault = MacKeychainKeyVault(service = "net.shino3.nostrism.test", account = "nostr-nsec-test")
        vault.clear()
        try {
            assertFalse(vault.hasKey())
            val key = ByteArray(32) { it.toByte() }
            vault.importPrivateKey(key)
            assertTrue(vault.hasKey())
            assertContentEquals(key, vault.privateKey())
            // -U による上書きも確認。
            val key2 = ByteArray(32) { (255 - it).toByte() }
            vault.importPrivateKey(key2)
            assertContentEquals(key2, vault.privateKey())
        } finally {
            vault.clear()
        }
        assertFalse(vault.hasKey())
    }
}
