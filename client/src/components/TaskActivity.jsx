import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Avatar, ErrorNote } from './ui';

const TABS = [
  { id: 'comments', label: 'Comments' },
  { id: 'history', label: 'History' },
];

function relativeTime(iso) {
  const seconds = Math.round((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Discussion and audit trail for one task.
 *
 * Both feeds are loaded lazily when the dialog opens rather than with the
 * board, since neither is needed until someone opens a specific card.
 */
export default function TaskActivity({ projectId, taskId, currentUserId }) {
  const [tab, setTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([
        api.listComments(projectId, taskId),
        api.listTaskActivity(projectId, taskId),
      ]);
      setComments(c.comments);
      setHistory(h.activity);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setBusy(true);
    setError('');
    try {
      const { comment } = await api.createComment(projectId, taskId, { body });
      setComments((prev) => [...prev, comment]);
      setDraft('');
      // A new comment is itself an audit entry, so refresh the history too.
      api.listTaskActivity(projectId, taskId).then((h) => setHistory(h.activity));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.deleteComment(projectId, taskId, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="mb-3 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-teal-light text-navy'
                : 'text-slate-500 hover:bg-slate-100 hover:text-navy'
            }`}
          >
            {t.label}
            {t.id === 'comments' && comments.length > 0 && (
              <span className="ml-1.5 text-[11px] tabular-nums text-slate-400">
                {comments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />

      {loading ? (
        <p className="py-3 text-xs text-slate-400">Loading…</p>
      ) : tab === 'comments' ? (
        <div className="space-y-3">
          {comments.length === 0 && (
            <p className="text-xs text-slate-500">
              No comments yet. Add context, a decision, or a blocker here.
            </p>
          )}

          {comments.map((c) => (
            <article key={c.id} className="flex gap-2.5">
              <Avatar name={c.author?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-navy">
                    {c.author?.name}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {relativeTime(c.createdAt)}
                    {c.editedAt ? ' · edited' : ''}
                  </span>
                  {c.author?.id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="ml-auto text-[11px] text-slate-400 hover:text-rust"
                    >
                      Delete
                    </button>
                  )}
                </p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              </div>
            </article>
          ))}

          <form onSubmit={submit} className="space-y-2">
            <textarea
              className="input"
              rows={2}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-secondary btn-sm"
                disabled={busy || !draft.trim()}
              >
                {busy ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {history.length === 0 && (
            <p className="text-xs text-slate-500">No changes recorded yet.</p>
          )}
          {history.map((a) => (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <Avatar name={a.actor?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-slate-700">
                  <span className="font-semibold text-navy">{a.actor?.name}</span>{' '}
                  {a.summary}
                </p>
                <p className="text-[11px] text-slate-400">{relativeTime(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
