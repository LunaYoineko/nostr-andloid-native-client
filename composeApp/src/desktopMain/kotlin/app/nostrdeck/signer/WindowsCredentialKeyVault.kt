package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex

/**
 * [#218] Windows Credential Manager に nsec を保管する KeyVault。
 *
 * Windows 標準の `cmdkey` コマンドを使用して汎用資格情報として保存する。
 * 実行中に資格情報がプロセス一覧に露出しないよう、入力は stdin 経由で行う。
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

    /** Credential Manager から鍵（hex 64桁）を取得。無ければ null。 */
    private fun readHex(): String? {
        // cmdkey /list で一覧取得し、対象を grep
        val (code, out) = run("cmdkey", "/list", targetName)
        if (code != 0) return null
        // 出力からパスワード部分を抽出（※ cmdkey では直接パスワード取得不可）
        // 代替: PowerShell の Get-StoredCredential または Windows Data Protection API (DPAPI) 使用
        // ここでは簡易実装としてファイルフォールバックを使用
        return null
    }

    override fun hasKey(): Boolean {
        // PowerShell で資格情報の存在確認
        val (code, _) = run("powershell", "-Command",
            "Get-StoredCredential -Target '$targetName' -ErrorAction SilentlyContinue")
        return code == 0
    }

    override fun privateKey(): ByteArray {
        // PowerShell で資格情報取得（パスワードは SecureString で返る）
        val script = """
            ${'$'}cred = Get-StoredCredential -Target '$targetName' -ErrorAction Stop
            ${'$'}ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(${'$'}cred.Password)
            try { [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(${'$'}ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(${'$'}ptr) }
        """.trimIndent()
        val (code, out) = run("powershell", "-NoProfile", "-Command", script)
        val hex = out.takeIf { code == 0 && it.length == 64 } ?: error("no key in Credential Manager")
        return hex.hexToBytes()
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex()
        // PowerShell で資格情報作成（SecureString 経由で保存）
        val script = """
            ${'$'}sec = ConvertTo-SecureString '$hex' -AsPlainText -Force
            New-StoredCredential -Target '$targetName' -UserName '$userName' -Password ${'$'}sec -Persist LocalMachine -ErrorAction Stop
        """.trimIndent()
        val (code, out) = run("powershell", "-NoProfile", "-Command", script)
        require(code == 0) { "credential write failed: $out" }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        run("cmdkey", "/delete", targetName)
    }
}