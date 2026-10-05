package app.nostrdeck.db

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.util.Properties

/**
 * [#218] Desktop(JVM) 実装。JDBC SQLite ドライバでファイル DB を開く。
 * [#736] Android / iOS と同じく、版の番号（`PRAGMA user_version`）を見て、新規なら作成、古ければ N.sqm で移行する。
 * 以前は「新規ファイルのときだけ作成」で移行も番号の記録もしていなかったため、その頃の DB には
 * 先に [LegacyDesktopDb] で番号を付け直してから開く。
 */
actual class DriverFactory(private val dbFile: File) {
    actual fun createDriver(): SqlDriver {
        dbFile.parentFile?.mkdirs()
        val url = "jdbc:sqlite:${dbFile.absolutePath}"
        if (dbFile.exists()) LegacyDesktopDb.stampVersion(url)
        return JdbcSqliteDriver(url, Properties(), NostrDb.Schema)
    }
}

/**
 * [#736] 版の番号を記録していなかった頃の Desktop の DB に、番号を付け直す。
 *
 * その頃の DB は `user_version` が 0 のままで、移行の起点が分からない（0 のまま開くと「新規」とみなされ、
 * 既にある表を作ろうとして落ちる）。各 N.sqm で増える表・列は決まっているので、どれがあるかで版を判断する。
 * この修正以降に作られる DB には必ず番号が付くので、見分ける対象は版 13（12.sqm まで）以前の DB だけ。
 * **N.sqm を足しても [MARKERS] は増やさない。**
 */
internal object LegacyDesktopDb {
    private class Marker(val version: Long, val table: String, val column: String? = null)

    /** 「その表（・列）があれば、少なくともこの版」。新しい順。N.sqm を当てると版は N+1 になる。 */
    private val MARKERS = listOf(
        // 11.sqm（publish_queue.ref_id）。続く 12.sqm は #423 より前に積まれた送信記録を捨てるデータだけの移行で、
        // ref_id がある DB は #423 以後に作られているので捨てる必要が無い（残っているのは本当に未送信の投稿）。13 とみなす。
        Marker(13, "publish_queue", "ref_id"),
        Marker(11, "ogp_cache"),          // 10.sqm
        Marker(10, "deleted_event"),      // 9.sqm
        Marker(9, "custom_emoji"),        // 8.sqm
        Marker(8, "app_setting"),         // 7.sqm
        Marker(7, "media_server"),        // 6.sqm
        Marker(6, "profile", "banner"),   // 5.sqm
        Marker(5, "profile", "lud16"),    // 4.sqm
        Marker(4, "used_hashtag"),        // 3.sqm
        Marker(3, "relay"),               // 2.sqm
        Marker(2, "event_tag"),           // 1.sqm
    )

    /** 表の一覧と列の引き方から版を判断する。どれも無ければ最初の版（1）。 */
    fun inferVersion(tables: Set<String>, columnsOf: (String) -> Set<String>): Long =
        MARKERS.firstOrNull { m -> m.table in tables && (m.column == null || m.column in columnsOf(m.table)) }?.version ?: 1L

    /** 番号が 0 なのに表がある DB だけ、判断した版を記録する。番号が付いている DB と空のファイルには何もしない。 */
    fun stampVersion(url: String) {
        DriverManager.getConnection(url).use { c ->
            if (c.longQuery("PRAGMA user_version") != 0L) return
            val tables = c.strings("SELECT name FROM sqlite_master WHERE type = 'table'")
            if ("event" !in tables) return
            val version = inferVersion(tables) { table -> c.strings("SELECT name FROM pragma_table_info('$table')") }
            c.createStatement().use { it.execute("PRAGMA user_version = $version") }
            println("Nostrism [#736] legacy desktop DB: user_version 0 -> $version")
        }
    }

    private fun Connection.longQuery(sql: String): Long =
        createStatement().use { s -> s.executeQuery(sql).use { r -> if (r.next()) r.getLong(1) else 0L } }

    private fun Connection.strings(sql: String): Set<String> =
        createStatement().use { s ->
            s.executeQuery(sql).use { r -> buildSet { while (r.next()) add(r.getString(1)) } }
        }
}
