package app.nostrdeck.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import app.nostrdeck.model.NetworkTier
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf

/**
 * [#359] Android 実装。ConnectivityManager のデフォルトネットワークを監視して
 *   - NOT_METERED                     → UNMETERED（Wi-Fi 等）
 *   - metered + OSのデータセーバー有効 → CONSTRAINED
 *   - metered                        → METERED（モバイル回線）
 *   - ネットワーク無し                → OFFLINE
 * を流す。[appContext] は MainActivity が Repository 生成前に注入する。
 * 未注入（テスト等）は従来どおり UNMETERED 固定＝節約分岐が無効になる安全側。
 */
actual class NetworkPolicy actual constructor() {
    companion object {
        @Volatile
        var appContext: Context? = null
    }

    actual val tier: Flow<NetworkTier> = run {
        val ctx = appContext
        if (ctx == null) {
            flowOf(NetworkTier.UNMETERED)
        } else {
            callbackFlow {
                val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                fun current(): NetworkTier {
                    val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
                        ?: return NetworkTier.OFFLINE
                    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return NetworkTier.OFFLINE
                    if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) return NetworkTier.UNMETERED
                    return if (cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED) {
                        NetworkTier.CONSTRAINED
                    } else {
                        NetworkTier.METERED
                    }
                }
                trySend(current())
                val cb = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) { trySend(current()) }
                    override fun onLost(network: Network) { trySend(current()) }
                    override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                        trySend(current())
                    }
                }
                cm.registerDefaultNetworkCallback(cb)
                awaitClose { runCatching { cm.unregisterNetworkCallback(cb) } }
            }.distinctUntilChanged()
        }
    }
}
