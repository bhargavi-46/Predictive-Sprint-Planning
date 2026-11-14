import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';

const COLUMN_CONFIG = {
  backlog:    { bar: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-600',  header: 'bg-slate-50',  label: 'Backlog',      ring: 'ring-slate-300' },
  todo:       { bar: 'bg-sky-500',    badge: 'bg-sky-50 text-sky-700',        header: 'bg-sky-50/60', label: 'To Do',        ring: 'ring-sky-300' },
  inprogress: { bar: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700',    header: 'bg-amber-50/60', label: 'In Progress', ring: 'ring-amber-300' },
  done:       { bar: 'bg-teal',       badge: 'bg-teal-light text-teal',        header: 'bg-teal-light/50', label: 'Done',     ring: 'ring-teal/40' },
};

export default function BoardColumn({ column, tasks, onAddTask, onOpenTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const cfg = COLUMN_CONFIG[column.id] || COLUMN_CONFIG.backlog;
  const points = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200
                  bg-white shadow-sm transition-all duration-150 ${isOver ? `ring-2 ${cfg.ring} shadow-md` : ''}`}
    >
      {/* Top colour accent */}
      <div className={`h-[3px] w-full ${cfg.bar}`} />

      {/* Header */}
      <header className={`${cfg.header} border-b border-slate-100 px-4 py-3`}>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 shrink-0 rounded-full ${cfg.bar}`} />
          <h2 className="flex-1 text-sm font-bold tracking-tight text-navy">{column.title}</h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${cfg.badge}`}>
            {tasks.length}
          </span>
        </div>
        <p className="mt-1 pl-4 text-[11px] text-slate-400 tabular-nums">
          {points} story {points === 1 ? 'point' : 'points'}
        </p>
      </header>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2.5 p-3 transition-colors duration-150 ${
          isOver ? 'bg-teal/5' : 'bg-slate-50/40'
        }`}
        style={{ minHeight: '56vh' }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onOpenTask(task)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-10 text-center">
            <p className="text-xs text-slate-400">No tasks</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => onAddTask(column.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300
                     py-2.5 text-xs font-semibold text-slate-500 transition-all
                     hover:border-teal hover:bg-white hover:text-teal hover:shadow-sm
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
        >
          + Add task
        </button>
      </div>
    </section>
  );
}
