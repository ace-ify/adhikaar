/**
 * Evolution API — WhatsApp message sending utility
 *
 * Uses Evolution API v2 to send text messages, images, and buttons
 * back to WhatsApp users via a self-hosted instance.
 *
 * Docs: https://doc.evolution-api.com/v2/en/get-started/introduction
 */

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY || "adhikaar-evo-secret-key";
const EVOLUTION_INSTANCE =
  process.env.EVOLUTION_INSTANCE_NAME || "adhikaar-whatsapp";

interface EvolutionResponse {
  key?: { id: string };
  status?: string;
  error?: string;
  message?: string;
}

/**
 * Make an authenticated request to Evolution API.
 */
async function evoFetch(
  endpoint: string,
  body: Record<string, unknown>
): Promise<EvolutionResponse> {
  const url = `${EVOLUTION_API_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[WhatsApp] API error ${res.status}: ${text}`);
    throw new Error(`Evolution API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Send a text message to a WhatsApp number.
 * @param to - WhatsApp number in format "919876543210" (country code + number, no +)
 * @param text - Message text (plain text, no markdown)
 */
export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<EvolutionResponse> {
  // Evolution API expects number without + prefix
  const number = to.replace(/^\+/, "").replace(/\D/g, "");

  return evoFetch(`/message/sendText/${EVOLUTION_INSTANCE}`, {
    number,
    text,
  });
}

/**
 * Send an image with optional caption.
 * Used for sending form screenshots during review mode.
 */
export async function sendWhatsAppImage(
  to: string,
  imageBase64: string,
  caption?: string
): Promise<EvolutionResponse> {
  const number = to.replace(/^\+/, "").replace(/\D/g, "");

  return evoFetch(`/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    number,
    mediatype: "image",
    media: `data:image/png;base64,${imageBase64}`,
    caption: caption || "",
  });
}

/**
 * Send a button message for interactive choices.
 * Used for review confirmation (Confirm / Cancel).
 */
export async function sendWhatsAppButtons(
  to: string,
  text: string,
  buttons: { id: string; text: string }[]
): Promise<EvolutionResponse> {
  const number = to.replace(/^\+/, "").replace(/\D/g, "");

  return evoFetch(`/message/sendButtons/${EVOLUTION_INSTANCE}`, {
    number,
    title: "Adhikaar",
    description: text,
    buttons: buttons.map((b) => ({
      type: "reply",
      reply: { id: b.id, title: b.text },
    })),
  });
}

/**
 * Create the Evolution API instance (run once on first setup).
 * This connects the Evolution API to WhatsApp via QR code.
 */
export async function createInstance(): Promise<EvolutionResponse> {
  return evoFetch("/instance/create", {
    instanceName: EVOLUTION_INSTANCE,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/whatsapp/webhook`,
    webhookByEvents: true,
    webhookEvents: ["MESSAGES_UPSERT"],
  });
}

/**
 * Get the QR code to connect WhatsApp.
 */
export async function getQRCode(): Promise<string> {
  const url = `${EVOLUTION_API_URL}/instance/connect/${EVOLUTION_INSTANCE}`;
  const res = await fetch(url, {
    headers: { apikey: EVOLUTION_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`Failed to get QR code: ${res.status}`);
  }

  const data = await res.json();
  return data.base64 || data.code || "";
}

/**
 * Strip markdown formatting for WhatsApp plain text.
 * WhatsApp supports *bold*, _italic_, ~strikethrough~, ```monospace```
 * but not markdown headers, links, images, etc.
 */
export function formatForWhatsApp(text: string): string {
  return (
    text
      // Remove [SCHEME_CARD: {...}] tags — format them as plain text
      .replace(
        /\[SCHEME_CARD:\s*(\{[^}]+\})\]/g,
        (_match, json) => {
          try {
            const card = JSON.parse(json);
            return `*${card.name}*\nBenefit: ${card.benefit}\nMatch: ${card.score}%\n`;
          } catch {
            return "";
          }
        }
      )
      // Remove system tags
      .replace(/\[PROFILE_COMPLETE:[^\]]*\]/g, "")
      .replace(/\[FAMILY_MEMBER:[^\]]*\]/g, "")
      .replace(/\[FAMILY_COMPLETE:[^\]]*\]/g, "")
      .replace(/\[READY_TO_APPLY:[^\]]*\]/g, "")
      // Convert markdown headers to WhatsApp bold
      .replace(/^#{1,3}\s+(.+)$/gm, "*$1*")
      // Convert markdown bold **text** to WhatsApp *text*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Convert markdown links [text](url) to text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      // Remove markdown images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
      // Clean up excessive newlines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
