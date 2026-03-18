import { NextRequest, NextResponse } from "next/server";
import { chatWithLLM, toChatMessages } from "@/lib/llm";
import { WELFARE_AGENT_PROMPT } from "@/lib/prompts";
import { searchSchemes, type UserProfile } from "@/lib/myscheme";
import schemes from "@/data/schemes.json";
import { matchSchemes } from "@/lib/schemes";
import type { CitizenProfile, Scheme } from "@/lib/types";
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppButtons,
  formatForWhatsApp,
} from "@/lib/whatsapp";
import {
  addUserMessage,
  addAssistantMessage,
  getMessageHistory,
  getLanguage,
  setLanguage,
  detectLanguage,
  getReviewSession,
  setReviewSession,
  setCitizenData,
  getCitizenData,
} from "@/lib/whatsapp-sessions";
import { rateLimit } from "@/lib/rate-limit";
import { speechToText } from "@/lib/sarvam";

// Track message IDs we've already processed (dedup against Evolution API retries)
const processedMessages = new Set<string>();
const MAX_PROCESSED = 1000;

/**
 * POST /api/whatsapp/webhook
 *
 * Receives incoming WhatsApp messages from Evolution API webhook.
 * Returns 200 immediately, then processes in background via fire-and-forget.
 *
 * Evolution API webhook payload for MESSAGES_UPSERT:
 * {
 *   event: "messages.upsert",
 *   instance: "adhikaar-whatsapp",
 *   data: {
 *     key: { remoteJid: "919876543210@s.whatsapp.net", fromMe: false, id: "..." },
 *     message: { conversation: "text message" | extendedTextMessage: { text: "..." } },
 *     messageType: "conversation" | "extendedTextMessage",
 *     pushName: "User Name",
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Evolution API sends various events — we only care about incoming messages
    const event = body.event;
    if (event !== "messages.upsert") {
      return NextResponse.json({ status: "ignored", event });
    }

    const data = body.data;
    if (!data?.key?.remoteJid || data.key.fromMe) {
      return NextResponse.json({ status: "ignored", reason: "fromMe or no remoteJid" });
    }

    // Deduplicate: Evolution API may retry if we're slow
    const msgId = data.key.id;
    if (msgId && processedMessages.has(msgId)) {
      return NextResponse.json({ status: "ignored", reason: "duplicate" });
    }
    if (msgId) {
      processedMessages.add(msgId);
      // Prevent unbounded growth
      if (processedMessages.size > MAX_PROCESSED) {
        const first = processedMessages.values().next().value;
        if (first) processedMessages.delete(first);
      }
    }

    // Extract phone number from JID (format: "919876543210@s.whatsapp.net")
    const jid: string = data.key.remoteJid;
    if (!jid.endsWith("@s.whatsapp.net")) {
      return NextResponse.json({ status: "ignored", reason: "group message" });
    }
    const phoneNumber = jid.replace("@s.whatsapp.net", "");

    // Rate limit by phone number (20 messages per minute)
    const limited = rateLimit(`whatsapp:${phoneNumber}`, {
      maxRequests: 20,
      windowMs: 60_000,
    });
    if (limited) {
      console.log(`[WhatsApp] Rate limited ${phoneNumber} (retry in ${limited.retryAfter}s)`);
      return NextResponse.json({ status: "rate_limited" });
    }

    // Check if user is in an active HITL review session
    const activeReview = getReviewSession(phoneNumber);
    if (activeReview) {
      // Handle review flow responses (captcha, confirm, cancel)
      const messageText =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        "";
      if (messageText.trim()) {
        handleReviewResponse(phoneNumber, messageText.trim(), activeReview).catch(
          (err) => console.error(`[WhatsApp] Review response error:`, err)
        );
      }
      return NextResponse.json({ status: "accepted", flow: "review" });
    }

    // Extract message text — also handle voice messages via Sarvam STT
    let messageText =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      "";

    const messageType = data.messageType || "";
    const isAudio =
      messageType === "audioMessage" ||
      messageType === "pttMessage" ||
      !!data.message?.audioMessage;

    if (!messageText.trim() && isAudio) {
      // Voice message → download audio → Sarvam STT → transcript
      processVoiceMessage(phoneNumber, data).catch((err) =>
        console.error(`[WhatsApp] Voice processing error:`, err)
      );
      return NextResponse.json({ status: "accepted", flow: "voice" });
    }

    if (!messageText.trim()) {
      // Non-text, non-audio: reply with rejection in user's language
      const lang = getLanguage(phoneNumber);
      const rejectionMessages: Record<string, string> = {
        hi: "Adhikaar abhi sirf text aur voice messages support karta hai. Kripya apna sawal text mein bhejein.",
        en: "Adhikaar currently supports only text and voice messages. Please send your question as text.",
        ta: "Adhikaar tharpozhuthu uurai matrum kural seydhigalai mattum aadharikkiradhu. Thayavu seithu umannadhu urayaaga anuppungal.",
        te: "Adhikaar prastutham text mariyu voice sandeshaalanu matrame samarthishtundi. Dayachesi mee prashna text lo pamapandi.",
        bn: "Adhikaar ekhon sudhu text ebong voice messages samarthan kore. Dayakorey apnar proshno text e pathaan.",
        mr: "Adhikaar saddhya fakt text aani voice messages support karto. Krupaya tumcha prashna text madhe pathva.",
        gu: "Adhikaar haal maan fakt text ane voice messages support kare chhe. Krupaya tamaro prashna text maan moklo.",
        kn: "Adhikaar prastuta text mattu voice sandeshagalannu mathra belagisuththade. Dayavittu nimma prashneyannu text nalli kalisi.",
        ml: "Adhikaar ippol text, voice messages mathram support cheyyunnu. Dayavayi ningalude chodiyam text aayi ayakkuka.",
        pa: "Adhikaar haal sirf text ate voice messages support karda hai. Kirpa karke apna sawal text vich bhejo.",
        or: "Adhikaar bartamane keval text o voice messages support kare. Dayakari apananka prashnaku text re pathaunatu.",
      };
      const rejection = rejectionMessages[lang] || rejectionMessages.hi;
      sendWhatsAppText(phoneNumber, rejection).catch((e) =>
        console.error("[WhatsApp] Non-text reply failed:", e)
      );
      return NextResponse.json({ status: "ignored", reason: "non-text" });
    }

    console.log(
      `[WhatsApp] Message from ${phoneNumber}: ${messageText.slice(0, 80)}...`
    );

    // Fire-and-forget: process message in background, return 200 immediately
    processMessage(phoneNumber, messageText).catch((err) => {
      console.error(`[WhatsApp] Background processing failed for ${phoneNumber}:`, err);
    });

    return NextResponse.json({ status: "accepted" });
  } catch (error) {
    console.error("[WhatsApp] Webhook parse error:", error);
    return NextResponse.json(
      { status: "error", message: "Invalid webhook payload" },
      { status: 400 }
    );
  }
}

// ── Background message processing ──

async function processMessage(
  phoneNumber: string,
  messageText: string
): Promise<void> {
  // Detect language from message
  const currentLang = getLanguage(phoneNumber);
  const detectedLang = detectLanguage(messageText, currentLang);
  if (detectedLang !== currentLang) {
    setLanguage(phoneNumber, detectedLang);
  }

  // Add user message to session
  addUserMessage(phoneNumber, messageText);

  // Get conversation history
  const history = getMessageHistory(phoneNumber);
  const language = getLanguage(phoneNumber);

  // Build the same prompt as /api/chat
  const langNames: Record<string, string> = {
    hi: "Hindi (Devanagari script)",
    ta: "Tamil (தமிழ் script)",
    te: "Telugu (తెలుగு script)",
    bn: "Bengali (বাংলা script)",
    mr: "Marathi (Devanagari script)",
    gu: "Gujarati (ગુજરাતી script)",
    kn: "Kannada (ಕನ್ನಡ script)",
    ml: "Malayalam (മലയാളം script)",
    pa: "Punjabi (Gurmukhi script)",
    or: "Odia (ଓଡ଼ିଆ script)",
  };

  const langInstruction =
    language === "en"
      ? "\n\nIMPORTANT: Respond in simple English. Ensure all [SCHEME_CARD] tags use English contents."
      : `\n\nIMPORTANT: Respond in ${langNames[language] || "Hindi (Devanagari script)"}. Use simple language that everyone can understand. Ensure any scheme name (name) or benefit description (benefit) inside [SCHEME_CARD] tags is also translated.`;

  const whatsappInstruction = `\n\nWHATSAPP MODE: You are chatting on WhatsApp. Keep responses SHORT (3-4 lines max). Do NOT use markdown headers or links. Use *bold* for emphasis. Use numbered lists for schemes. Do NOT use emojis excessively. The user is on a mobile phone with potentially slow internet — be concise.`;

  const systemPrompt =
    WELFARE_AGENT_PROMPT + langInstruction + whatsappInstruction;

  const chatMessages = toChatMessages(history);

  // Get LLM response
  let response = await chatWithLLM(chatMessages, systemPrompt);

  // Check for [PROFILE_COMPLETE] tag — search schemes if found
  const profile = extractProfile(response);
  if (profile) {
    console.log(
      `[WhatsApp] Profile detected for ${phoneNumber}, searching schemes...`
    );

    const schemeResults = await searchForProfile(profile, language);
    const schemeData = `\n\n[SYSTEM: Live results from myScheme.gov.in:\n${schemeResults}\n\nPresent the top 5 most relevant using [SCHEME_CARD] tags. Keep it SHORT for WhatsApp.]`;

    const followUp = [
      ...chatMessages,
      { role: "assistant" as const, content: response },
      { role: "user" as const, content: schemeData },
    ];

    response = await chatWithLLM(followUp, systemPrompt);
  }

  // Check for [FAMILY_MEMBER] tags
  const familyMembers = extractFamilyMembers(response);
  if (familyMembers.length > 0) {
    const memberResults = await Promise.all(
      familyMembers.map(async (member) => {
        const results = await searchForProfile(member, language);
        return {
          name: member.name || "Member",
          relationship: member.relationship || "",
          results,
        };
      })
    );

    let familyData = `\n\n[SYSTEM: Family scheme results:\n`;
    for (const mr of memberResults) {
      familyData += `\n--- ${mr.name} (${mr.relationship}) ---\n${mr.results}\n`;
    }
    familyData += `\nPresent briefly using [SCHEME_CARD] tags. Keep SHORT for WhatsApp.]`;

    const followUp = [
      ...chatMessages,
      { role: "assistant" as const, content: response },
      { role: "user" as const, content: familyData },
    ];

    response = await chatWithLLM(followUp, systemPrompt);
  }

  // ── Check for [READY_TO_APPLY] before stripping tags ──
  const readyMatch = response.match(
    /\[READY_TO_APPLY:\s*(\{[\s\S]*?citizenData[\s\S]*?\}\s*\})\s*\]/
  ) || response.match(/\[READY_TO_APPLY:\s*(\{[\s\S]*?\})\s*\]/);

  if (readyMatch) {
    try {
      const readyData = JSON.parse(readyMatch[1]) as {
        schemeId?: string;
        schemeName?: string;
        citizenData?: Record<string, string>;
      };

      if (readyData.citizenData) {
        console.log(
          `[WhatsApp] READY_TO_APPLY detected for ${phoneNumber}: ${readyData.schemeName}`
        );

        // Store citizen data in session
        setCitizenData(phoneNumber, readyData.citizenData);

        // Generate a session ID for the review exchange
        const sessionId = `wa-${phoneNumber}-${Date.now()}`;

        // Notify user that form filling has started
        const lang = getLanguage(phoneNumber);
        const startMsg: Record<string, string> = {
          hi: `*${readyData.schemeName || "Scheme"}* ke liye form bhar raha hoon... Kripya 1-2 minute intezaar karein.`,
          en: `Filling the form for *${readyData.schemeName || "Scheme"}*... Please wait 1-2 minutes.`,
        };
        await sendWhatsAppText(phoneNumber, startMsg[lang] || startMsg.hi);

        // Trigger the review API
        triggerReviewFlow(phoneNumber, readyData, sessionId).catch((err) =>
          console.error(`[WhatsApp] Review flow error:`, err)
        );

        // Save assistant response (without the HITL part) to session
        addAssistantMessage(phoneNumber, response);
        return;
      }
    } catch (parseErr) {
      console.error(`[WhatsApp] Failed to parse READY_TO_APPLY:`, parseErr);
    }
  }

  // Format response for WhatsApp (strip markdown, format scheme cards)
  const whatsappResponse = formatForWhatsApp(response);

  // Save assistant response to session
  addAssistantMessage(phoneNumber, response);

  // Send response back via WhatsApp
  // Split long messages into chunks (WhatsApp has ~4096 char limit per message)
  const chunks = splitMessage(whatsappResponse, 4000);
  let sendFailed = false;
  for (const chunk of chunks) {
    try {
      await sendWhatsAppText(phoneNumber, chunk);
    } catch (sendErr) {
      console.error(
        `[WhatsApp] Failed to send message to ${phoneNumber}:`,
        sendErr
      );
      sendFailed = true;
      break;
    }
    // Small delay between chunks to maintain order
    if (chunks.length > 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(
    `[WhatsApp] ${sendFailed ? "Generated (send failed)" : "Replied to"} ${phoneNumber}: ${whatsappResponse.slice(0, 120)}...`
  );
}

// ── Helper functions ──

/**
 * Trigger the HITL review flow: call /api/automate/review, send screenshot to WhatsApp,
 * set up review session so the user can type captcha + confirm directly in chat.
 */
async function triggerReviewFlow(
  phoneNumber: string,
  readyData: { schemeId?: string; schemeName?: string; citizenData?: Record<string, string> },
  sessionId: string
): Promise<void> {
  const lang = getLanguage(phoneNumber);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    // Call the review API — this spawns smart_fill.py in review mode
    const reviewRes = await fetch(`${appUrl}/api/automate/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        citizenData: readyData.citizenData || {},
        sessionId,
      }),
    });

    if (!reviewRes.ok) {
      const errText = await reviewRes.text();
      console.error(`[WhatsApp] Review API returned ${reviewRes.status}: ${errText}`);
      const errorMsg: Record<string, string> = {
        hi: "Form fill karne mein error aaya. Kripya baad mein try karein.",
        en: "Error filling the form. Please try again later.",
      };
      await sendWhatsAppText(phoneNumber, errorMsg[lang] || errorMsg.hi);
      return;
    }

    const reviewData = (await reviewRes.json()) as {
      status?: string;
      filled_fields?: { field: string; value: string; isCaptcha?: boolean; selector?: string }[];
      has_captcha?: boolean;
      captcha_fields?: { selector: string }[];
      screenshot_base64?: string;
      message?: string;
    };

    if (reviewData.status === "error" || reviewData.status === "simulated") {
      const msg: Record<string, string> = {
        hi: reviewData.message || "Form bhar nahi paaya. Kripya baad mein try karein.",
        en: reviewData.message || "Could not fill the form. Please try again later.",
      };
      await sendWhatsAppText(phoneNumber, msg[lang] || msg.hi);
      return;
    }

    // Send screenshot to WhatsApp
    if (reviewData.screenshot_base64) {
      // Build caption with filled fields summary
      let caption = lang === "hi"
        ? `*${readyData.schemeName || "Scheme"}* ka form bhar diya hai.\n\nBhare gaye field:\n`
        : `*${readyData.schemeName || "Scheme"}* form has been filled.\n\nFilled fields:\n`;

      const fields = (reviewData.filled_fields || []).filter((f) => !f.isCaptcha);
      for (const field of fields.slice(0, 10)) {
        caption += `- ${field.field}: ${field.value}\n`;
      }
      if (fields.length > 10) {
        caption += lang === "hi" ? `...aur ${fields.length - 10} aur fields\n` : `...and ${fields.length - 10} more fields\n`;
      }

      try {
        await sendWhatsAppImage(phoneNumber, reviewData.screenshot_base64, caption);
      } catch (imgErr) {
        console.error("[WhatsApp] Failed to send screenshot:", imgErr);
        // Fall back to text-only summary
        await sendWhatsAppText(phoneNumber, caption);
      }
    }

    // Store captcha selector if available
    const captchaSelector = reviewData.captcha_fields?.[0]?.selector || "";
    setCitizenData(phoneNumber, { _captchaSelector: captchaSelector });

    // Set review session — this activates the review intercept at the top of the handler
    setReviewSession(phoneNumber, sessionId);

    // Send instructions with interactive buttons
    const instructionMsg = reviewData.has_captcha
      ? (lang === "hi"
          ? "Kripya screenshot dekh kar verify karein.\n\n1. Captcha type karein (screenshot mein dikhega)\n2. Phir *confirm* type karein submit karne ke liye\n3. Ya *cancel* type karein raddkarne ke liye"
          : "Please verify the screenshot.\n\n1. Type the captcha (shown in the screenshot)\n2. Then type *confirm* to submit\n3. Or type *cancel* to abort")
      : (lang === "hi"
          ? "Kripya screenshot dekh kar verify karein.\n\n*confirm* type karein submit karne ke liye\n*cancel* type karein raddkarne ke liye"
          : "Please verify the screenshot.\n\nType *confirm* to submit\nType *cancel* to abort");

    // Try sending interactive buttons, fall back to text
    try {
      const buttons = [
        { id: "confirm", text: lang === "hi" ? "Confirm" : "Confirm" },
        { id: "cancel", text: lang === "hi" ? "Cancel" : "Cancel" },
      ];
      await sendWhatsAppButtons(phoneNumber, instructionMsg, buttons);
    } catch {
      await sendWhatsAppText(phoneNumber, instructionMsg);
    }

  } catch (err) {
    console.error(`[WhatsApp] triggerReviewFlow error:`, err);
    const errorMsg: Record<string, string> = {
      hi: "Form bharne mein technical error aaya. Kripya baad mein try karein.",
      en: "A technical error occurred while filling the form. Please try later.",
    };
    await sendWhatsAppText(phoneNumber, errorMsg[lang] || errorMsg.hi);
  }
}

/**
 * Process a WhatsApp voice message: download audio → Sarvam STT → text → processMessage
 */
async function processVoiceMessage(
  phoneNumber: string,
  data: Record<string, unknown>
): Promise<void> {
  const lang = getLanguage(phoneNumber);

  // Sarvam language code mapping
  const sarvamLangCodes: Record<string, string> = {
    hi: "hi-IN",
    en: "en-IN",
    ta: "ta-IN",
    te: "te-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    pa: "pa-IN",
    or: "or-IN",
  };

  try {
    // Download audio from Evolution API
    const audioMsg =
      (data.message as Record<string, unknown>)?.audioMessage as
        | Record<string, unknown>
        | undefined;
    const mediaUrl = (audioMsg?.url as string) || "";
    const base64Audio = (data as Record<string, unknown>).base64 as
      | string
      | undefined;

    let audioBuffer: ArrayBuffer | null = null;

    if (base64Audio) {
      // Evolution API sometimes provides base64 directly
      const binary = Buffer.from(base64Audio, "base64");
      audioBuffer = binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength
      );
    } else if (mediaUrl) {
      // Download from URL
      const audioRes = await fetch(mediaUrl);
      if (audioRes.ok) {
        audioBuffer = await audioRes.arrayBuffer();
      }
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      // Try Evolution API media download endpoint
      const EVOLUTION_API_URL =
        process.env.EVOLUTION_API_URL || "http://localhost:8080";
      const EVOLUTION_API_KEY =
        process.env.EVOLUTION_API_KEY || "adhikaar-evo-secret-key";
      const EVOLUTION_INSTANCE =
        process.env.EVOLUTION_INSTANCE_NAME || "adhikaar-whatsapp";

      const msgKey = (data as Record<string, unknown>).key as Record<
        string,
        unknown
      >;
      const msgId = msgKey?.id as string;

      if (msgId) {
        const mediaRes = await fetch(
          `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              message: { key: msgKey, message: data.message },
            }),
          }
        );
        if (mediaRes.ok) {
          const mediaData = (await mediaRes.json()) as {
            base64?: string;
          };
          if (mediaData.base64) {
            const binary = Buffer.from(mediaData.base64, "base64");
            audioBuffer = binary.buffer.slice(
              binary.byteOffset,
              binary.byteOffset + binary.byteLength
            );
          }
        }
      }
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      const noAudioMsg: Record<string, string> = {
        hi: "Voice message download nahi ho paya. Kripya dobara bhejein ya text mein likhein.",
        en: "Could not download the voice message. Please resend or type your message.",
      };
      await sendWhatsAppText(phoneNumber, noAudioMsg[lang] || noAudioMsg.hi);
      return;
    }

    console.log(
      `[WhatsApp] Voice message from ${phoneNumber}: ${audioBuffer.byteLength} bytes, STT lang=${sarvamLangCodes[lang] || "hi-IN"}`
    );

    // Send "processing" indicator
    const processingMsg: Record<string, string> = {
      hi: "Aapka voice message sun raha hoon...",
      en: "Listening to your voice message...",
    };
    await sendWhatsAppText(
      phoneNumber,
      processingMsg[lang] || processingMsg.hi
    );

    // Run Sarvam STT
    const transcript = await speechToText(
      audioBuffer,
      sarvamLangCodes[lang] || "hi-IN"
    );

    if (!transcript || !transcript.trim()) {
      const noTranscriptMsg: Record<string, string> = {
        hi: "Voice message samajh nahi aaya. Kripya dobara bolein ya text mein likhein.",
        en: "Could not understand the voice message. Please try again or type your message.",
      };
      await sendWhatsAppText(
        phoneNumber,
        noTranscriptMsg[lang] || noTranscriptMsg.hi
      );
      return;
    }

    console.log(
      `[WhatsApp] STT transcript for ${phoneNumber}: "${transcript.slice(0, 80)}..."`
    );

    // Process the transcript as a regular text message
    await processMessage(phoneNumber, transcript);
  } catch (err) {
    console.error(`[WhatsApp] Voice message processing error:`, err);
    const errorMsg: Record<string, string> = {
      hi: "Voice message process karne mein error aaya. Kripya text mein likhein.",
      en: "Error processing voice message. Please type your message instead.",
    };
    const lang2 = getLanguage(phoneNumber);
    await sendWhatsAppText(phoneNumber, errorMsg[lang2] || errorMsg.hi);
  }
}

/**
 * Handle user responses during an active HITL review session.
 * User can type captcha, "confirm"/"haan", or "cancel"/"nahi".
 */
async function handleReviewResponse(
  phoneNumber: string,
  text: string,
  sessionId: string
): Promise<void> {
  const lang = getLanguage(phoneNumber);
  const lower = text.toLowerCase().trim();

  // Detect confirmation or cancellation
  const confirmPatterns =
    /^(confirm|yes|haan|ha|ji|submit|ok|okay|ठीक|हाँ|हां|जी|पुष्टि)$/i;
  const cancelPatterns =
    /^(cancel|no|nahi|nah|ruko|रुको|नहीं|रद्द)$/i;

  if (confirmPatterns.test(lower)) {
    // User confirmed — send confirmation to smart_fill.py
    try {
      const reviewSession = getReviewSession(phoneNumber);
      if (!reviewSession) return;

      // Get any captcha value that was stored earlier
      const citizenData = getCitizenData(phoneNumber) || {};
      const captchaValue = (citizenData._pendingCaptcha as string) || "";
      const captchaSelector =
        (citizenData._captchaSelector as string) || "";

      const confirmRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/automate/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            action: "submit",
            captcha_value: captchaValue,
            captcha_selector: captchaSelector,
            accept_declaration: true,
          }),
        }
      );

      if (confirmRes.ok) {
        const confirmMsg: Record<string, string> = {
          hi: "Form submit ho raha hai... Kripya kuch der intezaar karein.",
          en: "Submitting the form... Please wait a moment.",
        };
        await sendWhatsAppText(
          phoneNumber,
          confirmMsg[lang] || confirmMsg.hi
        );
      }
    } catch (err) {
      console.error("[WhatsApp] Confirm error:", err);
    }

    // Clear review session
    setReviewSession(phoneNumber, undefined);
    // Clear pending captcha
    setCitizenData(phoneNumber, {
      _pendingCaptcha: undefined,
      _captchaSelector: undefined,
    });
  } else if (cancelPatterns.test(lower)) {
    // User cancelled
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/automate/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action: "cancel" }),
        }
      );
    } catch (err) {
      console.error("[WhatsApp] Cancel error:", err);
    }

    const cancelMsg: Record<string, string> = {
      hi: "Form submission cancel kar diya gaya hai.",
      en: "Form submission has been cancelled.",
    };
    await sendWhatsAppText(phoneNumber, cancelMsg[lang] || cancelMsg.hi);

    setReviewSession(phoneNumber, undefined);
    setCitizenData(phoneNumber, {
      _pendingCaptcha: undefined,
      _captchaSelector: undefined,
    });
  } else {
    // Treat as captcha input — store it and ask for confirmation
    setCitizenData(phoneNumber, { _pendingCaptcha: text });

    const captchaMsg: Record<string, string> = {
      hi: `Captcha "${text}" save ho gaya. Ab "confirm" type karein submit karne ke liye, ya "cancel" type karein raddkarne ke liye.`,
      en: `Captcha "${text}" saved. Type "confirm" to submit, or "cancel" to abort.`,
    };
    await sendWhatsAppText(phoneNumber, captchaMsg[lang] || captchaMsg.hi);
  }
}

function extractProfile(text: string): UserProfile | null {
  const match = text.match(/\[PROFILE_COMPLETE:\s*(\{[^}]+\})\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractFamilyMembers(
  text: string
): (UserProfile & { name?: string; relationship?: string })[] {
  const members: (UserProfile & {
    name?: string;
    relationship?: string;
  })[] = [];
  const regex = /\[FAMILY_MEMBER:\s*(\{[^}]+\})\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    try {
      members.push(JSON.parse(m[1]));
    } catch {
      // skip malformed
    }
  }
  return members;
}

function toLocalProfile(profile: UserProfile): CitizenProfile {
  const casteMap: Record<string, "general" | "obc" | "sc" | "st" | "ews"> = {
    General: "general",
    OBC: "obc",
    SC: "sc",
    ST: "st",
  };
  return {
    gender:
      profile.gender === "Male"
        ? "male"
        : profile.gender === "Female"
          ? "female"
          : "other",
    age: profile.age,
    state: profile.state,
    category: casteMap[profile.caste || "General"] || "general",
    bplCard: profile.isBpl,
    hasDisability: profile.disability,
  };
}

async function searchForProfile(
  profile: UserProfile,
  language: string
): Promise<string> {
  try {
    const result = await searchSchemes(profile, { lang: language, size: 10 });
    if (result.total > 0) {
      let data = `${result.total} schemes found. Top matches:\n`;
      data += result.schemes
        .slice(0, 8)
        .map(
          (s, i) =>
            `${i + 1}. ${s.schemeName} (${s.schemeShortTitle || s.slug}) — ${s.briefDescription?.slice(0, 120)}... | Benefit: ${s.benefitTypes || "Various"}`
        )
        .join("\n");
      return data;
    }
    throw new Error("No results");
  } catch {
    const localProfile = toLocalProfile(profile);
    const matched = matchSchemes(localProfile, schemes as Scheme[]);
    if (matched.length > 0) {
      let data = `${matched.length} schemes matched (local). Top:\n`;
      data += matched
        .slice(0, 6)
        .map(
          (m, i) =>
            `${i + 1}. ${m.scheme.name} — ${m.scheme.description.slice(0, 100)} | Benefit: ${m.scheme.maxBenefit} | Score: ${m.eligibilityScore}%`
        )
        .join("\n");
      return data;
    }
    return "No matching schemes found.";
  }
}

/**
 * Split a long message into chunks at paragraph boundaries.
 */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at a paragraph boundary
    let splitIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      splitIdx = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      splitIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
