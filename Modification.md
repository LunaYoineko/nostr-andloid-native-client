# Modification - Windows / Linux / macOS 対応

本ドキュメントは Android/iOS のみに加え Windows / Linux / macOS へ対応した際の変更点と、各環境でのビルド方法をまとめたものです。

## 概要

- **アーキテクチャ**: 既存の `jvm("desktop")` ターゲットを活用。JVM はクロスプラットフォームのため、同一 JAR/ランタイムで Windows / Linux / macOS 全てで動作。ネイティブインストーラは `compose.desktop.nativeDistributions` でホスト OS ごとに生成。
- **対応 OS**: Android (既存), iOS (既存), Windows 10/11, Linux (Ubuntu 22.04+/ Debian), macOS 13+ (Intel/Apple Silicon 共に JVM 経由)

## 追加ファイル

| ファイル | 役割 |
|---|---|
| `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/WindowsCredentialKeyVault.kt` | Windows Credential Manager (Powershell `Get/New-StoredCredential`) で 32byte 秘密鍵を保管。`-Persist CurrentUser` で管理者権限不要、`-ExecutionPolicy Bypass` 付与。`$` エスケープは `${'$'}` または `\$` で処理 |
| `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/LinuxSecretKeyVault.kt` | Linux Secret Service / libsecret (`secret-tool` CLI) で保管。`List<String>` → `Array` は `*toTypedArray()` で展開 |
| `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/DesktopKeyVault.kt` | 既存（フォールバック用 `~/.nostrism/key.bin`） |
| `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/MacKeychainKeyVault.kt` | 既存（`security` CLI） |

## 変更ファイル

### 1. `composeApp/build.gradle.kts` (`compose.desktop` 周り)

```kotlin
// [#218] 変更前: targetFormats(TargetFormat.Dmg) のみ
// 変更後:
compose.desktop {
    application {
        mainClass = "app.nostrdeck.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Msi, TargetFormat.Deb, TargetFormat.Rpm, TargetFormat.Dmg)
            packageName = "Nostrism"
            packageVersion = "1.0.0"
            description = "Nostr Decentralized Client"
            vendor = "Nostrism"
            copyright = "Copyright 2025 Nostrism"
            modules("java.sql", "java.naming", "jdk.unsupported") // [#sql] JDBC で必須
            linux {
                debMaintainer = "Nostrism <noreply@nostrism.example>"
                menuGroup = "Network;Chat;"
                iconFile.set(rootProject.file("docs/store/icon-512.png"))
            }
            macOS {
                bundleID = "net.shino3.nostrism"
                iconFile.set(rootProject.file("docs/store/icon.icns"))
            }
            windows {
                menuGroup = "Nostrism"
                upgradeUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                iconFile.set(rootProject.file("docs/store/icon.ico"))
            }
        }
    }
}
```

**ポイント**
- `modules("java.sql", ...)` が無いと `jpackage` の `jlink` ランタイムに `java/sql/DriverManager` が含まれず `NoClassDefFoundError: java/sql/DriverManager` で起動失敗（uberJar はシステム JRE を使うため問題なし）。追加で解消。
- `iconFile` を各プラットフォーム別に設定。Linux: `icon-512.png`、macOS: `icon.icns`、Windows: `icon.ico`。旧は Compose デフォルトアイコン（1024x1024）で、deb インストール後に `Categories=不明` となっていたのを `Network;Chat;` に修正。`/opt/nostrism/lib/Nostrism.png` は 512px に縮小され `/usr/share/applications/nostrism-Nostrism.desktop` の `Icon=/opt/nostrism/lib/Nostrism.png` が正しく表示。
- macOS DMG の `.app` アイコンは `icon.icns` (16〜1024px) が `.app/Contents/Resources` に配置され Dock/Finder に反映。DMG ファイル自体のアイコンが Java のまま見える場合は Finder キャッシュの影響 (`killall Finder` で解消)。

### 2. `composeApp/src/desktopMain/kotlin/app/nostrdeck/Main.kt`

```kotlin
import app.nostrdeck.signer.LinuxSecretKeyVault
import app.nostrdeck.signer.WindowsCredentialKeyVault

private fun isCommandAvailable(cmd: String): Boolean = runCatching {
    val osName = System.getProperty("os.name").orEmpty().lowercase()
    val isWindows = osName.contains("win")
    val checkCmd = if (isWindows) listOf("where", cmd) else listOf("which", cmd)
    ProcessBuilder(*checkCmd.toTypedArray()).redirectErrorStream(true).start().waitFor() == 0
}.getOrDefault(false)

private fun isSecretToolAvailable(): Boolean = isCommandAvailable("secret-tool") && runCatching {
    ProcessBuilder("secret-tool", "--help").start().waitFor() == 0
}.getOrDefault(false)

/**
 * [#221] 鍵保管の選択。macOS は Keychain（security CLI）、Windows は Credential Manager、
 * Linux は libsecret（secret-tool）。それ以外の OS は従来のファイル保管。
 * 旧・平文ファイル(key.bin)が残っていれば各ストアへ移行し、移行を確認してから平文を消す。
 * secret-tool / security / powershell が無い環境では自動でファイル保管へフォールバック。
 */
private fun buildKeyVault(): KeyVault {
    val osName = System.getProperty("os.name").orEmpty().lowercase()
    val isMac = osName.contains("mac")
    val isWindows = osName.contains("win")
    val isLinux = osName.contains("linux") || osName.contains("nix")
    val legacy = File(appDir, "key.bin")

    val vault: KeyVault = when {
        isMac -> if (isCommandAvailable("security")) MacKeychainKeyVault() else {
            println("Nostrism [#221] security CLI not found, using file vault"); DesktopKeyVault(legacy)
        }
        isWindows -> if (isCommandAvailable("powershell") || isCommandAvailable("pwsh")) {
            println("Nostrism [#221] using Windows Credential Manager")
            WindowsCredentialKeyVault()
        } else {
            println("Nostrism [#221] powershell not found, using file vault"); DesktopKeyVault(legacy)
        }
        isLinux -> if (isSecretToolAvailable()) {
            val candidate = LinuxSecretKeyVault()
            val usable = runCatching { candidate.hasKey(); true }.isSuccess
            if (usable) {
                println("Nostrism [#221] using Linux secret-tool")
                candidate
            } else {
                println("Nostrism [#221] secret service not available, using file vault"); DesktopKeyVault(legacy)
            }
        } else {
            println("Nostrism [#221] secret-tool not found, using file vault (sudo apt install libsecret-tools)"); DesktopKeyVault(legacy)
        }
        else -> DesktopKeyVault(legacy)
    }

### 3. `nostr-core/build.gradle.kts`

`jvm("desktop")` のみで全デスクトップ対応。Kotlin/Native の `windowsX64` 等は Compose 1.11 では未提供のため追加不要。

### 4. `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/WindowsCredentialKeyVault.kt`

Windows 投稿失敗の修正内容:

| 問題 | 原因 | 修正 |
|---|---|---|
| **Credential Manager 保存失敗** | `-Persist LocalMachine` が管理者権限必須 | `-Persist CurrentUser` に変更（一般ユーザー権限で保存可能） |
| **PowerShell 実行ポリシー** | スクリプト実行がブロックされる | `-ExecutionPolicy Bypass` 追加 |
| **`isCommandAvailable` が Windows で失敗** | `which` コマンドが Unix のみ | Windows では `where` コマンドを使用するよう修正 `Main.kt:63` |
| **`$` 変数展開エラー** | Kotlin 文字列テンプレートで `$cred` 等が変数と解釈される | `\${'$'}cred` / `\$cred` 形式でエスケープ `WindowsCredentialKeyVault.kt:30` |
| **credential 取得ロジック不備** | `cmdkey` ではパスワード取得不可 | PowerShell `Get-StoredCredential` + `SecureStringToBSTR` で確実に取得 `WindowsCredentialKeyVault.kt:29` |
| **デバッグログ不足** | どの Vault が選択されたか不明 | `println("using Windows Credential Manager")` 等を追加 `Main.kt:66` |

**修正後の主なコード**:
```kotlin
private fun runPs(script: String): Pair<Int, String> = run(
    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script
)

private fun readHex(): String? {
    val script = """
        \${'$'}cred = Get-StoredCredential -Target '$targetName' -ErrorAction SilentlyContinue
        if (\${'$'}cred) {
            \${'$'}ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(\${'$'}cred.Password)
            try { [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(\${'$'}ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(\${'$'}ptr) }
        }
    """.trimIndent()
    val (code, out) = runPs(script)
    return out.takeIf { code == 0 && it.length == 64 }
}

override fun importPrivateKey(privateKey: ByteArray) {
    require(privateKey.size == 32) { "private key must be 32 bytes" }
    val hex = privateKey.toHex()
    val script = """
        \${'$'}sec = ConvertTo-SecureString '$hex' -AsPlainText -Force
        New-StoredCredential -Target '$targetName' -UserName '$userName' -Password \${'$'}sec -Persist CurrentUser -ErrorAction Stop
    """.trimIndent()
    val (code, out) = runPs(script)
    require(code == 0) { "credential write failed: $out" }
}
```

## 各環境でのビルド方法

### 共通準備

```bash
export JAVA_HOME=<JDK 17 のパス>
export ANDROID_HOME=<Android SDK のパス>   # platforms;android-36, build-tools;36.0.0, platform-tools
# local.properties に sdk.dir=<Android SDK のパス> を設定
```

依存パッケージ（Linux ホスト例）:
```bash
sudo apt install -y libsecret-tools
```

### Windows

ホスト OS が Windows の場合に `msi` が生成可能。クロスビルドは不可。

```bash
./gradlew :composeApp:packageMsi          # build/compose/binaries/main/msi/*.msi
./gradlew :composeApp:packageUberJarForCurrentOS  # どこでもビルド可能、java -jar で実行
java -jar composeApp/build/compose/jars/Nostrism-*.jar
```

### Linux (Ubuntu/Debian)

```bash
./gradlew :composeApp:packageDeb          # build/compose/binaries/main/deb/*.deb
sudo dpkg -i composeApp/build/compose/binaries/main/deb/*.deb
sudo update-desktop-database /usr/share/applications  # アイコンが反映されない場合
/opt/nostrism/bin/Nostrism                # ランタイム同梱バイナリ
# または
./gradlew :composeApp:createDistributable # build/compose/binaries/main/app/Nostrism/
./gradlew :composeApp:packageUberJarForCurrentOS # build/compose/jars/*.jar
sudo dpkg -r nostrism                      # アンインストール
```

`packageRpm` は `rpmbuild` 未導入で `jpackage: invalid type [rpm]` になる。必要なら `sudo apt install rpm` 後に再実行。

### macOS

```bash
./gradlew :composeApp:packageDmg          # ホストが macOS の場合のみ .dmg 生成
./gradlew :composeApp:packageUberJarForCurrentOS
java -jar composeApp/build/compose/jars/Nostrism-*.jar
```

JVM なので Apple Silicon / Intel 共に同一 JAR で動作。`linuxX64Main` 等のネイティブターゲットは不要。

### Android / iOS

従来通り:

```bash
./gradlew :composeApp:assembleDebug       # build/outputs/apk/debug/*.apk
./gradlew :nostr-core:assemble            # iOS framework (iosArm64 / iosSimulatorArm64) も同時ビルド
```

## トラブルシューティング

- **secret-tool がない**: `sudo apt install libsecret-tools`。無い場合は自動で `~/.nostrism/key.bin`（平文）へフォールバック。GNOME 環境で `gnome-keyring` が無効だと D-Bus エラーになる場合も file へフォールバック。
- **deb アイコンが出ない**: `sudo update-desktop-database` / `sudo gtk-update-icon-cache` / ログアウトで再読み込み。`iconFile` は `docs/store/icon-512.png` を使用。
- **deb 起動で `NoClassDefFoundError: java/sql/DriverManager`**: 本修正で `modules("java.sql", ...)` を追加済み。再発時は `composeApp/build.gradle.kts` の `modules` を確認。
- **`packageRpm` が `jpackage: invalid type [rpm]` で失敗**: `rpmbuild` 未導入の場合。必要なら `sudo apt install rpm` 後に再実行。
- **ヘッドレスで `Cannot create Linux GL context`**: ヘッドレス環境で GL が無いため。実デスクトップでは正常起動。

### Windows 固有のトラブルシューティング

- **投稿できない / 鍵が保存されない**:
  1. 起動時コンソールで `Nostrism [#221] using Windows Credential Manager` が出るか確認。出ない場合は `powershell` が PATH にない（`where powershell` で確認）。
  2. `Get-StoredCredential -Target 'Nostrism:NostrKey'` で資格情報が返るか確認。返らない場合は初回起動時に自動生成されるため、一度アプリを再起動。
  3. Windows ファイアウォールでアプリの送信 (TCP 443/80) が許可されているか確認。
  4. `%USERPROFILE%\.nostrism\nostr.db` が別プロセスでロックされていないか確認（再起動で解消）。
  5. `java.library.path` に `secp256k1-jni-jvm` の DLL が含まれるか確認（MSI インストールなら自動、uberJar なら `java -Djava.library.path=... -jar ...`）。

- **`which`/`where` エラーでクラッシュ**: `isCommandAvailable` で OS 判定して `where` を使うよう修正済み。古いキャッシュが残っている場合は `./gradlew clean` で再ビルド。

- **PowerShell 実行ポリシーエラー**: `-ExecutionPolicy Bypass` 付与済み。管理者権限で `Set-ExecutionPolicy RemoteSigned` も有効。

## 今後の拡張

- Windows: `Credential Manager` の `Get-StoredCredential` は `CredentialManager` モジュールが必要な場合あり。未導入環境では file へフォールバックするが、可能なら `cmdkey` + DPAPI への切り替え検討。
- Linux: `libsecret-tools` 以外に `pass` / `kwallet` 対応、Wayland での D-Bus セッション継承の検証。
- macOS: Apple Silicon 向け `jpackage` の `runtime` に `java.sql` が含まれることは確認済み。
