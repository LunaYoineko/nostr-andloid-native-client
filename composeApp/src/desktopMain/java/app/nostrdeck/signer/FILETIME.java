package app.nostrdeck.signer;

import com.sun.jna.*;
import java.util.Arrays;
import java.util.List;

/**
 * Windows FILETIME 構造体（自前実装、jna-platform の FILETIME と競合回避）
 */
public class WinFileTime extends Structure {
    public int dwLowDateTime;
    public int dwHighDateTime;

    @Override
    protected List<String> getFieldOrder() {
        return Arrays.asList("dwLowDateTime", "dwHighDateTime");
    }

    public WinFileTime() {
        this(Pointer.NULL);
    }

    public WinFileTime(Pointer pointer) {
        super(pointer);
        read();
    }
}