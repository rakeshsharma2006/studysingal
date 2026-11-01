# StudySignal

StudySignal is a single-user study planner. The lavender-purple React UI is backed by an Express API and SQLite-compatible storage. Local development uses the existing `better-sqlite3` database; production uses Turso through the async `@libsql/client` driver. Its analytics, recovery recommendations, and completion forecasts are transparent, rule-based summaries of recorded study activity.

## Installation and run locally

Requirements: Node.js 20.19+ (or 22.12+) and npm. From the project directory:

```powershell
npm install
npm --prefix backend install
Copy-Item backend\.env.example backend\.env
```

The backend creates the SQLite file and applies all pending migrations on startup. Start the frontend and API in separate PowerShell terminals:

```sh
npm run dev:api
```

```sh
npm run dev
```

Vite runs at `http://localhost:5173` and proxies `/api` requests to Express at `http://localhost:3001`. The SQLite database is initialized automatically at `backend/data/studysignal.sqlite`. Set `DATABASE_PATH`, `PORT`, or `CORS_ORIGINS` in `backend/.env` to override the defaults. `backend/.env.example` documents the optional settings.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express listening port |
| `DATABASE_PATH` | `backend/data/studysignal.sqlite` | SQLite database file path |
| `CORS_ORIGINS` | `http://localhost:5173` in the example env file | Comma-separated browser origins permitted to call the API; configure the deployed frontend origin in production |
| `VITE_API_BASE_URL` | `/api` | Frontend build-time API base URL; set to `https://<backend-domain>/api` when frontend and backend are deployed separately |
| `KNOWLEDGE_NEEDS_ATTENTION_BELOW` | `50` | Evidence score below which a topic needs attention |
| `KNOWLEDGE_REINFORCEMENT_BELOW` | `70` | Evidence score below which a topic needs reinforcement |
| `TURSO_DATABASE_URL` | None | Production Turso/libSQL URL provided by Turso |
| `TURSO_AUTH_TOKEN` | None | Production Turso access token; secret, configure only in the backend deployment environment |

Thresholds must be between 0 and 100, with the reinforcement threshold no lower than the attention threshold. The paths in `.env` are resolved relative to the backend process working directory. When `NODE_ENV=production` or either Turso setting is present, the backend uses Turso and requires both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Without those production conditions, it keeps using local `better-sqlite3`.

### Vercel deployment notes

This repository is connected to two Vercel projects. Set the **frontend** project's Root Directory to `./` and the **backend** project's Root Directory to `backend`. Select Node.js 22.x or newer in the backend project's runtime settings; the local native `better-sqlite3` dependency requires Node.js 22 or newer, though production queries use the async Turso client. The backend's `index.js` exports the Express app for Vercel and still calls `app.listen()` when run directly with `npm start`/`npm run dev`. This follows [Vercel's Express deployment guide](https://vercel.com/docs/frameworks/backend/express); no extra `vercel.json` or serverless wrapper is required.

Configure `CORS_ORIGINS` on the backend deployment with the exact deployed frontend origin(s), without a path. Configure `KNOWLEDGE_NEEDS_ATTENTION_BELOW` and `KNOWLEDGE_REINFORCEMENT_BELOW` on the backend if overriding their defaults. Configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as backend environment variables; never place them in frontend settings or source control. Configure `VITE_API_BASE_URL` on the frontend project as the backend URL ending in `/api`; Vite embeds this value at build time, so redeploy the frontend after changing it. The frontend displays an actionable error instead of attempting to parse platform HTML as API JSON. Production CORS is disabled when `CORS_ORIGINS` is unset rather than falling back to an open wildcard.

Vercel Function filesystems are read-only except for temporary scratch space. Production data is stored in Turso; do not point production `DATABASE_PATH` at `/tmp`. The API initializes schema migrations before serving API requests. `/api/health` executes a real database query and returns 503 if the database cannot initialize or answer.

### Local SQLite → Turso transfer

The migration command creates a consistent SQLite backup next to the source file, refuses to import into a target that already contains application rows, copies explicit primary keys and timestamps in foreign-key order, temporarily suppresses completion triggers during historical copy, restores those triggers, and verifies per-table row counts and foreign keys before committing. A failed transfer rolls back its Turso write transaction; the local source remains untouched.

1. Stop local writes, make an additional manual copy of `backend/data/studysignal.sqlite`, and configure `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `backend/.env` or the execution environment. Do not share or commit that file.
2. Ensure the Turso target is the intended new/empty database. Then run `npm run db:migrate:turso` from the repository root. The command prints only the backup path and per-table counts, never credentials.
3. Keep the source DB and generated `studysignal-pre-turso-*.sqlite` backup unchanged until production verification is complete. A second run against a target containing imported rows intentionally aborts.
4. Configure the two Turso variables in the backend Vercel project, configure CORS and knowledge thresholds, deploy, and verify `GET https://<backend-domain>/api/health` returns HTTP 200 JSON with `database: "connected"`. Check Vercel Runtime Logs if it does not.

To roll back application deployment, restore the previous deployment and point it only at a database containing the data that deployment expects. The migration does not copy new production writes back into SQLite; do not switch a live deployment back to the old local database without a separate reverse-sync/export plan. Keep a separate Turso backup before production cutover and before any data recovery operation.

## Verify

```sh
npm run test:api
npm run lint
npm run build
```

The API tests create and clean up temporary SQLite and in-memory libSQL databases. The libSQL adapter/route suite exercises migrations, CORS, CRUD, constraints, and completion history locally; it does not replace a real Turso credentialed connection check. Run `npm run db:check:turso` only after configuring Turso credentials. There is no separate frontend unit-test runner configured; the React pages are build/lint checked and the key flows are covered by API integration tests and browser checks.

## Implemented frontend flows

- **Syllabus:** create and edit subjects, set semester and exam date, add units and topics, update topic status/priority, edit topic titles, confirm topic deletion, and view topic-count completion progress.
- **Habits:** create and edit habits, archive/restore them, complete or undo today's local-date log, review a seven-day history, and view current/best streaks. Habit actions do not change topic status.
- **Study sessions:** select a topic, start/pause/resume/end a focus timer, manually log previous study time, view session history, and see subject study-time totals. A session never completes its topic.
- **Study plan:** schedule time for a topic and mark planned tasks completed or skipped. Plan actions do not update topic status.
- **Knowledge analysis:** append assessments, compare prior attempts, update confidence, and schedule or complete revisions.
- **Analytics:** review separate planned-time/task drift, transparent academic-debt points, evidence gaps, and cautious habit comparisons.
- **Recovery planner:** review ranked, explainable next-study recommendations generated from syllabus, exam, assessment, and revision records.
- **Exam forecast:** compare a 14-day completion pace with upcoming exam dates and explore target-rate scenarios.
- **Dashboard:** the overview, signals, habits, plans, charts, recommendations, and forecasts are fetched from `GET /api/dashboard`; cards show empty or unavailable states when records do not exist. No dashboard KPI or chart series uses hardcoded academic activity.

The top navigation search looks up subjects, topics, and habits from the API. Profile customization and notification delivery are not implemented.

## Optional demo dataset

The demo commands operate on the configured SQLite database, but only on records marked with the `Demo: ` prefix:

```powershell
npm run demo:seed
npm run demo:reset
```

Seeding is repeatable and creates four subjects, multiple units and topics, six habits, 14 days of sample check-ins/plans/sessions, multiple assessment attempts, upcoming exams, and overdue/upcoming revisions. The dashboard labels demo data when present. Reset removes only this dataset and its generated completion history; it preserves non-demo records. Do not seed the production database.

## Knowledge assessment and academic analytics

Assessment attempts are append-only historical records. A score uses quiz (60%), recall (25%), and confidence percentage (15%) with available weights renormalized when confidence is missing. A confidence rating from 1–5 maps to 20–100%. Confidence alone does not produce a verified evidence score; such topics are marked `UNVERIFIED`. Defaults are configurable with `KNOWLEDGE_NEEDS_ATTENTION_BELOW` (50) and `KNOWLEDGE_REINFORCEMENT_BELOW` (70); request-level overrides are available on knowledge analysis and analytics endpoints. Results are descriptive study evidence, not scientifically validated measurements of intelligence or mastery.

The knowledge page shows scored, weak, strong, and unverified topics, previous attempts and score trends, and revision history. Revisions can be scheduled, completed with optional recall performance, and checked for overdue status.

Analytics are independent calculation services: drift keeps time and task counts separate; academic debt has an explicit, capped point formula; knowledge gaps use assessment history without treating missing assessments as failures; and habit comparisons require at least five observations in each comparison group. Insufficient habit data returns the message `Not enough data to identify a reliable pattern.` Descriptive patterns do not establish causation. Analytics only read records.

## Recovery recommendations and exam forecast

The Recovery page ranks study actions using exam urgency (30%), knowledge weakness (30%), syllabus incompletion (25%), and revision delay (15%). Missing factors are excluded and available weights are renormalized. Unassessed topics are offered an assessment rather than treated as weak; completed topics appear only for a scored knowledge gap or a due revision. The recommendation engine does not update topic status.

The Exam Forecast page estimates completion using topic completion events from the inclusive last 14 calendar days, divided by 14. It rounds required days upward, reports insufficient data instead of inventing a baseline rate, and provides independent what-if scenarios. Session activity is contextual only. Forecasts are not exam-mark predictions or guarantees. Migration `003_topic_completion_history.sql` backfills currently completed topics and records future completion transitions; earlier completion events that were never recorded cannot be reconstructed. If a topic with completion history is deleted, its history row is retained with a null topic reference.

The dashboard derives its current academic overview and daily/weekly summaries from the same API-backed records. Weekly habit consistency counts each active habit according to its configured frequency; a weekly-frequency habit is one expected check-in per calendar week. Study duration, counts, and assessment evidence remain separate units. Assessment trends include only attempts with a valid evidence score.

| Endpoint | Response |
|---|---|
| `GET /api/dashboard?date=YYYY-MM-DD` | Consolidated live overview: syllabus, latest knowledge evidence, drift/debt, due work, habits, study charts, assessment trends, recommendations, and exam forecasts |
| `GET /api/recovery/recommendations?date=YYYY-MM-DD&limit=3` | Ranked recommendations, factor scores/weights, action, reason, duration, and configurable knowledge thresholds |
| `GET /api/forecast?date=YYYY-MM-DD&subjectId=1&targetTopicsPerDay=1` | Subject forecasts, completion pace/window, exam comparison, scenarios, and assumptions; omit `subjectId` for all subjects |

| Analytics endpoint | Response |
|---|---|
| `GET /api/analytics/drift?period=daily&date=YYYY-MM-DD` | Planned/actual minutes, planned/completed task counts, time drift and task drift; `period=weekly` reports Monday–Sunday |
| `GET /api/analytics/debt?date=YYYY-MM-DD` | Debt points, overdue/skipped counts, breakdown, oldest overdue item and organizational disclaimer |
| `GET /api/analytics/knowledge-gaps` | Strong, weak, completed-but-weak, declining, unverified, and revision-due topic lists |
| `GET /api/analytics/habit-impact?days=30` | Per-habit comparison groups, sample counts, observed differences, or insufficient-data message |
| `GET /api/analytics/report` | Structured combined read-only report |

Knowledge and revision endpoints:

- `GET /api/knowledge/analysis`
- `GET /api/topics/:topicId/assessments`; `POST` to record a new attempt
- `GET /api/topics/:topicId/revisions`
- `GET /api/revision-tasks/overdue?date=YYYY-MM-DD`
- `POST /api/revision-tasks` and `PATCH /api/revision-tasks/:id` to schedule/complete revisions, including optional `recall_score`

`PATCH` and `DELETE` on assessment attempts return `405`; add a new attempt instead so score history remains intact.

## Backend structure

```text
src/
  components/ui.jsx       Shared cards, buttons, inputs, menus, and dialogs
  pages/                  Academic pages, dashboard, analytics, recovery, forecast
  lib/api.js              Shared fetch/error handling for the frontend API
backend/
  routes/                 Express route factories and request validation
  database/
    migrations/           Repeatable SQL migrations
    index.js               SQLite connection, foreign keys, and initialization
    migrate.js             Ordered migration runner
  middleware/             Validation, error handling, and async handler
  services/
    analytics/             Independent pure calculations and database readers
    dashboard/             Aggregation across existing academic services
    forecast/               Completion projection and scenarios
    recovery/               Explainable priority scoring and recommendations
  scripts/demoData.js      Opt-in seed/reset for clearly tagged demo records
  test/                   API, calculation, and integration tests
  utils/                  Date helpers
  validators/             Zod resource/query schemas
  app.js                   Express app factory and error middleware
  index.js                 Server entry point
```

### Technology stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 4, Framer Motion, Lucide React, Chart.js 4 with `react-chartjs-2`.
- **Backend:** Node.js, Express 5, Zod 4, `better-sqlite3`.
- **Storage:** SQLite with versioned SQL migrations and foreign-key enforcement.

The browser calls `/api/...` through the Vite development proxy. Express validates request bodies and query parameters, routes into existing services, and returns JSON envelopes. Academic services use SQLite for persistence; analytics, recommendations, and forecasts are read-only calculations over stored records. The dashboard endpoint composes those services and read queries into one frontend response.

SQLite foreign-key enforcement is enabled on every connection. Parent records with dependent history use `ON DELETE RESTRICT`; habit logs are unique per `(habit_id, log_date)`. The schema is versioned by migrations in `backend/database/migrations`.

Calendar dates use strict `YYYY-MM-DD` strings and are treated as local calendar dates by the UI. Timestamps for study sessions are ISO strings with timezone information. The API does not parse a date-only value as UTC or infer a calendar date from a timestamp.

## Known limitations

- This is a local, single-user MVP: there is no authentication, account/profile management, remote synchronization, or notification delivery.
- SQLite persistence and data backup/restore are the operator's responsibility.
- Completion forecasts require recorded topic-completion history from the last 14 calendar days and are estimates, not guarantees or exam-mark predictions.
- Assessment evidence and habit comparisons are organizational summaries, not validated measures of mastery, intelligence, or causation.
- Completion history before the history migration cannot be reconstructed; the migration can only seed topics still marked completed when it is applied.
- The dashboard search covers subjects, topics, and habits; it does not search assessment/session content.

## REST endpoints

Every endpoint is prefixed by `/api`. Collection reads respond with `{ "data": [...] }`, single records with `{ "data": { ... } }`, and errors with an `error` object. Create returns `201`, successful update returns `200`, delete returns `204`, validation errors return `400`, missing records/routes return `404`, and conflicting or referenced records return `409`.

| Resource | Endpoints |
|---|---|
| Health | `GET /health` |
| Subjects | `GET /subjects`, `POST /subjects`, `GET /subjects/:id`, `PATCH /subjects/:id`, `DELETE /subjects/:id` |
| Syllabus progress | `GET /subjects/progress`; per-subject units: `GET /subjects/:subjectId/units` |
| Units | `GET /units`, `POST /units`, `GET /units/:id`, `PATCH /units/:id`, `DELETE /units/:id` |
| Topics | `GET /topics`, `POST /topics`, `GET /topics/:id`, `PATCH /topics/:id`, `DELETE /topics/:id` |
| Habits | `GET /habits`, `POST /habits`, `GET /habits/:id`, `PATCH /habits/:id`, `DELETE /habits/:id` |
| Habit history | `GET /habits/:habitId/history` (returns completed logs and current/longest streaks) |
| Habit logs | `GET /habit-logs`, `POST /habit-logs`, `GET /habit-logs/:id`, `PATCH /habit-logs/:id`, `DELETE /habit-logs/:id`; list can filter with `from`, `to`, `date`, and `habit_id` |
| Study plans | `GET /study-plans`, `POST /study-plans`, `GET /study-plans/:id`, `PATCH /study-plans/:id`, `DELETE /study-plans/:id` |
| Study sessions | `GET /study-sessions`, `POST /study-sessions`, `GET /study-sessions/:id`, `PATCH /study-sessions/:id`, `DELETE /study-sessions/:id`; list accepts `from`, `to`, `date`, and `topic_id` |
| Session totals | `GET /study-sessions/summary/by-subject` |
| Topic assessments | `GET /topic-assessments`, `POST /topic-assessments`, `GET /topic-assessments/:id`, `PATCH /topic-assessments/:id`, `DELETE /topic-assessments/:id` |
| Revision tasks | `GET /revision-tasks`, `POST /revision-tasks`, `GET /revision-tasks/:id`, `PATCH /revision-tasks/:id`, `DELETE /revision-tasks/:id` |

### Example requests and responses

Create a subject:

```http
POST /api/subjects
Content-Type: application/json

{
  "name": "Biology",
  "semester": "Semester 1",
  "exam_date": "2026-12-10"
}
```

```json
{
  "data": {
    "id": 1,
    "name": "Biology",
    "semester": "Semester 1",
    "exam_date": "2026-12-10",
    "created_at": "2026-11-01T04:20:00.000Z"
  }
}
```

Add a topic to a unit:

```http
POST /api/topics
Content-Type: application/json

{
  "unit_id": 1,
  "title": "Cell membranes",
  "priority": "HIGH",
  "estimated_minutes": 40
}
```

Mark a habit complete for a local calendar date:

```http
POST /api/habit-logs
Content-Type: application/json

{
  "habit_id": 1,
  "log_date": "2026-11-01",
  "completed": true
}
```

An invalid or duplicate request includes a stable error code and message, for example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "path": "quiz_score", "message": "Too big: expected number to be <=100" }
    ]
  }
}
```
#   s t u d y s i n g a l  
 