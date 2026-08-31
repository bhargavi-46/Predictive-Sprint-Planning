import Comment from '../models/Comment.js';
import Task from '../models/Task.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { emitToProject } from '../sockets/index.js';
import { recordActivity } from '../services/activityLog.js';

const AUTHOR = { path: 'author', select: 'name email' };

async function loadTask(req) {
  const task = await Task.findOne({ _id: req.params.taskId, project: req.project._id });
  if (!task) throw new ApiError(404, 'Task not found');
  return task;
}

/** GET /projects/:projectId/tasks/:taskId/comments */
export const listComments = asyncHandler(async (req, res) => {
  await loadTask(req);
  const comments = await Comment.find({ task: req.params.taskId })
    .populate(AUTHOR)
    .sort({ createdAt: 1 });

  res.json({ comments: comments.map((c) => c.toJSON()) });
});

/** POST /projects/:projectId/tasks/:taskId/comments */
export const createComment = asyncHandler(async (req, res) => {
  const task = await loadTask(req);

  const comment = await Comment.create({
    task: task._id,
    project: req.project._id,
    author: req.user.id,
    body: req.body.body,
  });

  await comment.populate(AUTHOR);

  recordActivity({
    projectId: req.project.id,
    taskId: task.id,
    actorId: req.user.id,
    action: 'comment.added',
    summary: `commented on ${task.reference}`,
  });

  emitToProject(req.project.id, 'comment:created', {
    taskId: task.id,
    comment: comment.toJSON(),
  });

  res.status(201).json({ comment: comment.toJSON() });
});

/**
 * PATCH /projects/:projectId/tasks/:taskId/comments/:commentId
 * Only the author may edit their own comment.
 */
export const updateComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({
    _id: req.params.commentId,
    task: req.params.taskId,
  });
  if (!comment) throw new ApiError(404, 'Comment not found');

  if (comment.author.toString() !== req.user.id) {
    throw new ApiError(403, 'You can only edit your own comments');
  }

  comment.body = req.body.body;
  comment.editedAt = new Date();
  await comment.save();
  await comment.populate(AUTHOR);

  emitToProject(req.project.id, 'comment:updated', {
    taskId: req.params.taskId,
    comment: comment.toJSON(),
  });

  res.json({ comment: comment.toJSON() });
});

/**
 * DELETE /projects/:projectId/tasks/:taskId/comments/:commentId
 * The author or the project owner may delete.
 */
export const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({
    _id: req.params.commentId,
    task: req.params.taskId,
  });
  if (!comment) throw new ApiError(404, 'Comment not found');

  const isAuthor = comment.author.toString() === req.user.id;
  if (!isAuthor && !req.project.isOwner(req.user.id)) {
    throw new ApiError(403, 'You can only delete your own comments');
  }

  await comment.deleteOne();

  emitToProject(req.project.id, 'comment:deleted', {
    taskId: req.params.taskId,
    commentId: req.params.commentId,
  });

  res.json({ message: 'Comment deleted' });
});
