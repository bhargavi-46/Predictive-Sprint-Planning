import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorNote, EmptyState, Modal } from '../components/ui.jsx';

const SEVERITY = {
  critical: 'bg-rust/15 text-rust border-rust/30',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-sky-100 text-sky-800 border-sky-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const CATEGORIES = ['technical', 'schedule', 'resource', 'external', 'quality'];
const STATUSES = ['open', 'mitigating', 'closed'];

const EMPTY = {
  title: '',
  description: '',
  category: 'technical',
  probability: 3,
  impact: 3,
  mitigation: '',
};

/**
 * 5x5 probability/impact grid. Placing risks spatially makes the ranking
 * obvious in a way a sorted list does not.
 */
function RiskMatrix({ risks }) {
  const open = risks.filter((r) => r.status !== 'closed');

  const cellTone = (p, i) => {
    const s = p * i;
    if (s >= 15) return 'bg-rust/20';
    if (s >= 8) return 'bg-amber-100';
    if (s >= 4) return 'bg-sky-50';
    return 'bg-slate-50';
  };

  return (
    <div className="card overflow-x-auto px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Risk matrix (probability × impact)
      </p>
      <table className="border-collapse text-xs">
        <tbody>
          {[5, 4, 3, 2, 1].map((p) => (
            <tr key={p}>
              <th className="pr-2 text-right font-normal text-slate-500">{p}</th>
              {[1, 2, 3, 4, 5].map((i) => {
                const here = open.filter((r) => r.probability === p && r.impact === i);
                return (
                  <td
                    key={i}
                    className={`h-12 w-12 border border-slate-200 align-top ${cellTone(p, i)}`}
                    title={here.map((r) => r.title).join('\n')}
                  >
                    {here.length > 0 && (
                      <span className="block p-1 text-center font-semibold text-navy">
                        {here.length}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th />
            {[1, 2, 3, 4, 5].map((i) => (
              <th key={i} className="pt-1 font-normal text-slate-500">{i}</th>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-slate-500">
        Rows: probability (1–5). Columns: impact (1–5). Numbers show open risks in each cell.
      </p>
    </div>
  );
}

export default function Risks() {
  const { projectId } = useParams();
  const [risks, setRisks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listRisks(projectId);
      setRisks(data.risks);
      setSummary(data.summary);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.createRisk(projectId, {
        ...form,
        probability: Number(form.probability),
        impact: Number(form.impact),
      });
      setDialogOpen(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (risk, status) => {
    await api.updateRisk(projectId, risk.id, { status });
    load();
  };

  const remove = async (risk) => {
    await api.deleteRisk(projectId, risk.id);
    load();
  };

  if (loading && !risks.length) return <Spinner label="Loading risk register…" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-navy">
            Risk Register
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ranked by exposure — probability × impact.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary" to={`/projects/${projectId}`}>Board</Link>
          <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
            Log risk
          </button>
        </div>
      </header>

      <ErrorNote message={error} onRetry={load} />

      {summary && risks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Open', summary.open],
            ['Critical', summary.critical],
            ['High', summary.high],
            ['Total exposure', summary.totalExposure],
          ].map(([label, value]) => (
            <div key={label} className="card px-4 py-3.5">
              <p className="eyebrow">{label}</p>
              <p className="mt-1.5 text-[28px] font-semibold leading-none tabular-nums
                            tracking-tight text-navy">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {risks.length === 0 ? (
        <EmptyState
          title="No risks logged"
          description="Record what could threaten delivery — an unavailable API, a dependency on another team, an unfamiliar technology."
          action={
            <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
              Log the first risk
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card divide-y divide-slate-100">
            {risks.map((r) => (
              <article key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${SEVERITY[r.severity]}`}
                      >
                        {r.severity} · {r.score}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        {r.category}
                      </span>
                      {r.status !== 'open' && (
                        <span className="text-[11px] italic text-slate-500">{r.status}</span>
                      )}
                    </div>
                    <h3 className="mt-1 font-medium text-navy">{r.title}</h3>
                    {r.description && (
                      <p className="mt-0.5 text-sm text-slate-600">{r.description}</p>
                    )}
                    {r.mitigation && (
                      <p className="mt-1 text-sm text-slate-500">
                        <strong className="font-medium">Mitigation:</strong> {r.mitigation}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <select
                      className="input h-8 py-0 text-xs"
                      value={r.status}
                      onChange={(e) => setStatus(r, e.target.value)}
                      aria-label={`Status of ${r.title}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      type="button"
                      className="rounded px-2 text-slate-400 hover:text-rust"
                      onClick={() => remove(r)}
                      aria-label={`Delete ${r.title}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <RiskMatrix risks={risks} />
        </div>
      )}

      <Modal
        open={dialogOpen}
        title="Log a risk"
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="risk-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save risk'}
            </button>
          </>
        }
      >
        <form id="risk-form" onSubmit={submit} className="space-y-3">
          <ErrorNote message={formError} />
          <label className="block">
            <span className="label">Title</span>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Payment gateway sandbox may be unavailable"
            />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Probability (1–5)</span>
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                value={form.probability}
                onChange={(e) => setForm({ ...form, probability: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Impact (1–5)</span>
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Mitigation plan</span>
            <textarea
              className="input"
              rows={2}
              value={form.mitigation}
              onChange={(e) => setForm({ ...form, mitigation: e.target.value })}
              placeholder="Build against a local stub so work is not blocked"
            />
          </label>
          <p className="text-xs text-slate-500">
            Exposure score: <strong>{form.probability * form.impact}</strong> out of 25.
          </p>
        </form>
      </Modal>
    </div>
  );
}
