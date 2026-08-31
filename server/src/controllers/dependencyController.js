import Task from '../models/Task.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { wouldCreateCycle } from '../services/criticalPath.js';
import { emitToProject } from '../sockets/index.js';

/**
 * POST /projects/:projectId/tasks/:taskId/dependencies
 * Body: { dependsOn: "<taskId>" }
 *
 * Adds "this task is blocked by that one". Rejected when it would close a
 * cycle, because a cyclic graph has no topological order and the critical
 * path becomes undefined.
 */
export const addDependency = asyncHandler(async (req, res) => {
  const { dependsOn } = req.body;
  if (!dependsOn) throw new ApiError(400, 'A dependsOn task id is required');

  const task = await Task.findOne({ _id: req.params.taskId, project: req.project._id });
  if (!task) throw new ApiError(404, 'Task not found');

  const dependency = await Task.findOne({ _id: dependsOn, project: req.project._id });
  if (!dependency) throw new ApiError(404, 'The task it depends on was not found');

  if (task.id === dependency.id) {
    throw new ApiError(400, 'A task cannot depend on itself');
  }
  if (task.dependsOn.map(String).includes(dependency.id)) {
    throw new ApiError(409, 'That dependency already exists');
  }

  const all = await Task.find({ project: req.project._id }).select('dependsOn');
  const plain = all.map((t) => ({ id: t.id, dependsOn: t.dependsOn.map(String) }));

  if (wouldCreateCycle(plain, task.id, dependency.id)) {
    throw new ApiError(
      409,
      `Adding this dependency would create a circular chain: ${dependency.reference} ` +
        `already depends on ${task.reference}, directly or indirectly.`
    );
  }

  task.dependsOn.push(dependency._id);
  await task.save();
  await task.populate([
    { path: 'assignee', select: 'name email' },
    { path: 'dependsOn', select: 'reference title status' },
  ]);

  emitToProject(req.project.id, 'task:updated', { task: task.toJSON() });
  res.status(201).json({ task: task.toJSON() });
});

/** DELETE /projects/:projectId/tasks/:taskId/dependencies/:dependencyId */
export const removeDependency = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.taskId, project: req.project._id });
  if (!task) throw new ApiError(404, 'Task not found');

  const before = task.dependsOn.length;
  task.dependsOn = task.dependsOn.filter(
    (d) => d.toString() !== req.params.dependencyId
  );

  if (task.dependsOn.length === before) {
    throw new ApiError(404, 'That dependency is not set on this task');
  }

  await task.save();
  await task.populate([
    { path: 'assignee', select: 'name email' },
    { path: 'dependsOn', select: 'reference title status' },
  ]);

  emitToProject(req.project.id, 'task:updated', { task: task.toJSON() });
  res.json({ task: task.toJSON() });
});

/**
 * GET /projects/:projectId/dependency-graph
 * Nodes and edges for the dependency visualisation.
 */
export const getDependencyGraph = asyncHandler(async (req, res) => {
  const filter = { project: req.project._id };
  if (req.query.sprint) filter.sprint = req.query.sprint;

  const tasks = await Task.find(filter).select(
    'reference title status storyPoints dependsOn'
  );

  const ids = new Set(tasks.map((t) => t.id));
  const edges = [];

  for (const task of tasks) {
    for (const dep of task.dependsOn.map(String)) {
      // Only draw edges whose both ends are in the requested scope.
      if (ids.has(dep)) edges.push({ from: dep, to: task.id });
    }
  }

  res.json({
    nodes: tasks.map((t) => ({
      id: t.id,
      reference: t.reference,
      title: t.title,
      status: t.status,
      storyPoints: t.storyPoints,
    })),
    edges,
  });
});
