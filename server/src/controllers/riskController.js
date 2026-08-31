import Risk from '../models/Risk.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { emitToProject } from '../sockets/index.js';

const POPULATE = [
  { path: 'owner', select: 'name email' },
  { path: 'createdBy', select: 'name email' },
  { path: 'relatedTasks', select: 'reference title status' },
];

export const listRisks = asyncHandler(async (req, res) => {
  const filter = { project: req.project._id };
  if (req.query.status) filter.status = req.query.status;

  const risks = await Risk.find(filter).populate(POPULATE);

  // Highest exposure first — the register is only useful if it is ranked.
  const sorted = risks
    .map((r) => r.toJSON())
    .sort((a, b) => b.score - a.score);

  const open = sorted.filter((r) => r.status !== 'closed');

  res.json({
    risks: sorted,
    summary: {
      total: sorted.length,
      open: open.length,
      critical: open.filter((r) => r.severity === 'critical').length,
      high: open.filter((r) => r.severity === 'high').length,
      totalExposure: open.reduce((s, r) => s + r.score, 0),
    },
  });
});

export const createRisk = asyncHandler(async (req, res) => {
  const { title, description, category, probability, impact, mitigation, owner, relatedTasks } =
    req.body;

  if (!title || !title.trim()) throw new ApiError(400, 'Risk title is required');
  if (!probability || !impact) {
    throw new ApiError(400, 'Both probability and impact are required (1-5)');
  }
  if (owner && !req.project.hasMember(owner)) {
    throw new ApiError(400, 'The risk owner must be a member of this project');
  }

  const risk = await Risk.create({
    project: req.project._id,
    title: title.trim(),
    description: description || '',
    category: category || 'technical',
    probability,
    impact,
    mitigation: mitigation || '',
    owner: owner || null,
    relatedTasks: relatedTasks || [],
    createdBy: req.user.id,
  });

  await risk.populate(POPULATE);
  emitToProject(req.project.id, 'risk:created', { risk: risk.toJSON() });
  res.status(201).json({ risk: risk.toJSON() });
});

export const updateRisk = asyncHandler(async (req, res) => {
  const risk = await Risk.findOne({ _id: req.params.riskId, project: req.project._id });
  if (!risk) throw new ApiError(404, 'Risk not found');

  const fields = [
    'title', 'description', 'category', 'probability',
    'impact', 'status', 'mitigation', 'relatedTasks',
  ];
  for (const field of fields) {
    if (req.body[field] !== undefined) risk[field] = req.body[field];
  }

  if (req.body.owner !== undefined) {
    if (req.body.owner && !req.project.hasMember(req.body.owner)) {
      throw new ApiError(400, 'The risk owner must be a member of this project');
    }
    risk.owner = req.body.owner || null;
  }

  await risk.save();
  await risk.populate(POPULATE);

  emitToProject(req.project.id, 'risk:updated', { risk: risk.toJSON() });
  res.json({ risk: risk.toJSON() });
});

export const deleteRisk = asyncHandler(async (req, res) => {
  const risk = await Risk.findOne({ _id: req.params.riskId, project: req.project._id });
  if (!risk) throw new ApiError(404, 'Risk not found');

  await risk.deleteOne();
  emitToProject(req.project.id, 'risk:deleted', { riskId: risk.id });
  res.json({ message: 'Risk deleted' });
});
