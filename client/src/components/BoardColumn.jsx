import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';

const ACCENTS = {
  backlog: 'bg-slate-400',
  todo: 'bg-sky-500',
  inprogress: 'bg-amber-500',
  done: 'bg-teal',
};

export default function BoardColumn({ column, tasks, onAddTask, onOpenTask }) {
  // The column itself is a drop target so empty columns still accept a card.
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const points = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  return (
    <section className="flex w-[19rem] shrink-0 flex-col overflow-hidden rounded-xl border
                        border-slate-200 bg-slate-50/70 shadow-sm">
      <header className="border-b border-slate-200 bg-white px-3.5 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENTS[column.id]}`} />
          <h2 className="text-[13px] font-semibold tracking-tight text-navy">
            {column.title}
          </h2>
          <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px]
                           font-semibold tabular-nums text-slate-600">
            {tasks.length}
          </span>
        </div>
        <p className="mt-1 pl-4 text-[11px] tabular-nums text-slate-400">
          {points} story points
        </p>
      </header>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 p-2.5 transition-colors ${
          isOver ? 'bg-teal-light ring-1 ring-inset ring-teal/40' : ''
        }`}
        style={{ minHeight: '55vh' }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onOpenTask(task)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 py-8
                          text-center text-xs text-slate-400">
            Drop tasks here
          </div>
        )}

        <button
          type="button"
          onClick={() => onAddTask(column.id)}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2
                     text-xs font-medium text-slate-500 transition-colors
                     hover:border-teal hover:bg-white hover:text-teal
                     focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-teal/30"
        >
          + Add task
        </button>
      </div>
    </section>
  );
}
