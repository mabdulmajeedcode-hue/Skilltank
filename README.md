# SKILLTANK

**Build career momentum.**

A full-stack, role-based learning management system built with FastAPI, MongoDB, and React. SKILLTANK goes beyond video courses — combining real payments, gated certification, AI-powered lesson support, attention tracking, and AI mock interviews into a single platform designed to take students from enrollment to genuine career readiness.

🔗 **Live demo:** [skilltank-tawny.vercel.app](https://skilltank-tawny.vercel.app/)

---

## Why SKILLTANK

Most learning platforms stop at "watch the video, get the certificate." SKILLTANK closes the full loop — learning, verified completion, and interview readiness — in one product, with every feature fully implemented rather than mocked.

- Real Stripe-hosted checkout with coupon validation, not a fake payment button
- AI lesson coach grounded strictly in lesson content, with a deterministic fallback that keeps working even without an API key
- Live attention and focus tracking inside the lesson player
- Automatically gated PDF certificates — issued only when requirements are genuinely met
- A built-in AI mock interview system that turns course completion into interview practice
- Three fully distinct role experiences — Student, Instructor, Admin — not the same dashboard with relabeled buttons

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Create React App, React Router, Recharts, Lucide icons |
| Backend | FastAPI, JWT authentication, Pydantic |
| Database | MongoDB (via Motor) in production, with a persistent SQLite fallback for local development |
| PDF generation | ReportLab — lesson resources and certificates |
| Payments | Stripe Checkout (test/sandbox mode), coupon validation, payment confirmation |
| Notifications | Email via Resend, WhatsApp via click-to-chat — all logged to `notifications_log` |
| AI | Structured lesson coaching and quiz generation, with a live external provider key or a deterministic grounded fallback |

---

## Quick Start

### Backend

```bash
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

> If `MONGO_URL` is omitted or unreachable, the API automatically falls back to `backend/data/skilltank.db`. Data persists across refreshes and restarts — nothing resets unexpectedly.

### Frontend

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`

**Production build:**
```bash
npm run build
npm run serve
```

---

## Demo Accounts

All accounts use the password `demo123`.

| Role | Email |
|---|---|
| Student | `student@skilltank.dev` |
| Instructor | `instructor@skilltank.dev` |
| Admin | `admin@skilltank.dev` |

---

## Stripe Sandbox

The local `.env` ships with a temporary anonymous Stripe sandbox (created June 18, 2026, expires June 25, 2026 unless claimed).

To create your own:

```bash
npm install -g @stripe/cli
stripe sandbox create --email dev@skilltank.local --full-name SKILLTANK --non-interactive
```

Copy the returned test secret and publishable keys into `backend/.env`. **Never use live keys or real card details in this project.**

**Test checkout:**
- Card: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any 3 digits
- Coupon: `LEARN20`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `MONGO_DB` | Database name |
| `SQLITE_PATH` | Local fallback database path |
| `JWT_SECRET` | Auth token signing secret |
| `STRIPE_SECRET_KEY` | Stripe sandbox secret key |
| `AI_API_KEY` | Optional — enables live AI model for lesson coach and quiz generation |
| `AI_MODEL` | Model identifier for the configured AI provider |
| `RESEND_API_KEY` | Email delivery via Resend |
| `RESEND_FROM` | Sender address for outgoing email |
| `NOTIFICATION_TEST_EMAIL` | Optional — routes all demo/test notification emails to one QA inbox |

### Frontend (`frontend/.env`)

| Variable | Purpose |
|---|---|
| `REACT_APP_API_URL` | Backend API base URL |

---

## Feature Map

| Feature | Route |
|---|---|
| Course catalog, categories, search, filters | `/courses` |
| Course details, curriculum, reviews | `/courses/:id` |
| Signup, login, logout, role sessions | `/signup`, `/login`, `/logout` |
| Enrollment, Stripe checkout, coupons | Catalog → `/checkout` → `/checkout/success` |
| Video lessons and curriculum navigation | `/learn/:courseId/:lessonId` |
| Progress, resume metadata, notes | Lesson player |
| Quizzes — scoring, pass/fail, retry reminders | `/learn/:courseId/quiz/:quizId` |
| Gated PDF certificates | `/my-learning`, `/certificates/:id` |
| Student dashboard | `/dashboard` |
| Instructor dashboard and analytics | `/instructor` |
| Course publish/unpublish management | `/instructor/courses` |
| Multi-step course builder | `/instructor/courses/new` |
| Reviews and enrolled-only forms | `/courses/:id` |
| Course Q&A with instructor replies | `/courses/:id`, `/instructor/qna` |
| Admin action center | `/admin` |
| User and course management | `/admin/users`, `/admin/courses` |
| Manual enrollment, completion reports, certificate reissue | `/admin/operations` |
| Notification logs and reminder runs | `/admin/operations`, `/notifications` |
| AI mock interview | `/mock-interview` |
| Attention/focus monitoring | Lesson player + `/admin/operations` |
| Career readiness score | `/dashboard` |
| Leaderboard and badges | `/leaderboard`, `/dashboard` |
| Coupon management, certificate reissue | `/admin/operations` |
| Downloadable resources and lesson notes | Lesson player |
| Drip content locks | Curriculum and lesson API |
| AI quiz generation fallback | Course builder, `/api/quizzes/generate` |
| B2B cohort bulk enrollment | `/admin/operations` |

---

## What's Seeded

- 13 users — 1 admin, 3 instructors, 9 students
- 10 courses — 3 modules each, 3 lessons per module, 4 quiz questions per module
- 25 enrollments at 0%, 40%, 65%, and 100% progress
- 9 certificates, 12 reviews, 6 Q&A threads, 3 mock interview reports
- 8 notification log rows, 5 attention logs, 8 leaderboard entries, 5 badges, readiness scores, coupons, and one B2B cohort
- Full role-based access restrictions across all three roles
- Responsive layouts verified at 375px mobile, tablet, and desktop widths

---

## Course Media

Lesson videos are genuine educational YouTube embeds from channels like freeCodeCamp and 3Blue1Brown — not placeholder or filler content. Instructors can supply a YouTube embed URL or upload a video file up to 100 MB.

Course thumbnails are cached locally under `frontend/public/images/courses`, sourced from Unsplash (Development, Design, Business, and Analytics categories).

---

## AI Lesson Coach

The in-lesson AI assistant supports:

- Lesson summary generation
- Structured study-note generation with one-click save
- Lesson-grounded Q&A — answers are scoped strictly to the current lesson's content
- Browser-based text-to-speech playback

With `AI_API_KEY` configured, it runs on the live configured model. **Without a key, a deterministic, lesson-grounded fallback keeps the feature fully functional** — every interaction is logged to `ai_assistant_logs` either way, and nothing is ever silently broken.

---

## Notifications

Every notification trigger persists evidence in `notifications_log` — no event is ever lost or unaccounted for.

- With `RESEND_API_KEY` and `RESEND_FROM` configured, email sends through Resend
- WhatsApp uses a no-setup `wa.me` click-to-chat link generated from the phone number saved in Settings — no WhatsApp Business API or Meta verification required
- WhatsApp rows are marked `manual_trigger_ready` since delivery only completes once the user opens the generated link
- Missing credentials are explicitly labeled `simulated_missing_credentials` — **never falsely marked as sent**

---

## Production Deployment

The repository includes a `Dockerfile` and `render.yaml`. The production container builds the React app and serves both the SPA and the FastAPI API from a single origin.

For a public deployment, configure:

- A MongoDB Atlas `MONGO_URL`
- Your own Stripe test-mode secret key
- `APP_URL` set to your deployed HTTPS URL
- A Resend sender and API key
- Optionally, `NOTIFICATION_TEST_EMAIL` during judging/demo to route all triggered emails to one inbox
- WhatsApp requires no API key — see Notifications above
- Optional Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — see setup below
- An optional AI provider key for live model responses

### Frontend on Vercel

Deploy the `frontend` directory as the Vercel project root.

- Framework preset: Create React App
- Build command: `npm run build`
- Output directory: `build`
- Required: `REACT_APP_API_URL=https://<your-backend-host>/api`
- Optional: `REACT_APP_ENABLE_EXTERNAL_VIDEO=true`
- Optional: `REACT_APP_GOOGLE_CLIENT_ID=<your-google-oauth-client-id>`
- Recommended: `GENERATE_SOURCEMAP=false`

`frontend/vercel.json` includes a rewrite rule so deep React Router links like `/courses/:id` and `/my-learning` survive a page refresh.

On the backend host, also set:

- `APP_URL=https://<your-vercel-domain>`
- `ALLOWED_ORIGINS=https://<your-vercel-domain>`
- `NOTIFICATION_TEST_EMAIL` during QA/demo if desired
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if Google sign-in should be active

---

## Verification

```bash
cd frontend
npm run build

cd ../backend
.\.venv\Scripts\python.exe -m py_compile main.py
```

The current frontend production build is generated in `frontend/build`.

---

## License

This project is built for demonstration and educational purposes. Stripe integration runs in sandbox/test mode only — never use live keys or real card details.
