package app.nostrdeck.signer;

import com.sun.jna.*;
import com.sun.jna.platform.win32.WinNT.FILETIME;
import java.util.Arrays;
import java.util.List;

/**
 * Windows FILETIME 構造体 (jna-platform の WinNT.FILETIME を使用)
 */
public class FILETIME extends Structure {
    public int dwLowDateTime;
    public int dwHighDateTime;

    @Override
    protected List<String> getFieldOrder() {
        return Arrays.asList("dwLowDateTime", "dwHighDateTime");
    }

    public FILETIME() {
        this(Pointer.NULL);
    }

    public FILETIME(Pointer pointer) {
        super(pointer);
        read();
    }
}