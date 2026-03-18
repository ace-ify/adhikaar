# Adhikaar (अधिकार) — Project Guide

> **India's First AI Welfare Copilot**  
> Built for the NeuralCity Challenge Hackathon | Team NEXUS

This guide explains everything about the Adhikaar project — from architecture to data flow, from tech stack to how to run it. It's written for team members who need to understand the codebase before presenting.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Hackathon Context](#hackathon-context)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Frontend Deep Dive](#frontend-deep-dive)
6. [Voice Agent Deep Dive](#voice-agent-deep-dive)
7. [Automation System](#automation-system)
8. [Data Flow](#data-flow)
9. [Design System](#design-system)
10. [Running the Project](#running-the-project)
11. [Environment Variables](#environment-variables)
12. [API Routes](#api-routes)
13. [Key Components](#key-components)

---

## Project Overview

**Adhikaar** (Hindi: अधिकार, meaning "Right/Entitlement") is an AI-powered copilot that helps Indian citizens discover and apply for government welfare schemes. Users can interact via voice or text in their preferred Indian language, and the system autonomously fills out application forms.

### Key Features

- **Voice-First Interface** — Talk to Adhikaar in Hindi, English, or other Indian languages
- **Scheme Discovery** — Search 4600+ government schemes via myScheme.gov.in API
- **Smart Form Filling** — AI analyzes any government portal and auto-fills applications
- **Document OCR** — Upload ID documents; AI extracts profile data automatically
- **Multi-Language Support** — STT/TTS powered by Sarvam AI (Indian languages)
- **Family Mode** — Apply for schemes on behalf of family members

---

## Hackathon Context

The team "vibe coded" this project in approximately **5 hours** during the NeuralCity Challenge hackathon. This explains certain architectural decisions:

- **Monorepo structure** for faster iteration
- **localStorage** instead of database (no setup required)
- **Pre-built UI components** (shadcn/ui, ReactBits)
- **Fallback chains** (Groq → Gemini, API → local JSON)
- **Mock portal** for demo instead of real government sites

---

## Architecture

The project is a **3-service monorepo**:

```
nexus/
├── frontend/          # Next.js 16 web app (main interface)
├── agent/             # Python LiveKit voice agent (voice AI)
├── automation/        # Playwright scripts (form filling)
└── PROJECT_GUIDE.md   # This file
```

### Service Communication

```
┌─────────────────────────────────────────────────────────────┐
│                        USER                                 │
│         (Web Browser / Mobile / Voice Call)                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Landing  │  │   Chat   │  │ Schemes  │  │Dashboard │    │
│  │  Page    │  │Interface │  │ Explorer │  │          │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │            │             │             │           │
│       └────────────┴──────┬──────┴──────────────┘           │
│                           │                                  │
│                    ┌──────▼──────┐                          │
│                    │ API Routes  │ (8 endpoints)            │
│                    └──────┬──────┘                          │
└───────────────────────────┼─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   GROQ API  │    │  LIVEKIT    │    │  myScheme   │
│ (Llama LLM) │    │  (Voice)    │    │ .gov.in API │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                          ▼
                 ┌────────────────┐
                 │ Voice Agent    │
                 │ (Python/Gemini)│
                 └────────────────┘
                          │
                          ▼
                 ┌────────────────┐
                 │ Automation     │
                 │ (Playwright)   │
                 └────────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js 16** | React framework with App Router |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library (based on Radix) |
| **Framer Motion** | Animations and transitions |
| **ReactBits** | Premium animated components |
| **WebGL/GLSL** | Audio visualizer shader |

### AI/LLM

| Technology | Purpose |
|------------|---------|
| **Groq API** | Primary LLM (Llama 3.3 70B) for text chat |
| **Google Gemini 2.0 Flash Realtime** | Voice agent LLM |
| **Google Gemini Vision** | OCR for document parsing |
| **Sarvam AI** | Indian language STT/TTS (Saarika, Bulbul) |

### Backend Services

| Technology | Purpose |
|------------|---------|
| **LiveKit** | Real-time voice infrastructure |
| **myScheme.gov.in API** | Government scheme database (4600+ schemes) |
| **Playwright** | Browser automation for form filling |

### Data Storage

| Technology | Purpose |
|------------|---------|
| **localStorage** | Browser-based storage (no database) |
| **In-memory Map** | Rate limiting |

---

## Frontend Deep Dive

### Pages

#### `/` — Landing Page (`Hero.tsx`)

The landing page is a single massive component (1280 lines) featuring:

- **WhatsApp-style chat demo** — Animated conversation showing the product flow
- **Saturn ring system** — SVG ellipses with GLSL glow animations
- **CountUp statistics** — 400+ schemes, 7.5L Cr budget, 40% unclaimed
- **How It Works timeline** — 4-step scroll-driven animation
- **Features bento grid** — 6 feature cards with spotlight effects
- **DPI Integrations** — Flowing menu with 8 government platform icons

Key sections:
- Hero with BlurText + ShinyText headings
- ScrollVelocity marquee
- Stats band
- How It Works (4 steps)
- Features (6 cards)
- Tech Stack band
- FAQ section
- CTA + Footer

#### `/chat` — Chat Interface (`ChatInterface.tsx`)

This is the main interaction point (1019 lines). Here's how it works:

```
User Message → /api/chat → LLM (Groq/Llama)
                              │
                              ▼
                    [PROFILE_COMPLETE: {...}]
                              │
                              ▼
                    myScheme.gov.in API
                              │
                              ▼
                    [SCHEME_CARD] tags in response
                              │
                              ▼
                    Frontend parses & renders cards
```

**Key Features:**
- **Session Management** — Create, select, delete chat sessions (stored in localStorage)
- **Scheme Cards** — Clickable cards with match scores (green ≥80%, amber ≥60%, red <60%)
- **Apply Flow** — When user wants to apply, LLM emits `[READY_TO_APPLY: {...}]`
- **OCR Upload** — Upload ID documents → `/api/ocr` → Gemini Vision extracts data → auto-sends to chat
- **Family Mode** — `[FAMILY_MEMBER]` and `[FAMILY_COMPLETE]` tags for multi-person applications
- **Markdown Rendering** — Custom `renderFormattedText()` for bold, lists, paragraphs

**System Prompt (`WELFARE_AGENT_PROMPT`):**
- Collects user profile (name, age, gender, income, caste, state, occupation, etc.)
- Emits structured tags for profile completion, scheme cards, family members
- Knows about 42 local schemes as fallback

#### `/schemes` — Scheme Explorer

Browse and search government schemes:
- Category filtering
- Search functionality
- Detail modals with eligibility information

#### `/dashboard` — Application Tracker

Track submitted applications:
- Status timeline
- Statistics
- Progress bars

### Components

#### VoiceCall.tsx (492 lines)

Full-screen voice call interface:

- **States:** idle → connecting → connected
- **LiveKit Integration:** Gets token from `/api/livekit/token`, creates audio-only room
- **Audio Visualizer:** WebGL shader-based aurora (AgentAudioVisualizerAura)
- **Control Bar:**
  - Mic toggle
  - Chat panel (text input during voice call)
  - Fast Apply button (sends demo profile)
  - End call button

#### ChatSidebar.tsx (221 lines)

Collapsible sidebar:
- Session list grouped by time (Today/Yesterday/Last 7 Days/Older)
- Search filter
- Create new chat
- Delete session
- ADHIKAAR branding (280px width)

#### Navbar.tsx (182 lines)

Fixed floating glass navbar:
- Animated pill indicator (Framer Motion `layoutId`)
- Links: Home, Schemes, Dashboard
- "Start Talking" CTA button
- Mobile hamburger menu

#### Shared Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `PageShell.tsx` | 63 | Ambient background wrapper (purple/indigo gradients, tech grid) |
| `GlassCard.tsx` | 36 | Glass morphism card with hover shine |
| `GradientText.tsx` | 28 | Three gradient variants (purple, pink, rainbow) |
| `LanguageSelector.tsx` | 89 | Dropdown for en/hi language switching |
| `AgentAudioVisualizerAura.tsx` | 436 | WebGL shader aurora visualization |

---

## Voice Agent Deep Dive

### Architecture

The voice agent (`agent/src/agent.py`, 488 lines) uses:

- **LiveKit Agents SDK** — `AgentServer` + `AgentSession`
- **Google Gemini 2.0 Flash Realtime** — Voice model "Puck"
- **Silero VAD** — Voice activity detection (0.3 threshold, 0.1s min speech)
- **BVC Noise Cancellation** — For both regular and SIP participants

### Function Tools

The agent has 3 function tools:

1. **`search_schemes`** — Search for relevant schemes based on user profile
2. **`apply_for_scheme`** — Initiate application process for a scheme
3. **`fast_apply`** — Quick apply with pre-filled demo profile

### Agent Dispatch

The agent is dispatched via `AgentDispatchClient` with name `"adhikaar-agent"`. The frontend gets a LiveKit token from `/api/livekit/token` which also dispatches the agent.

### Sarvam AI Integration

For Indian language support:

| Service | Model | Purpose |
|---------|-------|---------|
| **STT** | Saarika v2 | Speech-to-text in Indian languages |
| **TTS** | Bulbul v2 | Text-to-speech (speaker: "anushka") |
| **Translation** | Mayura v1 | Translate between 10+ Indian languages |

---

## Automation System

### Two Automation Approaches

#### 1. `fill_form.py` (244 lines)

Hardcoded selector-based form filling for the mock PM-KISAN portal:
- Reliable but portal-specific
- Uses predefined selectors

#### 2. `smart_fill.py` (442 lines)

AI-powered universal form filler:
1. Extracts all form elements from any page
2. Sends to Groq LLM to analyze and get fill instructions
3. Executes the instructions
4. Works on ANY government portal

### API Endpoint

`POST /api/automate`:
- Tries `smart_fill.py` first
- Falls back to `fill_form.py`
- On Vercel: returns "simulated" (no Python available)

### Mock Government Portal

`automation/mock-portal/index.html` (622 lines):
- Simulates PM-KISAN farmer payment portal
- Used for demo/testing form filling

---

## Data Flow

### Text Chat Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│  Frontend   │────▶│  /api/chat   │
│  "I need     │     │  (sends     │     │  (receives   │
│   schemes"   │     │   message)  │     │   message)   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                                        ┌───────────────┐
                                        │   Groq LLM    │
                                        │ (Llama 3.3)   │
                                        └───────┬───────┘
                                                │
                                                ▼
                                       ┌────────────────┐
                                       │ Parse Response │
                                       │ - [PROFILE_    │
                                       │   COMPLETE]    │
                                       │ - [SCHEME_     │
                                       │   CARD]        │
                                       │ - [READY_TO_   │
                                       │   APPLY]       │
                                       └───────┬────────┘
                                               │
                        ┌──────────────────────┤
                        │                      │
                        ▼                      ▼
               ┌────────────────┐    ┌─────────────────┐
               │ myScheme.gov.in│    │  Return JSON    │
               │ API (if needed)│    │  to frontend    │
               └────────────────┘    └────────┬────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │ Frontend parses │
                                     │ tags, renders  │
                                     │ scheme cards    │
                                     └─────────────────┘
```

### Voice Call Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│  Frontend   │────▶│ /api/livekit │
│  (speaks)    │     │ VoiceCall   │     │   /token     │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                      │
                            ▼                      ▼
                   ┌────────────────┐    ┌────────────────┐
                   │ LiveKit Room   │    │  Dispatch      │
                   │ (audio-only)   │    │  Voice Agent   │
                   └───────┬────────┘    └───────┬────────┘
                           │                      │
                           ▼                      ▼
                   ┌────────────────┐    ┌────────────────┐
                   │ Agent listens  │◀───│ Gemini 2.0    │
                   │ & responds     │    │ Flash Realtime │
                   └───────┬────────┘    └────────────────┘
                           │
                           ▼
                   ┌────────────────┐
                   │ Sarvam TTS     │
                   │ (Bulbul v2)    │
                   │ → User hears   │
                   └────────────────┘
```

### Apply Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│  Frontend   │────▶│  /api/chat   │
│  "Apply for  │     │  (parses    │     │  (LLM emits  │
│   PM-KISAN"  │     │ READY_TO_   │     │ [READY_TO_   │
│              │     │   APPLY)    │     │   APPLY])    │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                            ▼
                   ┌───────────────┐
                   │ ApplyButton   │
                   │ clicks        │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ /api/automate  │
                   │ (Playwright)  │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ Save to       │
                   │ localStorage  │
                   │ (applications)│
                   └───────────────┘
```

---

## Design System

### Global Styles (`globals.css` — 492 lines)

**Theme:** Deep dark theme using OKLCH color space

```css
background: oklch(0.06 0.015 280);
```

**Utility Classes:**

| Class | Purpose |
|-------|---------|
| `.glass` | Backdrop blur + subtle border |
| `.glass-strong` | Stronger glass effect |
| `.glass-elevated` | Elevated glass with stronger blur |
| `.gradient-text` | Purple gradient text |
| `.neon-border` | Glowing purple border |
| `.hero-gradient` | Hero section background |

### Animations

13 keyframe animations defined:
- `shimmer` — Text shimmer effect
- `float` — Floating animation
- `glow-pulse` — Pulsing glow
- `border-glow` — Border glow effect
- `gradient-shift` — Gradient color shift
- `saturn-drift` — Saturn ring drift
- `voice-bar` — Voice indicator bars
- `pulse-ring` — Pulsing ring
- `text-reveal` — Text reveal animation

### Film Grain Overlay

SVG-based film grain effect using `feTurbulence`.

### Custom Scrollbar

Purple-themed scrollbar.

---

## Running the Project

### Prerequisites

- Node.js 18+
- Python 3.10+
- pnpm (or npm/yarn)
- Docker (optional)

### Option 1: Docker Compose (Recommended)

```bash
# From project root
docker-compose up --build

# Services:
# - Frontend: http://localhost:3000
# - Agent: ws://localhost:8000
```

### Option 2: Manual Setup

#### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your API keys

pnpm install
pnpm dev
```

#### Agent

```bash
cd agent
cp .env.example .env
# Edit .env with your API keys

pip install -e .
python -m agent.src.agent
```

#### Automation

```bash
cd automation
pip install -r requirements.txt

# Run specific script
python fill_form.py
# or
python smart_fill.py
```

### Option 3: Vercel Deployment

The project includes `render.yaml` for Render.com deployment.

---

## Environment Variables

### Frontend (.env.local)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes | Primary LLM (Llama 3.3 70B) |
| `GEMINI_API_KEY` | Yes | OCR + backup LLM |
| `SARVAM_API_KEY` | Yes | Indian language STT/TTS |
| `LIVEKIT_URL` | Yes | Voice infrastructure |
| `LIVEKIT_API_KEY` | Yes | LiveKit authentication |
| `LIVEKIT_API_SECRET` | Yes | LiveKit authentication |
| `MYSCHEME_API_KEY` | Yes | Government scheme API |
| `GOOGLE_API_KEY` | Yes | Gemini Realtime for voice |

### Agent (.env)

| Variable | Required | Purpose |
|----------|----------|---------|
| `LIVEKIT_URL` | Yes | Voice infrastructure |
| `LIVEKIT_API_KEY` | Yes | LiveKit authentication |
| `LIVEKIT_API_SECRET` | Yes | LiveKit authentication |
| `GOOGLE_API_KEY` | Yes | Gemini Realtime |

---

## API Routes

All API routes are in `frontend/src/app/api/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Main chat with LLM + scheme search |
| `/api/ocr` | POST | Document OCR via Gemini Vision |
| `/api/automate` | POST | Trigger Playwright automation |
| `/api/voice/stt` | POST | Sarvam speech-to-text |
| `/api/voice/tts` | POST | Sarvam text-to-speech |
| `/api/livekit/token` | POST | LiveKit room token + agent dispatch |
| `/api/schemes/search` | POST | myScheme.gov.in search |
| `/api/schemes/detail` | GET | myScheme.gov.in scheme detail |

---

## Key Components

### ChatInterface.tsx (1019 lines)

**Location:** `frontend/src/components/chat/ChatInterface.tsx`

Main chat component handling:
- Message input and display
- Session management (localStorage)
- Scheme card parsing and rendering
- Apply flow orchestration
- OCR upload handling
- Markdown text rendering

**Key Functions:**
- `parseSchemeCards()` — Extract `[SCHEME_CARD]` tags from LLM response
- `handleSendMessage()` — Send to `/api/chat`
- `handleApply()` — Trigger apply flow
- `handleOCRUpload()` — Upload and process document

### VoiceCall.tsx (492 lines)

**Location:** `frontend/src/components/chat/VoiceCall.tsx`

Voice call interface with:
- LiveKit room connection
- Audio visualizer integration
- Control bar (mic, chat, fast apply, end call)
- Agent state management (listening/thinking/speaking)
- Auto-save applications when reference numbers detected

### Hero.tsx (1280 lines)

**Location:** `frontend/src/components/landing/Hero.tsx`

Landing page with:
- WhatsApp chat demo
- Saturn ring animation
- Stats display
- How It Works timeline
- Features grid
- FAQ section

### agent.py (488 lines)

**Location:** `agent/src/agent.py`

Python voice agent with:
- LiveKit Agents SDK integration
- Gemini 2.0 Flash Realtime model
- Silero VAD configuration
- BVC noise cancellation
- Function tools (search_schemes, apply_for_scheme, fast_apply)

### smart_fill.py (442 lines)

**Location:** `automation/smart_fill.py`

AI-powered form filler:
- Extracts form elements from any page
- Sends to Groq LLM for fill instructions
- Executes instructions via Playwright

---

## Summary

Adhikaar is a comprehensive AI copilot that:

1. **Accepts voice or text input** in multiple Indian languages
2. **Understands user eligibility** by collecting profile data
3. **Searches 4600+ government schemes** via myScheme.gov.in API
4. **Presents matching schemes** with eligibility scores
5. **Autonomously fills forms** using AI-powered browser automation
6. **Tracks applications** in local storage

Built in ~5 hours for a hackathon using modern AI APIs (Groq, Gemini, LiveKit, Sarvam) and pre-built UI components. The architecture is designed for rapid prototyping with fallback chains and mock implementations for demo purposes.

---

*Last updated: March 2026*  
*For questions, refer to the source code or ask the team.*
