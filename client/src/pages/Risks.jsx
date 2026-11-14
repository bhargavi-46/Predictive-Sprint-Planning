import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorNote, EmptyState, Modal } from '../components/ui.jsx';

/* ------------------------------------------------------------------ */
/*  Config & constants                                                 */
/* ------------------------------------------------------------------ */

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
  high:     { label: 'High',     color: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  medium:   { label: 'Medium',   color: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-800 border-sky-200' },
  low:      { label: 'Low',      color: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const CATEGORIES = [
  { id: 'technical', label: 'Technical', icon: '⚙️' },
  { id: 'schedule',  label: 'Schedule',  icon: '⏱️' },
  { id: 'resource',  label: 'Resource',  icon: '👥' },
  { id: 'external',  label: 'External',  icon: '🌐' },
  { id: 'quality',   label: 'Quality',   icon: '🧪' },
];

const STATUSES = ['open', 'mitigating', 'closed'];

const EMPTY = {
  title: '', description: '', category: 'technical',
  probability: 3, impact: 3, mitigation: '',
};

/* ------------------------------------------------------------------ */
/*  5×5 Heatmap Matrix                                                 */
/* ------------------------------------------------------------------ */

function RiskMatrix({ risks }) {
  const open = risks.filter((r) => r.status !== 'closed');

  const cellColor = (p, i) => {
    const s = p * i;
    if (s >= 15) return 'bg-rose-200 border-rose-300';
    if (s >= 8) return 'bg-amber-100 border-amber-200';
    if (s >= 4) return 'bg-sky-50 border-sky-200';
    return 'bg-emerald-50 border-emerald-200';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs p-5 space-y-3">
      <h3 className="text-sm font-bold text-navy">Risk Heatmap</h3>
      <p className="text-[11px] text-slate-500 -mt-1">Probability × Impact matrix</p>

      <div className="flex flex-col items-center pt-1">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          ↑ Probability
        </div>

        <div className="flex">
          <div className="flex flex-col justify-between pr-1.5">
            {[5,4,3,2,1].map((p) => (
              <div key={p} className="h-10 flex items-center justify-end">
                <span className="text-[10px] font-bold text-slate-400">{p}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-rows-5 gap-1">
            {[5,4,3,2,1].map((p) => (
              <div key={p} className="grid grid-cols-5 gap-1">
                {[1,2,3,4,5].map((i) => {
                  const here = open.filter((r) => r.probability === p && r.impact === i);
                  return (
                    <div key={i}
                      className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-transform hover:scale-110 cursor-default ${cellColor(p, i)}`}
                      title={here.length ? here.map((r) => r.title).join('\n') : `Score ${p * i}`}>
                      {here.length > 0 ? (
                        <span className="text-xs font-black">{here.length}</span>
                      ) : (
                        <span className="text-[9px] text-slate-300">{p * i}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex pl-6 mt-1 gap-1">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="w-10 text-center">
              <span className="text-[10px] font-bold text-slate-400">{i}</span>
            </div>
          ))}
        </div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 pl-6">
          Impact →
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100 text-[10px] text-slate-600">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-200" />Critical (15–25)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-100" />High (8–14)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-sky-50 border border-sky-200" />Medium (4–7)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-200" />Low (1–3)</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exposure Bar  — a simple visual bar showing score out of 25        */
/* ------------------------------------------------------------------ */

function ExposureBar({ score }) {
  const pct = Math.min((score / 25) * 100, 100);
  const color = score >= 15 ? 'bg-rose-500' : score >= 8 ? 'bg-amber-500' : score >= 4 ? 'bg-sky-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-bold text-slate-600 shrink-0 w-8 text-right">{score}/25</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk Card                                                          */
/* ------------------------------------------------------------------ */

function RiskCard({ risk, onStatusChange, onDelete }) {
  const sev = SEVERITY_CONFIG[risk.severity] || SEVERITY_CONFIG.medium;
  const cat = CATEGORIES.find((c) => c.id === risk.category);
  const closed = risk.status === 'closed';

  return (
    <div className={`rounded-2xl border bg-white shadow-xs transition hover:shadow-sm overflow-hidden ${closed ? 'opacity-60' : ''}`}>
      {/* Colored severity strip at top */}
      <div className={`h-1.5 ${sev.color}`} />

      <div className="p-4 space-y-3">
        {/* Top row: badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${sev.badge}`}>
            {sev.label}
          </span>
          <span className="text-[11px] text-slate-500">
            {cat?.icon} {cat?.label || risk.category}
          </span>
          {risk.status !== 'open' && (
            <span className="text-[11px] italic text-slate-400 capitalize">{risk.status}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-navy leading-snug">{risk.title}</h3>

        {/* Description */}
        {risk.description && (
          <p className="text-xs text-slate-600 leading-relaxed">{risk.description}</p>
        )}

        {/* Exposure bar */}
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Exposure Score (Probability {risk.probability} × Impact {risk.impact})
          </p>
          <ExposureBar score={risk.score} />
        </div>

        {/* Mitigation */}
        {risk.mitigation ? (
          <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-3 text-xs">
            <p className="font-semibold text-emerald-800 mb-0.5">Mitigation Plan</p>
            <p className="text-emerald-900/80 leading-relaxed">{risk.mitigation}</p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">No mitigation plan documented</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <select
            className="input h-7 py-0 text-[11px] font-semibold w-28 rounded-lg"
            value={risk.status}
            onChange={(e) => onStatusChange(risk, e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'open' ? 'Open' : s === 'mitigating' ? 'Mitigating' : 'Resolved'}</option>)}
          </select>
          <button type="button" onClick={() => onDelete(risk)}
            className="text-xs text-slate-300 hover:text-rose-500 transition">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

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
  const [filterCat, setFilterCat] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listRisks(projectId);
      setRisks(data.risks || []);
      setSummary(data.summary || null);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await api.createRisk(projectId, { ...form, probability: Number(form.probability), impact: Number(form.impact) });
      setDialogOpen(false); setForm(EMPTY); await load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const setStatus = async (risk, status) => {
    try { await api.updateRisk(projectId, risk.id, { status }); load(); }
    catch (err) { alert(err.message); }
  };

  const remove = async (risk) => {
    if (!window.confirm(`Delete "${risk.title}"?`)) return;
    try { await api.deleteRisk(projectId, risk.id); load(); }
    catch (err) { alert(err.message); }
  };

  if (loading && !risks.length) return <Spinner label="Loading risks…" />;

  const filtered = filterCat === 'all' ? risks : risks.filter((r) => r.category === filterCat);

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-navy">Risk Register</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track, score, and mitigate delivery threats</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link className="btn-secondary h-9 text-xs" to={`/projects/${projectId}`}>← Board</Link>
          <button type="button" className="btn-primary h-9 text-xs" onClick={() => setDialogOpen(true)}>
            + Log Risk
          </button>
        </div>
      </div>

      <ErrorNote message={error} onRetry={load} />

      {/* Summary row */}
      {summary && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Open',     value: summary.open,          accent: 'border-l-slate-400',  icon: '📋' },
            { label: 'Critical', value: summary.critical,      accent: 'border-l-rose-500',   icon: '🔴' },
            { label: 'High',     value: summary.high,          accent: 'border-l-amber-500',  icon: '🟠' },
            { label: 'Total Exposure', value: summary.totalExposure, accent: 'border-l-navy', icon: '🎯' },
          ].map((s) => (
            <div key={s.label} className={`card rounded-xl p-4 border-l-4 ${s.accent}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>{s.icon}</span>{s.label}
              </p>
              <p className="text-2xl font-black text-navy mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {risks.length === 0 ? (
        <EmptyState
          title="No risks logged"
          description="Record what could threaten delivery — an unavailable API, a team member absence, an unfamiliar technology."
          action={<button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>Log the first risk</button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Left: Cards */}
          <div className="space-y-4">
            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button type="button" onClick={() => setFilterCat('all')}
                className={`px-3 py-1.5 rounded-full font-semibold transition ${filterCat === 'all' ? 'bg-navy text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                All ({risks.length})
              </button>
              {CATEGORIES.map((c) => {
                const n = risks.filter((r) => r.category === c.id).length;
                if (!n) return null;
                return (
                  <button key={c.id} type="button" onClick={() => setFilterCat(c.id)}
                    className={`px-3 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${filterCat === c.id ? 'bg-navy text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {c.icon} {c.label} ({n})
                  </button>
                );
              })}
            </div>

            {/* Risk cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((r) => (
                <RiskCard key={r.id} risk={r} onStatusChange={setStatus} onDelete={remove} />
              ))}
            </div>
          </div>

          {/* Right: Heatmap (sticky) */}
          <div className="lg:sticky lg:top-4 self-start">
            <RiskMatrix risks={risks} />
          </div>
        </div>
      )}

      {/* New Risk Modal */}
      <Modal open={dialogOpen} title="Log a Risk"
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
            <button type="submit" form="risk-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Risk'}
            </button>
          </>
        }>
        <form id="risk-form" onSubmit={submit} className="space-y-3.5">
          <ErrorNote message={formError} />

          <label className="block">
            <span className="label">Title</span>
            <input className="input" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Payment gateway sandbox may be unavailable" />
          </label>

          <label className="block">
            <span className="label">Description</span>
            <textarea className="input" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Category</span>
              <select className="input" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Probability (1–5)</span>
              <input className="input" type="number" min={1} max={5} value={form.probability}
                onChange={(e) => setForm({ ...form, probability: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Impact (1–5)</span>
              <input className="input" type="number" min={1} max={5} value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })} />
            </label>
          </div>

          <label className="block">
            <span className="label">Mitigation plan</span>
            <textarea className="input" rows={2} value={form.mitigation}
              onChange={(e) => setForm({ ...form, mitigation: e.target.value })}
              placeholder="Build against a local stub so work is not blocked" />
          </label>

          {/* Live exposure preview */}
          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Exposure Preview</p>
            <ExposureBar score={Number(form.probability || 0) * Number(form.impact || 0)} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
