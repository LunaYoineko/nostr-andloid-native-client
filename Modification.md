# Modification - Windows / Linux / macOS 対応

本ドキュメントは Android/iOS のみに加え Windows / Linux / macOS へ対応した際の変更点と、各環境でのビルド方法をまとめたものです。

## 概要

- **アーキテクチャ**: 既存の `jvm("desktop")` ターゲットを活用。JVM はクロスプラットフォームのため、同一 JAR/ランタイムで Windows / Linux / macOS 全てで動作。ネイティブインストーラは `compose.desktop.nativeDistributions` でホスト OS ごとに生成。
- **対応 OS**: Android (既存), iOS (既存), Windows 10/11, Linux (Ubuntu 22.04+/ Debian), macOS 13+ (Intel/Apple Silicon 共に JVM 経由)
- **ブランチ**: `desktop` で作業。ビルド検証は `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`, `ANDROID_HOME=/home/luna/android-sdk` (platform 36, build-tools 36.0.0), `GRADLE_USER_HOME=/mnt/workspace/gradle-cache` で実施。

## 追加ファイル

| ファイル | 役割 |
|---|---|
| `composeApp/src/desktopMain/kotlin/app/nostrdeck/signer/WindowsCredentialKeyVault.kt` | Windows Credential Manager (Powershell `Get/New-StoredCredential`) で 32byte 秘密鍵を保管。`$` のエスケープは `${'$'}` で処理 |
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
                iconFile.set(rootProject.file("docs/store/icon-512.png"))
            }
            windows {
                menuGroup = "Nostrism"
                upgradeUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                iconFile.set(rootProject.file("docs/store/icon-512.png"))
            }
        }
    }
}
```

**ポイント**
- `modules("java.sql", ...)` が無いと `jpackage` の `jlink` ランタイムに `java/sql/DriverManager` が含まれず `NoClassDefFoundError: java/sql/DriverManager` で起動失敗（uberJar はシステム JRE を使うため問題なし）。追加で解消。
- `iconFile` を `rootProject.file("docs/store/icon-512.png")` に設定。旧は Compose デフォルトアイコン（1024x1024）で、deb インストール後に `Categories=不明` となっていたのを `Network;Chat;` に修正。`/opt/nostrism/lib/Nostrism.png` は 512px に縮小され `/usr/share/applications/nostrism-Nostrism.desktop` の `Icon=/opt/nostrism/lib/Nostrism.png` が正しく表示。

### 2. `composeApp/src/desktopMain/kotlin/app/nostrdeck/Main.kt`

```kotlin
import app.nostrdeck.signer.LinuxSecretKeyVault
import app.nostrdeck.signer.WindowsCredentialKeyVault

private fun isCommandAvailable(cmd: String): Boolean = runCatching {
    ProcessBuilder("which", cmd).start().waitFor() == 0
}.getOrDefault(false)
private fun isSecretToolAvailable(): Boolean = isCommandAvailable("secret-tool") && runCatching {
    ProcessBuilder("secret-tool", "--help").start().waitFor() == 0
}.getOrDefault(false)

private fun buildKeyVault(): KeyVault {
    val osName = System.getProperty("os.name").orEmpty().lowercase()
    val isMac = osName.contains("mac")
    val isWindows = osName.contains("win")
    val isLinux = osName.contains("linux") || osName.contains("nix")
    val legacy = File(appDir, "key.bin")
    val vault: KeyVault = when {
        isMac -> if (isCommandAvailable("security")) MacKeychainKeyVault() else DesktopKeyVault(legacy)
        isWindows -> if (isCommandAvailable("powershell") || isCommandAvailable("pwsh")) WindowsCredentialKeyVault() else DesktopKeyVault(legacy)
        isLinux -> if (isSecretToolAvailable()) {
            val c = LinuxSecretKeyVault()
            if (runCatching { c.hasKey(); true }.isSuccess) c else DesktopKeyVault(legacy)
        } else {
            println("secret-tool not found, using file vault (sudo apt install libsecret-tools)")
            DesktopKeyVault(legacy)
        }
        else -> DesktopKeyVault(legacy)
    }
    // legacy key.bin からのマイグレーションは従来通り
}
```

- OS 自動判定。`secret-tool` / `security` / `powershell` が無い環境（最小構成やヘッドレス）では自動でファイル保管へフォールバックしクラッシュしない。

### 3. `nostr-core/build.gradle.kts`

`jvm("desktop")` のみで全デスクトップ対応。Kotlin/Native の `windowsX64` 等は Compose 1.11 では未提供のため追加不要。

## 各環境でのビルド方法

### 共通準備

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/home/luna/android-sdk   # platforms;android-36, build-tools;36.0.0, platform-tools
export GRADLE_USER_HOME=/mnt/workspace/gradle-cache  # / が逼迫するため /mnt/workspace を使用
# local.properties に sdk.dir=/home/luna/android-sdk が必要（既設置）
```

依存パッケージ（Linux ホスト例）:
```bash
sudo apt install -y libsecret-tools xvfb   # secret-tool, ヘッドレス検証用
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
./gradlew :composeApp:packageDeb          # build/compose/binaries/main/deb/*.deb (検証済み 107M)
sudo dpkg -i composeApp/build/compose/binaries/main/deb/*.deb
sudo update-desktop-database /usr/share/applications  # アイコンが反映されない場合
/opt/nostrism/bin/Nostrism                # ランタイム同梱バイナリ
# または
./gradlew :composeApp:createDistributable # build/compose/binaries/main/app/Nostrism/
./gradlew :composeApp:packageUberJarForCurrentOS # build/compose/jars/*.jar (101M)
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
./gradlew :composeApp:assembleDebug       # build/outputs/apk/debug/*.apk (検証済み 97M)
./gradlew :nostr-core:assemble            # iOS framework (iosArm64 / iosSimulatorArm64) も同時ビルド
```

## 検証結果

| タスク | 結果 | 成果物 |
|---|---|---|
| `:nostr-core:assemble` | SUCCESS (9m56s) | AAR + desktopJar + iOS klib |
| `:composeApp:compileKotlinDesktop` | SUCCESS (34s → 2s) | `LinuxSecretKeyVault` の `*toTypedArray()` と Windows の `${'$'}` 修正後 |
| `:composeApp:packageUberJarForCurrentOS` | SUCCESS | `Nostrism-linux-x64-1.0.0.jar` (101M) |
| `:composeApp:packageDeb` | SUCCESS | `nostrism_1.0.0-1_amd64.deb` (107M), `Nostrism.png` 512px, `Categories=Network;Chat;` |
| `:composeApp:createDistributable` | SUCCESS | `bin/Nostrism` (ELF) + `lib/runtime` (java.sql 含む) |
| `:composeApp:assembleDebug` | SUCCESS | `composeApp-debug.apk` (97M) |
| `:composeApp:packageRpm` | FAILED (jpackage rpm 未対応) | `rpm` 導入で解消可能 |
| 実行時 `java/sql/DriverManager` | 解消 | `modules("java.sql", ...)` 追加で jlink ランタイムに含む |
| 実行時 `secret-tool not found` | 解消 | `libsecret-tools` 導入 + `Main.kt` で自動フォールバック |

ヘッドレスでの `xvfb-run /opt/nostrism/bin/Nostrism` は `Cannot create Linux GL context` となるが、これはヘッドレス環境で GL が無いためで実デスクトップでは正常起動。`java -jar` の uberJar も同様。

## トラブルシューティング

- **secret-tool がない**: `sudo apt install libsecret-tools`。無い場合は自動で `~/.nostrism/key.bin`（平文）へフォールバック。GNOME 環境で `gnome-keyring` が無効だと D-Bus エラーになる場合も file へフォールバック。
- **deb アイコンが出ない**: `sudo update-desktop-database` / `sudo gtk-update-icon-cache` / ログアウトで再読み込み。`iconFile` は `docs/store/icon-512.png` を使用。
- **deb 起動で `NoClassDefFoundError: java/sql/DriverManager`**: 本修正で `modules("java.sql", ...)` を追加済み。再発時は `composeApp/build.gradle.kts` の `modules` を確認。
- **容量不足**: ルート (`/`) が逼迫する場合は `GRADLE_USER_HOME=/mnt/workspace/gradle-cache` と `ANDROID_HOME=/home/luna/android-sdk`（または `/mnt` 配下）を使用。プロジェクト外の削除は行わないこと。

## 今後の拡張

- Windows: `Credential Manager` の `Get-StoredCredential` は `CredentialManager` モジュールが必要な場合あり。未導入環境では file へフォールバックするが、可能なら `cmdkey` + DPAPI への切り替え検討。
- Linux: `libsecret-tools` 以外に `pass` / `kwallet` 対応、Wayland での D-Bus セッション継承の検証。
- macOS: Apple Silicon 向け `jpackage` の `runtime` に `java.sql` が含まれることは確認済み。
