#!/usr/bin/env bash
# [#218] GitHub Releases への **Desktop プレビュー配布**（Windows MSI / Linux DEB+RPM / macOS dmg / 汎用 JAR）。
#
# 位置づけ: scripts/release-github.sh（Android APK + macOS dmg）と同じ「プレビュー配布」枠。
# ストア配信（Play / TestFlight）とは別で、監査もテスター登録も不要。代わりに:
#   - 署名の都合で既存版との相互更新はできない（注意を Release ノートに必ず載せる）
#   - macOS dmg は未署名（初回は右クリック→開く）
#
# 前提:
#   - git tag vX.Y.Z && git push --tags 済み（version.sh --on-tag が 1）
#   - gh CLI ログイン済み
#   - JDK 21（jpackage を含むフル JDK。Compose Desktop は JBR を packaging に拒否する #3107）
#   - Linux: fakeroot / rpm が必要（`apt install fakeroot rpm`）
#   - Windows: WiX3（同梱の :composeApp:downloadWix が取得する / wix コマンドが PATH に必要）
#
# 使い方:
#   scripts/release-desktop.sh                    # 実行プラットフォームに合った配布物をビルド
#   TARGETS=windows scripts/release-desktop.sh    # Windows MSI のみ
#   TARGETS=linux scripts/release-desktop.sh      # Linux DEB + RPM のみ
#   TARGETS=mac scripts/release-desktop.sh        # macOS dmg のみ
#   TARGETS=jar scripts/release-desktop.sh        # 汎用 JAR のみ（どの OS でも動く）
#   TARGETS=windows,jar scripts/release-desktop.sh
#   DRY_RUN=1 scripts/release-desktop.sh          # ビルドのみ（Release を作らない・タグ無しでも可）
#
# 注意: 各ターゲットは生成できるプラットフォームで実行する必要がある
#       （Windows MSI は Windows 上、DEB/RPM は Linux 上でのみ生成できる）。
#       全ターゲットの Release を作るには、プラットフォームごとに TARGETS を分けて実行する。
set -euo pipefail
cd "$(dirname "$0")/.."

# ---- 実行環境の判定 ----
OS=$(uname -s)          # Darwin / Linux / MINGW*|MSYS*|CYGWIN*
case "$OS" in
  Darwin)  HOST=mac ;;
  Linux)   HOST=linux ;;
  *)       HOST=windows ;;
esac

TARGETS="${TARGETS:-auto}"
if [ "$TARGETS" = "auto" ]; then
  case "$HOST" in
    windows) TARGETS="windows,jar" ;;
    linux)   TARGETS="linux,jar" ;;
    mac)     TARGETS="mac,jar" ;;
  esac
fi

has() { case ",$TARGETS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

NAME=$(scripts/version.sh --name)
BUILD=$(scripts/version.sh --build)
ON_TAG=$(scripts/version.sh --on-tag)
if [ "$ON_TAG" != "1" ]; then
  echo "⚠ HEAD がバージョンタグ上ではありません（version=${NAME}）。先に \`git tag vX.Y.Z && git push --tags\` を実行してください" >&2
  # DRY_RUN はビルド確認用なのでタグ無しでも続行する。
  [ "${DRY_RUN:-0}" = "1" ] || exit 1
fi
TAG="v$NAME"
ASSETS=()
NOTES_MD=()

# ---- JDK チェック（jpackage 入りのフル JDK が必要。Android Studio 同梱 JBR には無い）----
if [ ! -x "${JAVA_HOME:-/nonexistent}/bin/jpackage" ]; then
  echo "⚠ jpackage 入りの JDK が見つかりません。例:" >&2
  case "$HOST" in
    mac)     echo "  mkdir -p ~/.jdks && cd ~/.jdks && curl -sL 'https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse' | tar xz" >&2 ;;
    linux)   echo "  mkdir -p ~/.jdks && cd ~/.jdks && curl -sL 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse' | tar xz" >&2 ;;
    windows) echo "  winget install EclipseAdoptium.Temurin.21.JDK  （JAVA_HOME を設定してください）" >&2 ;;
  esac
  exit 1
fi

OUT=composeApp/build/compose

# ---- Windows（MSI）----
if has windows && [ "$HOST" = windows ]; then
  echo "==> Building MSI (version=$NAME)"
  ./gradlew :composeApp:packageMsi -q -PpackagingJavaHome="$JAVA_HOME"
  SRC=$(ls "$OUT"/binaries/main/msi/*.msi | head -1)
  DST="$OUT/binaries/main/msi/Nostrism-$NAME-windows.msi"
  [ "$SRC" = "$DST" ] || cp "$SRC" "$DST"
  ASSETS+=("$DST")
  NOTES_MD+=("- **Windows**: \`Nostrism-$NAME-windows.msi\`")
  NOTES_MD+=("  MSI インストーラでそのまま実行できます。")
  echo "==> $DST"
fi

# ---- Linux（DEB + RPM）----
if has linux && [ "$HOST" = linux ]; then
  # DEB は fakeroot、RPM は rpm が必要。無ければビルドをスキップして警告する。
  DEB_TASKS=()
  if command -v fakeroot >/dev/null 2>&1; then
    DEB_TASKS+=(":composeApp:packageDeb")
    NOTES_MD+=("- **Linux**: \`Nostrism-$NAME-linux.deb\`（Debian / Ubuntu 等の .deb 系）")
  else
    echo "⚠ fakeroot が無いため DEB をスキップします（apt install fakeroot）" >&2
  fi
  if command -v rpmbuild >/dev/null 2>&1 || command -v rpm >/dev/null 2>&1; then
    DEB_TASKS+=(":composeApp:packageRpm")
    NOTES_MD+=("- **Linux**: \`Nostrism-$NAME-linux.rpm\`（Fedora / RHEL 等の .rpm 系）")
  else
    echo "⚠ rpm が無いため RPM をスキップします（apt install rpm）" >&2
  fi
  if [ ${#DEB_TASKS[@]} -gt 0 ]; then
    echo "==> Building Linux packages (version=$NAME)"
    ./gradlew "${DEB_TASKS[@]}" -q -PpackagingJavaHome="$JAVA_HOME"
    # ワイルドカードは `-f` で判定できない（パターン展開されない）ので ls で glob する。
    SRC_DEB=$(ls -1 "$OUT"/binaries/main/deb/*.deb 2>/dev/null | head -1 || true)
    if [ -n "$SRC_DEB" ]; then
      DST_DEB="$OUT/binaries/main/deb/Nostrism-$NAME-linux.deb"
      [ "$SRC_DEB" = "$DST_DEB" ] || cp "$SRC_DEB" "$DST_DEB"
      ASSETS+=("$DST_DEB")
      echo "==> $DST_DEB"
    fi
    SRC_RPM=$(ls -1 "$OUT"/binaries/main/rpm/*.rpm 2>/dev/null | head -1 || true)
    if [ -n "$SRC_RPM" ]; then
      DST_RPM="$OUT/binaries/main/rpm/Nostrism-$NAME-linux.rpm"
      [ "$SRC_RPM" = "$DST_RPM" ] || cp "$SRC_RPM" "$DST_RPM"
      ASSETS+=("$DST_RPM")
      echo "==> $DST_RPM"
    fi
  fi
fi

# ---- macOS（dmg）----
if has mac && [ "$HOST" = mac ]; then
  echo "==> Building dmg (version=$NAME)"
  ./gradlew :composeApp:packageDmg -q -PpackagingJavaHome="$JAVA_HOME"
  SRC=$(ls "$OUT"/binaries/main/dmg/*.dmg | head -1)
  DST="$OUT/binaries/main/dmg/Nostrism-$NAME-macos.dmg"
  [ "$SRC" = "$DST" ] || cp "$SRC" "$DST"
  ASSETS+=("$DST")
  NOTES_MD+=("- **macOS**: \`Nostrism-$NAME-macos.dmg\`")
  NOTES_MD+=("  ⚠️ 未署名のため、初回起動時は Finder で**右クリック→開く**を選択してください。")
  echo "==> $DST"
fi

# ---- 汎用 JAR（どの OS でも動く。CI や手元での単体確認用）----
if has jar; then
  echo "==> Building uber JAR (version=$NAME)"
  ./gradlew :composeApp:packageUberJarForCurrentOS -q
  # packageUberJarForCurrentOS の出力名は OS 依存（Nostrism-windows-x64-1.0.0.jar など）。
  SRC_JAR=$(ls -1 "$OUT"/jars/Nostrism-*-x64-1.0.0.jar 2>/dev/null | head -1 || true)
  if [ -z "$SRC_JAR" ]; then
    echo "⚠ JAR が生成されませんでした（$OUT/jars を確認してください）" >&2
  else
    DST_JAR="$OUT/jars/Nostrism-$NAME-jar.jar"
    [ "$SRC_JAR" = "$DST_JAR" ] || cp "$SRC_JAR" "$DST_JAR"
    ASSETS+=("$DST_JAR")
    NOTES_MD+=("- **汎用 JAR**: \`Nostrism-$NAME-jar.jar\`")
    NOTES_MD+=("  \`java -jar Nostrism-$NAME-jar.jar\` で起動。開発・検証用（ネイティブパッケージのインストール不要）。")
    echo "==> $DST_JAR"
  fi
fi

if [ ${#ASSETS[@]} -eq 0 ]; then
  echo "⚠ ビルド成果物が生成されませんでした。TARGETS=$TARGETS / HOST=$HOST を確認してください" >&2
  exit 1
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> DRY_RUN: GitHub Release へのアップロードはスキップ"
  exit 0
fi

# ---- Release ノート ----
NOTES=$(mktemp)
{
  if [ -f distribution/whatsnew/whatsnew-ja-JP ]; then
    cat distribution/whatsnew/whatsnew-ja-JP
  else
    echo "Nostrism $NAME"
  fi
  echo
  echo "---"
  echo
  echo "### ダウンロード（Desktop プレビュー配布）"
  echo
  printf '%s\n' "${NOTES_MD[@]}"
  echo
  echo "⚠️ **注意**: Desktop 版とストア版（Play / TestFlight）は署名が異なるため、相互更新はできません。"
  echo "既存版から移行する場合は、先にアンインストールしてください。"
  echo
  echo "iOS / Android のプレビュー配布は \`release-github.sh\` を参照。"
} > "$NOTES"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --notes-file "$NOTES" >/dev/null
else
  gh release create "$TAG" --title "Nostrism $NAME" --notes-file "$NOTES"
fi
rm -f "$NOTES"

for a in "${ASSETS[@]}"; do gh release upload "$TAG" "$a" --clobber; done
echo "==> uploaded: $(gh release view "$TAG" --json url -q .url)"
gh release view "$TAG" --json assets --jq '.assets[] | "    \(.name)"'