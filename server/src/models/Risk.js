import mongoose from 'mongoose';

export const RISK_STATUSES = ['open', 'mitigating', 'closed'];
export const RISK_CATEGORIES = [
  'technical',
  'schedule',
  'resource',
  'external',
  'quality',
];

const riskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Risk title is required'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    category: { type: String, enum: RISK_CATEGORIES, default: 'technical' },

    // Classic 1-5 qualitative scales, as used in the PMBOK risk matrix.
    probability: { type: Number, min: 1, max: 5, required: true },
    impact: { type: Number, min: 1, max: 5, required: true },

    status: { type: String, enum: RISK_STATUSES, default: 'open', index: true },
    mitigation: { type: String, trim: true, maxlength: 1000, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Risks are far more actionable when tied to the work they threaten.
    relatedTasks: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
      default: [],
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

/** Risk exposure score (1-25). Ranks what threatens delivery most. */
riskSchema.virtual('score').get(function score() {
  return this.probability * this.impact;
});

/** Banding used for the colour-coded risk matrix in the UI. */
riskSchema.virtual('severity').get(function severity() {
  const s = this.probability * this.impact;
  if (s >= 15) return 'critical';
  if (s >= 8) return 'high';
  if (s >= 4) return 'medium';
  return 'low';
});

riskSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('Risk', riskSchema);
