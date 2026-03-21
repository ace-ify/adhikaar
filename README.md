<!-- Generated README — see frontend/README.md for frontend-specific docs -->

# Adhikaar (अधिकार)

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/LiveKit-Voice-blue?style=for-the-badge&logo=livekit" alt="LiveKit">
  <img src="https://img.shields.io/badge/Groq-LLM-7B61FF?style=for-the-badge&logo=hardware" alt="Groq">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<p align="center">
  <strong>India's First AI Welfare Copilot</strong><br>
  Voice-first AI assistant that helps Indian citizens discover and apply for government welfare schemes in their native language.
</p>

<p align="center">
  <a href="https://adhikaar.vercel.app">Live Demo</a>
  ·
  <a href="https://github.com/your-username/adhikaar">Repository</a>
  ·
  <a href="#-deployment">Deployment</a>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎙️ **Voice-First AI** | Talk to the assistant in Hindi, English, or 10+ Indian languages |
| 🏛️ **4,600+ Schemes** | Access to government welfare schemes via myScheme.gov.in API |
| 🤖 **AI Form Filling** | Autonomous browser automation that fills government forms |
| 📄 **OCR Document Parsing** | Extract information from Aadhaar, PAN, and other documents |
| 🔊 **Real-Time Voice** | LiveKit-powered voice calls with human-like responses |
| 🌐 **Multi-Language** | Supports Hindi, English, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia |
| 👨‍👩‍👧‍👦 **Family Mode** | Apply for schemes for your entire family |
| 📊 **Application Tracker** | Dashboard to track all submitted applications |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              USERS                                   │
│                    (Web App, Voice Call)                            │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Next.js 16    │  │   LiveKit       │  │   Sarvam AI     │
│   Frontend      │  │   Voice Agent   │  │   STT/TTS       │
│                 │  │   (Gemini 2.0)  │  │   (Indian Lang) │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         │            ┌───────┴───────┐
         │            │               │
         ▼            ▼               ▼
┌─────────────────────────────────────────────────────┐
│                    API Layer                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐  │
│  │  Groq   │  │ Gemini  │  │   myScheme.gov.in   │  │
│  │  LLM    │  │ Vision  │  │   (4600+ schemes)   │  │
│  └─────────┘  └─────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              Automation Layer (Playwright)           │
│         AI-powered universal form filler            │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 16](https://nextjs.org/) (React 19)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + shadcn/ui
- **Animations**: [Framer Motion](https://www.framer.com/) + GSAP
- **Voice UI**: [LiveKit](https://livekit.io/) + WebGL shaders
- **AI SDK**: [Vercel AI SDK](https://sdk.vercel.ai/)

### Backend / Agent
- **Voice Agent**: [LiveKit Agents SDK](https://github.com/livekit/agents) + Python
- **Voice AI**: [Google Gemini 2.0 Flash Realtime](https://ai.google.dev/)
- **Automation**: [Playwright](https://playwright.dev/)
- **Speech**: [Sarvam AI](https://sarvam.ai/) (Saarika STT, Bulbul TTS)

### External APIs
- **LLM**: [Groq](https://console.groq.com/) (Llama 3.3 70B)
- **Vision**: [Google Gemini](https://ai.google.dev/) (OCR)
- **Schemes**: [myScheme.gov.in](https://myscheme.gov.in/) API

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- [Groq API Key](https://console.groq.com/)
- [LiveKit Cloud](https://cloud.livekit.io/) account
- [Google AI API Key](https://aistudio.google.com/app/apikey)
- [Sarvam AI API Key](https://sarvam.ai/) (optional, for voice)
- [myScheme API Key](https://developers.myscheme.gov.in/) (optional)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/adhikaar.git
cd adhikaar

# 2. Setup Frontend
cd frontend
cp .env.example .env.local
# Edit .env.local with your API keys
npm install
npm run dev

# 3. Setup Voice Agent (optional)
cd ../agent
cp .env.example .env.local
# Edit .env.local with your API keys
pip install -e .
python -m agent.src.agent start
```

### Using Docker Compose

```bash
# Copy environment files
cp frontend/.env.example frontend/.env.local
cp agent/.env.example agent/.env.local

# Edit the .env.local files with your API keys

# Start all services
docker-compose up --build
```

---

## 🌐 Deployment

### Frontend (Vercel) — Recommended

Vercel offers the best experience for Next.js applications with generous free tier.

1. **Connect Repository**
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   ```

2. **Configure Environment Variables**
   
   In your Vercel dashboard, add the following environment variables:
   ```
   GROQ_API_KEY=your_groq_api_key
   GEMINI_API_KEY=your_gemini_api_key
   SARVAM_API_KEY=your_sarvam_api_key
   LIVEKIT_URL=wss://your-instance.livekit.cloud
   LIVEKIT_API_KEY=your_livekit_key
   LIVEKIT_API_SECRET=your_livekit_secret
   MYSCHEME_API_KEY=your_myscheme_key
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

**Vercel Free Tier Includes:**
- 100GB bandwidth/month
- Unlimited deployments
- Edge caching
- Automatic SSL

### Voice Agent (Render) — Recommended for Side Projects

Render offers free tier for Docker-based services.

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Connect your GitHub repository

2. **Deploy the Agent**
   - Create a new **Background Worker**
   - Set root directory: `/agent`
   - Use the existing `Dockerfile`
   - Region: Oregon (closest to LiveKit)

3. **Add Environment Variables**
   ```
   LIVEKIT_URL=wss://your-instance.livekit.cloud
   LIVEKIT_API_KEY=your_livekit_key
   LIVEKIT_API_SECRET=your_livekit_secret
   GOOGLE_API_KEY=your_gemini_key
   ```

**Render Free Tier Includes:**
- 750 hours/month
- 512MB RAM
- Sleeps after 15 min inactivity (wakes on request)

### Alternative Hosting Options

| Service | Frontend | Agent | Notes |
|---------|----------|-------|-------|
| **Vercel** | ✅ | ❌ | Best for Next.js |
| **Railway** | ✅ | ✅ | $5 credit/month free |
| **Fly.io** | ❌ | ✅ | 500GB transfer/month free |
| **DigitalOcean** | ✅ | ✅ | App Platform available |
| **AWS** | ✅ | ✅ | Free tier available |

---

## 📁 Project Structure

```
adhikaar/
├── frontend/                    # Next.js 16 web application
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   │   ├── page.tsx       # Landing page
│   │   │   ├── chat/          # Chat interface
│   │   │   ├── schemes/       # Scheme explorer
│   │   │   ├── dashboard/     # Application tracker
│   │   │   └── api/           # API routes
│   │   ├── components/         # React components
│   │   ├── lib/               # Utilities & integrations
│   │   └── data/              # Local scheme database
│   └── package.json
│
├── agent/                      # Python LiveKit voice agent
│   ├── src/
│   │   ├── agent.py           # Main voice agent
│   │   └── data/              # Bundled scheme database
│   ├── pyproject.toml
│   └── Dockerfile
│
├── docker-compose.yml          # Local development
├── render.yaml                 # Render.com deployment
└── vercel.json                # Vercel configuration
```

---

## 🔑 Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for text chat |
| `GEMINI_API_KEY` | Yes | Gemini API for OCR |
| `SARVAM_API_KEY` | Recommended | Indian language STT/TTS |
| `LIVEKIT_URL` | Yes | LiveKit Cloud instance URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `MYSCHEME_API_KEY` | Optional | Government scheme API |

### Agent (`agent/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_URL` | Yes | Must match frontend |
| `LIVEKIT_API_KEY` | Yes | Must match frontend |
| `LIVEKIT_API_SECRET` | Yes | Must match frontend |
| `GOOGLE_API_KEY` | Yes | Gemini 2.0 Flash Realtime |

---

## 📜 License

MIT License — feel free to use this project for your own purposes.

---

## 🙏 Acknowledgments

- **Team NEXUS** — Built for the IET hackathon
- **Groq** — Lightning-fast LLM inference
- **LiveKit** — Real-time voice infrastructure
- **Sarvam AI** — Indian language speech processing
- **myScheme.gov.in** — Government scheme data

---

<p align="center">
  Made with ❤️ for India
</p>
