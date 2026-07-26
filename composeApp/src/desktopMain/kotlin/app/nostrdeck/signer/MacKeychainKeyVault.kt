package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex

/**
 * [#221] macOS Keychain に nsec を保管する KeyVault（`security` CLI 経由）。
 *
 * 旧 [DesktopKeyVault]（~/.nostrism/key.bin への平文保管）の置き換え。JVM から Security.framework を
 * 直接呼ぶには JNI/JNA が要るため、macOS 標準の `security` コマンドで代替する。
 *
 * 書き込みは `security -i`（対話モード）の stdin にコマンドを流す。`-w <hex>` を argv に載せると
 * 実行中に `ps` で秘密鍵が見えてしまうため（一瞬でも露出させない）。
 */
class MacKeychainKeyVault(
    private val service: String = "net.shino3.nostrism",
    private val account: String = "nostr-nsec",
) : KeyVault {

    private fun run(vararg args: String): Pair<Int, String> {
        val p = ProcessBuilder(*args).redirectErrorStream(true).start()
        val out = p.inputStream.readBytes().decodeToString().trim()
        return p.waitFor() to out
    }

    /** Keychain 上の鍵（hex 64桁）。無ければ null。 */
    private fun readHex(): String? {
        val (code, out) = run("security", "find-generic-password", "-a", account, "-s", service, "-w")
        return out.takeIf { code == 0 && it.length == 64 }
    }

    override fun hasKey(): Boolean = readHex() != null

    override fun privateKey(): ByteArray {
        val hex = readHex() ?: error("no key set")
        return hex.hexToBytes()
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        // -U: 既存エントリがあれば上書き。hex は英数のみなのでクォート不要。
        val cmd = "add-generic-password -a $account -s $service -w ${privateKey.toHex()} -U\n"
        val p = ProcessBuilder("security", "-i").redirectErrorStream(true).start()
        p.outputStream.use { it.write(cmd.encodeToByteArray()) }
        val out = p.inputStream.readBytes().decodeToString().trim()
        require(p.waitFor() == 0) { "keychain write failed: $out" }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        run("security", "delete-generic-password", "-a", account, "-s", service)
    }
}
