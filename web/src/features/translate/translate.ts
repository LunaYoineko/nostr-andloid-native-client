/**
 * 投稿本文のオンデバイス翻訳（#541。ネイティブの Translator.kt に対応）。
 * Chrome の組み込み翻訳（Translator API / LanguageDetector API）だけを使い、外部の翻訳サービスへは送らない。
 * 両方揃っていないブラウザでは呼び出し側（moreMenu）が「翻訳」自体を出さない（translateAvailable）。
 */

type DetectionResult = { detectedLanguage: string; confidence: number };
type LanguageDetectorInstance = { detect(text: string): Promise<DetectionResult[]> };
type LanguageDetectorApi = { create(): Promise<LanguageDetectorInstance> };

type TranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";
type TranslatorInstance = { translate(text: string): Promise<string> };
type TranslatorApi = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorAvailability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
};

type BrowserApis = { translator: TranslatorApi; detector: LanguageDetectorApi };

function browserApis(): BrowserApis | null {
  const g = self as unknown as { Translator?: TranslatorApi; LanguageDetector?: LanguageDetectorApi };
  if (!g.Translator || !g.LanguageDetector) return null;
  return { translator: g.Translator, detector: g.LanguageDetector };
}

/** Translator と LanguageDetector の両方があるブラウザだけ true（⋯ メニューの「翻訳」はこのときだけ出す） */
export function translateAvailable(): boolean {
  return "Translator" in self && "LanguageDetector" in self;
}

/** 表示言語（navigator.language の言語部分。例 "ja-JP" → "ja"） */
function targetLanguage(): string {
  return (navigator.language || "en").split("-")[0].toLowerCase();
}

/**
 * text を表示言語へ翻訳する。本文の言語を LanguageDetector で判定し、表示言語と同じなら原文をそのまま返す。
 * 違えば Translator.availability → Translator.create → translate（モデルのダウンロードが要る場合はブラウザに任せる）。
 * 非対応ブラウザ・判定不能・非対応言語・失敗はすべて null。
 */
export async function translateNote(text: string): Promise<string | null> {
  const apis = browserApis();
  if (!apis) return null;
  const target = targetLanguage();
  try {
    const detector = await apis.detector.create();
    const [top] = await detector.detect(text);
    const source = top?.detectedLanguage;
    if (!source) return null;
    if (source === target) return text;
    const availability = await apis.translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    });
    if (availability === "unavailable") return null;
    const translator = await apis.translator.create({ sourceLanguage: source, targetLanguage: target });
    return await translator.translate(text);
  } catch {
    return null;
  }
}
