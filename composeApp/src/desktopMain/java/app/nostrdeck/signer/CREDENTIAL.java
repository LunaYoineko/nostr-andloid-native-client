package app.nostrdeck.signer;

import com.sun.jna.*;
import app.nostrdeck.signer.WinFileTime;
import java.util.Arrays;
import java.util.List;

/**
 * Windows CREDENTIAL 構造体 (JNA マッピング)
 * https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw
 */
public class CREDENTIAL extends Structure {
    public int Flags;
    public int Type;
    public WString TargetName; // LPWSTR
    public WString Comment; // LPWSTR
    public WinFileTime LastWritten;
    public int CredentialBlobSize;
    public Pointer CredentialBlob; // PBYTE
    public int Persist;
    public int AttributeCount;
    public Pointer Attributes; // PCREDENTIAL_ATTRIBUTE
    public WString TargetAlias; // LPWSTR
    public WString UserName; // LPWSTR

    @Override
    protected List<String> getFieldOrder() {
        return Arrays.asList(
            "Flags", "Type", "TargetName", "Comment", "LastWritten",
            "CredentialBlobSize", "CredentialBlob", "Persist",
            "AttributeCount", "Attributes", "TargetAlias", "UserName"
        );
    }

    public CREDENTIAL() {
        this(Pointer.NULL);
    }

    public CREDENTIAL(Pointer pointer) {
        super(pointer);
        read();
    }
}