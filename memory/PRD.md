# Skill Tank LMS — Project PRD

## Original Problem Statement
Comprehensive LMS upgrade: Fix critical bugs, implement Google OAuth via Emergent Auth, add real AI (Claude Sonnet 4.6) for lesson coaching, quiz generation, and interview questions. Ensure Vercel/Render deployment compatibility.

## Architecture
- **Frontend**: React (Create React App), single App.js, styles.css
- **Backend**: FastAPI + SQLite (via custom Store abstraction), uvicorn on port 8001
- **AI**: Claude Sonnet 4.6 via emergentintegrations library (Emergent LLM key)
- **Auth**: Custom JWT + Emergent-managed Google OAuth
- **Preview URL**: https://7a64f86c-bbda-4081-8a83-f98fc0b5b62f.preview.emergentagent.com

## What's Been Implemented

### Session 1 (2025-02-XX)

#### Critical Fixes
- [x] **server.py created** — Backend was failing to start (`uvicorn server:app` but only `main.py` existed). Created `/app/backend/server.py` that imports from `main.py`
- [x] **Route/Category Refresh Bug** — Catalog component now uses `useSearchParams()` from React Router instead of one-time `window.location.search` read. URL param changes (e.g. from MegaMenu) now instantly re-filter courses without reload
- [x] **Emergent Google OAuth** — Replaced broken Google Identity Services popup with Emergent-managed Auth redirect (`https://auth.emergentagent.com`). Added `AuthCallback` component at `/auth/callback` route. Added `POST /api/auth/google-emergent` backend endpoint
- [x] **Back Button on Auth Pages** — Added "← Back to home" button above login form in `login-panel` section
- [x] **Video sizing** — Already uses `aspect-ratio: 16/9` in CSS; confirmed correct
- [x] **AI Chatbot Enter key** — Pressing Enter (without Shift) now submits chatbot message

#### AI Integration
- [x] **Real AI Lesson Coach** — `lesson_ai_response()` now uses `LlmChat` with `claude-sonnet-4-6` via emergentintegrations. Falls back to structured text on error
- [x] **AI Quiz Generation** — `generate_quiz()` now uses Claude to generate context-aware questions. Falls back to static questions on error
- [x] **AI Interview Questions** — `interview_questions()` endpoint uses Claude for dynamic interview question generation

#### Environment Setup
- [x] Created `/app/backend/.env` with EMERGENT_LLM_KEY, JWT_SECRET, ALLOWED_ORIGINS
- [x] Created `/app/frontend/.env` with REACT_APP_BACKEND_URL, REACT_APP_API_URL, DANGEROUSLY_DISABLE_HOST_CHECK

## Vercel Compatibility
- `/app/frontend/vercel.json` already has: `{"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}`
- All `/api/*` routes go to backend (Render/FastAPI)
- No hardcoded secrets in frontend code

## Prioritized Backlog

### P0 (Critical - Must Fix)
- None outstanding

### P1 (High Priority)
- Complete feature matrix verification (26 features from spec)
- Test end-to-end Google OAuth flow with a real Google account
- Mobile responsive audit at 375px

### P2 (Good-to-Have)
- Sequential lesson drip locking
- Telegram notification delivery
- Coupon engine validation
- Real-time note annotation at video timestamps
- Gamified badge framework (partially implemented)
- Cohort allocation engine

## Test Credentials
- student@skilltank.dev / demo123
- instructor@skilltank.dev / demo123
- admin@skilltank.dev / demo123
