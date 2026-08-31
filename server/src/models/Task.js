import mongoose from 'mongoose';

export const TASK_STATUSES = ['backlog', 'todo', 'inprogress', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];

const taskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    sprint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null, // null => the task sits in the product backlog
      index: true,
    },
    reference: { type: String, required: true }, // e.g. "APM-14"
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: TASK_STATUSES, default: 'backlog', index: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    storyPoints: { type: Number, min: 0, max: 100, default: 1 },

    // Effort actually taken, recorded when the task is completed. Comparing
    // this against storyPoints is what drives estimation-accuracy analysis.
    actualPoints: { type: Number, min: 0, max: 100, default: null },

    /**
     * Tasks that must finish before this one can start ("blocked by").
     * Together these edges form the directed acyclic graph that the
     * critical-path calculation walks. Cycles are rejected at the API layer.
     */
    dependsOn: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
      default: [],
    },

    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },

    // Position within its Kanban column. Drag-and-drop rewrites this value.
    order: { type: Number, default: 0 },

    // Stamped when the task first reaches "done"; drives the burndown chart.
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Expose Mongoose's internal revision counter as `version` so clients can
    // send it back for optimistic-concurrency checks on edit.
    optimisticConcurrency: true,
  }
);

taskSchema.index({ project: 1, status: 1, order: 1 });
// Board filters query by assignee and by due date; both are common enough to index.
taskSchema.index({ project: 1, assignee: 1 });
taskSchema.index({ project: 1, dueDate: 1 });
// Backs the free-text search on the board.
taskSchema.index({ title: 'text', description: 'text' });

/**
 * Keep `completedAt` consistent with `status` on every write, so the
 * burndown calculation can trust it as the single source of truth.
 */
taskSchema.pre('save', function syncCompletedAt(next) {
  if (this.isModified('status')) {
    if (this.status === 'done' && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== 'done') {
      this.completedAt = null;
    }
  }
  next();
});

taskSchema.virtual('isOverdue').get(function isOverdue() {
  if (!this.dueDate || this.status === 'done') return false;
  return this.dueDate < new Date();
});

taskSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    // __v is the concurrency token. Surface it under a meaningful name rather
    // than leaking Mongoose's internal field to API consumers.
    ret.version = ret.__v;
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Task', taskSchema);
