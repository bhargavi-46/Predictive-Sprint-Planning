import mongoose from 'mongoose';

/**
 * A discussion entry on a task.
 *
 * Stored in its own collection rather than embedded in the task: comment
 * volume is unbounded and unrelated to how often a task is read, so embedding
 * would grow every board query for data the board never displays.
 */
const commentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: {
      type: String,
      required: [true, 'A comment cannot be empty'],
      trim: true,
      maxlength: 5000,
    },
    // Set the first time the body changes, so "edited" can be shown honestly.
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

commentSchema.index({ task: 1, createdAt: 1 });

commentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Comment', commentSchema);
