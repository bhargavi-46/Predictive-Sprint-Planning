import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../api/client';
import { Spinner, ErrorNote } from './ui';

function Stat({ label, value, accent = 'text-navy' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

export default function BurndownPanel({ projectId, sprint, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sprint) { setLoading(false); return undefined; }

    let cancelled = false;
    setLoading(true);
    setError('');

    api.getBurndown(projectId, sprint.id)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, sprint, refreshKey]);

  if (!sprint) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        Select or create a sprint to see its burndown chart.
      </div>
    );
  }

  if (loading) return <Spinner label="Calculating burndown…" />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const { summary, burndown } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total points" value={summary.totalPoints} />
        <Stat label="Completed" value={summary.completedPoints} accent="text-teal" />
        <Stat label="Remaining" value={summary.remainingPoints} accent="text-rust" />
        <Stat label="Progress" value={`${summary.percentComplete}%`} />
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-navy">
          Burndown — {sprint.name}
        </h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={burndown} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8"
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8"
                     label={{ value: 'Points', angle: -90, position: 'insideLeft',
                              style: { fontSize: 11, fill: '#94a3b8' } }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone" dataKey="ideal" name="Ideal" stroke="#94a3b8"
                strokeDasharray="5 5" dot={false} strokeWidth={2}
              />
              <Line
                type="monotone" dataKey="remaining" name="Actual remaining" stroke="#238c87"
                strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The actual line stops at today. Sitting above the ideal line means the sprint is
          running behind.
        </p>
      </div>
    </div>
  );
}
