# AI SkillFit — Run in 4 commands

## Option A: Use Neon DB (already configured — no Docker needed)

```bash
# 1. Install
pnpm install

# 2. Push DB schema (creates all tables including new flagged_for_review column)
pnpm db:push

# 3. Create admin user
pnpm --filter @workspace/api-server run seed:admin

# 4a. Start API (terminal 1)
pnpm dev:api

# 4b. Start frontend (terminal 2)
pnpm dev:web
```

Open http://localhost:5173 → candidate flow
Open http://localhost:5173/admin → login: admin / admin123

---

## Option B: Full local stack (Docker)

```bash
docker compose up -d   # starts Postgres + Redis
# Then follow Option A steps but use:
# DATABASE_URL="postgresql://skillfit:skillfit@localhost:5432/skillfit"
```

---

## Fixes applied in this build
1. GEMINI_API_KEY env var mismatch fixed — Gemini scoring now works
2. Redis/Bull queue made optional — server starts without Redis
3. Worker crashes no longer kill the HTTP server
4. flagged_for_review DB column added — admin review queue now shows candidates
5. Stats dashboard pendingReviewCount fixed
6. docker-compose now includes Redis
7. All .env files pre-filled with working keys
