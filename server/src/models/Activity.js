import mongoose from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'task.created',
  'task.updated',
  'task.moved',
  'task.deleted',
  'task.assigned',
  'dependency.added',
  'dependency.removed',
  'comment.added',
  'sprint.created',
  'sprint.started',
  'sprint.completed',
  'risk.created',
];

/**
 * Append-only audit trail.
 *
 * Answers "who changed this, and when" — the question every team eventually
 * asks about a task that moved unexpectedly, and the one thing a board without
 * history can never answer. Entries are never updated or deleted; correcting a
 * mistake means recording the correction, not rewriting the past.
 *
 * `changes` holds only the fields that actually differed, as before/after
 * pairs, so the log stays readable and does not duplicate the whole document
 * on every edit.
 */
const activitySchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },

    // Human-readable summary, rendered directly in the activity feed.
    summary: { type: String, required: true, maxlength: 500 },

    changes: {
      type: [
        {
          _id: false,
          field: String,
          from: mongoose.Schema.Types.Mixed,
          to: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The feed is always read newest-first, scoped to a project or a task.
activitySchema.index({ project: 1, createdAt: -1 });
activitySchema.index({ task: 1, createdAt: -1 });

activitySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Activity', activitySchema);
