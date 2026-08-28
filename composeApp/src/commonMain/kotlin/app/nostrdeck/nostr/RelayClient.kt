package app.nostrdeck.nostr

import app.nostrdeck.crypto.currentUnixTime
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ClosedReceiveChannelException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** リレー接続状態（UI のステータス表示用・モノクロ ●/◑/○）。 */
enum class RelayConnState { CONNECTING, CONNECTED, DISCONNECTED }

/** [#364] 購読(subId)単位の受信量。EVENT フレームのバイト数を購読に帰属させた概算。 */
data class RelaySubTraffic(val subId: String, val events: Long, val bytes: Long)

/** [#364] リレー1本の通信量スナップショット（開発者モードのモニタ表示用）。 */
data class RelayTraffic(
    val url: String,
    val state: RelayConnState,
    /** 現在の接続が確立した unix 秒。未接続は 0。 */
    val connectedAtSec: Long,
    val bytesIn: Long,
    val bytesOut: Long,
    val eventsIn: Long,
    val subs: List<RelaySubTraffic>,
)

/** UI 表示用のリレー1件の接続状態スナップショット。 */
data class RelayConn(val url: String, val state: RelayConnState)

/**
 * 単一リレーへの WebSocket 接続（NIP-01）。
 * 切断時は指数バックオフ+ジッターで再接続し、購読中の REQ を張り直す。
 */
class RelayClient(
    val url: String,
    private val scope: CoroutineScope,
) {
    private val client = HttpClient { install(WebSockets) }
    private val _messages = MutableSharedFlow<RelayMessage>(extraBufferCapacity = 512)
    val messages = _messages.asSharedFlow()

    private val outgoing = Channel<String>(Channel.BUFFERED)
    private val activeReqs = mutableMapOf<String, String>()  // subId → REQ json
    private var job: Job? = null
    // 現在の WebSocket セッション。強制再接続([forceReconnect])で閉じるために保持する。
    private var currentSession: DefaultClientWebSocketSession? = null
    // バックオフ待機中に即再接続させるためのシグナル（フォアグラウンド復帰時に wake()）。
    private val wakeSignal = Channel<Unit>(Channel.CONFLATED)

    private val _state = MutableStateFlow(RelayConnState.CONNECTING)
    /** 接続状態（UI 監視用）。接続中/接続済/切断。 */
    val state: StateFlow<RelayConnState> = _state.asStateFlow()
    val connected: Boolean get() = _state.value == RelayConnState.CONNECTED

    // [#364] 通信量カウンタ（セッション内累計・メモリのみ。pause/再接続でもリセットしない）。
    // 受信ループで加算し、モニタは概算値として読むだけなので厳密な同期は取らない。
    private var bytesIn = 0L
    private var bytesOut = 0L
    private var eventsIn = 0L
    private var connectedAtSec = 0L
    private class SubCounter { var events = 0L; var bytes = 0L }
    private val trafficBySub = mutableMapOf<String, SubCounter>()

    /** [#364] モニタ用スナップショット。読み取りは概算で良い（カウンタ競合は許容）。 */
    fun trafficSnapshot(): RelayTraffic = RelayTraffic(
        url = url,
        state = _state.value,
        connectedAtSec = connectedAtSec,
        bytesIn = bytesIn,
        bytesOut = bytesOut,
        eventsIn = eventsIn,
        subs = runCatching {
            trafficBySub.entries.map { RelaySubTraffic(it.key, it.value.events, it.value.bytes) }
                .sortedByDescending { it.bytes }
        }.getOrElse { emptyList() },
    )

    fun start() {
        if (job != null) return
        job = scope.launch {
            var backoff = 1000L
            while (isActive) {
                _state.value = RelayConnState.CONNECTING
                try {
                    client.webSocket(urlString = url) {
                        backoff = 1000L
                        runSession(this)
                    }
                } catch (t: CancellationException) {
                    throw t
                } catch (_: Throwable) {
                    // 接続失敗/切断 → 下でバックオフ
                }
                _state.value = RelayConnState.DISCONNECTED
                if (!isActive) break
                // バックオフ待機。ただし wake() が来たら即座に再接続を試みる（フォアグラウンド復帰）。
                val woken = withTimeoutOrNull(backoff + (0..500).random().toLong()) { wakeSignal.receive() } != null
                backoff = if (woken) 1000L else (backoff * 2).coerceAtMost(30_000)
            }
        }
    }

    private suspend fun runSession(session: DefaultClientWebSocketSession) {
        _state.value = RelayConnState.CONNECTED
        connectedAtSec = currentUnixTime()
        currentSession = session
        // (再)接続時に購読中の REQ を張り直す
        activeReqs.values.forEach { outgoing.trySend(it) }
        val sender = scope.launch {
            try {
                while (true) {
                    val text = outgoing.receive()
                    bytesOut += text.length   // [#364] REQ/EVENT はほぼ ASCII のため文字数≒バイト数で近似
                    session.send(Frame.Text(text))
                }
            } catch (t: CancellationException) {
                throw t
            } catch (_: Throwable) {
                // 送信失敗（切断直後の send 等）。ここで例外を漏らすと appScope 直下の
                // 未捕捉例外としてアプリごと落ちる(#78 実機クラッシュの正体)。受信側が
                // 切断を検知して外の再接続ループが復旧するので、握りつぶして良い。
            }
        }
        try {
            for (frame in session.incoming) {
                if (frame is Frame.Text) {
                    bytesIn += frame.data.size   // [#364] ワイヤ上のペイロードバイト数
                    val msg = RelayProtocol.parse(frame.readText())
                    if (msg is RelayMessage.Event) {
                        eventsIn++
                        val c = trafficBySub.getOrPut(msg.subscriptionId) { SubCounter() }
                        c.events++
                        c.bytes += frame.data.size
                    }
                    _messages.emit(msg)
                }
            }
        } finally {
            sender.cancel()
            currentSession = null
            connectedAtSec = 0L
        }
    }

    /** 購読開始（同じ subId は上書き）。 */
    fun subscribe(subId: String, vararg filters: Filter) {
        val req = RelayProtocol.req(subId, *filters)
        activeReqs[subId] = req
        outgoing.trySend(req)
    }

    /** 購読停止（CLOSE 送信）。 */
    fun unsubscribe(subId: String) {
        activeReqs.remove(subId)
        outgoing.trySend(RelayProtocol.close(subId))
    }

    /** イベント送信（publish）。 */
    fun publish(eventJson: String) {
        outgoing.trySend(eventJson)
    }

    /** [NIP-42] AUTH 成立後などに、現在アクティブな購読(REQ)を張り直して制限イベントを取り直す。 */
    fun resendSubscriptions() {
        activeReqs.values.forEach { outgoing.trySend(it) }
    }

    /** バックオフ待機中なら即再接続を促す（フォアグラウンド復帰時に呼ぶ）。接続中なら無害。 */
    fun wake() {
        wakeSignal.trySend(Unit)
    }

    /**
     * [#14] 現在の接続を破棄して即再接続する（Cmd+R 等の「タイムライン再構築」用）。
     * セッションを閉じると受信ループが終わり、start() の再接続ループが復帰して
     * [activeReqs]（購読中の REQ）を張り直す。切断中なら wake で即リトライさせる。
     */
    fun forceReconnect() {
        val s = currentSession
        if (s != null) scope.launch { runCatching { s.close() } }
        wake()
    }

    /**
     * [#358] バックグラウンド節約用の一時停止。接続ループを止めてソケットを閉じるが、
     * [activeReqs] と HttpClient は保持する（[stop] と違い [start] で再開でき、
     * 再接続時に購読中の REQ が自動で張り直される）。
     */
    fun pause() {
        job?.cancel()
        job = null
        _state.value = RelayConnState.DISCONNECTED
    }

    fun stop() {
        job?.cancel()
        job = null
        _state.value = RelayConnState.DISCONNECTED
        client.close()
    }
}
