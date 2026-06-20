# Skill Tank LMS — Project PRD (Updated)

## Original Problem Statement
Comprehensive LMS - fix bugs, integrate AI, Google OAuth, redesign entire UI.

## Architecture
- **Frontend**: React (CRA), single App.js + styles.css
- **Backend**: FastAPI + SQLite, server.py → main.py  
- **AI**: Claude Sonnet 4.6 via emergentintegrations (Emergent LLM key)
- **Auth**: Custom JWT + Emergent-managed Google OAuth
- **Payments**: Stripe sandbox simulation
- **Email**: Resend SDK v2.32.2 (key configured, domain verification pending)
- **Fonts**: Outfit (headings) + Manrope (body) from Google Fonts
- **Preview URL**: https://skilltank-lms.preview.emergentagent.com

## What's Been Implemented

### Session 1 — Phase 1: Critical Bug Fixes
- server.py created, Catalog useSearchParams fix, Emergent Google OAuth, back button, AI chatbot Enter key, Claude Sonnet 4.6 AI

### Session 2 — Phase 2: Feature Matrix
- Stripe sandbox, AI Interview fix, Focus tracker fix, Admin analytics charts, Landing filters, LinkedIn Card PNG, Resend email wired

### Session 3 — Phase 3: Comprehensive UI Overhaul (All Tests Pass 100%)
- Google Fonts: Outfit headings + Manrope body
- CSS variables: richer tokens, shadows, glow effects
- Course cards: redesign with glassmorphism badges, gradient overlay, hover-lift, animated thumbnails
- Buttons: premium shadow, smooth transitions, states (primary/soft/ghost/danger)
- Sidebar nav: active state gradient, hover effects
- Stat cards: colored icon gradients per category (green/purple/yellow/blue/rose)
- Login page: rich dark gradient left panel, premium form inputs with focus glow
- Landing hero: deep gradient with radial glow, Outfit font, em accent text
- Panels: 1.5px borders, subtle shadow
- Admin: colorful metric charts, styled tables, delivery status badges
- Modal: glassmorphism backdrop, styled form inputs
- Tables: proper header styling, zebra hover rows
- Interview role cards: dark CTA buttons, styled skill tags
- Mobile: responsive layouts tested at 375px

### Session 4 — Phase 4: P0 Bug Fixes (2026-02)
- **Stripe checkout intent preserved**: Protected route now passes `state={{ from: location }}` to login redirect
- **Login redirects to intended page**: Login/Signup now reads `location.state?.from?.pathname` post-auth
- **Google OAuth return path**: AuthCallback reads `?returnTo=` param from callback URL
- **All CTA buttons preserve intent**: CourseDetail.enroll(), SubscribePage.subscribe(), CertificationDetailPage.enrollPath() all pass state to navigate('/login')
- **Resend SDK fixed**: Replaced raw httpx.post with official resend Python SDK (asyncio.to_thread)
- **Email recipient hardcoded**: All login notification emails target mabdulmajeed.code@gmail.com per user request

## Vercel Deployment Notes
- /app/frontend/vercel.json: SPA redirect rewrites configured
- REACT_APP_BACKEND_URL in .env
- DANGEROUSLY_DISABLE_HOST_CHECK=true for dev server
- No hardcoded secrets in frontend

## Test Credentials
- student@skilltank.dev / demo123
- instructor@skilltank.dev / demo123  
- admin@skilltank.dev / demo123

## Prioritized Backlog
### P1
- Set up Resend verified sending domain for email delivery (currently only can send to Resend account owner's email in sandbox mode — domain verification at resend.com/domains required to send to mabdulmajeed.code@gmail.com)
- Test Google OAuth with real Google account end-to-end

### P2
- Sequential lesson drip locking
- Telegram notification delivery
- Coupon engine UI polish
- Real-time note timestamping
