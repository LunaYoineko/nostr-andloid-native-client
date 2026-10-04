package app.nostrdeck.signer

import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.Structure
import com.sun.jna.WString
import com.sun.jna.ptr.PointerByReference
import com.sun.jna.win32.StdCallLibrary
import com.sun.jna.win32.W32APIOptions

/**
 * [#218] advapi32.dll の Credential Management API（JNA マッピング）。
 *
 * Java ではなく Kotlin に置いているのは、desktopMain に Java ソースを 1 ファイルでも入れると
 * `compileDesktopMainJava` が有効になり、Gradle デーモン（JDK 21）の Java ターゲットと
 * Kotlin の jvmTarget（17）が不一致になってビルドが落ちるため。
 * main 側にも Java ソースは無いので、ここも Kotlin に揃えて `./gradlew :composeApp:run` を壊さない。
 */
internal interface Advapi32 : StdCallLibrary {

    /** CredReadW: TargetName の資格情報を読む。見つからない場合は false。 */
    fun CredReadW(targetName: String, type: Int, flags: Int, credential: PointerByReference): Boolean

    /** CredWriteW: 資格情報を保存（上書き）する。 */
    fun CredWriteW(credential: CREDENTIAL, flags: Int): Boolean

    /** CredDeleteW: 資格情報を削除する。存在しなければ false（例外にしない）。 */
    fun CredDeleteW(targetName: String, type: Int, flags: Int): Boolean

    /** CredFree: CredReadW が確保したバッファを解放する。 */
    fun CredFree(buffer: Pointer)

    companion object {
        val INSTANCE: Advapi32 =
            Native.load("advapi32", Advapi32::class.java, W32APIOptions.UNICODE_OPTIONS)
    }
}

/**
 * Windows FILETIME 構造体（64bit FILETIME）。
 *
 * `com.sun.jna.platform.win32.WinNT.FILETIME` と同じレイアウトだが、ここでは自前に持つ。
 * jna-platform 側の同名型と混在するのを避けるため、使う場面（構造体フィールド）も限定している。
 */
internal class WinFileTime : Structure {
    var dwLowDateTime: Int = 0
    var dwHighDateTime: Int = 0

    override fun getFieldOrder(): List<String> = FIELD_ORDER

    constructor() : super(Pointer.NULL)

    constructor(pointer: Pointer) : super(pointer) {
        read()
    }

    companion object {
        private val FIELD_ORDER = listOf("dwLowDateTime", "dwHighDateTime")
    }
}

/**
 * Windows CREDENTIALW 構造体（JNA マッピング）。
 * https://learn.microsoft.com/windows/win32/api/wincred/ns-wincred-credentialw
 *
 * `Flags`, `Type`, `CredentialBlobSize`, `Persist`, `AttributeCount` は Win32 では DWORD（32bit）。
 * `CredentialBlobSize` を long にしてはいけない（x86 では以降のレイアウトが全部ずれる）。
 *
 * 文字列フィールドは `WString` にしてある。JNA が NUL 終端・UTF-16・生存期間を面倒を見るので、
 * 自前で `Memory` を触るより安全かつ短く書ける。`null` はそのまま NULL ポインタになる。
 */
internal class CREDENTIAL : Structure {
    var Flags: Int = 0
    var Type: Int = 0
    var TargetName: WString? = null
    var Comment: WString? = null
    var LastWritten: WinFileTime = WinFileTime()
    var CredentialBlobSize: Int = 0
    var CredentialBlob: Pointer? = null
    var Persist: Int = 0
    var AttributeCount: Int = 0
    var Attributes: Pointer? = null
    var TargetAlias: WString? = null
    var UserName: WString? = null

    override fun getFieldOrder(): List<String> = FIELD_ORDER

    constructor() : super(Pointer.NULL)

    constructor(pointer: Pointer) : super(pointer) {
        read()
    }

    companion object {
        private val FIELD_ORDER = listOf(
            "Flags", "Type", "TargetName", "Comment", "LastWritten",
            "CredentialBlobSize", "CredentialBlob", "Persist",
            "AttributeCount", "Attributes", "TargetAlias", "UserName",
        )
    }
}