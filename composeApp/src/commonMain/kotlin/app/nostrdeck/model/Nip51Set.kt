package app.nostrdeck.model

/**
 * [#385] NIP-51 の「セット」（addressable なリスト）。
 *
 * 対象は **フォローセット kind:30000** と **ブックマークセット kind:30003** の2種類だけに絞る
 * （他 kind のセットは表示の意味付けが別なので今回は扱わない）。
 *
 * `content` が空でないものは NIP-04/44 で暗号化された非公開項目を持つが、**他人のものは復号できない**。
 * ここでは公開タグだけを解析し、非公開の有無だけ [hasPrivate] で伝える。
 */
data class Nip51Set(
    val kind: Int,
    val author: String,
    val dTag: String,
    /** 表示名。`title` タグ、無ければ `d` タグ。 */
    val title: String,
    val description: String = "",
    val image: String? = null,
    /** フォローセット(30000)のメンバー。 */
    val members: List<String> = emptyList(),
    /** ブックマークセット(30003)のイベント id。 */
    val eventIds: List<String> = emptyList(),
    /** ブックマークセット(30003)のアドレス参照（"kind:pubkey:d"）。記事等。 */
    val addresses: List<String> = emptyList(),
    val createdAt: Long = 0,
    /** 暗号化された非公開項目を持つか（他人のものは中身を出せない）。 */
    val hasPrivate: Boolean = false,
) {
    /** 行に出す公開項目の件数。 */
    val count: Int get() = members.size + eventIds.size + addresses.size

    /** 座標（同一なら版違い）。 */
    val address: String get() = "$kind:$author:$dTag"
}

/** [#385] 対象とする NIP-51 セットの kind。 */
val NIP51_SET_KINDS = listOf(30000, 30003)

/**
 * NIP-51 セットを解析する。公開タグのみを見る（非公開は content 側で復号が要るため）。
 * `p` はフォローセットのメンバー、`e`/`a` はブックマークの対象。
 */
fun parseNip51Set(event: NostrEvent): Nip51Set {
    val d = event.dTag()
    fun values(name: String) = event.tags.filter { it.size >= 2 && it[0] == name }
        .map { it[1] }.filter { it.isNotBlank() }.distinct()
    return Nip51Set(
        kind = event.kind,
        author = event.pubkey,
        dTag = d,
        title = event.tagValue("title") ?: event.tagValue("name") ?: d,
        description = event.tagValue("description").orEmpty(),
        image = event.tagValue("image") ?: event.tagValue("picture"),
        members = values("p"),
        eventIds = values("e"),
        addresses = values("a"),
        createdAt = event.createdAt,
        hasPrivate = event.content.isNotBlank(),
    )
}

/**
 * イベント群を NIP-51 セットへ解析する。同一座標(kind:pubkey:d)は最新版だけを残し、
 * 新しい順に並べる。中身が空のセット（全項目が非公開 or 削除済み）も、
 * 非公開があるなら残す（「見えないものがある」ことは伝える価値がある）。
 */
fun parseNip51Sets(events: List<NostrEvent>): List<Nip51Set> =
    events.filter { it.kind in NIP51_SET_KINDS }
        .groupBy { "${it.kind}:${it.pubkey}:${it.dTag()}" }
        .values
        .map { versions -> parseNip51Set(versions.maxByOrNull { it.createdAt }!!) }
        .filter { it.count > 0 || it.hasPrivate }
        .sortedByDescending { it.createdAt }
