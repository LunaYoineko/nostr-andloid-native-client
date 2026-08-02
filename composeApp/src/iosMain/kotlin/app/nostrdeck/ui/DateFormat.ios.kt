package app.nostrdeck.ui

import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSTimeZone
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.Foundation.localTimeZone

private val fmt: NSDateFormatter by lazy {
    NSDateFormatter().apply {
        dateFormat = "yyyy/MM/dd HH:mm"
        timeZone = NSTimeZone.localTimeZone
    }
}

actual fun formatAbsoluteTime(unixSeconds: Long): String =
    fmt.stringFromDate(NSDate.dateWithTimeIntervalSince1970(unixSeconds.toDouble()))
