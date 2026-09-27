package app.nostrdeck.signer;

import com.sun.jna.*;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;

/**
 * Kernel32.dll のエラー処理 API
 */
public interface Kernel32 extends StdCallLibrary {
    Kernel32 INSTANCE = Native.load("kernel32", Kernel32.class, W32APIOptions.UNICODE_OPTIONS);

    int GetLastError();

    int FormatMessage(
        int dwFlags,
        Pointer lpSource,
        int dwMessageId,
        int dwLanguageId,
        Pointer lpBuffer,
        int nSize,
        Pointer Arguments
    );
}