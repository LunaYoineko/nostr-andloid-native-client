/**
 * リアクションピッカー用の軽量 Unicode 絵文字カタログ（ネイティブ EmojiCatalog.kt の写し。並び・キーワードを変えない）。
 * フルデータセットは同梱せず、よく使うものを日英キーワードで検索できるようにする。
 */

export type EmojiEntry = { char: string; keywords: readonly string[] };

const e = (char: string, ...keywords: string[]): EmojiEntry => ({ char, keywords });

export const EMOJI_CATEGORIES: readonly { title: string; emojis: readonly EmojiEntry[] }[] = [
  {
    title: "表情",
    emojis: [
      e("😀", "grin", "smile", "笑顔", "にこ"),
      e("😃", "smile", "happy", "笑顔", "うれしい"),
      e("😄", "smile", "happy", "笑", "わらい"),
      e("😁", "grin", "beam", "にやり", "笑"),
      e("😆", "laugh", "haha", "爆笑", "わらい"),
      e("😅", "sweat", "苦笑", "あせ", "汗"),
      e("🤣", "rofl", "lol", "爆笑", "わらい"),
      e("😂", "joy", "tears", "笑い泣き", "わらい"),
      e("🙂", "slight smile", "ほほえみ", "にこ"),
      e("🙃", "upside down", "さかさ", "とぼけ"),
      e("😉", "wink", "ウインク", "ちゃめ"),
      e("😊", "blush", "smile", "にこ", "照れ"),
      e("😍", "heart eyes", "love", "好き", "ラブ"),
      e("🥰", "love", "smiling hearts", "好き", "ラブ"),
      e("😘", "kiss", "キス", "ちゅ"),
      e("😎", "cool", "sunglasses", "クール", "かっこいい"),
      e("🤔", "thinking", "考え", "うーん", "なやみ"),
      e("🤐", "zip", "だまる", "むぐ"),
      e("😴", "sleep", "ねむい", "睡眠", "zzz"),
      e("😭", "cry", "sob", "泣く", "なき"),
      e("😱", "scream", "shock", "驚き", "びっくり"),
      e("😡", "angry", "怒り", "おこ", "rage"),
      e("🥺", "pleading", "うるうる", "おねがい"),
      e("😇", "angel", "天使", "せいなる"),
      e("🤩", "star eyes", "すごい", "キラキラ"),
      e("😏", "smirk", "にやり", "どや"),
      e("😬", "grimace", "うわ", "やばい"),
      e("🥳", "party", "celebrate", "お祝い", "パーティ"),
      e("😮", "wow", "おどろき", "ほー"),
      e("🤗", "hug", "ハグ", "うれしい"),
    ],
  },
  {
    title: "手・ジェスチャー",
    emojis: [
      e("👍", "thumbs up", "good", "いいね", "グッド", "了解"),
      e("👎", "thumbs down", "bad", "だめ", "わるい"),
      e("👏", "clap", "拍手", "ぱちぱち", "すごい"),
      e("🙏", "pray", "thanks", "please", "おねがい", "感謝", "ありがとう"),
      e("🙌", "raise", "万歳", "やった"),
      e("👌", "ok", "オーケー", "了解"),
      e("✌️", "victory", "peace", "ピース"),
      e("🤝", "handshake", "握手", "よろしく"),
      e("💪", "muscle", "strong", "がんばる", "筋肉"),
      e("👋", "wave", "hello", "bye", "やあ", "ばいばい"),
      e("🤙", "call me", "しゃか"),
      e("👀", "eyes", "見てる", "目"),
      e("🫡", "salute", "敬礼", "了解"),
      e("🤷", "shrug", "さあ", "しらない"),
    ],
  },
  {
    title: "ハート・感情",
    emojis: [
      e("❤️", "heart", "love", "好き", "ハート", "ラブ"),
      e("🧡", "orange heart", "オレンジ", "ハート"),
      e("💛", "yellow heart", "黄色", "ハート"),
      e("💚", "green heart", "緑", "ハート"),
      e("💙", "blue heart", "青", "ハート"),
      e("💜", "purple heart", "紫", "ハート"),
      e("🖤", "black heart", "黒", "ハート"),
      e("🤍", "white heart", "白", "ハート"),
      e("💗", "growing heart", "ときめき", "ハート"),
      e("💕", "two hearts", "ハート", "ラブ"),
      e("💔", "broken heart", "失恋", "こわれ"),
      e("🔥", "fire", "hot", "炎", "あつい", "やばい"),
      e("✨", "sparkles", "キラキラ", "すごい"),
      e("⭐", "star", "星", "すごい"),
      e("🎉", "party", "tada", "おめでとう", "クラッカー"),
      e("🎊", "confetti", "お祝い", "くす玉"),
      e("💯", "100", "perfect", "満点", "完璧"),
      e("💢", "anger", "怒り", "イライラ"),
      e("💦", "sweat", "あせ", "汗"),
      e("💤", "zzz", "ねむい", "睡眠"),
    ],
  },
  {
    title: "動物・自然",
    emojis: [
      e("🐶", "dog", "犬", "いぬ"),
      e("🐱", "cat", "猫", "ねこ"),
      e("🐭", "mouse", "ねずみ"),
      e("🐰", "rabbit", "うさぎ"),
      e("🦊", "fox", "きつね"),
      e("🐻", "bear", "くま"),
      e("🐼", "panda", "パンダ"),
      e("🐸", "frog", "かえる"),
      e("🐧", "penguin", "ペンギン"),
      e("🐤", "chick", "ひよこ"),
      e("🦄", "unicorn", "ユニコーン"),
      e("🐝", "bee", "はち"),
      e("🌸", "cherry blossom", "桜", "さくら"),
      e("🌺", "flower", "花", "はな"),
      e("🌈", "rainbow", "虹", "にじ"),
      e("☀️", "sun", "晴れ", "たいよう"),
      e("🌙", "moon", "月", "つき"),
      e("⚡", "lightning", "雷", "かみなり"),
      e("❄️", "snow", "雪", "ゆき"),
      e("🌊", "wave", "波", "なみ"),
    ],
  },
  {
    title: "食べ物・飲み物",
    emojis: [
      e("🍎", "apple", "りんご"),
      e("🍌", "banana", "バナナ"),
      e("🍓", "strawberry", "いちご"),
      e("🍅", "tomato", "トマト"),
      e("🍙", "rice ball", "おにぎり"),
      e("🍣", "sushi", "寿司", "すし"),
      e("🍜", "ramen", "ラーメン", "麺"),
      e("🍕", "pizza", "ピザ"),
      e("🍔", "burger", "ハンバーガー"),
      e("🍰", "cake", "ケーキ"),
      e("🍩", "donut", "ドーナツ"),
      e("🍺", "beer", "ビール", "酒"),
      e("🍷", "wine", "ワイン"),
      e("☕", "coffee", "コーヒー", "お茶"),
      e("🍵", "tea", "お茶", "緑茶"),
      e("🎂", "birthday cake", "誕生日", "ケーキ"),
    ],
  },
  {
    title: "アクティビティ・記号",
    emojis: [
      e("⚽", "soccer", "サッカー"),
      e("⚾", "baseball", "野球"),
      e("🏀", "basketball", "バスケ"),
      e("🎮", "game", "ゲーム"),
      e("🎵", "music", "音楽", "おんがく"),
      e("🎸", "guitar", "ギター"),
      e("📷", "camera", "カメラ", "写真"),
      e("💻", "laptop", "pc", "パソコン"),
      e("📱", "phone", "スマホ", "携帯"),
      e("💰", "money", "お金", "かね"),
      e("🎁", "gift", "present", "プレゼント"),
      e("✅", "check", "ok", "完了", "チェック"),
      e("❌", "cross", "no", "ばつ", "だめ"),
      e("❓", "question", "はてな", "疑問"),
      e("❗", "exclamation", "びっくり", "注意"),
      e("🆗", "ok", "オーケー"),
      e("🈵", "full", "満"),
      e("🚀", "rocket", "ロケット", "すごい"),
      e("👑", "crown", "王冠", "おう"),
      e("💎", "gem", "diamond", "ダイヤ", "宝石"),
    ],
  },
];

/** 全エントリ（重複は char で除去） */
export const EMOJI_ALL: readonly EmojiEntry[] = (() => {
  const seen = new Set<string>();
  const out: EmojiEntry[] = [];
  for (const category of EMOJI_CATEGORIES) {
    for (const entry of category.emojis) {
      if (seen.has(entry.char)) continue;
      seen.add(entry.char);
      out.push(entry);
    }
  }
  return out;
})();

/** 日英キーワードの部分一致（小文字化）か、絵文字そのものとの一致で探す。空なら [] */
export function searchEmojis(query: string): EmojiEntry[] {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  if (q === "") return [];
  return EMOJI_ALL.filter((entry) => entry.char === trimmed || entry.keywords.some((k) => k.includes(q)));
}
