import Activity from '../models/Activity.js';
import { logger } from '../observability/logger.js';

/** Fields worth recording; everything else is noise in a history feed. */
const TRACKED = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  storyPoints: 'story points',
  actualPoints: 'actual points',
  assignee: 'assignee',
  sprint: 'sprint',
  dueDate: 'due date',
};

const STATUS_LABELS = {
  backlog: 'Backlog',
  todo: 'To Do',
  inprogress: 'In Progress',
  done: 'Done',
};

function display(field, value) {
  if (value === null || value === undefined || value === '') return 'empty';
  if (field === 'status') return STATUS_LABELS[value] || value;
  if (field === 'dueDate') return new Date(value).toISOString().slice(0, 10);
  return String(value);
}

/**
 * Compares a task before and after an edit and returns only the fields that
 * actually changed. Ids are stringified first so an ObjectId and its string
 * form are not reported as a difference.
 */
export function diffTask(before, after) {
  const changes = [];

  for (const field of Object.keys(TRACKED)) {
    const a = before[field];
    const b = after[field];

    const norm = (v) =>
      v === null || v === undefined
        ? null
        : v instanceof Date
          ? v.toISOString()
          : typeof v === 'object' && v._id
            ? String(v._id)
            : String(v);

    if (norm(a) !== norm(b)) {
      changes.push({ field, from: norm(a), to: norm(b) });
    }
  }

  return changes;
}

/**
 * Writes one audit entry.
 *
 * Deliberately fire-and-forget: a failure to record history must never break
 * the operation the user actually asked for. Failures are logged so a broken
 * audit trail is still visible in monitoring rather than silently empty.
 */
export function recordActivity({ projectId, taskId = null, actorId, action, summary, changes = [] }) {
  Activity.create({
    project: projectId,
    task: taskId,
    actor: actorId,
    action,
    summary: summary.slice(0, 500),
    changes,
  }).catch((err) => {
    logger.error({ err, action, projectId }, 'failed to record activity');
  });
}

/** Builds the sentence shown in the feed for a set of task field changes. */
export function summariseChanges(reference, changes) {
  if (!changes.length) return `updated ${reference}`;

  if (changes.length === 1) {
    const { field, from, to } = changes[0];
    const label = TRACKED[field] || field;

    if (field === 'status') {
      return `moved ${reference} from ${display(field, from)} to ${display(field, to)}`;
    }
    if (field === 'assignee') {
      return to === null ? `unassigned ${reference}` : `reassigned ${reference}`;
    }
    return `changed ${label} on ${reference} from ${display(field, from)} to ${display(field, to)}`;
  }

  const names = changes.map((c) => TRACKED[c.field] || c.field);
  const last = names.pop();
  return `updated ${names.join(', ')} and ${last} on ${reference}`;
}
