# Skill Tank LMS — Project PRD

## Original Problem Statement
Comprehensive LMS upgrade: Fix critical bugs (Stripe, Interview, Focus Tracker, Video), implement real AI (Claude 4.6), Emergent Google OAuth, landing page filters, admin analytics charts, LinkedIn card, Resend email. Ensure Vercel/Render deployment compatibility.

## Architecture
- **Frontend**: React (Create React App), single App.js + styles.css
- **Backend**: FastAPI + SQLite (custom Store abstraction), uvicorn on port 8001, server.py → main.py
- **AI**: Claude Sonnet 4.6 via emergentintegrations (Emergent LLM key)
- **Auth**: Custom JWT + Emergent-managed Google OAuth (/auth/callback route)
- **Payments**: Stripe sandbox simulation (sandbox_ session IDs)
- **Email**: Resend (RESEND_API_KEY set, domain verification pending)
- **Preview URL**: https://7a64f86c-bbda-4081-8a83-f98fc0b5b62f.preview.emergentagent.com

## What's Been Implemented

### Session 1 — Phase 1 Bug Fixes + AI
- [x] **server.py created** — Backend was failing to start, created server.py importing from main
- [x] **Route/Category Refresh Bug** — Catalog uses useSearchParams() from React Router
- [x] **Emergent Google OAuth** — AuthCallback + POST /api/auth/google-emergent endpoint
- [x] **Back Button on Auth Pages** — "← Back to home" above login form
- [x] **AI Chatbot Enter key** — Enter key submits chat messages
- [x] **Claude Sonnet 4.6** — lesson coach, quiz generation, interview questions

### Session 2 — Full Feature Matrix + Critical Bug Fixes
- [x] **Stripe Sandbox** — Full sandbox flow bypassing Stripe API: creates enrollment directly
- [x] **AI Interview Fix** — try-catch with FALLBACK_QS + loading state; backend multi-key LLM handling
- [x] **Focus Tracker Fix** — Only visibilitychange, no more window.blur/focus false positives
- [x] **Video Player Expanded** — max-width: 1400px, min-height: 300px
- [x] **Admin Analytics Charts** — Metric bars, completion ring, category enrollment bars
- [x] **Landing Page Filters** — Category/Price/Rating filter dropdowns on homepage
- [x] **LinkedIn Card** — Canvas-based PNG with branding, gradient, progress bar
- [x] **Resend Email** — RESEND_API_KEY configured, triggers on login/enrollment (domain needs verification)

## Vercel Compatibility
- /app/frontend/vercel.json: {"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}
- All /api/* routes → backend (Render/FastAPI)
- No hardcoded secrets in frontend code

## Prioritized Backlog

### P1 (High Priority)
- Verify Resend email with domain setup (Resend dashboard domain verification)
- Test Google OAuth end-to-end with real Google account
- Mobile responsive audit at 375px

### P2 (Good-to-Have)
- Sequential lesson drip locking
- Coupon engine validation
- Real-time note timestamping at video milestones
- Telegram notification integration
- Cohort allocation engine

## Test Credentials
- student@skilltank.dev / demo123
- instructor@skilltank.dev / demo123
- admin@skilltank.dev / demo123
