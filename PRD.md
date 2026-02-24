# PRD — WhatsApp Booking Bot for Service Businesses

## Vision

A plug-and-play WhatsApp AI assistant that any service business (plumbers, locksmiths, electricians, handymen) can set up in minutes — no code, no technical skills. The business connects their WhatsApp number and Google Calendar, and the bot handles customer conversations, quote estimation, availability checking, and appointment booking automatically.

---

## Problem

Small service businesses lose leads because they can't answer WhatsApp messages fast enough. They juggle phone calls, manual scheduling, and missed follow-ups. Existing booking tools require customers to visit a website — but in many markets (UK trades, LATAM, Africa, India), WhatsApp *is* the primary channel.

## Solution

An AI-powered WhatsApp assistant that:
1. Greets customers and collects job details (service type, problem, address, urgency)
2. Generates an instant price estimate using AI
3. Checks the business owner's real-time Google Calendar availability
4. Offers appointment slots — prioritising short, soon slots for urgent requests
5. Books confirmed appointments directly into Google Calendar
6. Escalates to the human owner when needed

---

## Current State (v0 — Single-Tenant Prototype)

**What's built:**
- WhatsApp Cloud API integration (Meta webhooks)
- State-machine conversation flow (menu → intake → quote → confirm → slot select → booked)
- Claude AI for quote generation and free-form chat
- Google Calendar integration (freebusy check, event creation, urgency-aware short slots)
- FAQ knowledge base with keyword matching
- Human handoff with owner WhatsApp notification
- Daily digest (cron summary of jobs/conversations)
- Owner dashboard (HTML + REST API)

**Limitations:**
- Single tenant — one `.env` file, one WhatsApp number, one calendar
- Google Calendar via service account (requires sharing calendar manually)
- No self-serve onboarding — business owner must edit code/config
- SQLite database (not production-ready for multi-tenant)

**Tech stack:** Fastify, Prisma + SQLite, Meta Cloud API, Claude AI (claude-sonnet-4-6), Google Calendar API, node-cron

---

## Target State (v1 — Multi-Tenant SaaS)

### Target Customer
UK-based independent plumbers and small plumbing companies (1–5 engineers). Expand to other trades after product-market fit.

### Core Value Proposition
"Get a WhatsApp booking assistant in 5 minutes. No app to install, no website needed. Your customers message you on WhatsApp, the bot handles the rest."

---

## Roadmap

### Phase 1 — Foundation (Multi-Tenancy + Auth)

**Goal:** Make the system support multiple businesses from a single deployment.

- [ ] **Tenant model** — new `Tenant` table storing business name, email, services offered, pricing ranges, business hours, timezone
- [ ] **Database migration** — SQLite → PostgreSQL; add `tenantId` foreign key to Customer, Conversation, Job
- [ ] **Tenant-aware routing** — incoming WhatsApp messages matched to tenant by `phoneNumberId`
- [ ] **Auth system** — email/password signup + login for the business dashboard (e.g. Lucia or JWT)
- [ ] **Tenant-scoped dashboard** — each business sees only their own jobs, conversations, customers

### Phase 2 — Google Calendar OAuth

**Goal:** Business owners connect their own Google Calendar with one click.

- [ ] **Google OAuth 2.0 flow** — "Connect Google Calendar" button in dashboard
- [ ] **Token storage** — store `refreshToken` and `calendarId` per tenant in DB
- [ ] **Token refresh** — auto-refresh expired access tokens before API calls
- [ ] **Calendar selection** — let the business pick which calendar to use (personal, work, etc.)
- [ ] **Remove service account dependency** — all calendar calls use the tenant's OAuth token

### Phase 3 — WhatsApp Embedded Signup

**Goal:** Business owners connect their WhatsApp number without touching Meta Developer Portal.

- [ ] **Meta Tech Provider application** — apply for WhatsApp Embedded Signup access
- [ ] **Embedded Signup widget** — "Connect WhatsApp" button in dashboard triggers Meta's JS flow
- [ ] **WABA + phone number storage** — save `wabaId`, `phoneNumberId`, `whatsappToken` per tenant
- [ ] **Webhook routing** — single webhook endpoint routes messages to the correct tenant
- [ ] **Message template registration** — auto-register required message templates per tenant

### Phase 4 — Onboarding & Customisation

**Goal:** 5-minute self-serve setup with no technical knowledge.

- [ ] **Onboarding wizard** — step-by-step: sign up → connect WhatsApp → connect Calendar → configure services
- [ ] **Service configuration** — business picks which services they offer, sets custom pricing ranges
- [ ] **Business hours config** — set working days, start/end hours, timezone (replaces hardcoded 08–18 Mon–Fri)
- [ ] **Slot duration config** — business sets normal and urgent slot lengths per service
- [ ] **Custom bot personality** — business name, greeting message, tone (formal/casual)
- [ ] **Logo/brand** — optional brand colour for any future web-facing components

### Phase 5 — Billing & Payments

**Goal:** Monetise the platform.

- [ ] **Pricing model** — monthly subscription (e.g. £29/mo starter, £59/mo pro with more conversations)
- [ ] **Stripe integration** — subscription management, checkout, billing portal
- [ ] **Usage metering** — track conversations/month per tenant, enforce plan limits
- [ ] **Trial period** — 14-day free trial with full features
- [ ] **Upgrade prompts** — in-dashboard prompts when approaching plan limits

### Phase 6 — Growth & Retention

**Goal:** Features that make the product sticky and drive word-of-mouth.

- [ ] **Appointment reminders** — automated WhatsApp message 24h and 1h before appointment
- [ ] **Post-job follow-up** — automated "How did it go?" message after appointment, collect rating
- [ ] **Customer CRM** — view customer history, past jobs, notes
- [ ] **Analytics dashboard** — bookings/week, revenue estimates, response times, conversion funnel
- [ ] **Multi-engineer support** — assign jobs to specific team members, separate calendars per engineer
- [ ] **Rescheduling & cancellation** — customer can reschedule/cancel via WhatsApp (calendar event updated)
- [ ] **Review collection** — after job completion, send Google Reviews link via WhatsApp

### Phase 7 — Scale & Expand

**Goal:** Expand beyond plumbers, beyond the UK.

- [ ] **Multi-language** — bot conversations in customer's language (Claude handles this natively)
- [ ] **New verticals** — electricians, locksmiths, cleaners, beauty/barber, personal trainers
- [ ] **Marketplace/directory** — optional public listing where customers find local businesses
- [ ] **API & integrations** — Zapier/Make triggers, webhook events for external systems
- [ ] **White-label** — businesses can use their own domain for the dashboard

---

## Key Technical Decisions

| Decision | Current (v0) | Target (v1+) |
|---|---|---|
| Database | SQLite | PostgreSQL (Supabase or Railway) |
| Google Calendar auth | Service account | OAuth 2.0 per tenant |
| WhatsApp onboarding | Manual Meta setup | Embedded Signup (Tech Provider) |
| Hosting | Single instance | Containerised (Railway / Fly.io) |
| Frontend | Static HTML dashboard | Next.js or React SPA |
| Auth | None | Email/password + session tokens |
| Payments | None | Stripe Subscriptions |

---

## Success Metrics

| Metric | Target (6 months post-launch) |
|---|---|
| Tenant signups | 100 businesses |
| Activation rate (connected WhatsApp + Calendar) | 60% of signups |
| Bookings/tenant/month | 20+ appointments |
| Churn rate | < 5% monthly |
| MRR | £3,000+ |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Meta Tech Provider approval takes weeks/months | Blocks self-serve WhatsApp onboarding | Start application immediately; offer manual setup as interim |
| Google OAuth consent screen review | Blocks calendar connection for new tenants | Apply for verification early; use "testing" mode for beta |
| AI hallucinations in quotes | Wrong pricing damages trust | Keep structured quote logic; AI only suggests within configured ranges |
| WhatsApp message limits (1,000/day for new numbers) | Limits scale for new tenants | Guide businesses through Meta's quality rating process |
| Plumbers are not tech-savvy | Low activation if onboarding is confusing | Invest heavily in onboarding UX; offer setup call for first 50 customers |
