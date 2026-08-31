import Task from '../models/Task.js';
import Sprint from '../models/Sprint.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { analyseCriticalPath, findBlockedTasks } from '../services/criticalPath.js';
import {
  forecastCompletion,
  deriveVelocitySamples,
  workingDaysRemaining,
} from '../services/forecast.js';
import {
  analyseScopeCreep,
  analyseEstimationAccuracy,
} from '../services/scopeAnalysis.js';
import { cacheKey, getCached, setCached } from '../services/cache.js';
import { analyseTeamWorkload } from '../services/teamAnalytics.js';

/**
 * GET /projects/:projectId/sprints/:sprintId/workload
 *
 * Per-member load for capacity planning. See services/teamAnalytics.js for
 * why velocity is not reported per person.
 */
export const getTeamWorkload = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const tasks = await Task.find({ sprint: sprint._id });

  const plain = tasks.map((t) => ({
    id: t.id,
    status: t.status,
    storyPoints: t.storyPoints,
    dueDate: t.dueDate,
    assignee: t.assignee,
    dependsOn: (t.dependsOn || []).map(String),
  }));

  await req.project.populate({ path: 'members.user', select: 'name email' });

  res.json({
    sprint: { id: sprint.id, name: sprint.name },
    ...analyseTeamWorkload(plain, req.project.members),
  });
});

/** Shapes Mongoose docs into the plain objects the services expect. */
function toPlain(tasks) {
  return tasks.map((t) => ({
    id: t.id,
    reference: t.reference,
    title: t.title,
    status: t.status,
    storyPoints: t.storyPoints,
    actualPoints: t.actualPoints,
    completedAt: t.completedAt,
    dependsOn: (t.dependsOn || []).map(String),
  }));
}

async function loadSprint(req) {
  const sprint = await Sprint.findOne({
    _id: req.params.sprintId,
    project: req.project._id,
  });
  if (!sprint) throw new ApiError(404, 'Sprint not found');
  return sprint;
}

/** GET /projects/:projectId/sprints/:sprintId/critical-path */
export const getCriticalPath = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const tasks = await Task.find({ sprint: sprint._id });
  const plain = toPlain(tasks);

  const analysis = analyseCriticalPath(plain);
  const blocked = findBlockedTasks(plain);

  res.json({
    sprint: { id: sprint.id, name: sprint.name },
    ...analysis,
    blockedTasks: blocked,
    summary: {
      totalTasks: plain.length,
      criticalCount: analysis.criticalPath.length,
      blockedCount: blocked.length,
      projectDuration: analysis.projectDuration,
    },
  });
});

/** GET /projects/:projectId/sprints/:sprintId/forecast */
export const getForecast = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const sprintTasks = await Task.find({ sprint: sprint._id });

  const remainingPoints = sprintTasks
    .filter((t) => t.status !== 'done')
    .reduce((s, t) => s + (t.storyPoints || 0), 0);

  // Draw velocity history from the whole project, not just this sprint —
  // a sprint two days old has far too little history to forecast from.
  const completed = await Task.find({
    project: req.project._id,
    status: 'done',
    completedAt: { $ne: null },
  });

  const velocitySamples = deriveVelocitySamples(completed);
  const daysRemaining = workingDaysRemaining(sprint.endDate);

  const forecast = forecastCompletion({
    remainingPoints,
    velocitySamples,
    daysRemaining,
  });

  res.json({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      endDate: sprint.endDate,
      status: sprint.status,
    },
    remainingPoints,
    daysRemaining,
    velocity: {
      samples: velocitySamples,
      mean: velocitySamples.length
        ? Number(
            (velocitySamples.reduce((a, b) => a + b, 0) / velocitySamples.length).toFixed(2)
          )
        : 0,
    },
    forecast,
  });
});

/** GET /projects/:projectId/sprints/:sprintId/scope-creep */
export const getScopeCreep = asyncHandler(async (req, res) => {
  const sprint = await loadSprint(req);
  const tasks = await Task.find({ sprint: sprint._id });

  res.json({
    sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
    scopeCreep: analyseScopeCreep(sprint.commitment, toPlain(tasks)),
  });
});

/** GET /projects/:projectId/estimation-accuracy */
export const getEstimationAccuracy = asyncHandler(async (req, res) => {
  const filter = { project: req.project._id, status: 'done' };
  if (req.query.sprint) filter.sprint = req.query.sprint;

  const tasks = await Task.find(filter);
  res.json({ estimation: analyseEstimationAccuracy(toPlain(tasks)) });
});

/**
 * GET /projects/:projectId/sprints/:sprintId/health
 * One call powering the dashboard, so the UI does not fan out four requests.
 */
export const getSprintHealth = asyncHandler(async (req, res) => {
  const key = cacheKey(req.project.id, 'health', req.params.sprintId);
  const cached = getCached(key);
  if (cached) return res.json(cached);

  const sprint = await loadSprint(req);
  const sprintTasks = await Task.find({ sprint: sprint._id });
  const plain = toPlain(sprintTasks);

  const criticalPath = analyseCriticalPath(plain);
  const blocked = findBlockedTasks(plain);
  const scopeCreep = analyseScopeCreep(sprint.commitment, plain);

  const remainingPoints = plain
    .filter((t) => t.status !== 'done')
    .reduce((s, t) => s + (t.storyPoints || 0), 0);

  const completed = await Task.find({
    project: req.project._id,
    status: 'done',
    completedAt: { $ne: null },
  });

  const forecast = forecastCompletion({
    remainingPoints,
    velocitySamples: deriveVelocitySamples(completed),
    daysRemaining: workingDaysRemaining(sprint.endDate),
  });

  const estimation = analyseEstimationAccuracy(toPlain(completed));

  // Single headline signal for the dashboard banner.
  let riskLevel = 'on-track';
  const reasons = [];

  if (forecast.hasEnoughData && forecast.probabilityOnTime !== null) {
    if (forecast.probabilityOnTime < 50) {
      riskLevel = 'at-risk';
      reasons.push(`Only ${forecast.probabilityOnTime}% likely to finish on time`);
    } else if (forecast.probabilityOnTime < 80) {
      riskLevel = 'caution';
      reasons.push(`${forecast.probabilityOnTime}% likely to finish on time`);
    }
  }
  if (scopeCreep.hasBaseline && scopeCreep.totals.creepPercent > 10) {
    riskLevel = riskLevel === 'at-risk' ? 'at-risk' : 'caution';
    reasons.push(`Scope grew ${scopeCreep.totals.creepPercent}% after commitment`);
  }
  if (blocked.length) {
    reasons.push(`${blocked.length} task(s) blocked by unfinished dependencies`);
  }

  const payload = {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    },
    health: { riskLevel, reasons },
    criticalPath: {
      path: criticalPath.criticalPath,
      duration: criticalPath.projectDuration,
      tasks: criticalPath.tasks,
      hasCycle: criticalPath.hasCycle,
    },
    blockedTasks: blocked,
    scopeCreep,
    forecast,
    estimation,
  };

  // Cached until any write to this project invalidates it (see sockets/index.js).
  setCached(key, req.project.id, payload);
  res.json(payload);
});
