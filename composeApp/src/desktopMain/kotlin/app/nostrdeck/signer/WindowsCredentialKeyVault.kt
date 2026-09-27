package app.nostrdeck.signer

import app.nostrdeck.crypto.hexToBytes
import app.nostrdeck.crypto.secureRandomBytes
import app.nostrdeck.crypto.toHex
import com.sun.jna.*
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
    private val kernel32 = Kernel32.INSTANCE

    override fun hasKey(): Boolean {
        val pCred = PointerByReference()
        val result = advapi32.CredReadW(targetName, CRED_TYPE_GENERIC, 0, pCred)
        if (result) {
            advapi32.CredFree(pCred.value)
            return true
        }
        return false
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
            val blobSize = cred.CredentialBlobSize.toInt()
            if (blobSize != 64) return null // 64 hex chars = 32 bytes

            val blob = ByteArray(blobSize)
            cred.CredentialBlob.read(0, blob, 0, blobSize)
            return String(blob, StandardCharsets.UTF_8).takeIf { it.length == 64 }
        } finally {
            advapi32.CredFree(pCred.value)
        }
    }

    override fun importPrivateKey(privateKey: ByteArray) {
        require(privateKey.size == 32) { "private key must be 32 bytes" }
        val hex = privateKey.toHex().toByteArray(StandardCharsets.UTF_8)
        require(hex.size == 64) { "hex must be 64 chars" }

        val targetNamePtr = toWideString(targetName)
        val userNamePtr = toWideString(userName)
        val blobMem = Memory(hex.size.toLong()).apply { write(0, hex, 0, hex.size) }

        val cred = CREDENTIAL().apply {
            Flags = 0
            Type = CRED_TYPE_GENERIC
            TargetName = targetNamePtr
            UserName = userNamePtr
            Comment = Pointer.NULL
            TargetAlias = Pointer.NULL
            CredentialBlobSize = hex.size.toLong()
            CredentialBlob = blobMem
            Persist = CRED_PERSIST_LOCAL_MACHINE // persisted in user's profile (roaming)
            AttributeCount = 0
            Attributes = Pointer.NULL
            LastWritten = FILETIME()
        }

        val result = advapi32.CredWriteW(cred, 0)
        if (!result) {
            val error = kernel32.GetLastError()
            throw IllegalArgumentException("credential write failed (error=$error): ${getErrorMessage(error)}")
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

    private fun getErrorMessage(errorCode: Int): String {
        val buffer = Memory(1024)
        val result = kernel32.FormatMessage(
            FORMAT_MESSAGE_FROM_SYSTEM or FORMAT_MESSAGE_IGNORE_INSERTS,
            Pointer.NULL,
            errorCode,
            0,
            buffer,
            1024,
            Pointer.NULL
        )
        return if (result > 0) buffer.getString(0).trim() else "Unknown error $errorCode"
    }

    /** Kotlin String を UTF-16 (ワイド文字列) のメモリ領域に変換 */
    private fun toWideString(str: String): Pointer {
        val chars = str.toCharArray()
        val mem = Memory(((chars.size + 1) * 2).toLong()) // +1 for null terminator, *2 for UTF-16
        for (i in chars.indices) {
            mem.setShort((i * 2).toLong(), chars[i].code.toShort())
        }
        // null terminator is already zero-initialized by Memory
        return mem
    }

    companion object {
        private const val CRED_TYPE_GENERIC = 1
        private const val CRED_PERSIST_SESSION = 1
        private const val CRED_PERSIST_LOCAL_MACHINE = 2
        private const val CRED_PERSIST_ENTERPRISE = 3
        private const val FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000
        private const val FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200
    }
}