import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Spinner, ErrorNote, EmptyState, Modal, Avatar } from '../components/ui';

function ProjectCard({ project }) {
  const { total, done } = project.stats || { total: 0, done: 0 };
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      to={`/projects/${project.id}`}
      className="card block p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded bg-navy/10 px-1.5 py-0.5 text-[11px] font-bold text-navy">
            {project.key}
          </span>
          <h3 className="mt-2 truncate font-semibold text-navy">{project.name}</h3>
        </div>
        <div className="flex -space-x-2">
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
        <p className="mt-2 line-clamp-2 text-sm text-slate-500">{project.description}</p>
      )}

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{done} of {total} tasks done</span>
          <span className="font-semibold text-navy">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Link>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { projects: list } = await api.listProjects();
      setProjects(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { project } = await api.createProject(form);
      setProjects((prev) => [{ ...project, stats: { total: 0, done: 0 } }, ...prev]);
      setShowNew(false);
      setForm({ name: '', description: '' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Your projects</h1>
          <p className="text-sm text-slate-500">Pick a board or start a new project.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowNew(true)}>
          New project
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading projects…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to get a Kanban board, sprints and a burndown chart."
          action={
            <button type="button" className="btn-primary" onClick={() => setShowNew(true)}>
              Create a project
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      <Modal
        open={showNew}
        title="New project"
        onClose={() => setShowNew(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>
              Cancel
            </button>
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
            <input
              id="pname" required className="input" autoFocus
              placeholder="e.g. Payments Service"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              A short key (used for task IDs like PS-1) is generated automatically.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="pdesc">Description (optional)</label>
            <textarea
              id="pdesc" rows={3} className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </main>
  );
}
