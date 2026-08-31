import { useEffect } from 'react';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200
                       border-t-teal" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rust/25 bg-rust/[0.04]
                    px-3.5 py-3 text-sm text-rust">
      <span aria-hidden="true" className="mt-px shrink-0 font-semibold">!</span>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {description && (
        <p className="max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Accessible modal: closes on Escape and on backdrop click. */
export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex anim-fade-in items-center justify-center
                 bg-navy/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg anim-scale-in overflow-hidden rounded-xl border
                   border-slate-200 bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-7 w-7 place-items-center rounded-md text-lg leading-none
                       text-slate-400 transition-colors hover:bg-slate-100
                       hover:text-slate-700 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-teal/30"
          >
            ×
          </button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60
                             px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

const PRIORITY_STYLES = {
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
  medium: 'bg-sky-50 text-sky-700 ring-sky-200',
  high: 'bg-amber-50 text-amber-700 ring-amber-200',
  critical: 'bg-rust/10 text-rust ring-rust/25',
};

export function PriorityBadge({ priority }) {
  return (
    <span
      className={`badge shrink-0 ring-1 ring-inset ${
        PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium
      }`}
    >
      {priority}
    </span>
  );
}

/** Circular initials avatar; colour is derived from the name for stability. */
export function Avatar({ name, size = 'md' }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const palette = ['bg-navy', 'bg-teal', 'bg-navy-light', 'bg-rust', 'bg-navy-mid'];
  const hue = palette[(name || '').length % palette.length];
  const dims = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <span
      title={name}
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full
                  font-semibold text-white ring-2 ring-white/50 ${hue}`}
    >
      {initials}
    </span>
  );
}
