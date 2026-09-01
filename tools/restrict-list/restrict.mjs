#!/usr/bin/env node
// Nostrism 利用制限リスト管理ツール（ローカル実行専用）。
//
// 生の公開鍵はローカルの roster.json だけに置き、リレーへ発行する 30078 には
// SHA-256 ハッシュだけを載せる（誰を制限しているかリレー上からは分からない）。
// ハッシュは一方向なので、公開済みイベントから対象を消すには手元の名簿が要る。
// そのため「名簿を編集 → publish で作り直して上書き」という運用にする。
//
// アプリ側はこのイベント（作者 = 開発者鍵 / d = D_TAG）を読み、ログイン中の
// 公開鍵を同じ SALT + ALG でハッシュして突合する。★下記の定数はアプリと一致させること★

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nip19, finalizeEvent, getPublicKey, SimplePool } from 'nostr-tools'

// ---- アプリと共有する規約（変更したら composeApp 側の実装も合わせる）----
const D_TAG = 'app.nostrdeck:restrict'
const ALG = 'sha256'
// ソルト。逆コンパイルで抜ける程度の難読化だが「素の鍵をハッシュして総当たり」を面倒にする。
// ★アプリの突合実装と完全一致させること★
const SALT = 'nostrism:restrict:v1'
const CONTENT_VERSION = 1

// 発行先リレー（アプリが開発者鍵の 30078 を読みに来るリレー群に合わせる）。
const DEFAULT_RELAYS = [
  'wss://relay-jp.shino3.net',
  'wss://yabu.me',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
]

const HERE = dirname(fileURLToPath(import.meta.url))
const ROSTER_PATH = join(HERE, 'roster.json')

// ---- 小物 ----
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }
const hashPubkey = (hex) => createHash(ALG).update(`${SALT}:${hex}`).digest('hex')

/** npub / hex いずれの公開鍵入力も 64桁小文字 hex へ正規化。 */
function toHexPubkey(input) {
  const s = String(input).trim()
  if (/^[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase()
  if (s.startsWith('npub1')) {
    const { type, data } = nip19.decode(s)
    if (type !== 'npub') die(`npub ではありません: ${s}`)
    return data
  }
  if (s.startsWith('nprofile1')) {
    const { type, data } = nip19.decode(s)
    if (type !== 'nprofile') die(`解釈できません: ${s}`)
    return data.pubkey
  }
  die(`公開鍵として解釈できません（hex64 / npub / nprofile）: ${s}`)
}

function loadRoster() {
  if (!existsSync(ROSTER_PATH)) return { entries: [] }
  try {
    const j = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'))
    if (!Array.isArray(j.entries)) return { entries: [] }
    return j
  } catch (e) {
    die(`roster.json の読み込みに失敗: ${e.message}`)
  }
}

function saveRoster(roster) {
  roster.entries.sort((a, b) => a.pubkey.localeCompare(b.pubkey))
  writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2) + '\n')
}

/** 環境変数 NOSTR_NSEC（nsec1... か hex秘密鍵）から署名用の鍵を得る。 */
function loadSigner() {
  const raw = process.env.NOSTR_NSEC
  if (!raw) die('環境変数 NOSTR_NSEC が未設定です（開発者鍵の nsec1... または hex秘密鍵）')
  let skBytes
  const s = raw.trim()
  if (s.startsWith('nsec1')) {
    const { type, data } = nip19.decode(s)
    if (type !== 'nsec') die('NOSTR_NSEC が nsec ではありません')
    skBytes = data
  } else if (/^[0-9a-fA-F]{64}$/.test(s)) {
    skBytes = Uint8Array.from(s.match(/.{2}/g).map((h) => parseInt(h, 16)))
  } else {
    die('NOSTR_NSEC は nsec1... か 64桁hex で指定してください')
  }
  return { skBytes, pubkey: getPublicKey(skBytes) }
}

// ---- サブコマンド ----
function cmdAdd(args) {
  const noteIdx = args.indexOf('--note')
  let note = ''
  if (noteIdx >= 0) { note = args[noteIdx + 1] ?? ''; args.splice(noteIdx, 2) }
  if (args.length === 0) die('追加する公開鍵を指定してください: add <npub|hex> [--note "理由"]')
  const roster = loadRoster()
  const seen = new Set(roster.entries.map((e) => e.pubkey))
  let added = 0
  for (const a of args) {
    const hex = toHexPubkey(a)
    if (seen.has(hex)) { console.log(`= 既に登録済み: ${hex}`); continue }
    roster.entries.push({ pubkey: hex, note, addedAt: Math.floor(Date.now() / 1000) })
    seen.add(hex)
    added++
    console.log(`+ 追加: ${hex}${note ? `  (${note})` : ''}`)
  }
  saveRoster(roster)
  console.log(`\n名簿 ${roster.entries.length} 件（今回 +${added}）。反映するには \`publish\` を実行。`)
}

function cmdRemove(args) {
  if (args.length === 0) die('削除する公開鍵を指定してください: remove <npub|hex>')
  const roster = loadRoster()
  const before = roster.entries.length
  const targets = new Set(args.map(toHexPubkey))
  roster.entries = roster.entries.filter((e) => !targets.has(e.pubkey))
  saveRoster(roster)
  const removed = before - roster.entries.length
  console.log(`- 削除 ${removed} 件。名簿 ${roster.entries.length} 件。反映するには \`publish\` を実行。`)
}

function cmdList() {
  const roster = loadRoster()
  if (roster.entries.length === 0) { console.log('名簿は空です。'); return }
  console.log(`名簿 ${roster.entries.length} 件:\n`)
  for (const e of roster.entries) {
    const when = e.addedAt ? new Date(e.addedAt * 1000).toISOString().slice(0, 10) : '----------'
    console.log(`  ${e.pubkey}  ${when}  ${e.note || ''}`)
  }
}

function buildContent(roster) {
  const hashes = roster.entries.map((e) => hashPubkey(e.pubkey)).sort()
  return JSON.stringify({ v: CONTENT_VERSION, alg: ALG, salt: SALT, hashes })
}

async function cmdPublish(args) {
  const dry = args.includes('--dry')
  const relayFlagIdx = args.indexOf('--relay')
  const relays = relayFlagIdx >= 0
    ? args.slice(relayFlagIdx + 1).filter((a) => a.startsWith('wss://'))
    : DEFAULT_RELAYS

  const roster = loadRoster()
  const content = buildContent(roster)
  const { skBytes, pubkey } = loadSigner()

  const evtTemplate = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', D_TAG]],
    content,
  }
  const signed = finalizeEvent(evtTemplate, skBytes)

  console.log(`作者(開発者鍵) : ${pubkey}`)
  console.log(`npub          : ${nip19.npubEncode(pubkey)}`)
  console.log(`d タグ        : ${D_TAG}`)
  console.log(`ハッシュ件数  : ${roster.entries.length}`)
  console.log(`イベントID    : ${signed.id}`)

  if (dry) {
    console.log('\n--dry: 発行せず終了。content プレビュー:')
    console.log(content.length > 400 ? content.slice(0, 400) + ' …' : content)
    return
  }

  const pool = new SimplePool()
  console.log(`\n発行先 ${relays.length} リレー:`)
  const results = await Promise.allSettled(pool.publish(relays, signed))
  results.forEach((r, i) => {
    console.log(`  ${r.status === 'fulfilled' ? '✓' : '✗'} ${relays[i]}${r.status === 'rejected' ? `  (${r.reason})` : ''}`)
  })
  pool.close(relays)
  const ok = results.filter((r) => r.status === 'fulfilled').length
  console.log(`\n${ok}/${relays.length} リレーへ発行。`)
  if (ok === 0) die('どのリレーにも発行できませんでした。')
}

async function cmdVerify(args) {
  const relayFlagIdx = args.indexOf('--relay')
  const relays = relayFlagIdx >= 0
    ? args.slice(relayFlagIdx + 1).filter((a) => a.startsWith('wss://'))
    : DEFAULT_RELAYS
  const { pubkey } = loadSigner()
  const pool = new SimplePool()
  const evt = await pool.get(relays, { kinds: [30078], authors: [pubkey], '#d': [D_TAG] })
  pool.close(relays)
  if (!evt) { console.log('リレー上に発行済みイベントが見つかりません。'); return }
  let remoteHashes = []
  try { remoteHashes = JSON.parse(evt.content).hashes ?? [] } catch { die('content が壊れています。') }
  const roster = loadRoster()
  const localHashes = new Set(roster.entries.map((e) => hashPubkey(e.pubkey)))
  const remoteSet = new Set(remoteHashes)
  const onlyRemote = [...remoteSet].filter((h) => !localHashes.has(h)).length
  const onlyLocal = [...localHashes].filter((h) => !remoteSet.has(h)).length
  console.log(`発行済み: ${new Date(evt.created_at * 1000).toISOString()}  ハッシュ ${remoteHashes.length} 件`)
  console.log(`名簿    : ${roster.entries.length} 件`)
  if (onlyRemote === 0 && onlyLocal === 0) console.log('✓ 名簿と発行済みリストは一致しています。')
  else console.log(`⚠ 差分あり（発行のみ ${onlyRemote} / 名簿のみ ${onlyLocal}）。\`publish\` で更新してください。`)
}

function cmdHash(args) {
  if (args.length === 0) die('hash <npub|hex> — 突合デバッグ用にハッシュを表示')
  for (const a of args) {
    const hex = toHexPubkey(a)
    console.log(`${hex}  ->  ${hashPubkey(hex)}`)
  }
}

function usage() {
  console.log(`Nostrism 利用制限リスト管理

使い方:
  NOSTR_NSEC=nsec1... node restrict.mjs <command>

コマンド:
  add <npub|hex>... [--note "理由"]   名簿に追加（ローカルのみ）
  remove <npub|hex>...                名簿から削除（ローカルのみ）
  list                               名簿を表示
  publish [--dry] [--relay wss://..] 名簿をハッシュ化して 30078 を署名・発行
  verify  [--relay wss://..]         発行済みリストと名簿の一致を確認
  hash <npub|hex>...                 ハッシュ値を表示（アプリ突合のデバッグ用）

環境変数:
  NOSTR_NSEC   開発者鍵（nsec1... または 64桁hex）。publish/verify/署名で必須。

規約（アプリと一致させる定数。スクリプト冒頭）:
  d タグ = ${D_TAG}   alg = ${ALG}   salt = ${SALT}   content v = ${CONTENT_VERSION}
  ハッシュ = ${ALG}( salt + ":" + pubkeyHexLower )`)
}

// ---- ディスパッチ ----
const [cmd, ...rest] = process.argv.slice(2)
switch (cmd) {
  case 'add': cmdAdd(rest); break
  case 'remove': case 'rm': cmdRemove(rest); break
  case 'list': case 'ls': cmdList(); break
  case 'publish': await cmdPublish(rest); break
  case 'verify': await cmdVerify(rest); break
  case 'hash': cmdHash(rest); break
  case undefined: case '-h': case '--help': case 'help': usage(); break
  default: console.error(`不明なコマンド: ${cmd}\n`); usage(); process.exit(1)
}
