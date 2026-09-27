package app.nostrdeck.signer;

import com.sun.jna.*;
import com.sun.jna.ptr.PointerByReference;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;

/**
 * Advapi32.dll の Credential Management API
 */
public interface Advapi32 extends StdCallLibrary {
    Advapi32 INSTANCE = Native.load("advapi32", Advapi32.class, W32APIOptions.UNICODE_OPTIONS);

    // CredReadW
    boolean CredReadW(
        String targetName,
        int type,
        int flags,
        PointerByReference credential
    );

    // CredWriteW
    boolean CredWriteW(
        CREDENTIAL credential,
        int flags
    );

    // CredDeleteW
    boolean CredDeleteW(
        String targetName,
        int type,
        int flags
    );

    // CredFree
    void CredFree(Pointer buffer);
}