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

    /** Secret Service に到達したが、指定属性の項目は無い。 */
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

    private data class Result(val exit: Int, val stdout: String, val stderr: String, val timedOut: Boolean)

    /**
     * secret-tool を実行する。stdout / stderr は別スレッドで読み、タイムアウトを効かせる。
     *
     * 先に stdout を読むと、キーリングのロック解除プロンプトで待っているプロセスに
     * ブロックしたまま `waitFor` に到達できず、タイムアウトが機能しない。
     * 逆に出力を溜め込むとパイプが詰まるので、読み込みは両方とも別スレッドで行う。
     */
    private fun run(stdin: ByteArray? = null, timeoutSeconds: Long = 5, vararg args: String): Result {
        val p = ProcessBuilder(*args).start()
        if (stdin != null) {
            p.outputStream.use { it.write(stdin) }
        } else {
            p.outputStream.close()
        }

        val out = StringBuilder()
        val err = StringBuilder()
        fun spawn(reader: java.io.InputStream, sink: StringBuilder) = Thread {
            reader.bufferedReader().forEachLine { sink.appendLine(it) }
        }.apply { isDaemon = true; start() }
        val threads = listOf(spawn(p.inputStream, out), spawn(p.errorStream, err))

        val finished = p.waitFor(timeoutSeconds, TimeUnit.SECONDS)
        if (!finished) {
            p.destroyForcibly()
            threads.forEach { it.join(500) }
            return Result(-1, out.toString().trim(), err.toString().trim(), timedOut = true)
        }
        threads.forEach { it.join(1000) }
        return Result(p.exitValue(), out.toString().trim(), err.toString().trim(), timedOut = false)
    }

    private fun lookup(): SecretToolLookup {
        val r = run(args = arrayOf("secret-tool", "lookup", *attrArgs.toTypedArray()))

        // 成功を先に判定する。stderr に警告（"[…] ignoring:…" 等）が出ても、
        // 鍵が読めたなら Found なので Unavailable に落とさない。
        if (!r.timedOut && r.exit == 0 && r.stdout.length == 64) {
            return SecretToolLookup.Found(r.stdout)
        }
        // タイムアウトは「読めなかった」= Unavailable（既存の鍵を上書きさせない）
        if (r.timedOut) {
            return SecretToolLookup.Unavailable("timeout")
        }
        // stderr にエラーが出ていれば到達できていない
        if (r.stderr.isNotEmpty()) {
            return SecretToolLookup.Unavailable(r.stderr)
        }
        // stderr 空・exit 0 以外 = 項目が無い
        return SecretToolLookup.NotFound
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
        val r = run(stdin = hex.encodeToByteArray(), args = arrayOf(
            "secret-tool", "store", "--label=Nostrism nsec", *attrArgs.toTypedArray(),
        ))
        require(!r.timedOut && r.exit == 0) {
            "secret-tool store failed (exit=${r.exit}): ${r.stderr.ifEmpty { r.stdout }}"
        }
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