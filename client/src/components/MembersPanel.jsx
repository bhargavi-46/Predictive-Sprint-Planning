import { useState } from 'react';
import { api } from '../api/client';
import { ErrorNote, Avatar } from './ui';

export default function MembersPanel({ project, currentUserId, onChanged }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = project.owner.id === currentUserId;

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addMember(project.id, email.trim());
      setEmail('');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.user.name} from this project?`)) return;
    try {
      await api.removeMember(project.id, member.user.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-navy">Team members</h2>

      {isOwner && (
        <form onSubmit={invite} className="card space-y-3 p-4">
          <ErrorNote message={error} />
          <label className="label" htmlFor="m-email">Invite by email</label>
          <div className="flex gap-2">
            <input
              id="m-email" type="email" required className="input"
              placeholder="teammate@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy} className="btn-primary shrink-0">
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            The person must already have an account on this instance.
          </p>
        </form>
      )}

      <ul className="card divide-y divide-slate-100">
        {project.members.map((m) => (
          <li key={m.user.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={m.user.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {m.user.name}
                  {m.user.id === currentUserId && (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">{m.user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                m.role === 'owner' ? 'bg-navy/10 text-navy' : 'bg-slate-100 text-slate-600'
              }`}>
                {m.role}
              </span>
              {isOwner && m.role !== 'owner' && (
                <button type="button" onClick={() => remove(m)}
                        className="text-xs text-slate-400 hover:text-rust">
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
