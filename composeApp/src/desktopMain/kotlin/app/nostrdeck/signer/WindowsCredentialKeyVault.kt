package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex

/**
 * [#218] Windows Credential Manager に nsec を保管する KeyVault。
 *
 * PowerShell の `Get-StoredCredential` / `New-StoredCredential` を使用。
 * `-Persist CurrentUser` で管理者権限不要。実行ポリシー回避で `-ExecutionPolicy Bypass` 付与。
 */
class WindowsCredentialKeyVault(
    private val targetName: String = "Nostrism:NostrKey",
    private val userName: String = "nostr-nsec",
) : KeyVault {

    private fun run(vararg args: String): Pair<Int, String> {
        val p = ProcessBuilder(*args).redirectErrorStream(true).start()
        val out = p.inputStream.readBytes().decodeToString().trim()
        return p.waitFor() to out
    }

    private fun runPs(script: String): Pair<Int, String> = run(
        "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script
    )

    /** Credential Manager から鍵（hex 64桁）を取得。無ければ null。 */
    private fun readHex(): String? {
        val script = """
            \${'$'}cred = Get-StoredCredential -Target '$targetName' -ErrorAction SilentlyContinue
            if (\${'$'}cred) {
                \${'$'}ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(\${'$'}cred.Password)
                try { [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(\${'$'}ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(\${'$'}ptr) }
            }
        """.trimIndent()
        val (code, out) = runPs(script)
        return out.takeIf { code == 0 && it.length == 64 }
    }

    override fun hasKey(): Boolean {
        val script = "Get-StoredCredential -Target '$targetName' -ErrorAction SilentlyContinue"
        val (code, _) = runPs(script)
        return code == 0
    }

    override fun privateKey(): ByteArray {
        val hex = readHex() ?: error("no key in Credential Manager")
        return hex.hexToBytes()
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex()
        // -Persist CurrentUser で管理者権限不要
        val script = """
            \${'$'}sec = ConvertTo-SecureString '$hex' -AsPlainText -Force
            New-StoredCredential -Target '$targetName' -UserName '$userName' -Password \${'$'}sec -Persist CurrentUser -ErrorAction Stop
        """.trimIndent()
        val (code, out) = runPs(script)
        require(code == 0) { "credential write failed: $out" }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        val script = "Remove-StoredCredential -Target '$targetName' -ErrorAction SilentlyContinue"
        runPs(script)
    }
}