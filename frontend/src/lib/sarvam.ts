const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const SARVAM_BASE_URL = "https://api.sarvam.ai";

export async function speechToText(
  audioBuffer: ArrayBuffer,
  languageCode: string = "hi-IN"
): Promise<string> {
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("language_code", languageCode);
  formData.append("model", "saarika:v2");

  const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: {
      "api-subscription-key": SARVAM_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Sarvam STT error: ${response.status}`);
  }

  const data = await response.json();
  return data.transcript || "";
}

export async function textToSpeech(
  text: string,
  targetLanguageCode: string = "hi-IN",
  speaker: string = "anushka"
): Promise<string> {
  const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": SARVAM_API_KEY,
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: targetLanguageCode,
      speaker: speaker,
      model: "bulbul:v2",
    }),
  });

  if (!response.ok) {
    throw new Error(`Sarvam TTS error: ${response.status}`);
  }

  const data = await response.json();
  return data.audios?.[0] || ""; // base64 encoded audio
}

export async function translateText(
  text: string,
  sourceLang: string = "en",
  targetLang: string = "hi"
): Promise<string> {
  const langMap: Record<string, string> = {
    en: "en-IN",
    hi: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    pa: "pa-IN",
  };

  const response = await fetch(`${SARVAM_BASE_URL}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": SARVAM_API_KEY,
    },
    body: JSON.stringify({
      input: text,
      source_language_code: langMap[sourceLang] || sourceLang,
      target_language_code: langMap[targetLang] || targetLang,
      model: "mayura:v1",
    }),
  });

  if (!response.ok) {
    throw new Error(`Sarvam Translation error: ${response.status}`);
  }

  const data = await response.json();
  return data.translated_text || text;
}
