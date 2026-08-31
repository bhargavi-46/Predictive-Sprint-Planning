import Activity from '../models/Activity.js';
import { asyncHandler } from '../middleware/error.js';

const ACTOR = { path: 'actor', select: 'name email' };
const TASK = { path: 'task', select: 'reference title' };

/**
 * GET /projects/:projectId/activity
 *
 * Project-wide audit feed, newest first. Cursor paginated on `_id` rather than
 * skip/limit: skip re-scans everything it skips, and on an append-only feed a
 * new entry arriving mid-scroll would shift every subsequent page.
 */
export const listActivity = asyncHandler(async (req, res) => {
  const { limit = 50, cursor, task, actor, action } = req.query;

  const filter = { project: req.project._id };
  if (task) filter.task = task;
  if (actor) filter.actor = actor;
  if (action) filter.action = action;
  // Ids are monotonic, so "older than the last one seen" is a range query.
  if (cursor) filter._id = { $lt: cursor };

  const entries = await Activity.find(filter)
    .populate(ACTOR)
    .populate(TASK)
    .sort({ _id: -1 })
    .limit(limit + 1);

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;

  res.json({
    activity: page.map((a) => a.toJSON()),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});

/** GET /projects/:projectId/tasks/:taskId/activity */
export const listTaskActivity = asyncHandler(async (req, res) => {
  const entries = await Activity.find({
    project: req.project._id,
    task: req.params.taskId,
  })
    .populate(ACTOR)
    .sort({ _id: -1 })
    .limit(100);

  res.json({ activity: entries.map((a) => a.toJSON()) });
});
