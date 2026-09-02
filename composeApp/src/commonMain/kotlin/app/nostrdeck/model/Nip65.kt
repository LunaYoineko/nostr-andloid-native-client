package app.nostrdeck.model

/**
 * [#386] NIP-65（kind:10002）の `r` タグ解釈。
 * `["r", <url>, <marker?>]` の marker は "read"(Inbox のみ) / "write"(Outbox のみ)、
 * 無印は read+write の両用。URL の正規化は呼び出し側（Repository）の規則に合わせて渡す。
 */
fun nip65PrefsFromTags(
    tags: List<List<String>>,
    normalize: (String) -> String = { it.trim().trimEnd('/') },
): List<RelayPref> =
    tags.filter { it.size >= 2 && it[0] == "r" }
        .mapNotNull { tag ->
            val url = normalize(tag[1])
            // ws:// も NIP-65 上は有効だが、接続対象は wss:// のみに揃える（既存の購読と同じ規則）。
            if (!url.startsWith("wss://")) return@mapNotNull null
            val marker = tag.getOrNull(2)?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
            RelayPref(
                url = url,
                read = marker != "write",
                write = marker != "read",
                source = "nip65",
            )
        }
        .distinctBy { it.url }
