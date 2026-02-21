# WhatsApp Service Bot

A WhatsApp chatbot for service-based businesses (plumbers, locksmiths, electricians, etc.) built with:
- **Meta Cloud API** — official WhatsApp integration
- **Fastify** — lightweight Node.js webhook server
- **Claude AI** (claude-sonnet-4-6) — quote estimation and free-form chat
- **Prisma + SQLite** — conversation state and job storage

---

## Features

- Hybrid menu + AI conversation flow
- Structured intake (service type, problem description, address, urgency)
- AI-generated price quote estimates
- Job booking with confirmation
- Human handoff — notifies the business owner via WhatsApp

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all values:

| Variable | Where to get it |
|---|---|
| `WHATSAPP_TOKEN` | Meta Developer Portal → Your App → WhatsApp → API Setup → System User Token |
| `PHONE_NUMBER_ID` | Meta Developer Portal → Your App → WhatsApp → API Setup |
| `VERIFY_TOKEN` | Any secret string you choose |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `OWNER_PHONE` | Your WhatsApp number in international format (e.g. `447911123456`) |

### 3. Set up Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com) and create a new App (type: **Business**)
2. Add the **WhatsApp** product to your app
3. Under **WhatsApp → API Setup**, note your `Phone Number ID`
4. Generate a **System User Access Token** with `whatsapp_business_messaging` permission

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start the server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build && npm start
```

---

## Testing locally with ngrok

Meta requires a public HTTPS URL for webhooks. Use [ngrok](https://ngrok.com) to expose your local server:

```bash
# In a separate terminal
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL.

### Register webhook in Meta Developer Portal

1. Go to **WhatsApp → Configuration**
2. Set **Callback URL** to `https://xxxx.ngrok-free.app/webhook`
3. Set **Verify Token** to the same value as your `VERIFY_TOKEN` env var
4. Click **Verify and Save**
5. Subscribe to the `messages` field

### Send a test message

Send any message from a WhatsApp account to your test phone number. You should see:
- The webhook fires in your terminal logs
- The bot replies with the welcome menu

---

## Conversation States

| State | Description |
|---|---|
| `MENU` | Showing the main welcome menu |
| `SERVICE_SELECT` | Customer is picking a service type |
| `INTAKE` | Collecting job details (3 steps) |
| `CONFIRM` | Showing quote + asking for booking confirmation |
| `AI_CHAT` | Free-form conversation with Claude |
| `HANDOFF` | Human agent is handling — bot is silent |
| `DONE` | Conversation ended |

---

## Project Structure

```
src/
├── index.ts              # Fastify server entry point
├── config.ts             # Environment variables
├── webhooks/
│   └── meta.ts           # Webhook verification + message receiver
├── bot/
│   ├── router.ts         # Main state machine / message dispatcher
│   ├── menus.ts          # WhatsApp interactive menus and buttons
│   ├── ai.ts             # Claude AI integration
│   └── handoff.ts        # Human escalation
├── services/
│   ├── whatsapp.ts       # Meta API client (send messages)
│   └── anthropic.ts      # Anthropic SDK wrapper
└── db/
    └── client.ts         # Prisma client

prisma/
└── schema.prisma         # Database schema (Customer, Conversation, Job)
```

---

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project from your repo
3. Add all environment variables in the Railway dashboard
4. Railway auto-detects Node.js and runs `npm start` after `npm run build`
5. Use the Railway-provided URL as your Meta webhook URL
