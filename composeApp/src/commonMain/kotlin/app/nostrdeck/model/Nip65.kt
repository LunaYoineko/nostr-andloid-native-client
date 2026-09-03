package app.nostrdeck.model

/**
 * [#386][#390] NIP-65（kind:10002）の `r` タグ解釈。自分の 10002（リレー設定）と
 * 他人の 10002（プロフィールの「使用リレー」表示）の**両方がここを通る**（解釈の乖離を防ぐ）。
 *
 * `["r", <url>, <marker?>]` の marker は "read"(Inbox のみ) / "write"(Outbox のみ)、
 * 無印は read+write の両用。marker は前後空白と大小文字を無視する。URL は [normalize] 後に重複を畳む。
 *
 * @param requireWss true なら `wss://` 以外を捨てる（他人のリレーを自分の接続先候補として出す側）。
 *   false なら空でない URL をそのまま通す（自分の設定。ローカル開発リレーの `ws://` を壊さない）。
 */
fun nip65PrefsFromTags(
    tags: List<List<String>>,
    requireWss: Boolean = true,
    normalize: (String) -> String = { it.trim().trimEnd('/') },
): List<RelayPref> =
    tags.filter { it.size >= 2 && it[0] == "r" }
        .mapNotNull { tag ->
            val url = normalize(tag[1])
            if (url.isBlank()) return@mapNotNull null
            if (requireWss && !url.startsWith("wss://")) return@mapNotNull null
            val marker = tag.getOrNull(2)?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
            RelayPref(
                url = url,
                read = marker != "write",
                write = marker != "read",
                source = "nip65",
            )
        }
        .distinctBy { it.url }
