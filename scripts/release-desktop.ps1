#Requires -Version 5.1
<#
.SYNOPSIS
    [#218] GitHub Releases への **Desktop プレビュー配布**（Windows 版）。

.DESCRIPTION
    scripts/release-desktop.sh の PowerShell 版。Windows で .sh を実行できない環境向け。

    scripts/release-desktop.sh（Android APK + macOS dmg）と同じ「プレビュー配布」枠で、
    ストア配信（Play / TestFlight）とは別。監査もテスター登録も不要。代わりに:
      - 署名の都合で既存版との相互更新はできない（注意を Release ノートに必ず載せる）
      - 未署名の exe / MSI は SmartScreen で警告が出る場合がある

    タグは Windows 側で打つ前提:
      git tag vX.Y.Z
      git push origin desktop
      .\scripts\release-desktop.ps1
    macOS dmg / Linux DEB+RPM は各プラットフォームの release-desktop.sh で-release _attachment する。

.PARAMETER Targets
    ビルドする配布物。windows / jar / all から指定（既定は all = windows + jar）。

.PARAMETER DryRun
    ビルドのみ。GitHub Release は作らない。タグ未打ちでも実行できる。

.EXAMPLE
    .\scripts\release-desktop.ps1
    全ターゲットをビルドして Release へ添付

.EXAMPLE
    .\scripts\release-desktop.ps1 -Targets jar
    汎用 JAR のみ

.EXAMPLE
    .\scripts\release-desktop.ps1 -DryRun
    ビルドのみ（Release を作らない・タグ無しでも可）
#>
[CmdletBinding()]
param(
    [ValidateSet('all', 'windows', 'jar')]
    [string]$Targets = 'all',

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# ---- バージョン導出（scripts/version.sh と同じ規則）----
# git tag を優先し、無ければ upstream の最新タグにフォールバックする。
function Get-ReleaseVersion {
    $tag = (git describe --tags --abbrev=0 --match 'v[0-9]*' 2>$null)
    if (-not $tag) {
        $tag = (git describe --tags --abbrev=0 --match 'v[0-9]*' 'origin/main' 2>$null)
    }
    $name = if ($tag) { $tag -replace '^v', '' } else { '0.0.0' }
    $build = [int](git rev-list --count HEAD)
    [pscustomobject]@{ Name = $name; Build = $build; Tag = "v$name" }
}

$rel = Get-ReleaseVersion

$onTag = $false
try {
    $tagCommit = git rev-list -n1 $rel.Tag 2>$null
    $head = git rev-parse HEAD
    $onTag = ($tagCommit -eq $head)
} catch { $onTag = $false }

if (-not $onTag) {
    Write-Warning "HEAD がバージョンタグ上ではありません（version=$($rel.Name)）。"
    Write-Warning "先に ``git tag $($rel.Tag); git push origin desktop`` を実行してください。"
    if (-not $DryRun) { exit 1 }
}

# ---- JDK チェック（jpackage 入りのフル JDK が必要。Android Studio 同梱 JBR には無い）----
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\jpackage.exe'))) {
    Write-Error "jpackage 入りの JDK が見つかりません。例:"
    Write-Error "  winget install EclipseAdoptium.Temurin.21.JDK  （JAVA_HOME を設定してください）"
    exit 1
}

$out = 'composeApp/build/compose'
$assets = New-Object System.Collections.Generic.List[string]
$notesMd = New-Object System.Collections.Generic.List[string]

# ---- Windows MSI ----
if ($Targets -in @('all', 'windows')) {
    Write-Host "==> Building MSI (version=$($rel.Name))"
    # JAVA_HOME を切り替えても Gradle は起動済みデーモンを使い回すため、jpackage 用 JDK を明示する（#438）。
    & .\gradlew :composeApp:packageMsi -q "-PpackagingJavaHome=$jdk"
    if ($LASTEXITCODE -ne 0) { throw "packageMsi が失敗しました" }

    $src = Get-ChildItem "$out\binaries\main\msi\*.msi" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $src) { throw "MSI が生成されませんでした（$out\binaries\main\msi を確認してください）" }

    $dst = Join-Path $src.DirectoryName "Nostrism-$($rel.Name)-windows.msi"
    if ($src.FullName -ne $dst) { Copy-Item $src.FullName $dst }
    $assets.Add($dst)
    $notesMd.Add("- **Windows**: ``Nostrism-$($rel.Name)-windows.msi``")
    $notesMd.Add("  MSI インストーラでそのまま実行できます。")
    Write-Host "==> $dst"
}

# ---- 汎用 JAR（java -jar で起動）----
if ($Targets -in @('all', 'jar')) {
    Write-Host "==> Building uber JAR (version=$($rel.Name))"
    & .\gradlew :composeApp:packageUberJarForCurrentOS -q
    if ($LASTEXITCODE -ne 0) { throw "packageUberJarForCurrentOS が失敗しました" }

    $src = Get-ChildItem "$out\jars\Nostrism-*-x64-1.0.0.jar" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $src) { throw "JAR が生成されませんでした（$out\jars を確認してください）" }

    $dst = Join-Path $src.DirectoryName "Nostrism-$($rel.Name)-jar.jar"
    if ($src.FullName -ne $dst) { Copy-Item $src.FullName $dst }
    $assets.Add($dst)
    $notesMd.Add("- **汎用 JAR**: ``Nostrism-$($rel.Name)-jar.jar``")
    $notesMd.Add("  ``java -jar Nostrism-$($rel.Name)-jar.jar`` で起動。開発・検証用（ネイティブパッケージのインストール不要）。")
    Write-Host "==> $dst"
}

if ($assets.Count -eq 0) {
    Write-Error "ビルド成果物が生成されませんでした。Targets=$Targets を確認してください"
    exit 1
}

if ($DryRun) {
    Write-Host "==> DRY_RUN: GitHub Release へのアップロードはスキップ"
    exit 0
}

# ---- Release ノート ----
$notes = New-TemporaryFile
try {
    $whatsnew = 'distribution/whatsnew/whatsnew-ja-JP'
    if (Test-Path $whatsnew) {
        Get-Content $whatsnew -Raw -Encoding UTF8 | Out-File $notes -Encoding utf8
    } else {
        "Nostrism $($rel.Name)" | Out-File $notes -Encoding utf8
    }

    @(
        ''
        '---'
        ''
        '### ダウンロード（Desktop プレビュー配布）'
        ''
        $notesMd
        ''
        '⚠️ **注意**: Desktop 版とストア版（Play / TestFlight）は署名が異なるため、相互更新はできません。'
        '既存版から移行する場合は、先にアンインストールしてください。'
        '未署名のため、Windows SmartScreen で警告が出た場合は「詳細情報」→「実行する」を選んでください。'
        ''
        'iOS / Android / macOS / Linux のプレビュー配布は `scripts/release-github.sh` / `release-desktop.sh` を参照。'
    ) | Add-Content $notes -Encoding utf8

    if (gh release view $rel.Tag 2>$null) {
        gh release edit $rel.Tag --notes-file $notes | Out-Null
    } else {
        gh release create $rel.Tag --title "Nostrism $($rel.Name)" --notes-file $notes
    }

    foreach ($a in $assets) { gh release upload $rel.Tag $a --clobber }
    Write-Host "==> uploaded: $((gh release view $rel.Tag --json url -q .url))"
    # gh の --jq は jq 構文なので、PowerShell のエスケープ（` + '"'）では書けない。
    # 引用符問題を避けて素の JSON を取り、PowerShell 側で整形する。
    (gh release view $rel.Tag --json assets | ConvertFrom-Json).assets |
        ForEach-Object { Write-Host "    $($_.name)" }
} finally {
    Remove-Item $notes -ErrorAction SilentlyContinue
}