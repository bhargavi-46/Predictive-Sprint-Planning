import { useEffect, useState } from 'react';
import { Modal, ErrorNote } from './ui';
import { api } from '../api/client';
import TaskActivity from './TaskActivity';

const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const blank = {
  title: '', description: '', status: 'backlog', priority: 'medium',
  assignee: '', sprint: '', dueDate: '', storyPoints: 1,
};

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

/**
 * Create/edit dialog. `task` null means create mode; `defaultStatus` seeds the
 * column the user clicked "+ Add task" in.
 */
export default function TaskDialog({
  open, task, defaultStatus, members, sprints, projectId, allTasks, currentUserId,
  onClose, onSave, onDelete, onDependencyChange,
}) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [deps, setDeps] = useState([]);
  const [depPick, setDepPick] = useState('');
  const [depBusy, setDepBusy] = useState(false);
  const [depError, setDepError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      task
        ? {
            title: task.title,
            description: task.description || '',
            status: task.status,
            priority: task.priority,
            assignee: task.assignee?.id || '',
            sprint: task.sprint || '',
            dueDate: toDateInput(task.dueDate),
            storyPoints: task.storyPoints ?? 1,
          }
        : { ...blank, status: defaultStatus || 'backlog' }
    );
    setDeps(task?.dependsOn || []);
    setDepPick('');
    setDepError('');
  }, [open, task, defaultStatus]);

  const addDependency = async () => {
    if (!depPick) return;
    setDepBusy(true);
    setDepError('');
    try {
      const { task: updated } = await api.addDependency(projectId, task.id, depPick);
      setDeps(updated.dependsOn || []);
      setDepPick('');
      onDependencyChange?.(updated);
    } catch (err) {
      setDepError(err.message);
    } finally {
      setDepBusy(false);
    }
  };

  const removeDependency = async (dependencyId) => {
    setDepBusy(true);
    setDepError('');
    try {
      const { task: updated } = await api.removeDependency(projectId, task.id, dependencyId);
      setDeps(updated.dependsOn || []);
      onDependencyChange?.(updated);
    } catch (err) {
      setDepError(err.message);
    } finally {
      setDepBusy(false);
    }
  };

  const depCandidates = (allTasks || []).filter(
    (t) => t.id !== task?.id && !deps.some((d) => d.id === t.id)
  );

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        ...form,
        assignee: form.assignee || null,
        sprint: form.sprint || null,
        dueDate: form.dueDate || null,
        storyPoints: Number(form.storyPoints),
        // Send the version we loaded so the server can reject the save if
        // someone else edited this task in the meantime.
        ...(task ? { version: task.version } : {}),
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${task.reference}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await onDelete(task);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal
      open={open}
      title={task ? `Edit ${task.reference}` : 'New task'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <button type="button" onClick={remove} disabled={busy}
                    className="btn-danger mr-auto">
              Delete
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="task-form" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <ErrorNote message={error} />

        <div>
          <label className="label" htmlFor="t-title">Title</label>
          <input id="t-title" required autoFocus className="input"
                 value={form.title} onChange={set('title')} />
        </div>

        <div>
          <label className="label" htmlFor="t-desc">Description</label>
          <textarea id="t-desc" rows={3} className="input"
                    value={form.description} onChange={set('description')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="t-status">Status</label>
            <select id="t-status" className="input" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="t-priority">Priority</label>
            <select id="t-priority" className="input" value={form.priority}
                    onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="t-assignee">Assignee</label>
            <select id="t-assignee" className="input" value={form.assignee}
                    onChange={set('assignee')}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="t-sprint">Sprint</label>
            <select id="t-sprint" className="input" value={form.sprint} onChange={set('sprint')}>
              <option value="">Backlog (no sprint)</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="t-due">Due date</label>
            <input id="t-due" type="date" className="input"
                   value={form.dueDate} onChange={set('dueDate')} />
          </div>
          <div>
            <label className="label" htmlFor="t-points">Story points</label>
            <input id="t-points" type="number" min="0" max="100" className="input"
                   value={form.storyPoints} onChange={set('storyPoints')} />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="label">Dependencies (blocked by)</label>

          {!task ? (
            <p className="text-xs text-slate-500">
              Save this task first, then reopen it to link dependencies.
            </p>
          ) : (
            <>
              <ErrorNote message={depError} />

              {deps.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Not blocked by anything. This task can start any time.
                </p>
              ) : (
                <ul className="space-y-1">
                  {deps.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded border
                                 border-slate-200 bg-slate-50 px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">
                        <span className="font-mono text-xs text-slate-500">{d.reference}</span>{' '}
                        {d.title}{' '}
                        <span className="text-xs text-slate-400">({d.status})</span>
                      </span>
                      <button
                        type="button"
                        disabled={depBusy}
                        onClick={() => removeDependency(d.id)}
                        className="shrink-0 text-xs text-slate-400 hover:text-rust"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex gap-2">
                <select
                  className="input flex-1"
                  value={depPick}
                  onChange={(e) => setDepPick(e.target.value)}
                  disabled={depBusy || depCandidates.length === 0}
                >
                  <option value="">
                    {depCandidates.length === 0 ? 'No other tasks to link' : 'Select a task…'}
                  </option>
                  {depCandidates.map((t) => (
                    <option key={t.id} value={t.id}>{t.reference} — {t.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  disabled={depBusy || !depPick}
                  onClick={addDependency}
                >
                  Add
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                This task will be blocked until everything above is Done.
              </p>
            </>
          )}
        </div>
      </form>

      {task && (
        <TaskActivity
          projectId={projectId}
          taskId={task.id}
          currentUserId={currentUserId}
        />
      )}
    </Modal>
  );
}
