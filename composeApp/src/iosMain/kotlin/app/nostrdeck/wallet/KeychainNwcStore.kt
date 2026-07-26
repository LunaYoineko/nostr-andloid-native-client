package app.nostrdeck.wallet

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ByteVar
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.convert
import kotlinx.cinterop.get
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.usePinned
import kotlinx.cinterop.value
import platform.CoreFoundation.CFDictionaryAddValue
import platform.CoreFoundation.CFDictionaryCreateMutable
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFRelease
import platform.CoreFoundation.CFStringRef
import platform.CoreFoundation.CFTypeRef
import platform.CoreFoundation.CFTypeRefVar
import platform.CoreFoundation.kCFBooleanTrue
import platform.Foundation.CFBridgingRelease
import platform.Foundation.CFBridgingRetain
import platform.Foundation.NSData
import platform.Foundation.NSString
import platform.Foundation.create
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecItemNotFound
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccessible
import platform.Security.kSecAttrAccessibleWhenUnlockedThisDeviceOnly
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData

/**
 * [#7] NWC 接続文字列（secret を含む）の iOS Keychain 保存。
 * [app.nostrdeck.signer.KeychainKeyVault] と同じ SecItem パターン（可変長データ版）。
 * アクセス制御も同じ kSecAttrAccessibleWhenUnlockedThisDeviceOnly。
 */
@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
class KeychainNwcStore(
    private val service: String = "app.nostrdeck.nwc",
    private val account: String = "default",
) : NwcStore {

    override fun save(uri: String) {
        deleteItem()
        val valueRef = CFBridgingRetain(uri.encodeToByteArray().toNSData())
        val query = cfDictionaryOf(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service.toCFString(),
            kSecAttrAccount to account.toCFString(),
            kSecValueData to valueRef,
            kSecAttrAccessible to kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        )
        val status = SecItemAdd(query, null)
        CFRelease(query)
        CFBridgingRelease(valueRef)
        check(status == errSecSuccess) { "SecItemAdd failed: status=$status" }
    }

    override fun load(): String? = readData()?.decodeToString()

    override fun clear() = deleteItem()

    private fun readData(): ByteArray? = memScoped {
        val query = cfDictionaryOf(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service.toCFString(),
            kSecAttrAccount to account.toCFString(),
            kSecReturnData to kCFBooleanTrue,
            kSecMatchLimit to kSecMatchLimitOne,
        )
        val result = alloc<CFTypeRefVar>()
        val status = SecItemCopyMatching(query, result.ptr)
        CFRelease(query)
        when (status) {
            errSecSuccess -> (CFBridgingRelease(result.value) as? NSData)?.toByteArray()
            errSecItemNotFound -> null
            else -> null
        }
    }

    private fun deleteItem() {
        val query = cfDictionaryOf(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to service.toCFString(),
            kSecAttrAccount to account.toCFString(),
        )
        SecItemDelete(query)
        CFRelease(query)
    }

    private fun cfDictionaryOf(vararg items: Pair<CFStringRef?, CFTypeRef?>): CFDictionaryRef {
        val dict = CFDictionaryCreateMutable(null, items.size.convert(), null, null)
        for ((k, v) in items) CFDictionaryAddValue(dict, k, v)
        return dict!!
    }

    private fun String.toCFString(): CFStringRef? =
        CFBridgingRetain(this as NSString)?.reinterpret()

    private fun ByteArray.toNSData(): NSData =
        if (isEmpty()) NSData() else usePinned {
            NSData.create(bytes = it.addressOf(0), length = size.convert())
        }

    private fun NSData.toByteArray(): ByteArray {
        val len = length.toInt()
        if (len == 0) return ByteArray(0)
        val src = bytes!!.reinterpret<ByteVar>()
        return ByteArray(len) { i -> src[i] }
    }
}
