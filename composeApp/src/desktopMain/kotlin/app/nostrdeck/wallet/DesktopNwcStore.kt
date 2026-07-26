package app.nostrdeck.wallet

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.toHex
import java.io.File

/**
 * [#7] NWC 接続文字列（secret を含む）の Desktop 保存。
 * macOS は Keychain（`security` CLI、[app.nostrdeck.signer.MacKeychainKeyVault] と同方式）。
 * 値は hex エンコードして保存する（URI の `?&=` を CLI のパーサに通さないため）。
 * macOS 以外は平文ファイル（~/.nostrism/nwc.uri）へのフォールバック。
 */
class DesktopNwcStore(
    private val appDir: File,
    private val service: String = "net.shino3.nostrism.nwc",
    private val account: String = "nwc-uri",
) : NwcStore {

    private val isMac = System.getProperty("os.name").orEmpty().lowercase().contains("mac")
    private val fallback = File(appDir, "nwc.uri")

    override fun save(uri: String) {
        if (!isMac) { fallback.parentFile?.mkdirs(); fallback.writeText(uri); return }
        val cmd = "add-generic-password -a $account -s $service -w ${uri.encodeToByteArray().toHex()} -U\n"
        val p = ProcessBuilder("security", "-i").redirectErrorStream(true).start()
        p.outputStream.use { it.write(cmd.encodeToByteArray()) }
        val out = p.inputStream.readBytes().decodeToString().trim()
        check(p.waitFor() == 0) { "keychain write failed: $out" }
    }

    override fun load(): String? {
        if (!isMac) return fallback.takeIf { it.exists() }?.readText()?.trim()?.takeIf { it.isNotBlank() }
        val p = ProcessBuilder("security", "find-generic-password", "-a", account, "-s", service, "-w")
            .redirectErrorStream(true).start()
        val out = p.inputStream.readBytes().decodeToString().trim()
        if (p.waitFor() != 0 || out.isBlank()) return null
        return runCatching { out.hexToBytes().decodeToString() }.getOrNull()
    }

    override fun clear() {
        if (!isMac) { fallback.delete(); return }
        ProcessBuilder("security", "delete-generic-password", "-a", account, "-s", service)
            .redirectErrorStream(true).start().waitFor()
    }
}
