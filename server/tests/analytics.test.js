import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseCriticalPath,
  findCycle,
  wouldCreateCycle,
  topologicalOrder,
  findBlockedTasks,
} from '../src/services/criticalPath.js';
import {
  forecastCompletion,
  deriveVelocitySamples,
} from '../src/services/forecast.js';
import {
  analyseScopeCreep,
  analyseEstimationAccuracy,
} from '../src/services/scopeAnalysis.js';

const task = (id, points, dependsOn = [], status = 'todo') => ({
  id,
  reference: `T-${id}`,
  title: `Task ${id}`,
  status,
  storyPoints: points,
  dependsOn,
});

// ---------------------------------------------------------------- CPM

test('critical path: picks the longest chain, not the task count', () => {
  // A(3) -> B(5) -> D(2)   = 10   <- critical
  // A(3) -> C(1) -> D(2)   = 6
  const tasks = [
    task('A', 3),
    task('B', 5, ['A']),
    task('C', 1, ['A']),
    task('D', 2, ['B', 'C']),
  ];

  const r = analyseCriticalPath(tasks);

  assert.equal(r.projectDuration, 10);
  assert.deepEqual(r.criticalPath, ['A', 'B', 'D']);

  // C is off the critical path and has slack equal to the difference.
  const c = r.tasks.find((t) => t.id === 'C');
  assert.equal(c.float, 4);
  assert.equal(c.isCritical, false);
});

test('critical path: hand-worked CPM example matches by float', () => {
  const tasks = [
    task('start', 0),
    task('design', 4, ['start']),
    task('backend', 6, ['design']),
    task('frontend', 3, ['design']),
    task('integrate', 2, ['backend', 'frontend']),
  ];

  const r = analyseCriticalPath(tasks);
  assert.equal(r.projectDuration, 12); // 0 + 4 + 6 + 2

  const fe = r.tasks.find((t) => t.id === 'frontend');
  assert.equal(fe.float, 3); // 6 - 3
  assert.equal(fe.isCritical, false);
});

test('completed tasks stop constraining the remaining schedule', () => {
  const tasks = [
    task('A', 5, [], 'done'),
    task('B', 3, ['A']),
  ];
  const r = analyseCriticalPath(tasks);
  assert.equal(r.projectDuration, 3); // A contributes 0 once done
});

test('cycle detection finds a genuine loop', () => {
  const tasks = [
    task('A', 1, ['C']),
    task('B', 1, ['A']),
    task('C', 1, ['B']),
  ];
  assert.notEqual(findCycle(tasks), null);
  assert.equal(topologicalOrder(tasks), null);
  assert.equal(analyseCriticalPath(tasks).hasCycle, true);
});

test('acyclic graph reports no cycle', () => {
  const tasks = [task('A', 1), task('B', 1, ['A'])];
  assert.equal(findCycle(tasks), null);
  assert.deepEqual(topologicalOrder(tasks), ['A', 'B']);
});

test('wouldCreateCycle blocks self-dependency and indirect loops', () => {
  const tasks = [
    { id: 'A', dependsOn: [] },
    { id: 'B', dependsOn: ['A'] },
    { id: 'C', dependsOn: ['B'] },
  ];

  assert.equal(wouldCreateCycle(tasks, 'A', 'A'), true);   // self
  assert.equal(wouldCreateCycle(tasks, 'A', 'C'), true);   // closes A->B->C->A
  assert.equal(wouldCreateCycle(tasks, 'C', 'A'), false);  // already implied, safe
});

test('blocked tasks list their unfinished blockers only', () => {
  const tasks = [
    task('A', 1, [], 'done'),
    task('B', 1, [], 'inprogress'),
    task('C', 1, ['A', 'B']),
  ];

  const blocked = findBlockedTasks(tasks);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].id, 'C');
  assert.equal(blocked[0].blockedBy.length, 1); // only B, since A is done
  assert.equal(blocked[0].blockedBy[0].id, 'B');
});

// ----------------------------------------------------------- forecast

test('forecast is deterministic for identical inputs', () => {
  const input = { remainingPoints: 20, velocitySamples: [3, 5, 4], daysRemaining: 5 };
  const a = forecastCompletion(input);
  const b = forecastCompletion(input);
  assert.equal(a.probabilityOnTime, b.probabilityOnTime);
  assert.deepEqual(a.daysNeeded, b.daysNeeded);
});

test('forecast reports low confidence when far behind', () => {
  const r = forecastCompletion({
    remainingPoints: 100,
    velocitySamples: [2, 3, 2],
    daysRemaining: 2,
  });
  assert.ok(r.probabilityOnTime < 10, `expected low, got ${r.probabilityOnTime}`);
});

test('forecast reports high confidence when comfortably ahead', () => {
  const r = forecastCompletion({
    remainingPoints: 5,
    velocitySamples: [10, 12, 11],
    daysRemaining: 10,
  });
  assert.equal(r.probabilityOnTime, 100);
});

test('forecast degrades honestly with no history', () => {
  const r = forecastCompletion({
    remainingPoints: 10,
    velocitySamples: [],
    daysRemaining: 5,
  });
  assert.equal(r.hasEnoughData, false);
  assert.equal(r.probabilityOnTime, null);
});

test('percentiles are ordered p50 <= p85 <= p95', () => {
  const r = forecastCompletion({
    remainingPoints: 40,
    velocitySamples: [1, 5, 9],
    daysRemaining: 8,
  });
  assert.ok(r.daysNeeded.p50 <= r.daysNeeded.p85);
  assert.ok(r.daysNeeded.p85 <= r.daysNeeded.p95);
});

test('velocity samples aggregate per day and drop empty days', () => {
  const samples = deriveVelocitySamples([
    { completedAt: '2026-01-01T10:00:00Z', storyPoints: 3 },
    { completedAt: '2026-01-01T15:00:00Z', storyPoints: 2 },
    { completedAt: '2026-01-03T09:00:00Z', storyPoints: 5 },
  ]);
  assert.deepEqual(samples.sort((a, b) => a - b), [5, 5]);
});

// -------------------------------------------------------- scope creep

test('scope creep detects added work against the baseline', () => {
  const commitment = {
    capturedAt: new Date('2026-01-01'),
    taskIds: ['A', 'B'],
    totalPoints: 8,
    pointsByTask: new Map([['A', 5], ['B', 3]]),
  };
  const current = [task('A', 5), task('B', 3), task('C', 4)];

  const r = analyseScopeCreep(commitment, current);

  assert.equal(r.hasBaseline, true);
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].id, 'C');
  assert.equal(r.totals.netChange, 4);
  assert.equal(r.totals.creepPercent, 50);
  assert.equal(r.verdict, 'significant');
});

test('scope creep detects silent re-estimation', () => {
  const commitment = {
    capturedAt: new Date('2026-01-01'),
    taskIds: ['A'],
    totalPoints: 3,
    pointsByTask: new Map([['A', 3]]),
  };
  const r = analyseScopeCreep(commitment, [task('A', 8)]);

  assert.equal(r.reEstimated.length, 1);
  assert.equal(r.reEstimated[0].delta, 5);
});

test('scope creep says so plainly when no baseline exists', () => {
  const r = analyseScopeCreep(null, [task('A', 3)]);
  assert.equal(r.hasBaseline, false);
});

// ------------------------------------------------------- estimation

test('estimation accuracy flags an optimistic team', () => {
  const tasks = [
    { ...task('A', 2, [], 'done'), actualPoints: 4 },
    { ...task('B', 3, [], 'done'), actualPoints: 6 },
  ];
  const r = analyseEstimationAccuracy(tasks);

  assert.equal(r.hasData, true);
  assert.equal(r.meanRatio, 2);
  assert.match(r.bias, /optimistic/);
});

test('estimation accuracy recognises a calibrated team', () => {
  const tasks = [
    { ...task('A', 4, [], 'done'), actualPoints: 4 },
    { ...task('B', 6, [], 'done'), actualPoints: 6 },
  ];
  const r = analyseEstimationAccuracy(tasks);
  assert.equal(r.meanRatio, 1);
  assert.equal(r.mape, 0);
  assert.match(r.bias, /well calibrated/);
});

test('estimation accuracy reports no data rather than guessing', () => {
  const r = analyseEstimationAccuracy([task('A', 3, [], 'done')]);
  assert.equal(r.hasData, false);
});
