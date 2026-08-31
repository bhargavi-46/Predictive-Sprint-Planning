/**
 * Demo data generator, shared by `npm run seed` (against a real database)
 * and `npm run dev:memory` (against an in-memory one).
 */
import User from './models/User.js';
import Project from './models/Project.js';
import Sprint from './models/Sprint.js';
import Task from './models/Task.js';
import Risk from './models/Risk.js';

export const DEMO_PASSWORD = 'password123';

export const DEMO_PEOPLE = [
  { name: 'Mrunal Nikam', email: 'mrunal@example.com' },
  { name: 'Bhargavi Piridi', email: 'bhargavi@example.com' },
  { name: 'Akshit Kumar', email: 'akshit@example.com' },
];

/** A date `offset` days from today, at midnight. */
function daysFromNow(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * `key` gives each task a stable handle so dependencies can be expressed
 * declaratively in `deps` below without juggling generated ObjectIds.
 * `actual` records the effort really taken, which drives estimation accuracy.
 * `addedAfterCommit` marks work injected after the sprint started, so the
 * scope-creep panel has something real to report.
 */
const TASKS = [
  // Sprint 1 — finished, so the burndown has a real completed shape.
  { key: 'scaffold', title: 'Set up project scaffolding and CI', status: 'done', priority: 'high', points: 3, actual: 3, sprint: 0, done: -11 },
  { key: 'schema', title: 'Design the database schema (ER model)', status: 'done', priority: 'high', points: 5, actual: 8, sprint: 0, done: -10, deps: ['scaffold'] },
  { key: 'auth', title: 'Implement JWT authentication', status: 'done', priority: 'critical', points: 8, actual: 13, sprint: 0, done: -8, deps: ['schema'] },
  { key: 'authui', title: 'Build the registration and login screens', status: 'done', priority: 'medium', points: 5, actual: 5, sprint: 0, done: -6, deps: ['auth'] },
  { key: 'projapi', title: 'Project CRUD API endpoints', status: 'done', priority: 'high', points: 5, actual: 6, sprint: 0, done: -4, deps: ['auth'] },
  { key: 'apitests', title: 'Write API integration tests', status: 'inprogress', priority: 'medium', points: 3, sprint: 0, deps: ['projapi'] },

  // Sprint 2 — the currently active sprint.
  { key: 'dnd', title: 'Kanban board drag-and-drop', status: 'done', priority: 'critical', points: 8, actual: 8, sprint: 1, done: -2, deps: ['projapi'] },
  { key: 'ordering', title: 'Persist column ordering on drop', status: 'done', priority: 'high', points: 3, actual: 5, sprint: 1, done: -1, deps: ['dnd'] },
  { key: 'dialog', title: 'Task detail dialog with assignee picker', status: 'inprogress', priority: 'high', points: 5, sprint: 1, deps: ['dnd'] },
  { key: 'sockets', title: 'Real-time board sync over websockets', status: 'inprogress', priority: 'medium', points: 8, sprint: 1, deps: ['ordering'] },
  { key: 'burndown', title: 'Burndown chart on the dashboard', status: 'todo', priority: 'high', points: 5, sprint: 1, due: 3, deps: ['sockets'] },
  { key: 'transitions', title: 'Sprint start and complete transitions', status: 'todo', priority: 'medium', points: 3, sprint: 1, due: 4, deps: ['dialog'] },
  { key: 'overdue', title: 'Overdue task highlighting', status: 'todo', priority: 'low', points: 2, sprint: 1 },

  // Injected mid-sprint — these are what the scope-creep panel detects.
  { key: 'hotfix', title: 'Hotfix: session expiry logs users out mid-edit', status: 'todo', priority: 'critical', points: 5, sprint: 1, addedAfterCommit: true, deps: ['auth'] },
  { key: 'a11y', title: 'Keyboard accessibility for the board', status: 'todo', priority: 'medium', points: 3, sprint: 1, addedAfterCommit: true },

  // Product backlog — not yet pulled into a sprint.
  { key: 'emails', title: 'Email notifications on task assignment', status: 'backlog', priority: 'medium', points: 5 },
  { key: 'pdf', title: 'Export sprint report as PDF', status: 'backlog', priority: 'low', points: 5 },
  { key: 'dark', title: 'Dark mode for the board', status: 'backlog', priority: 'low', points: 3 },
  { key: 'bulkmove', title: 'Bulk-move tasks between sprints', status: 'backlog', priority: 'medium', points: 3 },
  { key: 'audit', title: 'Audit log of board changes', status: 'backlog', priority: 'low', points: 8 },
];

const RISKS = [
  {
    title: 'Websocket sync may not scale to concurrent editors',
    description: 'Simultaneous drags from several users could produce conflicting orderings.',
    category: 'technical', probability: 3, impact: 4,
    mitigation: 'Reorder writes send the full column list, so the last write is self-consistent.',
    status: 'mitigating', relatedKeys: ['sockets'],
  },
  {
    title: 'Sprint 2 is over-committed after the hotfix',
    description: 'Unplanned work was added after the commitment baseline was frozen.',
    category: 'schedule', probability: 4, impact: 4,
    mitigation: 'Move accessibility work to the next sprint if the forecast stays below 60%.',
    status: 'open', relatedKeys: ['hotfix', 'a11y'],
  },
  {
    title: 'Team unfamiliar with Monte Carlo forecasting',
    description: 'The forecasting module is new territory and may take longer than estimated.',
    category: 'resource', probability: 3, impact: 2,
    mitigation: 'Validated against hand-worked examples in the unit test suite.',
    status: 'closed', relatedKeys: [],
  },
  {
    title: 'MongoDB not installed on the demonstration machine',
    description: 'A missing database would block the live demo entirely.',
    category: 'external', probability: 2, impact: 5,
    mitigation: 'Portable MongoDB checked in under C:\\mongodb with a start script.',
    status: 'closed', relatedKeys: [],
  },
];

/**
 * Wipes any previous demo data and rebuilds it. Assumes mongoose is already
 * connected.
 */
export async function seedDemoData({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);

  log('[seed] clearing existing demo data…');
  const emails = DEMO_PEOPLE.map((p) => p.email);
  const existing = await User.find({ email: { $in: emails } });
  const existingIds = existing.map((u) => u._id);
  const oldProjects = await Project.find({ owner: { $in: existingIds } });
  const oldProjectIds = oldProjects.map((p) => p._id);

  await Promise.all([
    Task.deleteMany({ project: { $in: oldProjectIds } }),
    Sprint.deleteMany({ project: { $in: oldProjectIds } }),
    Risk.deleteMany({ project: { $in: oldProjectIds } }),
    Project.deleteMany({ _id: { $in: oldProjectIds } }),
    User.deleteMany({ _id: { $in: existingIds } }),
  ]);

  log('[seed] creating users…');
  const users = [];
  for (const person of DEMO_PEOPLE) {
    const user = new User({ ...person, password: DEMO_PASSWORD });
    await user.save(); // saved one at a time so the hashing hook runs
    users.push(user);
  }
  const [owner, second, third] = users;

  log('[seed] creating project…');
  const project = await Project.create({
    name: 'Agile Task Manager',
    key: 'ATM',
    description: 'Lightweight Kanban and sprint tracking for small development teams.',
    owner: owner._id,
    members: [
      { user: owner._id, role: 'owner' },
      { user: second._id, role: 'member' },
      { user: third._id, role: 'member' },
    ],
  });

  log('[seed] creating sprints…');
  const sprints = await Sprint.create([
    {
      project: project._id,
      name: 'Sprint 1 — Foundations',
      goal: 'Authentication, project setup and the core data model.',
      startDate: daysFromNow(-14),
      endDate: daysFromNow(-1),
      status: 'completed',
      completedAt: daysFromNow(-1),
    },
    {
      project: project._id,
      name: 'Sprint 2 — Board & Tracking',
      goal: 'Ship the Kanban board with live sync and the burndown chart.',
      startDate: daysFromNow(-4),
      endDate: daysFromNow(6),
      status: 'active',
    },
  ]);

  log('[seed] creating tasks…');
  const orderCounters = { backlog: 0, todo: 0, inprogress: 0, done: 0 };
  const byKey = new Map();
  let counter = 0;

  for (const spec of TASKS) {
    counter += 1;
    const assignee = users[counter % users.length];

    const task = new Task({
      project: project._id,
      sprint: spec.sprint !== undefined ? sprints[spec.sprint]._id : null,
      reference: `${project.key}-${counter}`,
      title: spec.title,
      status: spec.status,
      priority: spec.priority,
      storyPoints: spec.points,
      actualPoints: spec.actual ?? null,
      assignee: assignee._id,
      reporter: owner._id,
      dueDate: spec.due !== undefined ? daysFromNow(spec.due) : null,
      order: orderCounters[spec.status]++,
    });
    await task.save();
    byKey.set(spec.key, task);

    // Backdate completion so the burndown slopes over the sprint instead of
    // dropping everything onto today. Deliberately bypasses the save hook.
    if (spec.status === 'done' && spec.done !== undefined) {
      await Task.updateOne(
        { _id: task._id },
        { $set: { completedAt: daysFromNow(spec.done) } }
      );
    }
  }

  // Second pass: dependencies, now that every task has an id.
  log('[seed] linking dependencies…');
  for (const spec of TASKS) {
    if (!spec.deps?.length) continue;
    const task = byKey.get(spec.key);
    task.dependsOn = spec.deps.map((k) => byKey.get(k)._id);
    await task.save();
  }

  /**
   * Freeze Sprint 2's commitment baseline *excluding* the tasks marked as
   * added later. This reproduces what really happens: the sprint was started
   * with one scope, then work was injected — which is exactly what the
   * scope-creep panel is designed to surface.
   */
  log('[seed] capturing sprint commitment baseline…');
  const activeSprint = sprints[1];
  const committed = TASKS
    .filter((t) => t.sprint === 1 && !t.addedAfterCommit)
    .map((t) => byKey.get(t.key));

  activeSprint.commitment = {
    capturedAt: daysFromNow(-4),
    taskIds: committed.map((t) => t._id),
    totalPoints: committed.reduce((s, t) => s + t.storyPoints, 0),
    pointsByTask: new Map(committed.map((t) => [t.id, t.storyPoints])),
  };
  await activeSprint.save();

  log('[seed] creating risk register…');
  for (const spec of RISKS) {
    await Risk.create({
      project: project._id,
      title: spec.title,
      description: spec.description,
      category: spec.category,
      probability: spec.probability,
      impact: spec.impact,
      status: spec.status,
      mitigation: spec.mitigation,
      owner: owner._id,
      relatedTasks: spec.relatedKeys.map((k) => byKey.get(k)._id),
      createdBy: owner._id,
    });
  }

  project.taskCounter = counter;
  await project.save();

  log('\n[seed] done. Sign in with any of:');
  DEMO_PEOPLE.forEach((p) => log(`         ${p.email}  /  ${DEMO_PASSWORD}`));
  log(
    `\n[seed] project "${project.name}" · ${counter} tasks · 2 sprints · ` +
    `${RISKS.length} risks\n`
  );

  return { project, users, sprints, taskCount: counter };
}
