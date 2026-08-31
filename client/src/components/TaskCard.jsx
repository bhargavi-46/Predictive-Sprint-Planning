import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PriorityBadge, Avatar } from './ui';

function formatDue(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Presentational card, also reused for the drag overlay. */
export function TaskCardView({ task, dragging = false, onClick }) {
  const blockerCount = task.dependsOn?.length || 0;

  return (
    <article
      onClick={onClick}
      className={`card cursor-pointer space-y-2 p-3 ${
        dragging
          ? 'rotate-1 shadow-xl ring-1 ring-teal/30'
          : 'transition-all duration-150 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wide text-slate-400">
          {task.reference}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      <p className="text-[13px] font-medium leading-snug text-slate-800">{task.title}</p>

      {blockerCount > 0 && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-rust">
          <span aria-hidden="true">⛔</span>
          blocked by {blockerCount}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold tabular-nums">
            {task.storyPoints} pt{task.storyPoints === 1 ? '' : 's'}
          </span>
          {task.dueDate && (
            <span className={task.isOverdue ? 'font-semibold text-rust' : ''}>
              {formatDue(task.dueDate)}
            </span>
          )}
        </div>
        {task.assignee ? (
          <Avatar name={task.assignee.name} size="sm" />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed
                           border-slate-300 text-[10px] text-slate-400" title="Unassigned">
            ?
          </span>
        )}
      </div>
    </article>
  );
}

/** Sortable wrapper used inside the board columns. */
export default function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <TaskCardView task={task} onClick={onClick} />
    </div>
  );
}
