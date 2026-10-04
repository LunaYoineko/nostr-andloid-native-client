#!/usr/bin/env bash
# [#710] 関西弁（うにゅうと握手）の辞書を Web からネイティブへ写す。
# 正は Web の web/src/i18n/ja-kansai.json。ネイティブは同じ内容を composeResources/files に同梱して読む。
# 内容が一致しているかは desktopTest の KansaiDictSyncTest が確かめる（Web 側を変えたらこれを実行する）。
set -euo pipefail
cd "$(dirname "$0")/.."
cp web/src/i18n/ja-kansai.json composeApp/src/commonMain/composeResources/files/ja-kansai.json
echo "synced: composeApp/src/commonMain/composeResources/files/ja-kansai.json"
