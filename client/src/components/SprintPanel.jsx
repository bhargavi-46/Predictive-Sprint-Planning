import { useState } from 'react';
import { api } from '../api/client';
import { Modal, ErrorNote, EmptyState } from './ui';

const STATUS_STYLES = {
  planned: 'bg-slate-100 text-slate-600',
  active: 'bg-teal-light text-teal',
  completed: 'bg-navy/10 text-navy',
};

function formatRange(start, end) {
  const opts = { month: 'short', day: 'numeric' };
  return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(
    end
  ).toLocaleDateString(undefined, opts)}`;
}

export default function SprintPanel({ projectId, sprints, activeSprintId, onSelect, onChanged }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createSprint(projectId, form);
      setShowNew(false);
      setForm({ name: '', goal: '', startDate: '', endDate: '' });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (sprint, status) => {
    try {
      await api.updateSprint(projectId, sprint.id, { status });
      onChanged();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const remove = async (sprint) => {
    if (!window.confirm(`Delete "${sprint.name}"? Its tasks return to the backlog.`)) return;
    try {
      await api.deleteSprint(projectId, sprint.id);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy">Sprints</h2>
        <button type="button" className="btn-primary" onClick={() => setShowNew(true)}>
          New sprint
        </button>
      </div>

      {sprints.length === 0 ? (
        <EmptyState
          title="No sprints yet"
          description="Create a sprint to group backlog items into a time-boxed iteration."
        />
      ) : (
        <div className="space-y-2">
          {sprints.map((s) => {
            const pct = s.stats.total
              ? Math.round((s.stats.done / s.stats.total) * 100)
              : 0;
            return (
              <div
                key={s.id}
                className={`card p-4 ${
                  s.id === activeSprintId ? 'border-teal ring-1 ring-teal' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(s.id)}
                        className="font-semibold text-navy hover:underline"
                      >
                        {s.name}
                      </button>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold
                                        uppercase ${STATUS_STYLES[s.status]}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatRange(s.startDate, s.endDate)} · {s.durationDays} days
                    </p>
                    {s.goal && <p className="mt-1 text-sm text-slate-600">{s.goal}</p>}
                  </div>

                  <div className="flex items-center gap-2">
                    {s.status === 'planned' && (
                      <button type="button" className="btn-secondary text-xs"
                              onClick={() => setStatus(s, 'active')}>
                        Start
                      </button>
                    )}
                    {s.status === 'active' && (
                      <button type="button" className="btn-secondary text-xs"
                              onClick={() => setStatus(s, 'completed')}>
                        Complete
                      </button>
                    )}
                    <button type="button" onClick={() => remove(s)}
                            className="text-xs text-slate-400 hover:text-rust">
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{s.stats.done} of {s.stats.total} tasks done</span>
                    <span className="font-semibold text-navy">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showNew}
        title="New sprint"
        onClose={() => setShowNew(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>
              Cancel
            </button>
            <button type="submit" form="sprint-form" disabled={busy} className="btn-primary">
              {busy ? 'Creating…' : 'Create sprint'}
            </button>
          </>
        }
      >
        <form id="sprint-form" onSubmit={create} className="space-y-4">
          <ErrorNote message={error} />
          <div>
            <label className="label" htmlFor="s-name">Sprint name</label>
            <input id="s-name" required autoFocus className="input" placeholder="Sprint 1"
                   value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="s-goal">Sprint goal (optional)</label>
            <input id="s-goal" className="input"
                   placeholder="Ship the checkout flow end to end"
                   value={form.goal}
                   onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="s-start">Start date</label>
              <input id="s-start" type="date" required className="input"
                     value={form.startDate}
                     onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="s-end">End date</label>
              <input id="s-end" type="date" required className="input"
                     value={form.endDate}
                     onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
