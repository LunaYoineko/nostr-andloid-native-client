package app.nostrdeck.data

import app.nostrdeck.crypto.Nip19
import app.nostrdeck.model.ContentToken
import app.nostrdeck.model.tokenizeNostrContent

/**
 * [#350] NIP-27（本文中の nostr: 参照）のメンション抽出。
 *
 * 本文に書かれた `nostr:npub1…` / `nostr:nprofile1…` を hex pubkey の列に解決する。
 * NIP-27 は「メンションした相手へは `p` タグを付けて通知が届くようにする」ことを
 * 期待しており（Bot は #p 購読で反応する）、投稿系の全経路がここを通る。
 * 純関数だけを置く（Nip10 と同じ方針。DB/署名と切り離してテストするため）。
 */
object Nip27 {

    /**
     * [content] からメンション先の hex pubkey を抽出する（出現順・重複除去）。
     * `nostr:` 接頭辞は任意。npub に加えて nprofile も拾う。
     * 表示側（ContentText）は nprofile も @名前 に展開するので、抽出だけ npub 限定だと
     * 「見た目はメンションなのに通知が飛ばない」不一致になる。
     * チェックサム不正など解析できないものは黙って捨てる（本文は自由入力のため）。
     *
     * [#369] 走査は共通トークナイザ [tokenizeNostrContent] に一本化。URL が先に
     * 1トークンとして確定するので、`https://…/user/npub1…` のような URL パス中の
     * bech32 は拾わない（表示側がメンション扱いしないものへ p タグを付けない）。
     * 語中ヒット（直前が英数字）を拾わない規則もトークナイザ側が持つ。
     */
    fun mentionPubkeys(content: String): List<String> =
        tokenizeNostrContent(content)
            .filterIsInstance<ContentToken.NostrRef>()
            .filter { it.bech.startsWith("npub1") || it.bech.startsWith("nprofile1") }
            .mapNotNull { Nip19.mentionBechToHex(it.bech) }
            .distinct()

    /**
     * メンション先の `p` タグを組み立てる。[existing] に既にある pubkey は重複させない
     * （返信の NIP-10 継承分や返信相手など、呼び出し側が先に積んだ p と揃えるため）。
     */
    fun mentionPTags(content: String, existing: Collection<String> = emptyList()): List<List<String>> {
        val seen = existing.toHashSet()
        return mentionPubkeys(content).filter { seen.add(it) }.map { listOf("p", it) }
    }
}
