import { Avatar } from './ui';

/**
 * Avatar strip above the board for filtering by assignee.
 *
 * Multi-select rather than single: "show me Bhargavi and Akshit" is the actual
 * standup question, and a single-select control cannot express it. Clicking a
 * selected avatar removes them again, so the same click both adds and removes
 * and no separate clear affordance is needed per person.
 */
export default function TeamFilterBar({
  members,
  selectedIds,
  onToggle,
  onClear,
  counts = {},
  unassignedCount = 0,
  showUnassigned,
  onToggleUnassigned,
}) {
  const active = selectedIds.length > 0 || showUnassigned;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200
                    bg-white px-3 py-2.5 shadow-sm">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Team
      </span>

      {members.map((m) => {
        const id = m.user.id;
        const isOn = selectedIds.includes(id);
        const count = counts[id] ?? 0;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={isOn}
            title={`${m.user.name} — ${count} task${count === 1 ? '' : 's'}`}
            className={`group flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5
                        text-sm transition-all focus-visible:outline-none
                        focus-visible:ring-2 focus-visible:ring-teal/40 ${
              isOn
                ? 'border-teal bg-teal-light text-navy shadow-sm'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Avatar name={m.user.name} size="sm" />
            <span className="max-w-[7rem] truncate font-medium">
              {m.user.name.split(' ')[0]}
            </span>
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                isOn ? 'bg-white/70 text-teal' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}

      {unassignedCount > 0 && (
        <button
          type="button"
          onClick={onToggleUnassigned}
          aria-pressed={showUnassigned}
          title={`Unassigned — ${unassignedCount} task${unassignedCount === 1 ? '' : 's'}`}
          className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-sm
                      transition-all focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-teal/40 ${
            showUnassigned
              ? 'border-teal bg-teal-light text-navy shadow-sm'
              : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed
                           border-slate-300 text-[10px] text-slate-400">
            ?
          </span>
          <span className="font-medium">Unassigned</span>
          <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
            showUnassigned ? 'bg-white/70 text-teal' : 'bg-slate-100 text-slate-500'
          }`}>
            {unassignedCount}
          </span>
        </button>
      )}

      {active && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-slate-500
                     transition-colors hover:bg-slate-100 hover:text-navy"
        >
          Show everyone
        </button>
      )}
    </div>
  );
}
