package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex

/**
 * [#218] Linux libsecret (Secret Service API) に nsec を保管する KeyVault。
 *
 * GNOME Keyring / KWallet 等の Secret Service 実装に対応。
 * `secret-tool` CLI を使用（DBus 経由で安全に保管）。
 */
class LinuxSecretKeyVault(
    private val schema: String = "org.freedesktop.Secret.Generic",
    private val attributes: Map<String, String> = mapOf(
        "application" to "Nostrism",
        "key-type" to "nostr-nsec",
    ),
) : KeyVault {

    private fun run(vararg args: String): Pair<Int, String> {
        val p = ProcessBuilder(*args).redirectErrorStream(true).start()
        val out = p.inputStream.readBytes().decodeToString().trim()
        return p.waitFor() to out
    }

    private val attrArgs: List<String> = attributes.flatMap { (k, v) -> listOf(k, v) }

    /** Secret Service から鍵（hex 64桁）を取得。無ければ null。 */
    private fun readHex(): String? {
        val (code, out) = run("secret-tool", "lookup", *attrArgs.toTypedArray())
        return out.takeIf { code == 0 && it.length == 64 }
    }

    override fun hasKey(): Boolean = readHex() != null

    override fun privateKey(): ByteArray {
        val hex = readHex() ?: error("no key in secret service")
        return hex.hexToBytes()
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex()
        // secret-tool store は stdin から秘密を読み取る（プロセス一覧に露出しない）
        val p = ProcessBuilder("secret-tool", "store", "--label=Nostrism nsec", *attrArgs.toTypedArray())
            .redirectErrorStream(true).start()
        p.outputStream.use { it.write(hex.encodeToByteArray()) }
        val out = p.inputStream.readBytes().decodeToString().trim()
        require(p.waitFor() == 0) { "secret-tool store failed: $out" }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        run("secret-tool", "clear", *attrArgs.toTypedArray())
    }
}