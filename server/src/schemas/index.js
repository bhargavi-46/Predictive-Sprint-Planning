import { z } from 'zod';
import { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import { RISK_CATEGORIES, RISK_STATUSES } from '../models/Risk.js';

/** A 24-character hex Mongo ObjectId. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

/**
 * An id, an empty string, or null.
 *
 * `undefined` is preserved rather than collapsed into `null`, because the two
 * mean different things on a PATCH: absent means "leave this field alone",
 * while an explicit null or "" means "clear it". Collapsing them made every
 * partial update silently wipe the fields it did not mention.
 */
const nullableId = z
  .union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '' ? null : v));

const isoDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.literal(''), z.null()])
  .optional()
  .transform((v) =>
    v === undefined ? undefined : v === '' || v === null ? null : new Date(v)
  );

// ------------------------------------------------------------------- auth
export const registerBody = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// --------------------------------------------------------------- projects
export const createProjectBody = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(6)
    .regex(/^[A-Z][A-Z0-9]*$/, 'Key must start with a letter and contain only letters and digits')
    .optional(),
  description: z.string().trim().max(500).optional().default(''),
});

export const updateProjectBody = createProjectBody.partial();

// ---------------------------------------------------------------- sprints
export const createSprintBody = z
  .object({
    name: z.string().trim().min(1, 'Sprint name is required').max(120),
    goal: z.string().trim().max(500).optional().default(''),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((s) => s.endDate > s.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });

export const updateSprintBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    goal: z.string().trim().max(500).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    status: z.enum(['planned', 'active', 'completed']).optional(),
  })
  .refine((s) => !s.startDate || !s.endDate || s.endDate > s.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });

// ------------------------------------------------------------------ tasks
export const createTaskBody = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().trim().max(2000).optional().default(''),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: nullableId,
  sprint: nullableId,
  dueDate: isoDate,
  storyPoints: z.coerce.number().int().min(0).max(100).optional(),
});

export const updateTaskBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: nullableId,
  sprint: nullableId,
  dueDate: isoDate,
  storyPoints: z.coerce.number().int().min(0).max(100).optional(),
  actualPoints: z.coerce.number().int().min(0).max(100).nullable().optional(),
  // Optimistic-concurrency token; see middleware/concurrency.js.
  version: z.coerce.number().int().min(0).optional(),
});

export const moveTaskBody = z.object({
  status: z.enum(TASK_STATUSES),
  orderedIds: z
    .array(objectId)
    .min(1, 'orderedIds must contain at least one task id')
    .max(500, 'Too many tasks in one reorder'),
});

export const addDependencyBody = z.object({
  dependsOn: objectId,
});

/** Board filters. Everything optional; absent means "no filter". */
export const listTasksQuery = z.object({
  sprint: z.union([objectId, z.literal('backlog')]).optional(),
  assignee: objectId.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  q: z.string().trim().max(120).optional(),
  blocked: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  cursor: objectId.optional(),
});

// ------------------------------------------------------------------ risks
export const createRiskBody = z.object({
  title: z.string().trim().min(1, 'Risk title is required').max(200),
  description: z.string().trim().max(1000).optional().default(''),
  category: z.enum(RISK_CATEGORIES).optional(),
  probability: z.coerce.number().int().min(1).max(5),
  impact: z.coerce.number().int().min(1).max(5),
  mitigation: z.string().trim().max(1000).optional().default(''),
  relatedTasks: z.array(objectId).max(50).optional(),
});

export const updateRiskBody = createRiskBody.partial().extend({
  status: z.enum(RISK_STATUSES).optional(),
});

// --------------------------------------------------------------- comments
export const commentBody = z.object({
  body: z.string().trim().min(1, 'A comment cannot be empty').max(5000),
});

export const commentParams = z.object({
  projectId: objectId,
  taskId: objectId,
  commentId: objectId,
});

// --------------------------------------------------------------- activity
export const listActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: objectId.optional(),
  task: objectId.optional(),
  actor: objectId.optional(),
  action: z.string().max(40).optional(),
});

// ----------------------------------------------------------------- params
export const projectParams = z.object({ projectId: objectId });
export const taskParams = z.object({ projectId: objectId, taskId: objectId });
export const sprintParams = z.object({ projectId: objectId, sprintId: objectId });
export const riskParams = z.object({ projectId: objectId, riskId: objectId });
export const dependencyParams = z.object({
  projectId: objectId,
  taskId: objectId,
  dependencyId: objectId,
});
export const memberParams = z.object({ projectId: objectId, userId: objectId });
