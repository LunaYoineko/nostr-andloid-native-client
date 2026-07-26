package app.nostrdeck

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import app.nostrdeck.data.EventRepository
import app.nostrdeck.state.DeckState
import app.nostrdeck.ui.handleDeckKey
import app.nostrdeck.data.defaultRelaysFor
import app.nostrdeck.db.DriverFactory
import app.nostrdeck.db.createDatabase
import app.nostrdeck.signer.DesktopKeyVault
import app.nostrdeck.signer.KeyVault
import app.nostrdeck.signer.MacKeychainKeyVault
import app.nostrdeck.signer.SignerProvider
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File
import java.util.Locale

// [#218] Desktop(Mac) エントリ。Android MainActivity / iOS MainViewController と同じ骨格:
// 鍵保管(KeyVault) → DB(DriverFactory) → EventRepository を1つ組み立てて App() に渡す。
private val appScope = CoroutineScope(
    SupervisorJob() + Dispatchers.Default +
        CoroutineExceptionHandler { _, t -> println("Nostrism uncaught in appScope: $t") },
)

// アプリで1つ。データは ~/.nostrism/ 配下（DB と鍵）。
private val appDir: File = File(System.getProperty("user.home"), ".nostrism").apply { mkdirs() }

/**
 * [#221] 鍵保管の選択。macOS は Keychain（security CLI）。それ以外の OS は従来のファイル保管。
 * 旧・平文ファイル(key.bin)が残っていれば Keychain へ移行し、移行を確認してから平文を消す。
 */
private fun buildKeyVault(): KeyVault {
    val isMac = System.getProperty("os.name").orEmpty().lowercase().contains("mac")
    val legacy = File(appDir, "key.bin")
    if (!isMac) return DesktopKeyVault(legacy)

    val kc = MacKeychainKeyVault()
    if (legacy.exists() && legacy.length() == 32L) {
        runCatching {
            if (!kc.hasKey()) kc.importPrivateKey(legacy.readBytes())
            // Keychain 側と同じ鍵であることを読み戻しで確認してから平文を消す。
            // （別鍵が既に Keychain にある場合は上書きも削除もしない＝鍵を失わない）
            if (kc.privateKey().contentEquals(legacy.readBytes())) {
                legacy.delete()
                println("Nostrism [#221] key migrated to macOS Keychain; plaintext key.bin removed")
            } else {
                println("Nostrism [#221] Keychain already holds a different key; key.bin left in place")
            }
        }.onFailure { println("Nostrism [#221] keychain migration failed: $it") }
    }
    return kc
}

private val repository: EventRepository by lazy {
    SignerProvider.useVault(buildKeyVault())
    // [#7] NWC（ウォレット接続）。保存済み接続があれば復元する。
    app.nostrdeck.wallet.NwcManager.init(appScope, app.nostrdeck.wallet.DesktopNwcStore(appDir))
    app.nostrdeck.wallet.NwcManager.restore()
    val db = createDatabase(DriverFactory(File(appDir, "nostr.db")))
    val relays = defaultRelaysFor(Locale.getDefault().language)
    EventRepository(db, appScope, relays).apply { start() }
}

fun main() = application {
    val repo = remember { repository }
    // [#14] Desktop はウィンドウレベルでキーを拾う（フォーカス非依存＝マウス操作後も確実）。
    // DeckState は App() 生成後にコールバックで受け取る。
    var deck by remember { mutableStateOf<DeckState?>(null) }
    Window(
        onCloseRequest = ::exitApplication,
        title = "Nostrism",
        state = rememberWindowState(width = 1280.dp, height = 860.dp),
        onPreviewKeyEvent = { e -> deck?.let { handleDeckKey(it, e) { repo.reconnectAll() } } ?: false },
    ) {
        App(repo, onDeckState = { deck = it })
    }
}
