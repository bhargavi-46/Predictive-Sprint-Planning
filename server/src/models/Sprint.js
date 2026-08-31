import mongoose from 'mongoose';

export const SPRINT_STATUSES = ['planned', 'active', 'completed'];

const sprintSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Sprint name is required'],
      trim: true,
      maxlength: 120,
    },
    goal: { type: String, trim: true, maxlength: 300, default: '' },
    startDate: { type: Date, required: [true, 'Sprint start date is required'] },
    endDate: { type: Date, required: [true, 'Sprint end date is required'] },
    status: { type: String, enum: SPRINT_STATUSES, default: 'planned' },
    completedAt: { type: Date, default: null },

    /**
     * Immutable snapshot of what the team committed to when the sprint was
     * started. Scope creep is measured strictly against this baseline: without
     * a frozen reference point, "work added mid-sprint" cannot be detected at
     * all, because the current task list always looks like the plan.
     */
    commitment: {
      capturedAt: { type: Date, default: null },
      taskIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
        default: [],
      },
      totalPoints: { type: Number, default: 0 },
      // Per-task points at capture time, so re-estimation is detectable too.
      pointsByTask: { type: Map, of: Number, default: undefined },
    },
  },
  { timestamps: true }
);

// A sprint that ends before it starts is always a data-entry mistake.
// invalidate() (rather than next(new Error(...))) makes this a proper
// ValidationError, so the API reports 400 instead of 500.
sprintSchema.pre('validate', function validateDateRange(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Sprint end date must fall on or after the start date');
  }
  next();
});

/** Total number of calendar days the sprint spans, inclusive of both ends. */
sprintSchema.virtual('durationDays').get(function durationDays() {
  if (!this.startDate || !this.endDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((this.endDate - this.startDate) / msPerDay) + 1;
});

sprintSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Sprint', sprintSchema);
