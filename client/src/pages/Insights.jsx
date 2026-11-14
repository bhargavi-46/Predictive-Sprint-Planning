import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import { api } from '../api/client.js';
import { Spinner, ErrorNote, EmptyState } from '../components/ui.jsx';

/* ------------------------------------------------------------------ */
/*  Small reusable visual components                                   */
/* ------------------------------------------------------------------ */

/** Circular gauge that fills from 0–100% — the hero visual */
function CircularGauge({ value, size = 140, label, sublabel, color }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-3xl font-black tracking-tight" style={{ color }}>{value}%</span>
        {sublabel && <span className="text-[10px] text-slate-500 mt-0.5">{sublabel}</span>}
      </div>
      {label && <p className="mt-2 text-xs font-semibold text-slate-600 text-center">{label}</p>}
    </div>
  );
}

/** A small metric tile */
function Metric({ icon, label, value, sub, accent = 'text-navy' }) {
  return (
    <div className="flex items-start gap-3 p-3.5 bg-white rounded-xl border border-slate-100 shadow-xs">
      <span className="text-lg mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-black tracking-tight mt-0.5 ${accent}`}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/** Status pill */
function StatusPill({ children, tone = 'neutral' }) {
  const map = {
    good: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-100 text-amber-800 border-amber-200',
    bad: 'bg-rose-100 text-rose-800 border-rose-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${map[tone]}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Section panels                                                     */
/* ------------------------------------------------------------------ */

function ForecastSection({ forecast, daysRemaining }) {
  if (!forecast?.hasEnoughData) {
    return (
      <div className="text-center p-8 text-sm text-slate-400">
        <p className="text-base font-semibold text-slate-600 mb-1">Waiting for velocity data</p>
        <p>Complete a few tasks so the forecast engine can learn your team's pace.</p>
      </div>
    );
  }

  const p = forecast.probabilityOnTime;
  const color = p >= 80 ? '#0f766e' : p >= 50 ? '#d97706' : '#be123c';
  const tone = p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad';
  const bars = [
    { name: 'Optimistic (P50)', days: forecast.daysNeeded.p50 },
    { name: 'Realistic (P85)', days: forecast.daysNeeded.p85 },
    { name: 'Worst Case (P95)', days: forecast.daysNeeded.p95 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Hero gauge */}
        <div className="relative shrink-0">
          <CircularGauge
            value={p}
            color={color}
            sublabel="on-time"
          />
        </div>

        {/* Metrics beside gauge */}
        <div className="flex-1 grid gap-2.5 sm:grid-cols-3 w-full">
          <Metric icon="📅" label="Days Left" value={daysRemaining}
            sub="working days in sprint" />
          <Metric icon="⏱️" label="Realistic Estimate" value={`${forecast.daysNeeded.p85}d`}
            sub="85% confidence level"
            accent={forecast.daysNeeded.p85 <= daysRemaining ? 'text-emerald-700' : 'text-rose-700'} />
          <Metric icon="🔁" label="Simulations Run" value={forecast.trials.toLocaleString()}
            sub="randomised future trials" />
        </div>
      </div>

      {/* Horizontal bar chart */}
      <div className="bg-slate-50/80 rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Estimated days needed by confidence level
        </p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={bars} layout="vertical" margin={{ left: 4, right: 20 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${v} days`]} />
            <Bar dataKey="days" radius={[0, 6, 6, 0]} barSize={20}>
              {bars.map((b) => (
                <Cell key={b.name} fill={b.days <= daysRemaining ? '#0f766e' : '#be123c'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal inline-block" /> Within deadline</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-700 inline-block" /> Exceeds deadline</span>
        </div>
      </div>
    </div>
  );
}

function CriticalPathSection({ criticalPath }) {
  if (criticalPath?.hasCycle) {
    return <ErrorNote message="Circular dependency detected. Remove the loop to compute the critical path." />;
  }

  const tasks = (criticalPath?.tasks || [])
    .filter((t) => t.isCritical)
    .sort((a, b) => a.earliestStart - b.earliestStart);

  if (!tasks.length) {
    return (
      <div className="text-center p-8 text-sm text-slate-400">
        <p className="text-base font-semibold text-slate-600 mb-1">No dependencies yet</p>
        <p>Link tasks on the board using "Blocked by" to reveal the critical chain.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Visual chain */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-0 min-w-max">
          {tasks.map((t, i) => {
            const done = t.status === 'done';
            return (
              <div key={t.id} className="flex items-stretch">
                <div className={`relative w-48 rounded-xl p-3 border-2 transition-shadow
                  ${done
                    ? 'border-emerald-300 bg-emerald-50 shadow-emerald-100/50'
                    : 'border-rose-300 bg-white shadow-rose-100/40'
                  } shadow-sm`}>
                  {/* Status dot */}
                  <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-white shadow
                    ${done ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                  <p className="font-mono text-[11px] font-bold text-slate-500">{t.reference}</p>
                  <p className="text-xs font-bold text-navy mt-0.5 truncate" title={t.title}>{t.title}</p>

                  <div className="flex items-center justify-between mt-2 text-[11px]">
                    <span className="text-slate-500">{t.storyPoints} pts</span>
                    <span className={`font-bold ${done ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {done ? '✓ Done' : '0 slack'}
                    </span>
                  </div>
                </div>

                {i < tasks.length - 1 && (
                  <div className="flex items-center px-1.5 shrink-0">
                    <div className="w-6 h-0.5 bg-rose-300 rounded" />
                    <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[7px] border-transparent border-l-rose-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
        Tasks on this chain have zero slack — delaying any one delays the entire sprint.
        Total: <strong className="text-navy">{criticalPath.duration} points</strong>.
      </p>
    </div>
  );
}

function BlockedSection({ blockedTasks }) {
  if (!blockedTasks?.length) return null;

  return (
    <div className="space-y-2">
      {blockedTasks.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-amber-600 text-lg shrink-0">⏳</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-navy truncate">
                <span className="font-mono text-slate-500 mr-1">{t.reference}</span>
                {t.title}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-white border border-amber-200 px-2.5 py-1 text-[11px] text-amber-900 font-medium shrink-0">
            Waiting on {t.blockedBy.map((b) => b.reference).join(', ')}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScopeCreepSection({ scopeCreep }) {
  if (!scopeCreep?.hasBaseline) {
    return (
      <div className="text-center p-8 text-sm text-slate-400">
        <p className="text-base font-semibold text-slate-600 mb-1">No baseline recorded yet</p>
        <p>Start a sprint to freeze the commitment snapshot.</p>
      </div>
    );
  }

  const { totals, added = [], reEstimated = [], baseline, current } = scopeCreep;
  const pct = totals.creepPercent;
  const hasCreep = pct > 0;

  // Pie data for committed vs added
  const pieData = [
    { name: 'Original commitment', value: baseline.totalPoints, fill: '#0f766e' },
  ];
  if (totals.netChange > 0) {
    pieData.push({ name: 'Added mid-sprint', value: totals.netChange, fill: '#be123c' });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Pie chart */}
        <div className="shrink-0">
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                innerRadius={36} outerRadius={56} paddingAngle={2} strokeWidth={0}>
                {pieData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} pts`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-3 text-[10px] text-slate-500 mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal inline-block" />Original</span>
            {totals.netChange > 0 && (
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-700 inline-block" />Added</span>
            )}
          </div>
        </div>

        <div className="flex-1 grid gap-2.5 sm:grid-cols-3 w-full">
          <Metric icon="🔒" label="Committed" value={`${baseline.totalPoints} pts`}
            sub={`${baseline.taskCount} tasks at sprint start`} />
          <Metric icon="📋" label="Current Load" value={`${current.totalPoints} pts`}
            sub={`${current.taskCount} tasks now`} />
          <Metric icon={hasCreep ? '⚠️' : '✅'} label="Scope Change"
            value={`${hasCreep ? '+' : ''}${pct}%`}
            sub={hasCreep ? `+${totals.netChange} pts added` : 'No extra work added'}
            accent={pct > 15 ? 'text-rose-700' : pct > 5 ? 'text-amber-700' : 'text-emerald-700'} />
        </div>
      </div>

      {/* Lists of added / re-estimated */}
      {(added.length > 0 || reEstimated.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {added.length > 0 && (
            <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-2">
                Added after sprint started ({added.length})
              </p>
              {added.map((t) => (
                <div key={t.id} className="flex justify-between items-center text-xs py-1 border-b border-rose-100 last:border-0">
                  <span className="truncate text-slate-700"><span className="font-mono text-slate-500">{t.reference}</span> {t.title}</span>
                  <span className="shrink-0 font-bold text-rose-700">+{t.storyPoints}</span>
                </div>
              ))}
            </div>
          )}
          {reEstimated.length > 0 && (
            <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-2">
                Points changed mid-sprint ({reEstimated.length})
              </p>
              {reEstimated.map((t) => (
                <div key={t.id} className="flex justify-between items-center text-xs py-1 border-b border-amber-100 last:border-0">
                  <span className="truncate text-slate-700"><span className="font-mono text-slate-500">{t.reference}</span> {t.title}</span>
                  <span className="shrink-0 font-semibold text-amber-700">{t.pointsBefore} → {t.pointsAfter}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EstimationSection({ estimation }) {
  if (!estimation?.hasData) {
    return (
      <div className="text-center p-8 text-sm text-slate-400">
        <p className="text-base font-semibold text-slate-600 mb-1">Not enough completed tasks yet</p>
        <p>Finish tasks and log actual effort to see calibration advice.</p>
      </div>
    );
  }

  const ratio = estimation.meanRatio;
  const tone = ratio > 1.15 ? 'bad' : ratio < 0.85 ? 'warn' : 'good';

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Metric
          icon={tone === 'good' ? '✅' : '📐'}
          label="Actual ÷ Estimated"
          value={`${ratio}×`}
          sub={ratio > 1.1 ? 'Team underestimates effort' : 'Well calibrated'}
          accent={tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-emerald-700'}
        />
        <Metric icon="📊" label="Avg. Estimation Error" value={`${estimation.mape}%`}
          sub={`across ${estimation.sampleSize} tasks`} />
        <Metric icon="💡" label="Next Sprint Multiplier" value={`×${estimation.suggestedAdjustment}`}
          sub="apply to future estimates" accent="text-teal" />
      </div>

      {estimation.worstEstimates?.length > 0 && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
            Biggest estimation misses
          </p>
          {estimation.worstEstimates.map((t) => (
            <div key={t.id} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 last:border-0">
              <span className="truncate text-slate-700">
                <span className="font-mono text-slate-500">{t.reference}</span> {t.title}
              </span>
              <span className={`shrink-0 font-semibold ${t.variance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                est {t.estimated} → actual {t.actual}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper with collapsible info                              */
/* ------------------------------------------------------------------ */

function InsightSection({ icon, title, description, tag, tagTone, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{icon}</span>
          <div>
            <h2 className="text-[15px] font-bold text-navy tracking-tight">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {tag && <StatusPill tone={tagTone}>{tag}</StatusPill>}
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function Insights() {
  const { projectId } = useParams();
  const [sprints, setSprints] = useState([]);
  const [sprintId, setSprintId] = useState(null);
  const [health, setHealth] = useState(null);
  const [burndown, setBurndown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listSprints(projectId).then(({ sprints: list }) => {
      if (cancelled) return;
      setSprints(list);
      const active = list.find((s) => s.status === 'active') || list[0];
      setSprintId(active?.id ?? null);
      if (!active) setLoading(false);
    }).catch((e) => !cancelled && (setError(e.message), setLoading(false)));
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

  if (loading && !health) return <Spinner label="Analysing sprint health…" />;

  if (!sprintId) {
    return (
      <EmptyState
        title="No sprints yet"
        description="Create and start a sprint on the board to unlock delivery forecasting."
        action={<Link className="btn-primary" to={`/projects/${projectId}`}>Go to Board</Link>}
      />
    );
  }

  const prob = health?.forecast?.probabilityOnTime ?? null;
  const blocked = health?.blockedTasks || [];
  const creep = health?.scopeCreep?.totals?.creepPercent ?? 0;
  const riskLevel = health?.health?.riskLevel || 'on-track';
  const reasons = health?.health?.reasons || [];

  const bannerMap = {
    'on-track': { icon: '🟢', label: 'On Track', bg: 'from-emerald-50 to-emerald-100/60 border-emerald-200', text: 'text-emerald-900' },
    caution: { icon: '🟡', label: 'Needs Attention', bg: 'from-amber-50 to-amber-100/60 border-amber-200', text: 'text-amber-900' },
    'at-risk': { icon: '🔴', label: 'At Risk', bg: 'from-rose-50 to-rose-100/60 border-rose-200', text: 'text-rose-900' },
  };
  const banner = bannerMap[riskLevel] || bannerMap.caution;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-navy">Delivery Insights</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Sprint health, forecasting, dependencies, and scope tracking
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <select className="input h-9 text-xs font-semibold w-56"
            value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
            ))}
          </select>
          <Link className="btn-secondary h-9 text-xs" to={`/projects/${projectId}`}>← Board</Link>
        </div>
      </div>

      <ErrorNote message={error} onRetry={load} />

      {health && (
        <>
          {/* Overall health banner */}
          <div className={`rounded-2xl border bg-gradient-to-r ${banner.bg} p-5`}>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-3xl">{banner.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-black ${banner.text}`}>Sprint Status: {banner.label}</p>
                {reasons.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {reasons.map((r) => (
                      <li key={r} className={`text-xs ${banner.text} opacity-80 flex items-center gap-1.5`}>
                        <span className="opacity-50">•</span>{r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`text-xs ${banner.text} opacity-80 mt-0.5`}>
                    No delivery risks detected — your team is on track.
                  </p>
                )}
              </div>
              {prob !== null && (
                <div className="text-center shrink-0">
                  <p className={`text-4xl font-black ${banner.text}`}>{prob}%</p>
                  <p className="text-[11px] text-slate-500">on-time likelihood</p>
                </div>
              )}
            </div>
          </div>

          {/* 1. Forecast */}
          <InsightSection
            icon="📈"
            title="Completion Forecast"
            description="Simulated delivery probability using your team's past velocity"
            tag={prob !== null ? (prob >= 80 ? 'Likely on time' : prob >= 50 ? 'At risk' : 'Behind') : null}
            tagTone={prob >= 80 ? 'good' : prob >= 50 ? 'warn' : 'bad'}
          >
            <ForecastSection forecast={health.forecast} daysRemaining={health.forecast?.daysRemaining ?? 0} />
          </InsightSection>

          {/* 2. Critical Path */}
          <InsightSection
            icon="⛓️"
            title="Critical Path"
            description="The chain of dependent tasks that determines the earliest possible finish date"
            tag={health.criticalPath?.duration ? `${health.criticalPath.duration} pts total` : null}
            tagTone="neutral"
          >
            <CriticalPathSection criticalPath={health.criticalPath} />
          </InsightSection>

          {/* 3. Blocked Work */}
          {blocked.length > 0 && (
            <InsightSection
              icon="🚧"
              title="Blocked Tasks"
              description="Work that cannot proceed until prerequisites are completed"
              tag={`${blocked.length} blocked`}
              tagTone="warn"
            >
              <BlockedSection blockedTasks={blocked} />
            </InsightSection>
          )}

          {/* 4. Scope Creep */}
          <InsightSection
            icon="📦"
            title="Scope Tracking"
            description="Compares the current workload against the commitment made when the sprint started"
            tag={creep > 0 ? `+${creep}% growth` : 'No drift'}
            tagTone={creep > 15 ? 'bad' : creep > 5 ? 'warn' : 'good'}
          >
            <ScopeCreepSection scopeCreep={health.scopeCreep} />
          </InsightSection>

          {/* 5. Estimation */}
          <InsightSection
            icon="📐"
            title="Estimation Accuracy"
            description="How closely your team's effort estimates matched reality"
            tag={health.estimation?.hasData ? `${health.estimation.meanRatio}× ratio` : null}
            tagTone={health.estimation?.meanRatio > 1.15 ? 'warn' : 'good'}
          >
            <EstimationSection estimation={health.estimation} />
          </InsightSection>

          {/* 6. Burndown */}
          {burndown && (
            <InsightSection
              icon="📉"
              title="Sprint Burndown"
              description="Remaining work over time versus the ideal linear pace"
            >
              <div className="bg-slate-50/80 rounded-xl border border-slate-100 p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={burndown.burndown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" pts" />
                    <Tooltip />
                    <Line type="monotone" dataKey="ideal" stroke="#94a3b8" strokeDasharray="5 5" dot={false} name="Ideal Pace" />
                    <Line type="monotone" dataKey="remaining" stroke="#0f766e" strokeWidth={2.5} connectNulls={false} name="Actual Remaining" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-slate-400" /> Ideal pace</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-teal" /> Actual remaining work</span>
                </div>
              </div>
            </InsightSection>
          )}
        </>
      )}
    </div>
  );
}
