package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex
import java.util.concurrent.TimeUnit

/**
 * `secret-tool lookup` の結果。**「項目が無い」と「読み取りが失敗した」を必ず区別する。**
 *
 * secret-tool は「項目が無い」とき exit 1 で**何も出力しない**。
 * キーリングがロック中や D-Bus が不通のときは exit 1 で **stderr にエラーを出す**。
 * stderr を混ぜると両者を区別できず、既存の nsec を上書きしてしまうので分けている。
 */
sealed interface SecretToolLookup {
    /** 64桁 hex の鍵を取得できた。 */
    data class Found(val hex: String) : SecretToolLookup

    /** Secret Service に到達したが、指定属性的な項目は無い。 */
    data object NotFound : SecretToolLookup

    /** Secret Service に到達できなかった（ロック中・D-Bus 不通・CLI 不在など）。 */
    data class Unavailable(val message: String) : SecretToolLookup
}

/**
 * [#218] Linux libsecret (Secret Service API) に nsec を保管する KeyVault。
 *
 * GNOME Keyring / KWallet 等の Secret Service 実装に対応。
 * `secret-tool` CLI を使用（DBus 経由で安全に保管）。属性だけで引くので schema の指定は不要。
 */
class LinuxSecretKeyVault(
    private val attributes: Map<String, String> = mapOf(
        "application" to "Nostrism",
        "key-type" to "nostr-nsec",
    ),
) : KeyVault {

    private val attrArgs: List<String> = attributes.flatMap { (k, v) -> listOf(k, v) }

    /** 標準出力と stderr を分けて取る（区別のために必須）。 */
    private fun run(timeoutSeconds: Long = 5, vararg args: String): Triple<Int, String, String> {
        val p = ProcessBuilder(*args).start()
        val stderr = StringBuilder()
        val errThread = Thread { p.errorStream.bufferedReader().forEachLine { stderr.appendLine(it) } }
        errThread.isDaemon = true
        errThread.start()
        val out = p.inputStream.bufferedReader().readText()
        if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            p.destroyForcibly()
            return Triple(-1, out, "timeout")
        }
        errThread.join(500)
        return Triple(p.exitValue(), out.trim(), stderr.toString().trim())
    }

    private fun lookup(): SecretToolLookup {
        val (code, out, err) = run(args = arrayOf("secret-tool", "lookup", *attrArgs.toTypedArray()))
        return when {
            // stderr に何か出ている = Secret Service に到達できていない
            err.isNotEmpty() -> SecretToolLookup.Unavailable(err)
            // 出力つきで exit 0 = 見つかった
            code == 0 && out.length == 64 -> SecretToolLookup.Found(out)
            // stderr 空・exit 0 以外 = 項目が無い
            else -> SecretToolLookup.NotFound
        }
    }

    /**
     * Secret Service が使える状態かどうか。
     * [hasKey] は「鍵が無い」ことを返すので健全性の判定には使えない。Main.kt のフォールバック判定用。
     */
    fun isAvailable(): Boolean = when (lookup()) {
        is SecretToolLookup.Found, SecretToolLookup.NotFound -> true
        is SecretToolLookup.Unavailable -> false
    }

    override fun hasKey(): Boolean = lookup() is SecretToolLookup.Found

    override fun privateKey(): ByteArray = when (val r = lookup()) {
        is SecretToolLookup.Found -> r.hex.hexToBytes()
        SecretToolLookup.NotFound -> error("no key in secret service")
        // 「無い」と「読めなかった」を混ぜない。読めなかったのに新規作成に進ませると既存鍵を上書きする。
        is SecretToolLookup.Unavailable -> error("secret service unavailable: ${r.message}")
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex()
        // secret-tool store は stdin から秘密を読み取る（プロセス一覧に露出しない）
        val p = ProcessBuilder("secret-tool", "store", "--label=Nostrism nsec", *attrArgs.toTypedArray())
            .redirectErrorStream(true).start()
        p.outputStream.use { it.write(hex.encodeToByteArray()) }
        val out = p.inputStream.readBytes().decodeToString().trim()
        if (!p.waitFor(5, TimeUnit.SECONDS)) {
            p.destroyForcibly()
            throw IllegalStateException("secret-tool store timeout")
        }
        require(p.exitValue() == 0) { "secret-tool store failed: $out" }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        run(args = arrayOf("secret-tool", "clear", *attrArgs.toTypedArray()))
    }
}