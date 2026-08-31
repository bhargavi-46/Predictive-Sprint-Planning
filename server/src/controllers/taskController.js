import Task, { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { emitToProject } from '../sockets/index.js';
import { recordActivity, diffTask, summariseChanges } from '../services/activityLog.js';

const POPULATE = [
  { path: 'assignee', select: 'name email' },
  { path: 'reporter', select: 'name email' },
  { path: 'dependsOn', select: 'reference title status' },
];

/**
 * GET /projects/:projectId/tasks
 *
 * Filtering happens in the database rather than the client so a large board
 * does not ship every task over the wire on each load. `blocked` is the one
 * filter that cannot be expressed as a plain query — it depends on the status
 * of *other* documents — so it is applied after the fetch.
 */
export const listTasks = asyncHandler(async (req, res) => {
  const { sprint, assignee, status, priority, q, blocked, overdue, limit } = req.query;
  const filter = { project: req.project._id };

  // ?sprint=<id> restricts to one sprint; ?sprint=backlog gets unassigned work.
  if (sprint === 'backlog') filter.sprint = null;
  else if (sprint) filter.sprint = sprint;

  if (assignee) filter.assignee = assignee;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  // Case-insensitive substring match. Escaped so a user typing "C++" or "a.b"
  // searches for those literal characters instead of a regex.
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: safe, $options: 'i' } },
      { reference: { $regex: safe, $options: 'i' } },
    ];
  }

  if (overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $ne: 'done' };
  }

  let tasks = await Task.find(filter)
    .populate(POPULATE)
    .sort({ status: 1, order: 1 })
    .limit(limit);

  // "Blocked" means at least one dependency is not yet done.
  if (blocked === 'true') {
    tasks = tasks.filter((t) => t.dependsOn.some((d) => d.status !== 'done'));
  } else if (blocked === 'false') {
    tasks = tasks.filter((t) => t.dependsOn.every((d) => d.status === 'done'));
  }

  res.json({ tasks: tasks.map((t) => t.toJSON()), count: tasks.length });
});

export const createTask = asyncHandler(async (req, res) => {
  const { title, description, status, priority, assignee, sprint, dueDate, storyPoints } =
    req.body;

  if (!title || !title.trim()) throw new ApiError(400, 'Task title is required');
  if (status && !TASK_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  if (priority && !TASK_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `Priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }
  if (assignee && !req.project.hasMember(assignee)) {
    throw new ApiError(400, 'Cannot assign a task to a non-member of this project');
  }

  // Reserve the next reference number (APM-1, APM-2, ...) atomically.
  req.project.taskCounter += 1;
  await req.project.save();

  const column = status || 'backlog';
  const last = await Task.findOne({ project: req.project._id, status: column })
    .sort({ order: -1 })
    .select('order');

  const task = await Task.create({
    project: req.project._id,
    sprint: sprint || null,
    reference: `${req.project.key}-${req.project.taskCounter}`,
    title: title.trim(),
    description: description || '',
    status: column,
    priority: priority || 'medium',
    assignee: assignee || null,
    reporter: req.user.id,
    dueDate: dueDate ? new Date(dueDate) : null,
    storyPoints: storyPoints ?? 1,
    order: last ? last.order + 1 : 0,
  });

  await task.populate(POPULATE);

  recordActivity({
    projectId: req.project.id,
    taskId: task.id,
    actorId: req.user.id,
    action: 'task.created',
    summary: `created ${task.reference}`,
  });

  emitToProject(req.project.id, 'task:created', { task: task.toJSON() });
  res.status(201).json({ task: task.toJSON() });
});

async function loadTask(req) {
  const task = await Task.findOne({ _id: req.params.taskId, project: req.project._id });
  if (!task) throw new ApiError(404, 'Task not found');
  return task;
}

export const getTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req);
  await task.populate(POPULATE);
  res.json({ task: task.toJSON() });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req);
  const { title, description, status, priority, assignee, sprint, dueDate, storyPoints } =
    req.body;

  /**
   * Optimistic concurrency. Two people editing the same card previously meant
   * the slower save silently overwrote the faster one — a lost update with no
   * indication anything had gone wrong. When the client sends the version it
   * read, a mismatch is reported as a conflict instead.
   *
   * Optimistic rather than locking: edit collisions on one card are rare, and
   * holding a lock across a user's think-time would be far worse than
   * occasionally asking someone to reapply a change.
   */
  if (req.body.version !== undefined && req.body.version !== task.__v) {
    throw new ApiError(
      409,
      'This task was changed by someone else while you were editing. Reload to see the latest version, then reapply your change.',
      { code: 'STALE_VERSION', currentVersion: task.__v, yourVersion: req.body.version }
    );
  }

  // Snapshot before mutation so the audit entry records what actually changed.
  const before = task.toObject();

  if (title !== undefined) task.title = title.trim();
  if (description !== undefined) task.description = description;
  if (priority !== undefined) task.priority = priority;
  if (storyPoints !== undefined) task.storyPoints = storyPoints;
  if (req.body.actualPoints !== undefined) task.actualPoints = req.body.actualPoints;
  if (sprint !== undefined) task.sprint = sprint || null;
  if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;

  if (assignee !== undefined) {
    if (assignee && !req.project.hasMember(assignee)) {
      throw new ApiError(400, 'Cannot assign a task to a non-member of this project');
    }
    task.assignee = assignee || null;
  }

  if (status !== undefined && status !== task.status) {
    if (!TASK_STATUSES.includes(status)) {
      throw new ApiError(400, `Status must be one of: ${TASK_STATUSES.join(', ')}`);
    }
    const last = await Task.findOne({ project: req.project._id, status })
      .sort({ order: -1 })
      .select('order');
    task.status = status;
    task.order = last ? last.order + 1 : 0;
  }

  await task.save();

  const changes = diffTask(before, task.toObject());
  if (changes.length) {
    recordActivity({
      projectId: req.project.id,
      taskId: task.id,
      actorId: req.user.id,
      action: changes.some((c) => c.field === 'assignee') ? 'task.assigned' : 'task.updated',
      summary: summariseChanges(task.reference, changes),
      changes,
    });
  }

  await task.populate(POPULATE);

  emitToProject(req.project.id, 'task:updated', { task: task.toJSON() });
  res.json({ task: task.toJSON() });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req);
  const { reference } = task;
  await task.deleteOne();

  recordActivity({
    projectId: req.project.id,
    actorId: req.user.id,
    action: 'task.deleted',
    summary: `deleted ${reference}`,
  });

  emitToProject(req.project.id, 'task:deleted', { taskId: task.id });
  res.json({ message: 'Task deleted' });
});

/**
 * Persists a drag-and-drop gesture.
 *
 * The client sends the destination column plus the full ordered list of task
 * ids now in it. Rewriting the whole column in one shot keeps the stored order
 * consistent even if two people drag at the same time — last write wins on a
 * complete, self-consistent list rather than on a partial index shuffle.
 */
export const moveTask = asyncHandler(async (req, res) => {
  const { status, orderedIds } = req.body;
  const task = await loadTask(req);

  if (!TASK_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw new ApiError(400, 'orderedIds must be a non-empty array of task ids');
  }
  if (!orderedIds.includes(task.id)) {
    throw new ApiError(400, 'orderedIds must contain the task being moved');
  }

  const previousStatus = task.status;

  task.status = status;
  await task.save(); // saved first so the completedAt hook runs

  if (previousStatus !== status) {
    recordActivity({
      projectId: req.project.id,
      taskId: task.id,
      actorId: req.user.id,
      action: 'task.moved',
      summary: summariseChanges(task.reference, [
        { field: 'status', from: previousStatus, to: status },
      ]),
      changes: [{ field: 'status', from: previousStatus, to: status }],
    });
  }

  await Task.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, project: req.project._id },
        update: { $set: { order: index, status } },
      },
    }))
  );

  const tasks = await Task.find({ project: req.project._id })
    .populate(POPULATE)
    .sort({ status: 1, order: 1 });

  emitToProject(req.project.id, 'board:reordered', {
    tasks: tasks.map((t) => t.toJSON()),
  });
  res.json({ tasks: tasks.map((t) => t.toJSON()) });
});
