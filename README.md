# Predictive Sprint Planning & Delivery Risk Tool

A sprint management tool that answers **"will we finish on time?"** — not just
"where are we?"

Conventional trackers are descriptive: they record what already happened. A
burndown chart confirms a team is behind only once it *is* behind. This tool
adds a predictive layer on top of a familiar Kanban board — modelling task
dependencies to expose the critical path, freezing a commitment baseline to
detect scope creep, and forecasting completion as a **probability** using Monte
Carlo simulation over the team's own historical velocity.

> Not a report card — an early warning system.

---

## Contents

- [The problem](#the-problem)
- [What makes it different](#what-makes-it-different)
- [Features](#features)
- [Architecture](#architecture)
- [The algorithms](#the-algorithms)
- [Performance](#performance)
- [Engineering practices](#engineering-practices)
- [Getting started](#getting-started)
- [Testing](#testing)
- [API](#api)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)

---

## The problem

Small development teams can see what they have completed, but cannot reliably
tell whether they will finish on time. Three blind spots recur:

| Blind spot | What goes wrong |
|---|---|
| **Dependencies ignored** | Task B cannot start until Task A is done, but tools treat every task as independent. Blocked work is discovered only when someone picks it up. |
| **Scope creep unnoticed** | A team commits to 40 points; 12 more are added mid-sprint. The tool shows a longer list, never "you agreed to 40, you're carrying 52." |
| **Estimation error never measured** | A team that underestimates by 30% will do so again next sprint, because nothing measures the gap. |

## What makes it different

| | Trello | Jira | This tool |
|---|:---:|:---:|:---:|
| Kanban board, sprints | ✅ | ✅ | ✅ |
| Burndown chart | — | ✅ | ✅ |
| Task dependency graph | — | partial | ✅ |
| **Critical path (CPM)** | — | — | ✅ |
| **Frozen commitment baseline** | — | — | ✅ |
| **Scope-creep detection** | — | — | ✅ |
| **Monte Carlo completion forecast** | — | — | ✅ |
| **Estimation calibration** | — | — | ✅ |
| Risk register with exposure scoring | — | plugin | ✅ |

---

## Features

### Execution
- Kanban board with drag-and-drop across Backlog → To Do → In Progress → Done
- Time-boxed sprints with start/complete transitions
- Real-time multi-user sync over WebSockets
- **Team filter bar** — click avatars to view one member's board, or several at
  once for a standup
- Search and filter by assignee, priority, status, blocked, or overdue
- Task comments and a full **audit trail** of every change

### Prediction
- **Critical path** — the dependency chain that governs the sprint end date,
  with float computed per task
- **Blocked work** — what cannot start, and what it is waiting on
- **Scope creep** — measured against an immutable snapshot taken at sprint start
- **Monte Carlo forecast** — probability of finishing on time, with P50/P85/P95
  confidence bands
- **Estimation accuracy** — actual vs. estimated effort, with a suggested
  calibration factor for the next sprint
- **Team workload** — per-member load for capacity planning
- **Risk register** — probability × impact scoring on a 5×5 matrix

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (Vite)                                           │
│  Board · Delivery Insights · Risk Register                  │
└───────────────┬─────────────────────────┬───────────────────┘
                │ REST                    │ WebSocket
┌───────────────▼─────────────────────────▼───────────────────┐
│  Express API                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ helmet · rate limiting · request id · pino logging     │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Zod schema validation (params · query · body)          │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ JWT auth · project membership guards                   │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Controllers                                            │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Services   criticalPath · forecast · scopeAnalysis     │ │
│  │            teamAnalytics · activityLog · cache         │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │ Mongoose
                     ┌──────▼──────┐
                     │  MongoDB    │
                     └─────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, Vite |
| Drag-and-drop | `@dnd-kit` |
| Charts | Recharts |
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| Auth | JWT + bcrypt |
| Real-time | Socket.io |
| Validation | Zod, at the HTTP boundary |
| Security | Helmet, per-route rate limiting |
| Observability | Pino structured logs, per-request correlation ids |
| API docs | OpenAPI 3.1 at `/api/docs` |
| Tests | Node test runner, supertest, `mongodb-memory-server` |
| CI | GitHub Actions — Node 20 & 22, build, Docker, audit |

---

## The algorithms

The predictive layer is written from first principles rather than imported, so
every step is explainable. Everything else — routing, hashing, charting — uses
standard libraries.

### Critical Path Method — `services/criticalPath.js`

Tasks are nodes in a directed acyclic graph; `dependsOn` edges are precedence
relations; story points stand in for duration.

1. **Cycle check** — three-colour depth-first search. An edge into a node
   already on the recursion stack closes a loop.
2. **Topological order** — Kahn's algorithm, repeatedly taking nodes with no
   unmet prerequisites.
3. **Forward pass** — earliest start and finish for every task.
4. **Backward pass** — latest start and finish without delaying the project.
5. **Float** = latest start − earliest start. Zero float ⇒ critical.

Complexity: **O(V + E)**.

Cycles are rejected at write time, not discovered at read time — a cyclic graph
has no topological order, so the critical path would be undefined.

### Monte Carlo forecasting — `services/forecast.js`

An average velocity hides variability: two teams both averaging 30 points — one
steady at 29–31, one swinging 10–50 — carry very different risk. Sampling the
real distribution captures that.

1. Derive daily velocity samples from completed tasks.
2. Simulate the remaining work day by day, drawing a random historical velocity
   each day.
3. Repeat 5,000 times; count the fraction finishing within the sprint window.
4. Read P50/P85/P95 from the resulting distribution.

The generator is a **seeded mulberry32**, so identical board state always
produces an identical forecast — the number does not drift between two page
loads, and the feature can be demonstrated reproducibly.

With no history the tool reports *"not enough data to forecast"* rather than
inventing a confident number.

---

## Performance

The forecast runs on every dashboard load, so its cost was measured rather than
assumed. Benchmarked on Node 22 (`npm run bench`):

| Trials | Before | After | Speed-up |
|---|---|---|---|
| 5,000 (default) | 0.92 ms | **0.25 ms** | 3.7× |
| 50,000 | 9.30 ms | **2.49 ms** | 3.7× |

Throughput rose from ~5.4M to ~20M simulated trials per second.

**Counting sort instead of a comparison sort.** Extracting percentiles
previously sorted every trial result with a comparator — O(n log n) plus a
function call per comparison. Simulated durations are small bounded integers
(1–365 days), so a histogram answers the same question in one O(n + 365)
cumulative pass with no per-trial allocation.

**Typed arrays in the hot loop.** The velocity pool is a `Float64Array` and the
histogram an `Int32Array`, keeping both in contiguous memory.

A test asserts the rewritten percentiles match the original sorted-array
implementation exactly, so the optimisation cannot silently change results.

---

## Engineering practices

- **Validation as a boundary.** Every route parses params, query and body
  through a Zod schema before a controller runs. Handlers only ever see typed,
  coerced data; a malformed id returns a descriptive 400, not a 500 from inside
  the ODM.
- **Optimistic concurrency control.** Clients send the `version` they read;
  a mismatch returns `409 STALE_VERSION` instead of silently discarding a
  competing edit.
- **Cached analytics with correct invalidation.** Sprint health is cached per
  project and dropped at `emitToProject` — the single choke point every mutation
  already passes through.
- **Traceable errors.** A correlation id is generated per request, returned in
  `X-Request-Id` and in every error body, and attached to every log line.
- **Rate limiting.** Credential endpoints allow 10 *failed* attempts per 15
  minutes per IP; successful sign-ins are not counted.
- **Append-only audit trail.** Every task change records actor, action, and
  before/after values.

---

## Getting started

### Quickest — no database required

```bash
cd server && npm install && npm run dev:memory
```

Boots an in-memory MongoDB, seeds a demo project, and starts the API. Then:

```bash
cd client && npm install && npm run dev
```

Open <http://localhost:5173>.

### With Docker

```bash
docker compose up --build
```

### With a local MongoDB

```bash
cd server
npm install
cp .env.example .env     # set MONGODB_URI and JWT_SECRET
npm run check:db         # verifies the connection and names the problem if not
npm run seed
npm run dev
```

### Demo accounts

Seeding creates a project with 2 sprints, 20 tasks, linked dependencies and a
risk register, so every chart has real data immediately.

| Email | Password |
|---|---|
| `mrunal@example.com` | `password123` |
| `bhargavi@example.com` | `password123` |
| `akshit@example.com` | `password123` |

To see live sync, open two browsers as two different users and drag a card.

---

## Testing

```bash
cd server
npm test          # 60 tests
npm run bench     # forecast benchmark
```

Tests run against an in-memory MongoDB — no local database needed. Coverage
includes authentication, access control, task lifecycle, drag-and-drop
reordering, sprint transitions, burndown, critical path, scope creep, schema
validation, optimistic-concurrency conflicts, cache invalidation, and the
forecast engine's mathematical invariants.

Two are worth calling out:

- **Reference-implementation check.** The counting-sort percentiles are compared
  against the original sorted-array approach at p50, p85 and p95.
- **Invariants, not golden outputs.** Percentiles must be monotonic
  (p50 ≤ p85 ≤ p95), and more remaining work must never *raise* the probability
  of finishing on time. These hold for any seed, catching logic errors a fixed
  expected value would miss.

---

## API

Interactive docs at **`/api/docs`**; machine-readable spec at
`/api/openapi.json`.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` · `/login` | Authentication |
| `GET` `POST` | `/api/projects` | Projects |
| `GET` `POST` | `/api/projects/:id/sprints` | Sprints |
| `GET` `POST` | `/api/projects/:id/tasks` | Tasks, with filters |
| `PATCH` | `/api/projects/:id/tasks/:taskId/move` | Drag-and-drop |
| `POST` `DELETE` | `.../tasks/:taskId/dependencies` | Dependency edges |
| `GET` | `.../sprints/:sprintId/health` | **Full predictive analysis** |
| `GET` | `.../sprints/:sprintId/workload` | Per-member load |
| `GET` `POST` | `.../tasks/:taskId/comments` | Discussion |
| `GET` | `/api/projects/:id/activity` | Audit trail |
| `GET` `POST` | `/api/projects/:id/risks` | Risk register |

---

## Project structure

```
.
├── server/
│   ├── src/
│   │   ├── models/         User · Project · Sprint · Task · Risk · Comment · Activity
│   │   ├── services/       criticalPath · forecast · scopeAnalysis
│   │   │                   teamAnalytics · activityLog · cache
│   │   ├── controllers/    Route handlers
│   │   ├── schemas/        Zod request contracts
│   │   ├── middleware/     auth · validate · rateLimit · error
│   │   ├── observability/  Structured logging
│   │   ├── sockets/        Socket.io rooms and broadcasts
│   │   └── docs/           OpenAPI document
│   ├── tests/              60 integration and unit tests
│   └── bench/              Forecast benchmark
├── client/
│   └── src/
│       ├── pages/          Login · Projects · Board · Insights · Risks
│       ├── components/     Board · cards · dialogs · charts · team filter
│       ├── hooks/          WebSocket subscription
│       └── api/            Fetch wrapper
├── docs/                   Data model, ER diagram, API reference
└── .github/workflows/      CI pipeline
```

---

## Design decisions

**Drag-and-drop sends the whole column, not one index.** The client PATCHes the
destination status plus the complete ordered list of ids now in that column,
and the server rewrites the column in one `bulkWrite`. Two simultaneous drags
produce a complete, self-consistent ordering rather than a corrupted partial
shuffle.

**The board updates optimistically, then reconciles.** The card moves the
moment it is dropped; a failed request restores the previous state and tells
the user.

**Non-members get 404, not 403.** A 403 would confirm a project exists, so
project ids cannot be probed.

**`completedAt` is derived, not entered.** A `pre('save')` hook stamps it when a
task reaches `done` and clears it if reopened — which is what lets the burndown
be computed from the Task collection alone, with no separate history table.

**Velocity stays a team metric.** Per-person velocity is an Agile anti-pattern:
it rewards hoarding easy work and penalises helping a teammate, and story
points are relative estimates agreed by the team, not a personal rate. The
workload view reports *load* — how much committed work sits with each person —
which is a capacity question, not a ranking.

**Cycles are rejected on write.** A dependency that would close a loop is
refused with an explanation naming the conflicting task, because a cyclic graph
has no topological order and the critical path becomes undefined.

See `docs/DATA_MODEL.md` for the ER diagram and schema rationale.

---

## Roadmap

- Cumulative flow diagram and cycle-time distribution
- What-if simulation — "if we drop this task, what happens to the probability?"
- Sprint-health alerting when the forecast crosses a threshold
- Per-project role-based access control beyond owner/member

---

## About

Built for the Software Project Management course, Computer Science &
Engineering, **IIIT Vadodara**.

**Group 24** — Hasini Reddy · Mrunal Nikam · Akshit Kumar · Bhargavi Piridi

## License

MIT
