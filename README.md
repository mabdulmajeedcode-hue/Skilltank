# SKILLTANK LMS

A full-stack, role-based learning management system built with FastAPI, MongoDB, and React (Create React App). The interface follows the supplied Synapse reference: green accent, quiet white surfaces, soft cards, generous whitespace, and responsive navigation.

## Stack

- Frontend: React 19, Create React App, React Router, Recharts, Lucide icons
- Backend: FastAPI, JWT authentication, Pydantic
- Data: MongoDB through Motor in production, with a real persistent SQLite database fallback for local/development use
- PDF: ReportLab-backed lesson resources and certificates
- Payments: real Stripe-hosted Checkout in test/sandbox mode with coupon validation and payment confirmation
- Notifications: email delivery and WhatsApp click-to-chat evidence logged to `notifications_log`
- AI: structured interview and quiz-generation fallback, ready for an external provider key

## Run locally

### Backend

```powershell
cd C:\Users\ASUS\Documents\Skilltank\backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

The API docs are available at `http://localhost:8000/docs`.

If `MONGO_URL` is omitted or MongoDB cannot be reached, the API uses `backend/data/skilltank.db`. Data persists across refreshes and server restarts.

### Frontend

```powershell
cd C:\Users\ASUS\Documents\Skilltank\frontend
npm.cmd start
```

Open `http://localhost:3000`.

To run the optimized production bundle with SPA route fallback:

```powershell
npm.cmd run build
npm.cmd run serve
```

### Stripe sandbox

The local `.env` is configured with a temporary anonymous Stripe sandbox created on June 18, 2026. It expires on June 25, 2026 unless claimed. To create a replacement:

```powershell
npm.cmd install -g @stripe/cli
stripe.cmd sandbox create --email dev@skilltank.local --full-name SKILLTANK --non-interactive
```

Copy the returned test secret and publishable keys into `backend/.env`. Never use live keys or real card details for this project.

Test Checkout details:

- Card: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any three digits
- Coupon: `LEARN20`

## Demo accounts

All accounts use password `demo123`.

| Role | Email |
|---|---|
| Student | `student@skilltank.dev` |
| Instructor | `instructor@skilltank.dev` |
| Admin | `admin@skilltank.dev` |

## Environment variables

Backend (`backend/.env`):

- `MONGO_URL`
- `MONGO_DB`
- `SQLITE_PATH`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `AI_API_KEY`
- `AI_MODEL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `NOTIFICATION_TEST_EMAIL` (optional; routes demo/test notification emails to one QA inbox)

## Production deployment

The repository includes [Dockerfile](C:\Users\ASUS\Documents\Skilltank\Dockerfile) and [render.yaml](C:\Users\ASUS\Documents\Skilltank\render.yaml). The production container builds React and serves the SPA and FastAPI API from one origin.

For a public deployment, configure:

- MongoDB Atlas `MONGO_URL`
- Your own Stripe test-mode secret key
- `APP_URL` set to the deployed HTTPS URL
- Resend sender/API key
- Optional `NOTIFICATION_TEST_EMAIL=mabdulmajeed.code@gmail.com` while judging/demoing, so all email triggers arrive in one test inbox
- WhatsApp uses no API key: each student can save a phone number in Settings and Skill Tank generates a pre-filled `wa.me` click-to-chat link when relevant notification events are logged
- Optional Google OAuth credentials: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Optional AI provider key

The repository cannot create a permanent public URL without access to the user's Render/Railway/Fly.io/AWS account and DNS/project credentials.

Frontend (`frontend/.env`):

- `REACT_APP_API_URL`

### Vercel frontend deployment

Deploy the `frontend` directory as the Vercel project root.

- Framework preset: Create React App
- Build command: `npm run build`
- Output directory: `build`
- Required Vercel env var: `REACT_APP_API_URL=https://<your-backend-host>/api`
- Optional Vercel env var: `REACT_APP_ENABLE_EXTERNAL_VIDEO=true`
- Optional Vercel env var: `REACT_APP_GOOGLE_CLIENT_ID=<your-google-oauth-client-id>`
- Recommended Vercel env var: `GENERATE_SOURCEMAP=false`

The [frontend/vercel.json](C:\Users\ASUS\Documents\Skilltank\frontend\vercel.json) rewrite keeps React Router deep links such as `/courses/:id`, `/my-learning`, and `/admin` working on refresh.

On the backend host, set:

- `APP_URL=https://<your-vercel-domain>`
- `ALLOWED_ORIGINS=https://<your-vercel-domain>`
- `NOTIFICATION_TEST_EMAIL=mabdulmajeed.code@gmail.com` during QA/demo if all test emails should route to that inbox
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if Google sign-in should be active. Follow the setup steps below and include your Vercel domain as an authorized JavaScript origin.

### Setting up Google Sign-In

1. Go to https://console.cloud.google.com/ and create a new project (or select an existing one).
2. Navigate to "APIs & Services" -> "OAuth consent screen". Choose "External" user type, fill in the app name ("Skill Tank"), your email, and save.
3. Navigate to "APIs & Services" -> "Credentials" -> "Create Credentials" -> "OAuth client ID".
4. Choose "Web application" as the application type.
5. Under "Authorized JavaScript origins", add your deployed Vercel frontend URL (e.g., https://your-app.vercel.app) and http://localhost:3000 for local testing.
6. Under "Authorized redirect URIs", add the same URLs with your auth callback path appended (e.g., https://your-app.vercel.app/auth/google/callback).
7. Click Create. Copy the "Client ID" and "Client Secret" shown.
8. Set GOOGLE_CLIENT_ID in your frontend environment variables (Vercel project settings -> Environment Variables) - this one is safe to expose publicly.
9. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your backend environment variables (Render dashboard -> Environment) - the secret must NEVER be added to the frontend.
10. Redeploy both frontend and backend after adding these variables.

This is a manual, one-time setup step that requires your own Google account. Codex cannot create OAuth credentials on your behalf.

## Feature map

| Feature | Route |
|---|---|
| Course catalog, categories, search, filters | `/courses` |
| Course details, curriculum, reviews | `/courses/:id` |
| Signup, login, logout, and role sessions | `/signup`, `/login`, `/logout` |
| Free enrollment, Stripe sandbox checkout, confirmation, coupons | Course detail/catalog, `/checkout`, `/checkout/success` |
| Video lessons and curriculum navigation | `/learn/:courseId/:lessonId` |
| Progress, resume metadata, notes | Lesson player |
| Quiz UI, scoring, pass/fail, retry reminders | `/learn/:courseId/quiz/:quizId` |
| Automatic gated PDF certificates | `/my-learning`, `/certificates/:id` |
| Student dashboard | `/dashboard` |
| Instructor dashboard and analytics | `/instructor` |
| Course publish/unpublish management | `/instructor/courses` |
| Persistent multi-step course/module/lesson/quiz builder | `/instructor/courses/new` |
| Reviews and enrolled-only forms | `/courses/:id` |
| Course and lesson Q&A with instructor replies | `/courses/:id`, `/instructor/qna` |
| Admin action center | `/admin` |
| User activation and course publish/delete management | `/admin/users`, `/admin/courses` |
| Manual enrollment, completion reports, certificate override/reissue | `/admin/operations` |
| Notification trigger evidence and daily reminder run | `/admin/operations`, `/notifications` |
| AI mock interview | `/mock-interview` |
| Focus/attention monitoring | Lesson player + `/admin/operations` |
| Career readiness score | `/dashboard` |
| Leaderboard and badges | `/leaderboard`, `/dashboard` |
| Coupon create/activate/deactivate and certificate reissue | `/admin/operations` |
| Downloadable resources and lesson notes | Lesson player |
| Drip content locks | Curriculum and lesson API |
| AI quiz generation fallback | Course builder and `/api/quizzes/generate` |
| B2B cohort bulk enrollment | `/admin/operations` |

## Acceptance coverage

- 13 seeded users: 1 admin, 3 instructors, and 9 students
- 10 populated courses, each with 3 modules, 3 lessons per module, and 4 quiz questions per module
- 25 seeded enrollments at 0%, 40%, 65%, and 100%
- 9 seeded certificates, 12 reviews, 6 Q&A threads, 3 mock interview reports
- 8 notification log rows, 5 attention logs, 8 leaderboard entries, 5 badges, readiness score, coupons, and one B2B cohort
- Student, instructor, and admin role restrictions
- Responsive layouts tested at 375px mobile, tablet, and desktop widths

## Course media

Seeded lessons use working educational YouTube embeds from channels such as freeCodeCamp and 3Blue1Brown rather than placeholder/Rickroll content. Instructors can provide a YouTube embed URL or upload a video file up to 100 MB.

Course thumbnail photos are cached locally under `frontend/public/images/courses` from Unsplash:

- Development: photo by Florian Olivo
- Design: photo by UX Store
- Business: photo by Campaign Creators
- Analytics: photo by Luke Chesser

## Lesson AI

The lesson coach supports:

- summary generation;
- structured study-note generation and one-click persistence;
- lesson-grounded questions and answers;
- browser text-to-speech playback.

When `AI_API_KEY` is configured it uses the configured live model. Without a key, a deterministic lesson-grounded fallback remains functional and every interaction is stored in `ai_assistant_logs`.

## Communication delivery

Notification triggers always persist evidence in `notifications_log`.

- With `RESEND_API_KEY` and `RESEND_FROM`, email is delivered through Resend.
- WhatsApp notifications use a no-setup `wa.me` click-to-chat link generated from the phone number saved in Settings. This does not use the WhatsApp Business API and does not require Meta verification.
- WhatsApp notification rows use `manual_trigger_ready` because the message is only sent after a user opens the generated WhatsApp link.
- Missing credentials are explicitly labeled `simulated_missing_credentials`, never falsely labeled as sent.

## Verification

```powershell
cd frontend
npm.cmd run build

cd ..\backend
.\.venv\Scripts\python.exe -m py_compile main.py
```

The current frontend production build is generated in `frontend/build`.
