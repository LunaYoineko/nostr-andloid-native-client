# 利用制限リスト管理ツール（#376）

Nostrism の利用制限リスト（kind:30078）を**開発者のローカルから**管理・発行するツール。
アプリ本体はこのリストを読んで突合するだけで、リスト更新にアプリのリリースは不要。

## 仕組み

- 生の公開鍵は手元の `roster.json`（gitignore 済み）だけに持つ。
- リレーへ発行する 30078 の content には **SHA-256 ハッシュだけ**を載せる。
  誰を制限しているかはリレー上からは分からない。
- アプリはログイン中の公開鍵を同じ salt / alg でハッシュしてリストと突合する。
- ハッシュは一方向なので、対象を消すには手元の名簿を編集して**作り直して上書き**する
  （replaceable event なので同じ `d` タグで最新版に置き換わる）。

## 前提

```bash
cd tools/restrict-list
npm install            # nostr-tools を入れる
```

Node 18+ 推奨（グローバル WebSocket を使用）。

## 使い方

`publish` / `verify` は開発者鍵が要る。**nsec は環境変数で渡す**（履歴に残さないこと）。

```bash
# 追加（ローカル名簿に入るだけ。まだリレーには出ない）
node restrict.mjs add npub1xxxx --note "spam: 連投botの疑い"

# 名簿確認 / 削除
node restrict.mjs list
node restrict.mjs remove npub1xxxx

# ハッシュ化して署名・発行（これでアプリに反映される）
NOSTR_NSEC=nsec1yourdevkey node restrict.mjs publish

# 発行前に中身だけ確認
NOSTR_NSEC=nsec1yourdevkey node restrict.mjs publish --dry

# 発行済みリストと手元の名簿が一致しているか確認
NOSTR_NSEC=nsec1yourdevkey node restrict.mjs verify
```

## アプリ側と一致させる定数

`restrict.mjs` 冒頭。**変更したら composeApp 側の突合実装も必ず合わせること。**

| 定数 | 値 |
|---|---|
| d タグ | `app.nostrdeck:restrict` |
| alg | `sha256` |
| salt | `nostrism:restrict:v1` |
| ハッシュ | `sha256( salt + ":" + pubkeyHexLower )` |
| content | `{"v":1,"alg":"sha256","salt":"...","hashes":[...]}` |

`hash` サブコマンドでアプリ実装のデバッグ用にハッシュ値を突き合わせられる。

## 注意

- `roster.json` と nsec は**絶対にコミットしない**（.gitignore 済み）。
- 開発者鍵の公開鍵はアプリに埋め込み、アプリ側でこのイベントの**署名検証**を行うこと
  （なりすましリストを掴まされない）。
