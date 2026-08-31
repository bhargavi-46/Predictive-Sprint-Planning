import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Spinner, Avatar } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import Projects from './pages/Projects';
import Board from './pages/Board';
import Insights from './pages/Insights';
import Risks from './pages/Risks';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session…" />;
  return user ? children : <Navigate to="/login" replace />;
}

function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-navy-mid/40 bg-navy/95 backdrop-blur
                       supports-[backdrop-filter]:bg-navy/85">
      <div className="mx-auto flex h-14 max-w-[100rem] items-center justify-between px-5">
        <Link
          to="/projects"
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-white
                     transition-opacity hover:opacity-90"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-teal text-[13px]
                           font-bold text-white shadow-sm ring-1 ring-inset ring-white/20">
            A
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Agile Task Manager</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="mr-1 hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.name} size="sm" />
            <span className="text-sm font-medium text-white/90">{user.name}</span>
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login'); }}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium
                       text-white/90 transition-colors hover:border-white/35 hover:bg-white/10
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-white/40"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/projects"
          element={<RequireAuth><Projects /></RequireAuth>}
        />
        <Route
          path="/projects/:projectId"
          element={<RequireAuth><Board /></RequireAuth>}
        />
        <Route
          path="/projects/:projectId/insights"
          element={<RequireAuth><main className="mx-auto max-w-[100rem] px-5 py-7"><Insights /></main></RequireAuth>}
        />
        <Route
          path="/projects/:projectId/risks"
          element={<RequireAuth><main className="mx-auto max-w-[100rem] px-5 py-7"><Risks /></main></RequireAuth>}
        />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </div>
  );
}
