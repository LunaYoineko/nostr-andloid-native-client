package app.nostrdeck.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val fmt by lazy { SimpleDateFormat("yyyy/MM/dd HH:mm", Locale.getDefault()) }

actual fun formatAbsoluteTime(unixSeconds: Long): String = fmt.format(Date(unixSeconds * 1000L))
