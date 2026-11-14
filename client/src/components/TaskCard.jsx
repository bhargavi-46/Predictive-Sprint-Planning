import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar } from './ui';

function formatDue(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PRIORITY_CONFIG = {
  critical: { bar: 'bg-rose-500',   pill: 'bg-rose-50 text-rose-700 border-rose-200',    text: 'Critical' },
  high:     { bar: 'bg-orange-400', pill: 'bg-orange-50 text-orange-700 border-orange-200', text: 'High'  },
  medium:   { bar: 'bg-amber-400',  pill: 'bg-amber-50 text-amber-700 border-amber-200',   text: 'Medium' },
  low:      { bar: 'bg-sky-400',    pill: 'bg-sky-50 text-sky-700 border-sky-200',          text: 'Low'   },
};

/** Presentational card — reused for drag overlay */
export function TaskCardView({ task, dragging = false, onClick }) {
  const blockerCount = task.dependsOn?.length || 0;
  const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isOverdue = task.isOverdue && task.status !== 'done';

  return (
    <article
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-all duration-150 ${
        dragging
          ? 'rotate-2 scale-105 shadow-2xl ring-2 ring-teal/30 border-teal/30'
          : 'border-slate-200 shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300'
      }`}
    >
      {/* Priority left strip */}
      <div className={`absolute left-0 top-0 h-full w-[3px] ${pCfg.bar}`} />

      <div className="pl-4 pr-3 pt-3 pb-3 space-y-2.5">

        {/* Top: reference + priority */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {task.reference}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${pCfg.pill}`}>
            {pCfg.text}
          </span>
        </div>

        {/* Title */}
        <p className="text-[13px] font-semibold leading-snug text-slate-800 transition-colors group-hover:text-navy">
          {task.title}
        </p>

        {/* Blocked */}
        {blockerCount > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold text-rose-700">
              Blocked · waiting on {blockerCount} task{blockerCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Bottom: points + due + avatar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              {task.storyPoints} pt{task.storyPoints === 1 ? '' : 's'}
            </span>
            {task.dueDate && (
              <span className={`text-[11px] font-medium ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                {isOverdue && 'Overdue · '}{formatDue(task.dueDate)}
              </span>
            )}
          </div>
          {task.assignee ? (
            <Avatar name={task.assignee.name} size="sm" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-dashed border-slate-300 text-[10px] text-slate-400" title="Unassigned">
              —
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Sortable wrapper */
export default function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
    >
      <TaskCardView task={task} onClick={onClick} />
    </div>
  );
}
