# AI SkillFit — Karnataka EDCS Hackathon (Theme 5)

A mobile-first voice+video workforce assessment platform for Karnataka's blue-collar job candidates.

## Project Structure

### Artifacts
- **`artifacts/skillfit`** — React+Vite PWA (candidate flow + admin dashboard), preview at `/`
- **`artifacts/api-server`** — Express 5 REST API server, mounted at `/api`

### Libraries
- **`lib/db`** — PostgreSQL + Drizzle ORM, schema & migrations
- **`lib/api-spec`** — OpenAPI 3.0 spec (`openapi.yaml`)
- **`lib/api-zod`** — Generated Zod schemas from OpenAPI
- **`lib/api-client-react`** — Generated React Query hooks from OpenAPI
- **`lib/integrations-gemini-ai`** — Gemini AI client (Replit-provisioned, no API key needed)

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS v4, React Query, Wouter routing, shadcn/ui components
- **Backend**: Express 5, Drizzle ORM, PostgreSQL, express-session
- **AI**: Gemini 2.5 Flash via `@google/genai` (Replit AI Integration, or `GEMINI_API_KEY` for Google AI Studio)
- **Speech**: Web Speech API (browser native, no external service)
- **Theming**: Karnataka saffron (#FF6B00) primary, dark sidebar (bg-sidebar)

## Features

### Candidate PWA (`/`)
1. **Landing** — Language selector (Kannada/Hindi/English), 3-step flow overview
2. **Register** — Name, phone, district (30 Karnataka districts), trade selection
3. **Interview** — Voice recording via Web Speech API, face detection via canvas pixel analysis, 5 questions per trade/language from the question bank
4. **Results** — Classification result with score bar, candidate info summary

### Admin Dashboard (`/admin`)
- Login with credentials (demo: `admin / admin123`)
- **Dashboard** — Stats cards, classification bar chart, by-trade chart, district ranking, recent activity feed
- **Candidates** — Filterable/sortable table with pagination (by trade, district, language, classification)
- **Candidate Detail** — Interview responses with individual scores, integrity check data, officer action buttons (shortlist, send to training, request re-interview, escalate), audit log

## Database Schema

| Table | Purpose |
|-------|---------|
| `candidates` | Basic candidate info (name, phone, district, trade, language) |
| `interviews` | Interview sessions (status, timestamps) |
| `responses` | Per-question answers with Gemini scores |
| `integrity_checks` | Face presence %, liveness, integrity flags |
| `classifications` | AI-generated interview outcome categories |
| `officer_actions` | Admin officer audit trail |

## API Routes

All routes are under `/api`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/candidates` | Register a candidate |
| GET | `/candidates` | List with filters & pagination (requires officer session) |
| GET | `/candidates/:id` | Detailed candidate view (requires officer session) |
| POST | `/interviews` | Start interview session |
| GET | `/interviews/:id` | Get interview + responses |
| POST | `/interviews/:id/complete` | Mark interview done |
| POST | `/interviews/:id/responses` | Submit one response |
| POST | `/score` | Score a response via Gemini |
| POST | `/interviews/:id/classify` | Classify outcome via Gemini |
| GET | `/questions` | Public stable list (first N) by trade + language (rate-limited) |
| GET | `/admin/questions-pool` | Admin: larger pool preview (up to 500) |
| GET | `/interviews/:id/questions` | Per-interview randomized snapshot (candidate app) |
| POST | `/admin/login` | Officer login |
| POST | `/admin/logout` | Officer logout |
| GET | `/admin/me` | Current session info |
| POST | `/admin/actions` | Create officer action |
| GET | `/admin/candidates/:id/actions` | Get candidate's audit log |
| GET | `/stats/dashboard` | Dashboard stats (requires officer session) |
| GET | `/stats/by-trade` | Stats grouped by trade |
| GET | `/stats/by-district` | Stats grouped by district |
| GET | `/stats/recent-activity` | Recent activity feed |
| GET | `/stats/review-queue` | Flagged candidates pending review |
| POST | `/transcribe` | Groq Whisper audio transcription (optional) |

## Classification Categories

- `job_ready` — Score ≥ 7, ready for employment
- `requires_training` — Score 4–7, needs skill development
- `manual_verification` — Unclear, needs human review
- `poor_quality` — Very poor audio/video quality
- `suspected_duplicate` — Potential duplicate application

## Admin Credentials (Demo)

- `admin / admin123` (super_admin)
- `officer1 / officer123` (district_officer)

## Question Bank

Question data lives in `artifacts/api-server/src/lib/question-bank.ts` (routes in `questions.ts`):
- 5 questions per trade × 3 languages (where available) = 20+ questions
- Trades: Welder, Electrician, Carpenter, Plumber
- Languages: Kannada (kn), Hindi (hi), English (en)
- Falls back to English if language-specific questions are unavailable

## Session Management

Uses `express-session` with `SESSION_SECRET` environment variable (set in Replit Secrets). The React client sends `credentials: "include"` on all API calls so the session cookie is stored after `/api/admin/login`.

## Environment

Copy `.env.example` to `.env` in the repo root or `artifacts/api-server`. Required: `DATABASE_URL`. Gemini: either Replit integration vars or `GEMINI_API_KEY`. Optional: `GROQ_API_KEY` for Whisper transcription.

## Deployment (production-minded)

1. **Postgres**: `docker compose up -d` (see repo root `docker-compose.yml`) or any managed PostgreSQL.
2. **Schema**: `pnpm db:push`
3. **Admin user** (bcrypt in DB): `pnpm seed:admin` — set `SEED_ADMIN_PASSWORD` to a strong secret. Remove or avoid relying on env `ADMIN_PASSWORD` in production.
4. **API**: `NODE_ENV=production`, `SESSION_SECRET`, `CORS_ORIGIN` (comma-separated frontend URLs), `GEMINI_API_KEY` (or Replit Gemini vars).
5. **Candidate questions**: Each interview gets a **random subset** stored in `interviews.question_snapshot`. **`GET /questions`** remains **public** (stable first-N slice, integrations). **`GET /admin/questions-pool`** is the **advanced** authenticated preview (up to 500). The candidate PWA uses **`GET /interviews/:id/questions`**. Submits must use question IDs from that snapshot (server stores canonical question text).

## Anti-cheating (question flow)

- Large multilingual bank + **crypto shuffle** per interview.
- **Snapshot persisted** on first fetch; same session always sees the same ordered set.
- **POST /responses** rejects unknown `questionId` and overwrites client `questionText` with server snapshot text.

## Key Development Notes

- API client hooks are generated via `pnpm --filter @workspace/api-spec run codegen` 
- DB schema pushed with `pnpm --filter @workspace/db run push`
- `p-limit` and `p-retry` from `@workspace/integrations-gemini-ai` must be externalized in `artifacts/api-server/build.mjs`
- `@google/genai` must be a direct dependency of `@workspace/api-server` for runtime resolution
