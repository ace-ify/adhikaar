# Adhikaar (अधिकार) — Implementation Plan
## "India's First AI Welfare Copilot Built on Digital Public Infrastructure"

### Hackathon: NeuralCity Challenge
### Team: NEXUS

---

## 1. PROJECT IDENTITY

- **Name**: Adhikaar (अधिकार — "Your Rights")
- **Tagline**: "A voice-based AI welfare assistant that helps any Indian citizen discover and apply for government schemes in under 3 minutes"
- **Positioning**: AI Welfare Orchestration Layer — not just a scheme finder, an autonomous agent that DOES the work
- **Brand**: Dark mode, glassmorphism, purple-to-blue gradients (NeuralCity aligned)

---

## 2. CHALLENGE REQUIREMENTS MAPPING

| Challenge Says | How We Solve It |
|---|---|
| "Voice- or text-driven AI agent" | LiveKit real-time voice + text chat, Sarvam STT/TTS |
| "Interviews user in local language" | Hindi + English primary, Tamil bonus. Sarvam 10+ Indian languages |
| "Queries government eligibility APIs" | Firecrawl scrapes real govt data + structured scheme DB + Gemini matching |
| "Identifies matching schemes" | Eligibility engine: rule-based scoring + Gemini reasoning |
| "Asks for missing documentation" | Agent generates doc checklist per scheme, asks user to provide each |
| "Web-automation tools to fill out and submit" | Playwright automates a realistic mock govt portal (demo-safe) |
| "Autonomously navigate bureaucratic process" | End-to-end: interview → match → docs → fill → submit. Citizen does almost nothing |
| "Democratizing access for marginalized populations" | Voice-first (no literacy needed), local languages, zero tech skill required |

---

## 3. ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│                   ADHIKAAR ARCHITECTURE                       │
│              "Autonomous Welfare Agent"                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  CITIZEN INTERFACES                                          │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │  Voice Chat    │  │  Text Chat     │                     │
│  │  (LiveKit +    │  │  (Gemini +     │                     │
│  │   Sarvam)      │  │   Next.js)     │                     │
│  └───────┬────────┘  └───────┬────────┘                     │
│          └──────────┬────────┘                               │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AI AGENT BRAIN (Gemini 2.0 Flash)                   │   │
│  │  ├── Conversational Interview Engine                  │   │
│  │  ├── Citizen Profile Builder                          │   │
│  │  ├── Scheme Matching + Eligibility Scoring            │   │
│  │  ├── Document Checklist Generator                     │   │
│  │  └── Application Orchestrator                         │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                   │
│          ┌───────────────┼───────────────┐                   │
│          ▼               ▼               ▼                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Scheme Data  │ │  Document    │ │  Web Auto    │        │
│  │ Layer        │ │  Handler     │ │  (Playwright)│        │
│  │              │ │              │ │              │        │
│  │ • 50+ real   │ │ • Checklist  │ │ • Opens govt │        │
│  │   schemes    │ │ • Upload     │ │   portal     │        │
│  │ • Firecrawl  │ │ • Validate   │ │ • Fills form │        │
│  │   scraping   │ │ • DigiLocker │ │ • Uploads    │        │
│  │ • Eligibility│ │   (simulated)│ │   documents  │        │
│  │   rules      │ │              │ │ • Submits    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  LANGUAGE LAYER                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Sarvam AI APIs                                      │   │
│  │  ├── Saarika (STT) — Hindi, Tamil, 10+ languages    │   │
│  │  ├── Saaras (TTS) — Natural Indian voices            │   │
│  │  └── Mayura (Translation) — 22+ Indian languages     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. TECH STACK

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | Main web application |
| Styling | Tailwind CSS 3 | UI development |
| Components | shadcn/ui | Accessible components |
| Animations | Framer Motion | Transitions, micro-interactions |
| Voice UI | LiveKit React Components | Real-time voice in browser |
| Voice Backend | Python + LiveKit Agents SDK | Voice agent pipeline |
| STT | Sarvam Saarika API | Speech-to-text (Indian languages) |
| TTS | Sarvam Saaras API | Text-to-speech (Indian voices) |
| Translation | Sarvam Mayura API | Multi-language support |
| LLM Brain | Google Gemini 2.0 Flash | Conversational AI + reasoning |
| Web Automation | Playwright | Autonomous form filling |
| Web Scraping | Firecrawl | Scrape govt scheme data |
| Icons | Lucide React | Iconography |

---

## 5. FEATURE LIST (LOCKED)

### TIER 1 — Core Agent (Must Build, Challenge Requirements)

| # | Feature | What It Does | Challenge Mapping |
|---|---------|-------------|-------------------|
| 1 | **Voice Agent** | Real-time voice via LiveKit + Sarvam STT/TTS | "voice-driven AI agent" |
| 2 | **Text Chat** | Alternative text interface, same agent brain | "text-driven AI agent" |
| 3 | **Hindi + English** | Agent converses in user's language | "interviews in local language" |
| 4 | **Profile Interview** | Agent asks: state, age, income, caste, occupation, family, BPL, education, disability, land | "interviews the user" |
| 5 | **Scheme Database** | 50+ real Indian schemes with eligibility rules | "queries eligibility APIs" |
| 6 | **Eligibility Engine** | Match profile → schemes, show % scores | "identifies matching schemes" |
| 7 | **Document Checklist** | Agent lists required docs per scheme, asks for each | "asks for missing documentation" |
| 8 | **Document Upload** | Upload Aadhaar, income cert, etc. in chat | "asks for missing documentation" |
| 9 | **Web Automation (Playwright)** | Agent fills mock govt portal form autonomously | "web-automation tools to fill out and submit" |
| 10 | **Mock Govt Portal** | Realistic government application portal for demo | Supports #9 |

### TIER 2 — Full App (Should Build, Differentiators)

| # | Feature | What It Does |
|---|---------|-------------|
| 11 | **Landing Page** | Cinematic hero, features, impact stats, NeuralCity branding |
| 12 | **Scheme Explorer** | Browse/filter/search schemes with eligibility scores |
| 13 | **Application Dashboard** | Track submitted applications, status timeline |
| 14 | **Language Selector** | Switch Hindi/English/Tamil |
| 15 | **Firecrawl Scraping** | Demo: scrape real scheme data from myscheme.gov.in |

### TIER 3 — Wow Factors (Nice to Have)

| # | Feature | What It Does |
|---|---------|-------------|
| 16 | **DigiLocker Simulation** | "Fetch from DigiLocker" with mock API |
| 17 | **PDF Application** | Generate pre-filled downloadable application |
| 18 | **Automation Live View** | Show Playwright filling form in real-time split screen |
| 19 | **Tamil Voice** | Third language support |

---

## 6. FOLDER STRUCTURE

```
adhikaar/
├── frontend/                     # Next.js application
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Landing page
│   │   ├── globals.css
│   │   ├── chat/
│   │   │   └── page.tsx         # Agent chat (voice + text)
│   │   ├── schemes/
│   │   │   └── page.tsx         # Scheme explorer
│   │   ├── dashboard/
│   │   │   └── page.tsx         # Application tracking
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts     # Gemini chat endpoint
│   │       ├── schemes/
│   │       │   └── route.ts     # Scheme matching
│   │       ├── translate/
│   │       │   └── route.ts     # Sarvam translation
│   │       ├── automate/
│   │       │   └── route.ts     # Trigger Playwright automation
│   │       └── livekit/
│   │           └── token/
│   │               └── route.ts # LiveKit room token
│   ├── components/
│   │   ├── ui/                  # shadcn/ui
│   │   ├── landing/             # Hero, Features, HowItWorks, Impact
│   │   ├── chat/                # ChatInterface, MessageBubble, VoiceAgent, SchemeCard
│   │   ├── schemes/             # SchemeGrid, SchemeDetailCard, EligibilityBadge
│   │   ├── dashboard/           # ApplicationList, StatusTimeline
│   │   └── shared/              # Navbar, LanguageSelector, GlassCard, GradientText
│   ├── lib/
│   │   ├── gemini.ts
│   │   ├── sarvam.ts
│   │   ├── livekit.ts
│   │   ├── schemes.ts
│   │   ├── prompts.ts
│   │   └── types.ts
│   ├── data/
│   │   └── schemes.json         # 50+ real schemes
│   └── package.json
│
├── agent/                        # Python voice agent
│   ├── main.py                  # LiveKit agent entrypoint
│   ├── welfare_agent.py         # Agent logic + prompts
│   ├── sarvam_plugin.py         # Custom Sarvam STT/TTS
│   ├── eligibility.py           # Scheme matching
│   ├── requirements.txt
│   └── .env.example
│
├── automation/                   # Web automation
│   ├── fill_form.py             # Playwright script
│   └── mock-portal/             # Mock govt portal (simple HTML)
│       ├── index.html
│       ├── styles.css
│       └── form.html
│
├── .env.local
├── .gitignore
└── README.md
```

---

## 7. IMPLEMENTATION PHASES

### PHASE 1: Foundation (Hours 1-6)
| Task | Details |
|------|---------|
| Init Next.js + deps | TypeScript, Tailwind, shadcn/ui, framer-motion |
| Design system | NeuralCity colors, glassmorphism, fonts |
| Shared components | Navbar, GlassCard, GradientText, LanguageSelector |
| Schemes database | 50+ real Indian schemes in JSON with eligibility rules |
| Landing page | Hero, features, how-it-works, impact stats |

### PHASE 2: Core Agent — Text Chat (Hours 6-14)
| Task | Details |
|------|---------|
| Gemini API setup | Wrapper, system prompt, streaming responses |
| Sarvam API setup | STT, TTS, translation wrappers |
| Chat API route | POST /api/chat with conversation history |
| Eligibility engine | Profile → scheme matching with scores |
| Chat interface | Messages, typing indicator, scheme cards |
| Agent flow | Greeting → language → profile → matching → docs → results |
| Document checklist | Agent generates required docs list per scheme |

### PHASE 3: Voice Agent (Hours 14-22)
| Task | Details |
|------|---------|
| LiveKit Cloud setup | Project, credentials |
| Python agent | LiveKit Agents + Sarvam STT/TTS plugins |
| Sarvam STT plugin | Wrap Saarika API for LiveKit pipeline |
| Sarvam TTS plugin | Wrap Saaras API for LiveKit pipeline |
| LiveKit token API | /api/livekit/token endpoint |
| Voice UI integration | LiveKit React Components in chat page |
| Hindi voice test | End-to-end Hindi conversation |

### PHASE 4: Web Automation (Hours 22-30)
| Task | Details |
|------|---------|
| Mock govt portal | Realistic HTML form (NIC-style government portal look) |
| Playwright script | Fill form fields, upload docs, submit |
| Automation API | /api/automate triggers Playwright |
| Live view | Show automation happening in split screen or embedded view |
| Firecrawl integration | Scrape scheme data from real govt sites |

### PHASE 5: Full App Screens (Hours 30-40)
| Task | Details |
|------|---------|
| Scheme explorer | Filterable grid, category tabs, eligibility scores |
| Document upload | Upload UI in chat flow |
| Application dashboard | Track applications, status timeline |
| DigiLocker simulation | "Fetch from DigiLocker" mock |

### PHASE 6: Polish (Hours 40-48)
| Task | Details |
|------|---------|
| Animations | Page transitions, micro-interactions |
| Mobile responsive | All screens |
| Error handling | Fallbacks, loading states |
| Demo scripting | Perfect demo flow for judges |
| Final testing | 3 full run-throughs |

---

## 8. AGENT CONVERSATION FLOW

```
┌─────────────────────────────────────────────────┐
│ 1. GREETING                                      │
│    "नमस्ते! मैं अधिकार हूँ।"                      │
│    "Which language? Hindi / English / Tamil?"     │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ 2. PROFILE INTERVIEW                             │
│    Agent asks one question at a time:            │
│    • Which state do you live in?                 │
│    • What is your age?                           │
│    • What is your monthly household income?      │
│    • What is your caste category?                │
│    • What is your occupation?                    │
│    • How many people in your family?             │
│    • Do you have a BPL card?                     │
│    • What is your education level?               │
│    • Do you have any disability?                 │
│    • Do you own land?                            │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ 3. SCHEME MATCHING                               │
│    "I found 7 schemes you're eligible for!"      │
│    [PM-KISAN: 95%] [PMAY: 87%] [Ayushman: 92%] │
│    "Would you like to apply for PM-KISAN?"       │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ 4. DOCUMENT CHECKLIST                            │
│    "For PM-KISAN, you need:"                     │
│    ☐ Aadhaar Card                                │
│    ☐ Land ownership record (Khasra/Khatauni)     │
│    ☐ Bank passbook (for DBT)                     │
│    "Please upload or I can fetch from DigiLocker" │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ 5. AUTONOMOUS APPLICATION                        │
│    "I'm now filling your application..."         │
│    [Shows Playwright filling the govt portal]    │
│    ✅ Personal details — filled                   │
│    ✅ Land records — attached                     │
│    ✅ Bank details — filled                       │
│    ✅ Application submitted!                      │
│    "Your reference number: PMKISAN-2026-XXXXXX"  │
└─────────────────────────────────────────────────┘
```

---

## 9. MOCK GOVERNMENT PORTAL

A realistic-looking government application portal for the Playwright demo:

```
┌──────────────────────────────────────────────────┐
│  🏛️ Government of India                          │
│  Ministry of Agriculture & Farmers' Welfare      │
│  PM-KISAN Application Portal                     │
├──────────────────────────────────────────────────┤
│                                                  │
│  Personal Details:                               │
│  ┌────────────────┐ ┌────────────────┐          │
│  │ Full Name      │ │ Father's Name  │          │
│  └────────────────┘ └────────────────┘          │
│  ┌────────────────┐ ┌────────────────┐          │
│  │ Aadhaar Number │ │ Date of Birth  │          │
│  └────────────────┘ └────────────────┘          │
│  ┌────────────────┐ ┌────────────────┐          │
│  │ State          │ │ District       │          │
│  └────────────────┘ └────────────────┘          │
│                                                  │
│  Land Details:                                   │
│  ┌────────────────┐ ┌────────────────┐          │
│  │ Survey No.     │ │ Area (hectares)│          │
│  └────────────────┘ └────────────────┘          │
│                                                  │
│  Bank Details:                                   │
│  ┌────────────────┐ ┌────────────────┐          │
│  │ Account Number │ │ IFSC Code      │          │
│  └────────────────┘ └────────────────┘          │
│                                                  │
│  Documents: [Upload Aadhaar] [Upload Land Record]│
│                                                  │
│  [  Submit Application  ]                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

Styled to look like a real NIC government portal (brown/orange header, formal typography).

---

## 10. API KEYS NEEDED

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Sarvam AI | STT, TTS, Translation | Free developer credits |
| Google Gemini | LLM Brain | 15 RPM, 1M+ tokens/day free |
| LiveKit Cloud | Real-time voice | Generous free tier |
| Firecrawl | Web scraping | Free tier available |

---

## 11. DEMO SCRIPT (3 Minutes for Judges)

**[0:00-0:20] Landing**
→ Open Adhikaar, cinematic hero loads
→ "India's first AI welfare copilot"

**[0:20-1:20] Voice Agent (Hindi)**
→ Press mic, speak Hindi: "मैं UP से हूँ, किसान हूँ"
→ Agent asks follow-ups in Hindi
→ Agent: "7 योजनाएँ मिलीं!"
→ Shows scheme cards with scores

**[1:20-1:40] Document Collection**
→ Agent lists required docs
→ User uploads Aadhaar
→ "Fetch from DigiLocker" for land record

**[1:40-2:20] ★ THE WOW MOMENT — Web Automation ★**
→ Agent: "मैं आपका आवेदन भर रहा हूँ..."
→ Split screen shows Playwright opening govt portal
→ Form fields filling automatically
→ Documents uploading
→ Submit button clicked
→ "आवेदन सफल! Reference: PMKISAN-2026-847291"

**[2:20-2:40] Dashboard**
→ Dashboard shows application with status: "Submitted → Under Review"
→ Scheme explorer shows other eligible schemes

**[2:40-3:00] Architecture + Close**
→ Flash DPI architecture diagram
→ "Built on Bhashini, DigiLocker, API Setu"
→ "Adhikaar — अधिकार — Your rights, automated."

---

## 12. WINNING DIFFERENTIATORS

1. **AUTONOMOUS, not advisory** — Agent DOES the work, citizen just talks
2. **Voice-first in Hindi** — Real Sarvam voices, not browser TTS
3. **Live web automation** — Judges SEE Playwright filling forms
4. **DPI-native vision** — Positioned on India's digital infrastructure
5. **"ChatGPT for government schemes"** — Instantly understood positioning
6. **Real schemes, real data** — 50+ actual Indian welfare schemes
