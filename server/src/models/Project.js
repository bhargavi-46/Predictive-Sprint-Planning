import mongoose from 'mongoose';

export const PROJECT_ROLES = ['owner', 'member'];

/**
 * A membership row: which user belongs to this project and in what role.
 * Modelled as an embedded sub-document because members are always read
 * together with their project and are never queried independently.
 */
const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: PROJECT_ROLES, default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: 120,
    },
    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 6,
      // Short prefix used to label tasks, e.g. "APM-14".
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    taskCounter: { type: Number, default: 0 }, // drives the APM-1, APM-2, ... sequence
  },
  { timestamps: true }
);

projectSchema.index({ 'members.user': 1 });

/** True when the given user id appears in the member list. */
projectSchema.methods.hasMember = function hasMember(userId) {
  return this.members.some((m) => m.user.toString() === userId.toString());
};

projectSchema.methods.isOwner = function isOwner(userId) {
  return this.owner.toString() === userId.toString();
};

projectSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Project', projectSchema);
