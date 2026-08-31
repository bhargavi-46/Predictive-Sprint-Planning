/**
 * Integration tests for the REST API.
 *
 * Runs against an in-memory MongoDB instance, so no local database is
 * required and each run starts from a clean slate:
 *
 *   npm test
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';

const { createApp } = await import('../src/app.js');

let mongo;
let app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Registers a user and returns { token, user }. */
async function makeUser(suffix) {
  const res = await request(app).post('/api/auth/register').send({
    name: `User ${suffix}`,
    email: `user${suffix}@example.com`,
    password: 'password123',
  });
  assert.equal(res.status, 201);
  return res.body;
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------- auth
describe('authentication', () => {
  test('registers a user and returns a token', async () => {
    const { token, user } = await makeUser('reg');
    assert.ok(token);
    assert.equal(user.email, 'userreg@example.com');
    assert.equal(user.passwordHash, undefined, 'password hash must never be returned');
  });

  test('rejects a duplicate email', async () => {
    await makeUser('dup');
    const res = await request(app).post('/api/auth/register').send({
      name: 'Someone Else', email: 'userdup@example.com', password: 'password123',
    });
    assert.equal(res.status, 409);
  });

  test('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Shorty', email: 'short@example.com', password: 'abc',
    });
    assert.equal(res.status, 400);
  });

  test('logs in with correct credentials and rejects wrong ones', async () => {
    await makeUser('login');

    const ok = await request(app).post('/api/auth/login').send({
      email: 'userlogin@example.com', password: 'password123',
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const bad = await request(app).post('/api/auth/login').send({
      email: 'userlogin@example.com', password: 'wrong-password',
    });
    assert.equal(bad.status, 401);
  });

  test('refuses protected routes without a token', async () => {
    const res = await request(app).get('/api/projects');
    assert.equal(res.status, 401);
  });
});

// ------------------------------------------------------------ projects
describe('projects', () => {
  test('creates a project with the creator as owner and member', async () => {
    const { token } = await makeUser('proj');

    const res = await request(app)
      .post('/api/projects')
      .set(bearer(token))
      .send({ name: 'Payments Service', description: 'Billing work' });

    assert.equal(res.status, 201);
    assert.equal(res.body.project.key, 'PS', 'key is derived from the name initials');
    assert.equal(res.body.project.members.length, 1);
    assert.equal(res.body.project.members[0].role, 'owner');
  });

  test('hides projects the user does not belong to', async () => {
    const a = await makeUser('owner1');
    const b = await makeUser('outsider1');

    const created = await request(app)
      .post('/api/projects').set(bearer(a.token)).send({ name: 'Private Work' });

    const list = await request(app).get('/api/projects').set(bearer(b.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.projects.length, 0);

    // A non-member gets 404, not 403 — existence itself is not disclosed.
    const direct = await request(app)
      .get(`/api/projects/${created.body.project.id}`).set(bearer(b.token));
    assert.equal(direct.status, 404);
  });

  test('only the owner may add members', async () => {
    const owner = await makeUser('owner2');
    const member = await makeUser('member2');

    const { body } = await request(app)
      .post('/api/projects').set(bearer(owner.token)).send({ name: 'Team Project' });
    const projectId = body.project.id;

    const added = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(bearer(owner.token))
      .send({ email: 'usermember2@example.com' });
    assert.equal(added.status, 201);
    assert.equal(added.body.project.members.length, 2);

    // The newly added member is not the owner, so cannot invite others.
    const forbidden = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(bearer(member.token))
      .send({ email: 'userowner2@example.com' });
    assert.equal(forbidden.status, 403);
  });
});

// --------------------------------------------------------------- tasks
describe('tasks and the board', () => {
  let token;
  let projectId;

  before(async () => {
    const user = await makeUser('board');
    token = user.token;
    const { body } = await request(app)
      .post('/api/projects').set(bearer(token)).send({ name: 'Board Tests' });
    projectId = body.project.id;
  });

  test('creates tasks with sequential reference numbers', async () => {
    const first = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'First task' });
    const second = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Second task' });

    assert.equal(first.status, 201);
    assert.equal(first.body.task.reference, 'BT-1');
    assert.equal(second.body.task.reference, 'BT-2');
  });

  test('rejects an invalid status', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Bad status', status: 'almost-done' });
    assert.equal(res.status, 400);
  });

  test('stamps completedAt when a task reaches done, and clears it on reopen', async () => {
    const { body } = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Completion tracking' });
    const taskId = body.task.id;
    assert.equal(body.task.completedAt, null);

    const done = await request(app)
      .patch(`/api/projects/${projectId}/tasks/${taskId}`).set(bearer(token))
      .send({ status: 'done' });
    assert.ok(done.body.task.completedAt, 'completedAt is set on done');

    const reopened = await request(app)
      .patch(`/api/projects/${projectId}/tasks/${taskId}`).set(bearer(token))
      .send({ status: 'todo' });
    assert.equal(reopened.body.task.completedAt, null, 'completedAt clears on reopen');
  });

  test('refuses to assign a task to a non-member', async () => {
    const outsider = await makeUser('outsider2');

    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Wrong assignee', assignee: outsider.user.id });

    assert.equal(res.status, 400);
  });

  test('move rewrites the destination column order', async () => {
    const titles = ['Move A', 'Move B', 'Move C'];
    const created = [];
    for (const title of titles) {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
        .send({ title, status: 'todo' });
      created.push(res.body.task);
    }

    // Drag the last card to the front of the column.
    const reordered = [created[2].id, created[0].id, created[1].id];
    const res = await request(app)
      .patch(`/api/projects/${projectId}/tasks/${created[2].id}/move`)
      .set(bearer(token))
      .send({ status: 'todo', orderedIds: reordered });

    assert.equal(res.status, 200);

    const column = res.body.tasks
      .filter((t) => reordered.includes(t.id))
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);

    assert.deepEqual(column, reordered);
  });

  test('move rejects a payload that omits the task being moved', async () => {
    const { body } = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Orphan move', status: 'todo' });

    const res = await request(app)
      .patch(`/api/projects/${projectId}/tasks/${body.task.id}/move`)
      .set(bearer(token))
      .send({ status: 'todo', orderedIds: ['507f1f77bcf86cd799439011'] });

    assert.equal(res.status, 400);
  });
});

// ------------------------------------------------------------- sprints
describe('sprints and burndown', () => {
  let token;
  let projectId;

  before(async () => {
    const user = await makeUser('sprint');
    token = user.token;
    const { body } = await request(app)
      .post('/api/projects').set(bearer(token)).send({ name: 'Sprint Tests' });
    projectId = body.project.id;
  });

  test('rejects a sprint whose end precedes its start', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/sprints`).set(bearer(token))
      .send({ name: 'Backwards', startDate: '2026-03-10', endDate: '2026-03-01' });

    assert.equal(res.status, 400);
  });

  test('starting a sprint completes any other active sprint', async () => {
    const first = await request(app)
      .post(`/api/projects/${projectId}/sprints`).set(bearer(token))
      .send({ name: 'Sprint A', startDate: '2026-03-01', endDate: '2026-03-14' });
    const second = await request(app)
      .post(`/api/projects/${projectId}/sprints`).set(bearer(token))
      .send({ name: 'Sprint B', startDate: '2026-03-15', endDate: '2026-03-28' });

    await request(app)
      .patch(`/api/projects/${projectId}/sprints/${first.body.sprint.id}`)
      .set(bearer(token)).send({ status: 'active' });
    await request(app)
      .patch(`/api/projects/${projectId}/sprints/${second.body.sprint.id}`)
      .set(bearer(token)).send({ status: 'active' });

    const list = await request(app)
      .get(`/api/projects/${projectId}/sprints`).set(bearer(token));

    const active = list.body.sprints.filter((s) => s.status === 'active');
    assert.equal(active.length, 1, 'at most one sprint may be active');
    assert.equal(active[0].name, 'Sprint B');
  });

  test('burndown totals the sprint story points', async () => {
    const sprint = await request(app)
      .post(`/api/projects/${projectId}/sprints`).set(bearer(token))
      .send({ name: 'Burndown Sprint', startDate: '2026-04-01', endDate: '2026-04-10' });
    const sprintId = sprint.body.sprint.id;

    for (const points of [3, 5, 2]) {
      await request(app)
        .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
        .send({ title: `Task worth ${points}`, storyPoints: points, sprint: sprintId });
    }

    const res = await request(app)
      .get(`/api/projects/${projectId}/sprints/${sprintId}/burndown`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.totalPoints, 10);
    assert.equal(res.body.summary.completedPoints, 0);
    assert.equal(res.body.summary.percentComplete, 0);
    assert.ok(res.body.burndown.length > 1, 'one data point per sprint day');
  });

  test('deleting a sprint returns its tasks to the backlog', async () => {
    const sprint = await request(app)
      .post(`/api/projects/${projectId}/sprints`).set(bearer(token))
      .send({ name: 'Doomed Sprint', startDate: '2026-05-01', endDate: '2026-05-10' });
    const sprintId = sprint.body.sprint.id;

    const task = await request(app)
      .post(`/api/projects/${projectId}/tasks`).set(bearer(token))
      .send({ title: 'Survives deletion', sprint: sprintId });

    await request(app)
      .delete(`/api/projects/${projectId}/sprints/${sprintId}`).set(bearer(token));

    const after = await request(app)
      .get(`/api/projects/${projectId}/tasks/${task.body.task.id}`).set(bearer(token));

    assert.equal(after.status, 200, 'the task itself is not deleted');
    assert.equal(after.body.task.sprint, null, 'it falls back to the backlog');
  });
});
