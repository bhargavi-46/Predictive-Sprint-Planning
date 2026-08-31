/**
 * Tests for the production-hardening layer: schema validation at the HTTP
 * boundary, optimistic concurrency control, analytics caching, and the
 * invariants the forecast engine must hold after its counting-sort rewrite.
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-key-for-hardening-tests';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');
const { forecastCompletion } = await import('../src/services/forecast.js');
const { getCached, setCached, invalidateProject, cacheKey, resetCache } = await import(
  '../src/services/cache.js'
);

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

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function setup(suffix) {
  const { token } = await request(app)
    .post('/api/auth/register')
    .send({
      name: `User ${suffix}`,
      email: `hard${suffix}@example.com`,
      password: 'password123',
    })
    .then((r) => r.body);

  const project = await request(app)
    .post('/api/projects')
    .set(bearer(token))
    .send({ name: `Project ${suffix}`, key: 'HRD' })
    .then((r) => r.body.project);

  return { token, project };
}

// ------------------------------------------------------------ validation
describe('request validation', () => {
  test('rejects a password shorter than the minimum', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Shorty',
      email: 'shorty@example.com',
      password: 'abc',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 8 characters/);
  });

  test('rejects a malformed email before touching the database', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'password123',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid email/);
  });

  test('rejects a malformed project id with 400, not 500', async () => {
    const { token } = await setup('badid');
    const res = await request(app)
      .get('/api/projects/not-a-valid-object-id/tasks')
      .set(bearer(token));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid id/);
  });

  test('rejects story points outside the allowed range', async () => {
    const { token, project } = await setup('points');
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Too big', storyPoints: 9999 });
    assert.equal(res.status, 400);
  });

  test('coerces numeric strings so form input arrives typed', async () => {
    const { token, project } = await setup('coerce');
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'String points', storyPoints: '5' });
    assert.equal(res.status, 201);
    assert.strictEqual(res.body.task.storyPoints, 5, 'must be a number, not "5"');
  });

  test('a partial update leaves unmentioned fields untouched', async () => {
    // Regression: an over-eager transform once coerced absent optional fields
    // to null, so patching one field silently cleared assignee and due date.
    const { token, project } = await setup('partial');
    const me = await request(app)
      .get('/api/auth/me')
      .set(bearer(token))
      .then((r) => r.body.user);

    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Keeps its fields', assignee: me.id, dueDate: '2026-05-01' })
      .then((r) => r.body.task);

    assert.ok(created.assignee, 'precondition: task starts assigned');

    const patched = await request(app)
      .patch(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token))
      .send({ priority: 'critical' })
      .then((r) => r.body.task);

    assert.equal(patched.priority, 'critical');
    assert.ok(patched.assignee, 'assignee must survive an unrelated patch');
    assert.ok(patched.dueDate, 'due date must survive an unrelated patch');
  });

  test('an explicit null clears a field', async () => {
    const { token, project } = await setup('clear');
    const me = await request(app)
      .get('/api/auth/me')
      .set(bearer(token))
      .then((r) => r.body.user);

    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Gets unassigned', assignee: me.id })
      .then((r) => r.body.task);

    const patched = await request(app)
      .patch(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token))
      .send({ assignee: null })
      .then((r) => r.body.task);

    assert.equal(patched.assignee, null, 'an explicit null must clear the field');
  });

  test('attaches a request id to every error response', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x', password: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.requestId, 'errors must be traceable to a request');
    assert.ok(res.headers['x-request-id']);
  });
});

// -------------------------------------------------- optimistic concurrency
describe('optimistic concurrency control', () => {
  test('a stale version is rejected with 409 rather than silently overwriting', async () => {
    const { token, project } = await setup('conc');

    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Contested task', storyPoints: 3 })
      .then((r) => r.body.task);

    // Two clients both read version 0.
    const staleVersion = created.version;

    // First write succeeds and bumps the version.
    const first = await request(app)
      .patch(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token))
      .send({ title: 'Renamed by the first editor', version: staleVersion });
    assert.equal(first.status, 200);

    // Second write, still holding the old version, must be refused.
    const second = await request(app)
      .patch(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token))
      .send({ title: 'Renamed by the second editor', version: staleVersion });

    assert.equal(second.status, 409);
    assert.equal(second.body.details.code, 'STALE_VERSION');

    // The first editor's change must survive.
    const final = await request(app)
      .get(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token));
    assert.equal(final.body.task.title, 'Renamed by the first editor');
  });

  test('omitting the version keeps last-write-wins for simple clients', async () => {
    const { token, project } = await setup('nover');
    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Unversioned' })
      .then((r) => r.body.task);

    const res = await request(app)
      .patch(`/api/projects/${project.id}/tasks/${created.id}`)
      .set(bearer(token))
      .send({ title: 'Changed without a version' });

    assert.equal(res.status, 200);
  });
});

// ----------------------------------------------------------------- cache
describe('analytics cache', () => {
  test('returns a stored value within its TTL', () => {
    resetCache();
    const key = cacheKey('proj1', 'health', 'sprintA');
    setCached(key, 'proj1', { probability: 80 });
    assert.deepEqual(getCached(key), { probability: 80 });
  });

  test('expires an entry once its TTL has passed', () => {
    resetCache();
    const key = cacheKey('proj1', 'health', 'sprintB');
    setCached(key, 'proj1', { stale: true }, -1); // already expired
    assert.equal(getCached(key), undefined);
  });

  test('invalidating one project leaves other projects untouched', () => {
    resetCache();
    setCached(cacheKey('projA', 'health'), 'projA', 1);
    setCached(cacheKey('projB', 'health'), 'projB', 2);

    invalidateProject('projA');

    assert.equal(getCached(cacheKey('projA', 'health')), undefined);
    assert.equal(getCached(cacheKey('projB', 'health')), 2);
  });

  test('a task write invalidates the cached sprint health', async () => {
    const { token, project } = await setup('cacheinv');

    const sprint = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set(bearer(token))
      .send({
        name: 'Cache sprint',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
      })
      .then((r) => r.body.sprint);

    const key = cacheKey(project.id, 'health', sprint.id);

    await request(app)
      .get(`/api/projects/${project.id}/sprints/${sprint.id}/health`)
      .set(bearer(token));
    assert.ok(getCached(key), 'health should be cached after the first read');

    await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Invalidates the cache', sprint: sprint.id });

    assert.equal(getCached(key), undefined, 'a write must drop the stale analysis');
  });
});

// -------------------------------------------------------------- forecast
describe('forecast engine invariants', () => {
  const samples = [3, 5, 8, 2, 13, 5, 8];

  test('is deterministic for identical inputs', () => {
    const args = { remainingPoints: 40, velocitySamples: samples, daysRemaining: 10 };
    const a = forecastCompletion(args);
    const b = forecastCompletion(args);
    assert.deepEqual(a.daysNeeded, b.daysNeeded);
    assert.equal(a.probabilityOnTime, b.probabilityOnTime);
  });

  test('percentiles are monotonically non-decreasing', () => {
    const { daysNeeded } = forecastCompletion({
      remainingPoints: 60,
      velocitySamples: samples,
      daysRemaining: 10,
    });
    assert.ok(daysNeeded.p50 <= daysNeeded.p85, 'p50 must not exceed p85');
    assert.ok(daysNeeded.p85 <= daysNeeded.p95, 'p85 must not exceed p95');
  });

  test('more remaining work never raises the probability of finishing on time', () => {
    const small = forecastCompletion({
      remainingPoints: 20,
      velocitySamples: samples,
      daysRemaining: 10,
    });
    const large = forecastCompletion({
      remainingPoints: 200,
      velocitySamples: samples,
      daysRemaining: 10,
    });
    assert.ok(large.probabilityOnTime <= small.probabilityOnTime);
  });

  test('reports insufficient data instead of inventing a number', () => {
    const result = forecastCompletion({
      remainingPoints: 40,
      velocitySamples: [],
      daysRemaining: 10,
    });
    assert.equal(result.hasEnoughData, false);
    assert.equal(result.probabilityOnTime, null);
  });

  test('completed work forecasts as certain', () => {
    const result = forecastCompletion({
      remainingPoints: 0,
      velocitySamples: samples,
      daysRemaining: 5,
    });
    assert.equal(result.probabilityOnTime, 100);
  });

  test('histogram percentiles match a sorted-array reference implementation', () => {
    // Guards the counting-sort rewrite against the comparison sort it replaced.
    const trials = 4000;
    const result = forecastCompletion({
      remainingPoints: 50,
      velocitySamples: samples,
      daysRemaining: 10,
      trials,
    });

    // Reproduce the simulation with a plain array and sort it the old way.
    const reference = [];
    let seedBase = samples.reduce((acc, v, i) => acc + v * (i + 1), 50 * 31);
    let a = (Math.floor(Math.abs(seedBase) * 2654435761) % 2 ** 31 || 1) >>> 0;
    const rng = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < trials; i += 1) {
      let remaining = 50;
      let days = 0;
      while (remaining > 0 && days < 365) {
        remaining -= samples[Math.floor(rng() * samples.length)];
        days += 1;
      }
      reference.push(days);
    }
    reference.sort((x, y) => x - y);
    const at = (p) => reference[Math.min(reference.length - 1, Math.floor((p / 100) * reference.length))];

    assert.equal(result.daysNeeded.p50, at(50));
    assert.equal(result.daysNeeded.p85, at(85));
    assert.equal(result.daysNeeded.p95, at(95));
  });
});

// ------------------------------------------------------------- filtering
describe('board filtering', () => {
  test('filters tasks by a free-text query', async () => {
    const { token, project } = await setup('search');
    const post = (title) =>
      request(app)
        .post(`/api/projects/${project.id}/tasks`)
        .set(bearer(token))
        .send({ title });

    await post('Implement payment gateway');
    await post('Write documentation');

    const res = await request(app)
      .get(`/api/projects/${project.id}/tasks?q=payment`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.tasks.length, 1);
    assert.match(res.body.tasks[0].title, /payment/i);
  });

  test('treats regex metacharacters in a query as literal text', async () => {
    const { token, project } = await setup('regex');
    await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(bearer(token))
      .send({ title: 'Support C++ parsing' });

    const res = await request(app)
      .get(`/api/projects/${project.id}/tasks?q=${encodeURIComponent('C++')}`)
      .set(bearer(token));

    assert.equal(res.status, 200, 'an unescaped regex would throw here');
    assert.equal(res.body.tasks.length, 1);
  });

  test('filters to only blocked tasks', async () => {
    const { token, project } = await setup('blocked');
    const mk = (title) =>
      request(app)
        .post(`/api/projects/${project.id}/tasks`)
        .set(bearer(token))
        .send({ title })
        .then((r) => r.body.task);

    const blocker = await mk('Must happen first');
    const blocked = await mk('Waits on the blocker');
    await mk('Independent work');

    await request(app)
      .post(`/api/projects/${project.id}/tasks/${blocked.id}/dependencies`)
      .set(bearer(token))
      .send({ dependsOn: blocker.id });

    const res = await request(app)
      .get(`/api/projects/${project.id}/tasks?blocked=true`)
      .set(bearer(token));

    assert.equal(res.body.tasks.length, 1);
    assert.equal(res.body.tasks[0].id, blocked.id);
  });
});
