package app.nostrdeck.ui

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

/**
 * [#141] ExoPlayer のプール。
 *
 * **解く問題**: 動画は `LazyColumn` の項目として描かれるため、画面外へスクロールすると
 * コンポジションから外れ `player.release()` が走る。戻ってくると
 *  - プレイヤーを作り直す（コーデック初期化 + 再バッファリング）
 *  - **再生位置が 0 に戻る**
 *  - `activated` も `remember` なので false に戻り、**ポスターから押し直し**になる
 *
 * URL をキーにしたプールで実体を生かしておけば、戻ったときに位置ごと復帰できる。
 *
 * **上限を設ける理由**: `MediaCodec` はハードウェアの有限資源で、端末によっては
 * 同時に確保できる数が数個しかない。使い切ると他アプリを含めて再生が失敗するため、
 * LRU で [MAX] 本に抑え、あふれた分は本当に解放する。
 *
 * 同時再生の抑止は従来どおり [VideoPlaybackArbiter] が担う（プールは"生かす"だけで
 * "鳴らす"判断はしない）。プールへ戻すときは必ず一時停止するので、画面外の動画から
 * 音が出続けることはない。
 */
@UnstableApi
object ExoPlayerPool {
    /** 同時に生かす上限。MediaCodec の枯渇を避けるため小さく保つ。 */
    private const val MAX = 3

    /** accessOrder=true の LinkedHashMap＝アクセス順 LRU。先頭が最も古い。 */
    private val pool = object : LinkedHashMap<String, ExoPlayer>(0, 0.75f, true) {}

    /** この URL のプレイヤーが生きているか（＝ポスターではなく再生UIを出してよいか）。 */
    @Synchronized
    fun has(url: String): Boolean = pool.containsKey(url)

    /**
     * URL に対応するプレイヤーを得る。プールにあれば**位置を保ったまま**それを返し、
     * 無ければ新規に作って登録する。あふれたら最も古いものを本当に解放する。
     */
    @Synchronized
    fun acquire(context: Context, url: String): ExoPlayer {
        pool[url]?.let { return it }
        val player = ExoPlayer.Builder(context.applicationContext).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            volume = 0f          // 既定ミュート（TL を流しても静か）
            prepare()
        }
        pool[url] = player
        evictIfNeeded()
        return player
    }

    /**
     * 画面外へ出たときの返却。**解放せず一時停止するだけ**で、位置はそのまま残す。
     * 実体の解放は [evictIfNeeded] の LRU 追い出しか [releaseAll] で行う。
     */
    @Synchronized
    fun recycle(url: String) {
        val p = pool[url] ?: return
        p.playWhenReady = false
        VideoPlaybackArbiter.onRelease(p)
    }

    private fun evictIfNeeded() {
        while (pool.size > MAX) {
            val oldest = pool.entries.iterator().next()
            pool.remove(oldest.key)
            VideoPlaybackArbiter.onRelease(oldest.value)
            oldest.value.release()
        }
    }

    /** プロセス終了時（Activity 破棄）に全部返す。デコーダを持ったまま残さない。 */
    @Synchronized
    fun releaseAll() {
        pool.values.forEach {
            VideoPlaybackArbiter.onRelease(it)
            it.release()
        }
        pool.clear()
    }
}
