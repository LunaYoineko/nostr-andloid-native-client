#!/usr/bin/env bash
# [#252] バージョン導出の単一の真実。
#
#  - versionName（x.y.z）  = 直近の git tag `vX.Y.Z` から。タグが無ければ 0.0.0。
#  - build 番号            = コミット数（両ストア共通・単調増加。履歴 rewrite 厳禁）。
#
# 運用: リリース前に `git tag vX.Y.Z && git push --tags` を打つ。
#       バグ修正=PATCH(0.3.1) / 機能追加=MINOR(0.4.0) / 破壊的変更=MAJOR(1.0.0)。
#
# 使い方:
#   scripts/version.sh --name     # 0.3.0
#   scripts/version.sh --build    # 436
#   scripts/version.sh --on-tag   # 1=HEAD がタグ上（＝リリース版） / 0=タグより進んでいる
#   scripts/version.sh            # "0.3.0 436 1"
set -euo pipefail
cd "$(dirname "$0")/.."

TAG=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
NAME="${TAG#v}"
[ -z "$NAME" ] && NAME="0.0.0"
BUILD=$(git rev-list --count HEAD)

ON_TAG=0
if [ -n "$TAG" ] && [ "$(git rev-list -n1 "$TAG" 2>/dev/null)" = "$(git rev-parse HEAD)" ]; then
  ON_TAG=1
fi

case "${1:-}" in
  --name)   echo "$NAME" ;;
  --build)  echo "$BUILD" ;;
  --on-tag) echo "$ON_TAG" ;;
  --tag)    echo "$TAG" ;;
  *)        echo "$NAME $BUILD $ON_TAG" ;;
esac
