import Sprint from '../models/Sprint.js';
import Task from '../models/Task.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { emitToProject } from '../sockets/index.js';

export const listSprints = asyncHandler(async (req, res) => {
  const sprints = await Sprint.find({ project: req.project._id }).sort({ startDate: 1 });

  const withCounts = await Promise.all(
    sprints.map(async (s) => {
      const [total, done] = await Promise.all([
        Task.countDocuments({ sprint: s._id }),
        Task.countDocuments({ sprint: s._id, status: 'done' }),
      ]);
      return { ...s.toJSON(), stats: { total, done } };
    })
  );

  res.json({ sprints: withCounts });
});

export const createSprint = asyncHandler(async (req, res) => {
  const { name, goal, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) {
    throw new ApiError(400, 'Sprint name, start date and end date are required');
  }

  const sprint = await Sprint.create({
    project: req.project._id,
    name: name.trim(),
    goal: goal || '',
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });

  emitToProject(req.project.id, 'sprint:created', { sprint: sprint.toJSON() });
  res.status(201).json({ sprint: sprint.toJSON() });
});

async function loadSprint(req) {
  const sprint = await Sprint.findOne({
    _id: req.params.sprintId,
    project: req.project._id,
  });
  if (!sprint) throw new ApiError(404, 'Sprint not found');
  return sprint;
}

export const updateSprint = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const { name, goal, startDate, endDate, status } = req.body;

  if (name !== undefined) sprint.name = name.trim();
  if (goal !== undefined) sprint.goal = goal;
  if (startDate !== undefined) sprint.startDate = new Date(startDate);
  if (endDate !== undefined) sprint.endDate = new Date(endDate);

  if (status !== undefined) {
    // Only one sprint may be active at a time — that is what makes a
    // burndown chart meaningful.
    if (status === 'active') {
      await Sprint.updateMany(
        { project: req.project._id, status: 'active', _id: { $ne: sprint._id } },
        { $set: { status: 'completed', completedAt: new Date() } }
      );

      // Freeze the commitment baseline on first activation. Re-activating a
      // sprint must NOT re-capture it, or the creep measured so far would be
      // silently erased — the baseline has to stay the original promise.
      if (!sprint.commitment?.capturedAt) {
        const committed = await Task.find({ sprint: sprint._id });
        sprint.commitment = {
          capturedAt: new Date(),
          taskIds: committed.map((t) => t._id),
          totalPoints: committed.reduce((s, t) => s + (t.storyPoints || 0), 0),
          pointsByTask: new Map(committed.map((t) => [t.id, t.storyPoints || 0])),
        };
      }
    }
    sprint.status = status;
    sprint.completedAt = status === 'completed' ? new Date() : null;
  }

  await sprint.save();
  emitToProject(req.project.id, 'sprint:updated', { sprint: sprint.toJSON() });
  res.json({ sprint: sprint.toJSON() });
});

export const deleteSprint = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);

  // Return the sprint's tasks to the backlog rather than deleting work.
  await Task.updateMany({ sprint: sprint._id }, { $set: { sprint: null } });
  await sprint.deleteOne();

  emitToProject(req.project.id, 'sprint:deleted', { sprintId: sprint.id });
  res.json({ message: 'Sprint deleted; its tasks were returned to the backlog' });
});

/**
 * Burndown data: for each day of the sprint, how many story points remained
 * open at end of day, next to the ideal straight-line trend.
 */
export const getBurndown = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const tasks = await Task.find({ sprint: sprint._id });

  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(sprint.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(sprint.endDate);
  end.setHours(23, 59, 59, 999);

  const days = Math.max(1, Math.round((end - start) / msPerDay));
  const today = new Date();

  const points = [];
  for (let i = 0; i <= days; i += 1) {
    const dayEnd = new Date(start.getTime() + i * msPerDay);
    dayEnd.setHours(23, 59, 59, 999);

    const burned = tasks
      .filter((t) => t.completedAt && t.completedAt <= dayEnd)
      .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    points.push({
      date: dayEnd.toISOString().slice(0, 10),
      ideal: Number((totalPoints * (1 - i / days)).toFixed(1)),
      // Stop plotting the actual line beyond today, otherwise the chart
      // would imply future days are already at zero.
      remaining: dayEnd <= today ? totalPoints - burned : null,
    });
  }

  const completedPoints = tasks
    .filter((t) => t.status === 'done')
    .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  res.json({
    sprint: sprint.toJSON(),
    burndown: points,
    summary: {
      totalPoints,
      completedPoints,
      remainingPoints: totalPoints - completedPoints,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'done').length,
      percentComplete: totalPoints ? Math.round((completedPoints / totalPoints) * 100) : 0,
    },
  });
});
