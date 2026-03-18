/**
 * WhatsApp Session Manager
 *
 * Manages per-user conversation state keyed by phone number.
 * Each WhatsApp user gets their own message history so the LLM
 * can maintain context across messages.
 *
 * File-backed store — persists sessions across frontend restarts.
 * Sessions are stored in a JSON file on disk and loaded on startup.
 * For multi-instance, replace with Redis-backed sessions.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface WhatsAppSession {
  phoneNumber: string;
  language: string;
  messages: ChatMessage[];
  lastActive: number;
  /** Citizen profile extracted from conversation (for automation) */
  citizenData?: Record<string, unknown>;
  /** Active review session ID, if any */
  reviewSessionId?: string;
}

/** Max messages to keep per session (to stay within LLM context limits) */
const MAX_MESSAGES = 30;

/** Session TTL: 24 hours */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Persistence file path — stored in OS temp directory */
const SESSION_DIR = path.join(os.tmpdir(), "adhikaar_sessions");
const SESSION_FILE = path.join(SESSION_DIR, "whatsapp_sessions.json");

/** Debounce timer for batched writes */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 2000; // Write at most every 2 seconds

// ── File-backed session store ────────────────────────────

/** In-memory cache — always the source of truth, periodically flushed to disk */
let sessions = new Map<string, WhatsAppSession>();

/**
 * Load sessions from disk on startup.
 */
function loadFromDisk(): void {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const raw = fs.readFileSync(SESSION_FILE, "utf-8");
      const parsed: Record<string, WhatsAppSession> = JSON.parse(raw);
      const now = Date.now();
      let loaded = 0;

      for (const [key, session] of Object.entries(parsed)) {
        // Skip expired sessions during load
        if (now - session.lastActive > SESSION_TTL_MS) continue;
        sessions.set(key, session);
        loaded++;
      }

      console.log(
        `[whatsapp-sessions] Loaded ${loaded} sessions from disk (skipped ${Object.keys(parsed).length - loaded} expired)`
      );
    } else {
      console.log("[whatsapp-sessions] No session file found, starting fresh");
    }
  } catch (err) {
    console.warn("[whatsapp-sessions] Failed to load sessions from disk:", err);
    // Start with empty sessions — don't crash
  }
}

/**
 * Save all sessions to disk. Debounced to avoid excessive I/O.
 */
function scheduleSave(): void {
  if (saveTimer) return; // Already scheduled
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToDisk();
  }, SAVE_DEBOUNCE_MS);
}

function saveToDisk(): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const obj: Record<string, WhatsAppSession> = {};
    for (const [key, session] of sessions) {
      obj[key] = session;
    }

    // Write atomically: write to temp file, then rename
    const tmpFile = SESSION_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), "utf-8");
    fs.renameSync(tmpFile, SESSION_FILE);
  } catch (err) {
    console.warn("[whatsapp-sessions] Failed to save sessions to disk:", err);
  }
}

// Load existing sessions on module initialization
loadFromDisk();

/**
 * Clean up expired sessions every 30 minutes.
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[whatsapp-sessions] Cleaned ${cleaned} expired sessions`);
    scheduleSave();
  }
}, 30 * 60 * 1000);

/**
 * Get or create a session for a phone number.
 */
export function getSession(phoneNumber: string): WhatsAppSession {
  const normalized = phoneNumber.replace(/^\+/, "").replace(/\D/g, "");

  let session = sessions.get(normalized);
  if (!session) {
    session = {
      phoneNumber: normalized,
      language: "hi", // Default to Hindi for Indian users
      messages: [],
      lastActive: Date.now(),
    };
    sessions.set(normalized, session);
    scheduleSave();
  }

  session.lastActive = Date.now();
  return session;
}

/**
 * Add a user message to the session.
 */
export function addUserMessage(phoneNumber: string, content: string): void {
  const session = getSession(phoneNumber);
  session.messages.push({ role: "user", content });

  // Trim old messages if over limit
  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  scheduleSave();
}

/**
 * Add an assistant response to the session.
 */
export function addAssistantMessage(
  phoneNumber: string,
  content: string
): void {
  const session = getSession(phoneNumber);
  session.messages.push({ role: "assistant", content });

  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  scheduleSave();
}

/**
 * Get conversation history for LLM context.
 */
export function getMessageHistory(
  phoneNumber: string
): ChatMessage[] {
  const session = getSession(phoneNumber);
  return [...session.messages];
}

/**
 * Set the user's preferred language.
 */
export function setLanguage(phoneNumber: string, language: string): void {
  const session = getSession(phoneNumber);
  session.language = language;
  scheduleSave();
}

/**
 * Get the user's preferred language.
 */
export function getLanguage(phoneNumber: string): string {
  return getSession(phoneNumber).language;
}

/**
 * Store citizen data extracted from conversation (for form filling).
 */
export function setCitizenData(
  phoneNumber: string,
  data: Record<string, unknown>
): void {
  const session = getSession(phoneNumber);
  session.citizenData = { ...session.citizenData, ...data };
  scheduleSave();
}

/**
 * Get stored citizen data.
 */
export function getCitizenData(
  phoneNumber: string
): Record<string, unknown> | undefined {
  return getSession(phoneNumber).citizenData;
}

/**
 * Set an active review session ID for form review flow.
 */
export function setReviewSession(
  phoneNumber: string,
  sessionId: string | undefined
): void {
  getSession(phoneNumber).reviewSessionId = sessionId;
  scheduleSave();
}

/**
 * Get active review session ID.
 */
export function getReviewSession(
  phoneNumber: string
): string | undefined {
  return getSession(phoneNumber).reviewSessionId;
}

/**
 * Reset a user's session (clear history).
 */
export function resetSession(phoneNumber: string): void {
  const normalized = phoneNumber.replace(/^\+/, "").replace(/\D/g, "");
  sessions.delete(normalized);
  scheduleSave();
}

/**
 * Detect language from user message (basic detection for common greetings).
 * Falls back to existing session language.
 */
export function detectLanguage(text: string, currentLang: string): string {
  const lower = text.toLowerCase().trim();

  const langPatterns: Record<string, RegExp[]> = {
    hi: [/namaste|namaskar|hindi|हिन्दी|हिंदी|नमस्ते/i],
    en: [/english|hello|hi\b|hey\b/i],
    ta: [/tamil|தமிழ்|வணக்கம்/i],
    te: [/telugu|తెలుగు|నమస్కారం/i],
    bn: [/bengali|bangla|বাংলা|নমস্কার/i],
    mr: [/marathi|मराठी|नमस्कार/i],
    gu: [/gujarati|ગુજરાતી|નમસ્તે/i],
    kn: [/kannada|ಕನ್ನಡ|ನಮಸ್ಕಾರ/i],
    ml: [/malayalam|മലയാളം|നമസ്കാരം/i],
    pa: [/punjabi|ਪੰਜਾਬੀ|ਸਤ ਸ੍ਰੀ ਅਕਾਲ/i],
    or: [/odia|ଓଡ଼ିଆ|ନମସ୍କାର/i],
  };

  for (const [lang, patterns] of Object.entries(langPatterns)) {
    if (patterns.some((p) => p.test(lower))) {
      return lang;
    }
  }

  return currentLang;
}
