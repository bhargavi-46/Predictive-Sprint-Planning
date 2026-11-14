import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorNote } from '../components/ui';

/* Inline SVG icons — no emojis */
const Icons = {
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  trending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  logo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-white">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
    </svg>
  ),
};

const FEATURES = [
  { icon: Icons.target,   title: 'Monte Carlo Forecasting',  desc: 'Runs 10,000 simulations to predict your sprint completion probability.' },
  { icon: Icons.link,     title: 'Critical Path Detection',  desc: 'Finds the exact chain of tasks that governs your deadline.' },
  { icon: Icons.trending, title: 'Scope Creep Detection',    desc: 'Freezes a baseline at sprint start and flags every addition.' },
  { icon: Icons.zap,      title: 'Real-time Collaboration',  desc: 'Board updates live for every team member via WebSockets.' },
];

const DEMO_ACCOUNTS = [
  { label: 'Bhargavi', email: 'bhargavi@example.com', from: '#238c87', to: '#0891b2' },
  { label: 'Mrunal',   email: 'mrunal@example.com',   from: '#7c3aed', to: '#6d28d9' },
  { label: 'Akshit',   email: 'akshit@example.com',   from: '#ea580c', to: '#dc2626' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/projects" replace />;

  const fillDemo = (email) => setForm({ email, password: 'password123' });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form);
      navigate('/projects');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">

      {/* ── LEFT: dark brand panel ───────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #071624 0%, #122842 55%, #0a2e2b 100%)' }}
      >
        {/* Ambient glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-teal/8 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-teal/5 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/90 shadow-lg shadow-teal/20">
            {Icons.logo}
          </div>
          <span className="text-base font-bold tracking-tight text-white">Sprint Planner</span>
        </div>

        {/* Hero */}
        <div className="relative z-10">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.25em] text-teal">
            Predictive Sprint Intelligence
          </p>
          <h2 className="text-[2.6rem] font-black leading-[1.1] tracking-tight text-white">
            Will you finish<br />
            <span className="text-teal">on time?</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">
            Not just a tracker — an early warning system. See where your sprint is heading before it's too late.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4 group">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-teal transition-colors group-hover:bg-teal/15 group-hover:border-teal/30">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 border-t border-white/8 pt-6">
          <p className="text-xs text-slate-600">IIIT Vadodara &nbsp;·&nbsp; SPM Course</p>
          <p className="mt-1 text-[11px] text-slate-700">Mrunal &nbsp;·&nbsp; Akshit &nbsp;·&nbsp; Bhargavi</p>
        </div>
      </div>

      {/* ── RIGHT: form panel ───────────────────────────────────── */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center bg-paper px-6 py-10 sm:px-14">
        <div className="mx-auto w-full max-w-sm">

          {/* Mobile logo */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy">
              {Icons.logo}
            </div>
            <span className="text-base font-bold text-navy">Sprint Planner</span>
          </div>

          <h1 className="text-2xl font-bold text-navy">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your workspace</p>

          {/* Demo accounts */}
          <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Demo accounts
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => fillDemo(a.email)}
                  className="flex flex-col items-center gap-2 rounded-xl px-2 py-3 transition-all hover:scale-105 hover:shadow-md"
                  style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                    {a.label[0]}
                  </div>
                  <span className="text-[11px] font-semibold text-white">{a.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-400">
              Password: <span className="font-mono font-semibold text-slate-600">password123</span>
            </p>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or enter credentials</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorNote message={error} />
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" className="input"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" required autoComplete="current-password" className="input"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 font-semibold tracking-wide">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New here?{' '}
            <Link to="/register" className="font-semibold text-teal hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
