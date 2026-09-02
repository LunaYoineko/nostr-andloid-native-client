package app.nostrdeck.model

/**
 * [#384] addressable(parameterized replaceable, kind 30000-39999) イベントの共通処理。
 *
 * この種のイベントは `(kind, pubkey, d タグ)` が同一なら**同じ1件の版違い**で、リレーには
 * 古い版も残り得る（DB にも取り込み順に両方入る）。一覧に出すときは d ごとに最新版だけを見せる。
 */

/** イベントの `d` タグ（無ければ空文字＝NIP-01 の既定）。 */
fun NostrEvent.dTag(): String =
    tags.firstOrNull { it.size >= 2 && it[0] == "d" }?.get(1) ?: ""

/** イベントの最初の [name] タグ値（空文字は無しとして扱う）。 */
fun NostrEvent.tagValue(name: String): String? =
    tags.firstOrNull { it.size >= 2 && it[0] == name }?.get(1)?.takeIf { it.isNotBlank() }

/**
 * addressable イベント群を `d` タグごとに最新版（created_at 最大。同値なら先に来た方）へ畳み、
 * 新しい順に並べて返す。
 */
fun latestByDTag(events: List<NostrEvent>): List<NostrEvent> =
    events.groupBy { it.dTag() }
        .values
        .map { versions -> versions.maxByOrNull { it.createdAt }!! }
        .sortedByDescending { it.createdAt }
