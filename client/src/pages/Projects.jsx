import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Spinner, ErrorNote, EmptyState, Modal, Avatar } from '../components/ui';

/* ── Project card ────────────────────────────────────────────────── */
function ProjectCard({ project }) {
  const { total, done } = project.stats || { total: 0, done: 0 };
  const pct = total ? Math.round((done / total) * 100) : 0;

  const statusColor =
    pct === 100 ? 'bg-emerald-500' :
    pct >= 60   ? 'bg-teal'        :
    pct >= 30   ? 'bg-amber-400'   : 'bg-rose-400';

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm
                 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-slate-300 block"
    >
      {/* Top colour bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${statusColor} rounded-t-2xl`} />

      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block rounded-md border border-navy/10 bg-navy/5 px-2 py-0.5
                           text-[10px] font-black tracking-widest text-navy">
            {project.key}
          </span>
          <h3 className="mt-2 truncate text-base font-bold leading-snug text-navy
                         transition-colors group-hover:text-teal">
            {project.name}
          </h3>
        </div>
        <div className="flex shrink-0 -space-x-2">
          {project.members.slice(0, 3).map((m) => (
            <Avatar key={m.user.id} name={m.user.name} size="sm" />
          ))}
          {project.members.length > 3 && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200
                             text-[10px] font-semibold text-slate-600">
              +{project.members.length - 3}
            </span>
          )}
        </div>
      </div>

      {project.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">
          {project.description}
        </p>
      )}

      {/* Progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-slate-500">
          <span>{done} of {total} tasks done</span>
          <span className="font-bold text-navy">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex gap-3 text-[11px] font-semibold text-slate-400">
          <span>Board</span>
          <span className="text-slate-200">·</span>
          <span>Insights</span>
          <span className="text-slate-200">·</span>
          <span>Risks</span>
        </div>
        <span className="text-[11px] font-semibold text-teal opacity-0 transition-opacity group-hover:opacity-100">
          Open
        </span>
      </div>
    </Link>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function Projects() {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [form, setForm]           = useState({ name: '', description: '' });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { projects: list } = await api.listProjects(); setProjects(list); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreate = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const { project } = await api.createProject(form);
      setProjects((prev) => [{ ...project, stats: { total: 0, done: 0 } }, ...prev]);
      setShowNew(false); setForm({ name: '', description: '' });
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const totalTasks = projects.reduce((s, p) => s + (p.stats?.total || 0), 0);
  const doneTasks  = projects.reduce((s, p) => s + (p.stats?.done  || 0), 0);

  return (
    <div className="min-h-screen bg-paper">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-6 py-14 text-white"
        style={{ background: 'linear-gradient(135deg, #071624 0%, #122842 55%, #0a2e2b 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-teal/8 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-48 w-96 rounded-full bg-teal/5 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
                <span className="text-xs font-semibold tracking-wide text-teal">Live — real-time updates</span>
              </div>
              <h1 className="text-4xl font-black tracking-tight">Sprint Planner</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
                Answers <strong className="font-bold text-white">"will we finish on time?"</strong> — not just "where are we?".
                Monte Carlo simulation, Critical Path Method, and scope-creep detection built into your Kanban board.
              </p>
              {/* Feature pills — text only, no icons */}
              <div className="mt-5 flex flex-wrap gap-2">
                {['Monte Carlo Forecasting','Critical Path (CPM)','Scope Creep Detection','Risk Register','WebSocket Sync'].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/12 bg-white/6 px-3 py-1
                               text-[11px] font-medium text-slate-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="shrink-0 self-start rounded-xl bg-teal px-6 py-2.5 text-sm font-semibold
                         text-white shadow-lg shadow-teal/20 transition-all hover:bg-teal/85"
            >
              New Project
            </button>
          </div>

          {/* Stats */}
          {!loading && projects.length > 0 && (
            <div className="mt-10 flex gap-6">
              {[
                { label: 'Projects',  value: projects.length },
                { label: 'Tasks',     value: totalTasks },
                { label: 'Completed', value: `${totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/8 bg-white/5 px-5 py-3 backdrop-blur-sm">
                  <p className="text-2xl font-black text-white">{s.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy">
            Your workspaces
            {projects.length > 0 && (
              <span className="ml-2 rounded-full bg-navy/8 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {projects.length}
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <Spinner label="Loading projects…" />
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create your first project to get a Kanban board, sprints and predictive analytics."
            action={
              <button type="button" className="btn-primary" onClick={() => setShowNew(true)}>
                Create a project
              </button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </main>

      {/* ── New project modal ─────────────────────────────────────── */}
      <Modal open={showNew} title="New project" onClose={() => setShowNew(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" form="new-project" disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </>
        }
      >
        <form id="new-project" onSubmit={onCreate} className="space-y-4">
          <ErrorNote message={formError} />
          <div>
            <label className="label" htmlFor="pname">Project name</label>
            <input id="pname" required className="input" autoFocus placeholder="e.g. Payments Service"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500">
              A short key (used for task IDs like PS-1) is generated automatically.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="pdesc">Description (optional)</label>
            <textarea id="pdesc" rows={3} className="input"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
