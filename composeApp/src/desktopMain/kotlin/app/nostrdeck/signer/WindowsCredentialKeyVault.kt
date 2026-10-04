package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex
import com.sun.jna.Memory
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.WString
import com.sun.jna.platform.win32.Kernel32Util
import com.sun.jna.ptr.PointerByReference
import java.nio.charset.StandardCharsets

/**
 * [#218] Windows Credential Manager に nsec を保管する KeyVault。
 *
 * Windows ネイティブ API (CredWrite, CredRead, CredDelete, CredFree) を JNA 経由で直接呼び出す。
 * PowerShell モジュール (CredentialManager) を必要とせず、標準の Windows API のみで動作する。
 */
class WindowsCredentialKeyVault(
    private val targetName: String = "Nostrism:NostrKey",
    private val userName: String = "nostr-nsec",
) : KeyVault {

    private val advapi32 = Advapi32.INSTANCE

    override fun hasKey(): Boolean {
        return readHex() != null
    }

    override fun privateKey(): ByteArray {
        val hex = readHex() ?: error("no key in Credential Manager")
        return hex.hexToBytes()
    }

    private fun readHex(): String? {
        val pCred = PointerByReference()
        val result = advapi32.CredReadW(targetName, CRED_TYPE_GENERIC, 0, pCred)
        if (!result) return null

        try {
            val cred = CREDENTIAL(pCred.value)
            // CredentialBlob はバイト配列として格納される (ワイド文字列ではない)
            val blobSize = cred.CredentialBlobSize
            if (blobSize != 64) return null // 64 hex chars = 32 bytes

            val blob = ByteArray(blobSize)
            val blobPtr = cred.CredentialBlob ?: return null
            blobPtr.read(0, blob, 0, blobSize)
            return String(blob, StandardCharsets.UTF_8).takeIf { it.length == 64 }
        } finally {
            advapi32.CredFree(pCred.value)
        }
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex().toByteArray(StandardCharsets.UTF_8)
        require(hex.size == 64) { "hex must be 64 chars" }

        val blobMem = Memory(hex.size.toLong()).apply { write(0, hex, 0, hex.size) }

        val cred = CREDENTIAL().apply {
            Flags = 0
            Type = CRED_TYPE_GENERIC
            // WString を使うと JNA が NUL 終端・UTF-16・生存期間を自動で面倒を見る
            TargetName = WString(targetName)
            UserName = WString(userName)
            Comment = null
            TargetAlias = null
            CredentialBlobSize = hex.size
            CredentialBlob = blobMem
            Persist = CRED_PERSIST_LOCAL_MACHINE // この PC のこのユーザーの以後のログオンセッションで有効
            AttributeCount = 0
            Attributes = Pointer.NULL
            LastWritten = WinFileTime()
        }

        val result = advapi32.CredWriteW(cred, 0)
        if (!result) {
            val error = Native.getLastError()
            throw IllegalArgumentException("credential write failed (error=$error): ${Kernel32Util.formatMessage(error)}")
        }
    }

    override fun generate(): ByteArray {
        val k = secureRandomBytes(32)
        importPrivateKey(k)
        return k
    }

    override fun clear() {
        advapi32.CredDeleteW(targetName, CRED_TYPE_GENERIC, 0)
        // Ignore error - credential might not exist
    }

    companion object {
        private const val CRED_TYPE_GENERIC = 1
        private const val CRED_PERSIST_SESSION = 1
        private const val CRED_PERSIST_LOCAL_MACHINE = 2
        private const val CRED_PERSIST_ENTERPRISE = 3
    }
}