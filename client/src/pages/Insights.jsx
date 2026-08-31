import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { api } from '../api/client.js';
import { Spinner, ErrorNote, EmptyState } from '../components/ui.jsx';

const RISK_STYLES = {
  'on-track': { label: 'On track', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  caution: { label: 'Caution', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  'at-risk': { label: 'At risk', cls: 'bg-rust/10 text-rust border-rust/30' },
};

function Stat({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-navy',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rust',
  };
  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1.5 text-[28px] font-semibold leading-none tabular-nums tracking-tight
                     ${tones[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-navy">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Confidence bands: how many days the simulation says the work will take. */
function ForecastPanel({ forecast, daysRemaining }) {
  if (!forecast?.hasEnoughData) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-500">
        {forecast?.message || 'Not enough history to forecast yet.'}
      </div>
    );
  }

  const p = forecast.probabilityOnTime;
  const tone = p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad';
  const bars = [
    { name: '50% confident', days: forecast.daysNeeded.p50 },
    { name: '85% confident', days: forecast.daysNeeded.p85 },
    { name: '95% confident', days: forecast.daysNeeded.p95 },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Stat
        label="Chance of finishing on time"
        value={`${p}%`}
        hint={`${forecast.trials.toLocaleString()} simulations · ${daysRemaining} days left`}
        tone={tone}
      />
      <div className="card px-4 py-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          Days needed to finish the remaining work
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${v} days`, 'Needed']} />
            <Bar dataKey="days" radius={[0, 4, 4, 0]}>
              {bars.map((b) => (
                <Cell
                  key={b.name}
                  fill={b.days <= daysRemaining ? '#0f766e' : '#b4552e'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-xs text-slate-500">
          Bars beyond the {daysRemaining}-day sprint window are shown in red.
        </p>
      </div>
    </div>
  );
}

function CriticalPathPanel({ criticalPath }) {
  if (criticalPath.hasCycle) {
    return (
      <ErrorNote message="The dependency graph contains a circular chain, so no critical path can be computed. Remove one of the looping dependencies." />
    );
  }

  const critical = criticalPath.tasks
    .filter((t) => t.isCritical)
    .sort((a, b) => a.earliestStart - b.earliestStart);

  if (!critical.length) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-500">
        No critical path yet — add dependencies between tasks to see which chain
        governs the sprint end date.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto px-4 py-3">
        <div className="flex items-center gap-2">
          {critical.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="min-w-[130px] rounded border border-rust/30 bg-rust/5 px-2 py-1.5">
                <p className="font-mono text-[11px] text-rust">{t.reference}</p>
                <p className="truncate text-xs text-navy" title={t.title}>{t.title}</p>
                <p className="text-[11px] text-slate-500">{t.storyPoints} pts</p>
              </div>
              {i < critical.length - 1 && <span className="text-rust">→</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        These tasks have zero float — any delay to one of them delays the whole
        sprint. Total chain length: <strong>{criticalPath.duration} points</strong>.
      </p>
    </div>
  );
}

function ScopeCreepPanel({ scopeCreep }) {
  if (!scopeCreep.hasBaseline) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-500">{scopeCreep.message}</div>
    );
  }

  const { totals, added, reEstimated, baseline, current } = scopeCreep;
  const tone =
    scopeCreep.verdict === 'significant'
      ? 'bad'
      : scopeCreep.verdict === 'moderate'
        ? 'warn'
        : 'good';

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Committed" value={`${baseline.totalPoints} pts`} hint={`${baseline.taskCount} tasks at sprint start`} />
        <Stat label="Now" value={`${current.totalPoints} pts`} hint={`${current.taskCount} tasks today`} />
        <Stat
          label="Scope change"
          value={`${totals.creepPercent > 0 ? '+' : ''}${totals.creepPercent}%`}
          hint={`${totals.netChange > 0 ? '+' : ''}${totals.netChange} points`}
          tone={tone}
        />
      </div>

      {added.length > 0 && (
        <div className="card px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Added after commitment ({added.length})
          </p>
          <ul className="space-y-1 text-sm">
            {added.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="font-mono text-xs text-slate-500">{t.reference}</span>{' '}
                  {t.title}
                </span>
                <span className="shrink-0 text-slate-500">+{t.storyPoints} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reEstimated.length > 0 && (
        <div className="card px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Re-estimated after commitment ({reEstimated.length})
          </p>
          <ul className="space-y-1 text-sm">
            {reEstimated.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="font-mono text-xs text-slate-500">{t.reference}</span>{' '}
                  {t.title}
                </span>
                <span className="shrink-0 text-slate-500">
                  {t.pointsBefore} → {t.pointsAfter} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EstimationPanel({ estimation }) {
  if (!estimation.hasData) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-500">{estimation.message}</div>
    );
  }

  const tone =
    estimation.meanRatio > 1.15 ? 'bad' : estimation.meanRatio < 0.85 ? 'warn' : 'good';

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Actual ÷ estimated"
          value={`${estimation.meanRatio}×`}
          hint={estimation.bias}
          tone={tone}
        />
        <Stat label="Mean error (MAPE)" value={`${estimation.mape}%`} hint={`across ${estimation.sampleSize} tasks`} />
        <Stat
          label="Suggested adjustment"
          value={`×${estimation.suggestedAdjustment}`}
          hint="apply to next sprint's estimates"
        />
      </div>

      {estimation.worstEstimates?.length > 0 && (
        <div className="card px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Largest estimation misses
          </p>
          <ul className="space-y-1 text-sm">
            {estimation.worstEstimates.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="font-mono text-xs text-slate-500">{t.reference}</span>{' '}
                  {t.title}
                </span>
                <span className={`shrink-0 ${t.variance > 0 ? 'text-rust' : 'text-emerald-700'}`}>
                  est {t.estimated} → actual {t.actual}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Insights() {
  const { projectId } = useParams();
  const [sprints, setSprints] = useState([]);
  const [sprintId, setSprintId] = useState(null);
  const [health, setHealth] = useState(null);
  const [burndown, setBurndown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pick the active sprint by default — that is the one under way.
  useEffect(() => {
    let cancelled = false;
    api
      .listSprints(projectId)
      .then(({ sprints: list }) => {
        if (cancelled) return;
        setSprints(list);
        const active = list.find((s) => s.status === 'active') || list[0];
        setSprintId(active?.id ?? null);
        if (!active) setLoading(false);
      })
      .catch((e) => !cancelled && (setError(e.message), setLoading(false)));
    return () => { cancelled = true; };
  }, [projectId]);

  const load = useCallback(async () => {
    if (!sprintId) return;
    setLoading(true);
    setError('');
    try {
      const [h, b] = await Promise.all([
        api.getSprintHealth(projectId, sprintId),
        api.getBurndown(projectId, sprintId),
      ]);
      setHealth(h);
      setBurndown(b);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, sprintId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !health) return <Spinner label="Analysing sprint…" />;

  if (!sprintId) {
    return (
      <EmptyState
        title="No sprints yet"
        description="Create a sprint on the board, then start it to unlock forecasting and scope tracking."
        action={<Link className="btn-primary" to={`/projects/${projectId}`}>Go to board</Link>}
      />
    );
  }

  const risk = health && RISK_STYLES[health.health.riskLevel];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-navy">
            Delivery Insights
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dependency-aware forecasting for the selected sprint.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input h-9 w-56 py-0"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            aria-label="Select sprint"
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
          <Link className="btn-secondary" to={`/projects/${projectId}`}>Board</Link>
        </div>
      </header>

      <ErrorNote message={error} onRetry={load} />

      {health && (
        <>
          <div className={`rounded-xl border px-4 py-3.5 shadow-sm ${risk.cls}`}>
            <p className="text-sm font-semibold">{risk.label}</p>
            {health.health.reasons.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {health.health.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span aria-hidden="true" className="opacity-50">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm">No delivery risks detected for this sprint.</p>
            )}
          </div>

          <Section
            title="Completion forecast"
            subtitle="Monte Carlo simulation over the team's own historical velocity."
          >
            <ForecastPanel forecast={health.forecast} daysRemaining={health.forecast.daysRemaining ?? 0} />
          </Section>

          <Section
            title="Critical path"
            subtitle="The dependency chain that governs the sprint end date."
          >
            <CriticalPathPanel criticalPath={health.criticalPath} />
          </Section>

          {health.blockedTasks.length > 0 && (
            <Section title="Blocked work" subtitle="Waiting on unfinished dependencies.">
              <div className="card divide-y divide-slate-100">
                {health.blockedTasks.map((t) => (
                  <div key={t.id} className="px-4 py-2 text-sm">
                    <p>
                      <span className="font-mono text-xs text-slate-500">{t.reference}</span>{' '}
                      {t.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      blocked by{' '}
                      {t.blockedBy.map((b) => `${b.reference} (${b.status})`).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Scope creep"
            subtitle="Measured against the commitment frozen when the sprint started."
          >
            <ScopeCreepPanel scopeCreep={health.scopeCreep} />
          </Section>

          <Section
            title="Estimation accuracy"
            subtitle="How closely past estimates matched reality."
          >
            <EstimationPanel estimation={health.estimation} />
          </Section>

          {burndown && (
            <Section title="Burndown" subtitle="Remaining points against the ideal trend.">
              <div className="card px-4 py-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={burndown.burndown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ideal" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Ideal" />
                    <Line type="monotone" dataKey="remaining" stroke="#0f766e" strokeWidth={2} connectNulls={false} name="Actual" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
