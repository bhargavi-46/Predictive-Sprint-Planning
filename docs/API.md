# REST API Reference

Base URL: `http://localhost:4000/api`

All routes except `/health`, `/auth/register` and `/auth/login` require a bearer
token:

```
Authorization: Bearer <token>
```

## Conventions

- Request and response bodies are JSON.
- Identifiers are returned as `id` (string), never `_id`.
- Errors use the shape `{ "error": "message", "details": { ... } }`.

| Status | Meaning |
|---|---|
| 400 | Validation failed or a malformed identifier was supplied |
| 401 | Missing, invalid, or expired token |
| 403 | Authenticated, but not permitted (owner-only actions) |
| 404 | Not found — also returned for projects the caller cannot see |
| 409 | Conflict (duplicate email, member already added) |

> A non-member requesting a project receives **404, not 403**. Returning 403
> would confirm that the project exists, which leaks information.

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account. Returns `{ token, user }`. |
| POST | `/auth/login` | Sign in. Returns `{ token, user }`. |
| GET | `/auth/me` | The signed-in user. |
| GET | `/users/search?q=` | Look up users by name or email (min. 3 characters). |

```http
POST /api/auth/register
{ "name": "Mrunal Nikam", "email": "mrunal@example.com", "password": "password123" }
```

Passwords must be at least 8 characters. Login returns the same message for an
unknown email and a wrong password, so the endpoint cannot be used to enumerate
registered accounts.

## Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | Projects the caller belongs to, with task counts. |
| POST | `/projects` | Create a project (caller becomes owner). |
| GET | `/projects/:projectId` | One project with members populated. |
| PATCH | `/projects/:projectId` | Rename / edit description. **Owner only.** |
| DELETE | `/projects/:projectId` | Delete, cascading to sprints and tasks. **Owner only.** |
| POST | `/projects/:projectId/members` | Add a member by email. **Owner only.** |
| DELETE | `/projects/:projectId/members/:userId` | Remove a member. **Owner only.** |

The project `key` (used for task references such as `ATM-14`) is derived from
the name's initials when not supplied.

Removing a member does not delete their tasks; those tasks are simply set back
to unassigned.

## Sprints

| Method | Path | Description |
|---|---|---|
| GET | `/projects/:projectId/sprints` | All sprints with task counts. |
| POST | `/projects/:projectId/sprints` | Create a sprint. |
| PATCH | `/projects/:projectId/sprints/:sprintId` | Edit, or change `status`. |
| DELETE | `/projects/:projectId/sprints/:sprintId` | Delete; tasks return to the backlog. |
| GET | `/projects/:projectId/sprints/:sprintId/burndown` | Burndown series and summary. |

```http
POST /api/projects/:projectId/sprints
{ "name": "Sprint 1", "goal": "Ship auth", "startDate": "2026-03-01", "endDate": "2026-03-14" }
```

Setting `status: "active"` automatically completes any other active sprint —
only one sprint may be active at a time, which is what makes a burndown chart
meaningful.

### Burndown response

```json
{
  "sprint": { "...": "..." },
  "burndown": [
    { "date": "2026-03-01", "ideal": 21.0, "remaining": 21 },
    { "date": "2026-03-02", "ideal": 19.4, "remaining": 18 },
    { "date": "2026-03-03", "ideal": 17.7, "remaining": null }
  ],
  "summary": {
    "totalPoints": 21, "completedPoints": 3, "remainingPoints": 18,
    "totalTasks": 7, "completedTasks": 1, "percentComplete": 14
  }
}
```

`remaining` is `null` for dates after today, so the chart does not imply future
days are already burned down.

## Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/projects/:projectId/tasks` | List tasks. Filters: `?sprint=`, `?status=`, `?assignee=`. |
| POST | `/projects/:projectId/tasks` | Create a task. |
| GET | `/projects/:projectId/tasks/:taskId` | One task. |
| PATCH | `/projects/:projectId/tasks/:taskId` | Update any field. |
| DELETE | `/projects/:projectId/tasks/:taskId` | Delete a task. |
| PATCH | `/projects/:projectId/tasks/:taskId/move` | Persist a drag-and-drop move. |

`?sprint=backlog` returns tasks not attached to any sprint.

A task cannot be assigned to somebody who is not a project member — the API
rejects this with 400.

### The move endpoint

```http
PATCH /api/projects/:projectId/tasks/:taskId/move
{ "status": "inprogress", "orderedIds": ["id-c", "id-a", "id-b"] }
```

The client sends the destination column plus **the complete ordered list of task
ids now in it**, and the server rewrites that whole column in a single
`bulkWrite`. Sending the full list rather than a single index means two people
dragging at once resolve to a complete, self-consistent ordering instead of a
corrupted partial shuffle.

The response is the project's full task list, which is also broadcast to every
other connected client as `board:reordered`.

## WebSocket events

Clients connect to the same origin and authenticate with the JWT:

```js
io('/', { auth: { token } });
socket.emit('project:join', projectId);
```

Membership is re-verified server-side on join, so a user cannot subscribe to a
project they have left.

| Event | Payload | Emitted when |
|---|---|---|
| `task:created` | `{ task }` | A task is created |
| `task:updated` | `{ task }` | A task is edited |
| `task:deleted` | `{ taskId }` | A task is deleted |
| `board:reordered` | `{ tasks }` | Any drag-and-drop move |
| `sprint:created` | `{ sprint }` | A sprint is created |
| `sprint:updated` | `{ sprint }` | A sprint is edited or its status changes |
| `sprint:deleted` | `{ sprintId }` | A sprint is deleted |
