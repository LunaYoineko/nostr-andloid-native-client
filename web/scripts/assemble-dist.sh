#!/usr/bin/env bash
# web/dist/（Static Assets の配信ディレクトリ）を組み立てる。設計: #426 7.1 節。
#   docs/（LP の正本・無変更） → web/dist/
#   Web アプリ                → web/dist/app/（当面はプレースホルダ）
#   web/static/               → web/dist/ ルート（_headers / robots.txt / .assetsignore）
# リポジトリルートからでも web/ からでも動く（パスはスクリプトの位置から解決）。
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(dirname "$script_dir")"
repo_dir="$(dirname "$web_dir")"
docs_dir="$repo_dir/docs"
static_dir="$web_dir/static"
dist_dir="$web_dir/dist"

rm -rf "$dist_dir"
mkdir -p "$dist_dir"

# dotfile・.well-known/ を含めて丸ごと
cp -a "$docs_dir/." "$dist_dir/"

# Web アプリ（wasm 出力に差し替えるまでのプレースホルダ）
mkdir -p "$dist_dir/app"
cat > "$dist_dir/app/index.html" <<'HTML'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nostrism Web</title>
</head>
<body>
<p>Nostrism の Web 版は準備中です。</p>
<p><a href="/">トップへ戻る</a></p>
</body>
</html>
HTML

# 配信用メタファイル。docs/ に同名があれば上書きしない
for name in _headers robots.txt .assetsignore; do
  if [[ -e "$dist_dir/$name" ]]; then
    echo "assemble-dist: docs/$name が既にあるため web/static/$name はコピーしない" >&2
  else
    cp -a "$static_dir/$name" "$dist_dir/$name"
  fi
done

echo "assemble-dist: $dist_dir を組み立てた"
