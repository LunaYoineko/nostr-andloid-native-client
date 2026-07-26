#!/usr/bin/env bash
# [#221] macOS 版（Compose Desktop）を GitHub Releases へ配布する。
#
# 前提:
#  - リリースタグ済み（`git tag vX.Y.Z` / scripts/version.sh --on-tag が 1）
#  - `gh` CLI ログイン済み
#  - macOS（dmg 生成は jpackage 依存）
#
# 使い方:
#   scripts/release-mac.sh            # dmg をビルドして GitHub Release（v<version>）へ添付
#   DRY_RUN=1 scripts/release-mac.sh  # ビルドとファイル名確認のみ（Release は作らない）
#
# 注意: 現状は **未署名 dmg**（Developer ID 署名/公証は #221 の残タスク）。
# 利用者は初回起動時に「右クリック→開く」（または xattr -dr com.apple.quarantine）が必要。
set -euo pipefail
cd "$(dirname "$0")/.."

# dmg 生成には jpackage 入りのフル JDK が必要（Android Studio 同梱の JBR には無い。
# Homebrew の openjdk は Compose Desktop が packaging 用に拒否する #3107）。
# 現在の JAVA_HOME に無ければ ~/.jdks の Temurin/Corretto を探す。
if [ ! -x "${JAVA_HOME:-/nonexistent}/bin/jpackage" ]; then
  for cand in "$HOME"/.jdks/jdk-21*/Contents/Home /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home; do
    if [ -x "$cand/bin/jpackage" ]; then export JAVA_HOME="$cand"; break; fi
  done
fi
if [ ! -x "${JAVA_HOME:-/nonexistent}/bin/jpackage" ]; then
  echo "⚠ jpackage 入りの JDK が見つかりません。例:" >&2
  echo "  mkdir -p ~/.jdks && cd ~/.jdks && curl -sL 'https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse' | tar xz" >&2
  exit 1
fi

NAME=$(scripts/version.sh --name)
ON_TAG=$(scripts/version.sh --on-tag)
if [ "$ON_TAG" != "1" ]; then
  echo "⚠ HEAD がバージョンタグ上ではありません（version=$NAME）。先に \`git tag vX.Y.Z && git push --tags\` を実行してください" >&2
  # DRY_RUN はビルド確認用なのでタグ無しでも続行する。
  [ "${DRY_RUN:-0}" = "1" ] || exit 1
fi
TAG="v$NAME"

echo "==> Building dmg (version=$NAME)"
./gradlew :composeApp:packageDmg -q

# jpackage の制約で packageVersion は 1.0.0 固定（MAJOR>0 必須）。実バージョンはファイル名で示す。
SRC=$(ls composeApp/build/compose/binaries/main/dmg/*.dmg | head -1)
OUT_DIR=composeApp/build/compose/binaries/main/dmg
OUT="$OUT_DIR/Nostrism-$NAME-macos.dmg"
cp "$SRC" "$OUT"
echo "==> $OUT"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> DRY_RUN: GitHub Release へのアップロードはスキップ"
  exit 0
fi

# Release が無ければ whatsnew をノートにして作成（既存ならそのまま添付）。
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --title "Nostrism $NAME" --notes-file distribution/whatsnew/whatsnew-ja-JP
fi
gh release upload "$TAG" "$OUT" --clobber
echo "==> uploaded: $(gh release view "$TAG" --json url -q .url)"
echo "⚠ 未署名 dmg です。ダウンロードした利用者は初回のみ「右クリック→開く」が必要です"
