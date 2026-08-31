import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useProjectSocket } from '../hooks/useProjectSocket';
import { Spinner, ErrorNote } from '../components/ui';
import BoardColumn from '../components/BoardColumn';
import TeamFilterBar from '../components/TeamFilterBar';
import { TaskCardView } from '../components/TaskCard';
import TaskDialog from '../components/TaskDialog';
import SprintPanel from '../components/SprintPanel';
import BurndownPanel from '../components/BurndownPanel';
import MembersPanel from '../components/MembersPanel';

const COLUMNS = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'To Do' },
  { id: 'inprogress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'team', label: 'Team' },
];

export default function Board() {
  const { projectId } = useParams();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('board');
  const [sprintFilter, setSprintFilter] = useState('all');
  // Assignee filter. Empty means everyone; multi-select so a standup can show
  // two people's boards side by side.
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [newTaskStatus, setNewTaskStatus] = useState('backlog');
  const [activeTask, setActiveTask] = useState(null);

  // ------------------------------------------------------------ data load
  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [{ project: p }, { tasks: t }, { sprints: s }] = await Promise.all([
        api.getProject(projectId),
        api.listTasks(projectId),
        api.listSprints(projectId),
      ]);
      setProject(p);
      setTasks(t);
      setSprints(s);
      setSelectedSprintId((prev) => prev ?? (s.find((x) => x.status === 'active')?.id || s[0]?.id || null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadSprints = useCallback(async () => {
    const { sprints: s } = await api.listSprints(projectId);
    setSprints(s);
    setRefreshKey((k) => k + 1);
  }, [projectId]);

  // --------------------------------------------------- live collaboration
  useProjectSocket(projectId, {
    onTaskCreated: ({ task }) =>
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task])),
    onTaskUpdated: ({ task }) =>
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t))),
    onTaskDeleted: ({ taskId }) =>
      setTasks((prev) => prev.filter((t) => t.id !== taskId)),
    onBoardReordered: ({ tasks: fresh }) => setTasks(fresh),
    onSprintChanged: () => { reloadSprints(); },
  });

  // ------------------------------------------------------------ filtering
  const sprintTasks = useMemo(() => {
    if (sprintFilter === 'all') return tasks;
    if (sprintFilter === 'backlog') return tasks.filter((t) => !t.sprint);
    return tasks.filter((t) => t.sprint === sprintFilter);
  }, [tasks, sprintFilter]);

  /**
   * Per-person counts for the avatar strip. Derived from the sprint-filtered
   * set, not the assignee-filtered one, so the numbers stay stable as
   * selections change — a count that dropped to zero the moment you deselected
   * someone would be useless for deciding who to look at next.
   */
  const assigneeCounts = useMemo(() => {
    const counts = {};
    let unassigned = 0;
    for (const t of sprintTasks) {
      if (t.assignee) counts[t.assignee.id] = (counts[t.assignee.id] || 0) + 1;
      else unassigned += 1;
    }
    return { counts, unassigned };
  }, [sprintTasks]);

  const visibleTasks = useMemo(() => {
    if (!assigneeIds.length && !showUnassigned) return sprintTasks;
    return sprintTasks.filter((t) =>
      t.assignee ? assigneeIds.includes(t.assignee.id) : showUnassigned
    );
  }, [sprintTasks, assigneeIds, showUnassigned]);

  const tasksByColumn = useMemo(() => {
    const grouped = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
    visibleTasks.forEach((t) => grouped[t.status]?.push(t));
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.order - b.order));
    return grouped;
  }, [visibleTasks]);

  // --------------------------------------------------------- drag & drop
  const sensors = useSensors(
    // A small distance threshold keeps a click-to-open from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnOf = useCallback(
    (id) => {
      if (COLUMNS.some((c) => c.id === id)) return id; // dropped on the column itself
      return tasks.find((t) => t.id === id)?.status ?? null;
    },
    [tasks]
  );

  const onDragStart = ({ active }) => {
    setActiveTask(tasks.find((t) => t.id === active.id) || null);
  };

  const onDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;

    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to) return;

    const activeTaskObj = tasks.find((t) => t.id === active.id);
    if (!activeTaskObj) return;

    // Build the destination column's new ordering.
    const destination = tasksByColumn[to].filter((t) => t.id !== active.id);
    const overIndex = destination.findIndex((t) => t.id === over.id);
    const insertAt = overIndex === -1 ? destination.length : overIndex;
    destination.splice(insertAt, 0, { ...activeTaskObj, status: to });

    if (from === to && active.id === over.id) return;

    const orderedIds = destination.map((t) => t.id);

    // Optimistic update: reflect the move immediately, reconcile on response.
    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) => {
        const idx = orderedIds.indexOf(t.id);
        if (idx === -1) return t;
        return { ...t, status: to, order: idx };
      })
    );

    try {
      const { tasks: fresh } = await api.moveTask(projectId, active.id, {
        status: to,
        orderedIds,
      });
      setTasks(fresh);
      if (to === 'done' || from === 'done') setRefreshKey((k) => k + 1);
    } catch (err) {
      setTasks(snapshot); // roll back on failure
      window.alert(`Could not move the task: ${err.message}`);
    }
  };

  // -------------------------------------------------------- task actions
  const openNewTask = (status) => {
    setEditingTask(null);
    setNewTaskStatus(status);
    setDialogOpen(true);
  };

  const openTask = (task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const saveTask = async (payload) => {
    if (editingTask) {
      try {
        const { task } = await api.updateTask(projectId, editingTask.id, payload);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      } catch (err) {
        // Someone else edited this task first. Pull the current version in so
        // the user is looking at reality before they decide what to do.
        if (err.details?.code === 'STALE_VERSION') {
          const { task: fresh } = await api.getTask(projectId, editingTask.id);
          setTasks((prev) => prev.map((t) => (t.id === fresh.id ? fresh : t)));
          setEditingTask(fresh);
        }
        throw err;
      }
    } else {
      const body = { ...payload };
      // Honour the sprint currently being viewed when creating from that filter.
      if (!body.sprint && sprintFilter !== 'all' && sprintFilter !== 'backlog') {
        body.sprint = sprintFilter;
      }
      const { task } = await api.createTask(projectId, body);
      // The server already broadcasts task:created over the socket, which may
      // land before this response does — guard against adding it twice.
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
    }
    setRefreshKey((k) => k + 1);
    reloadSprints();
  };

  const deleteTask = async (task) => {
    await api.deleteTask(projectId, task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setRefreshKey((k) => k + 1);
    reloadSprints();
  };

  const handleDependencyChange = (updatedTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  // ---------------------------------------------------------------- view
  if (loading) return <Spinner label="Loading board…" />;
  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorNote message={error} onRetry={loadAll} /></div>;
  if (!project) return null;

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null;

  return (
    <main className="mx-auto max-w-[100rem] px-5 py-7">
      <nav className="mb-2 flex items-center gap-2 text-[13px]">
        <Link to="/projects" className="text-slate-500 transition-colors hover:text-navy">
          Projects
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-navy">{project.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-navy">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{project.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/projects/${projectId}/insights`} className="btn-secondary">
            Delivery Insights
          </Link>
          <Link to={`/projects/${projectId}/risks`} className="btn-secondary">
            Risk Register
          </Link>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3
                      border-b border-slate-200">
        <div className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`-mb-px rounded-t-md border-b-2 px-3.5 py-2.5 text-sm font-medium
                          transition-colors ${
                tab === t.id
                  ? 'border-teal text-navy'
                  : 'border-transparent text-slate-500 hover:bg-slate-900/[0.03] hover:text-navy'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'board' && (
          <div className="flex items-center gap-2 pb-2">
            <label htmlFor="sprint-filter" className="text-[13px] text-slate-500">
              Showing
            </label>
            <select
              id="sprint-filter" className="input h-9 w-56 py-0"
              value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}
            >
              <option value="all">All tasks</option>
              <option value="backlog">Backlog only (no sprint)</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === 'board' && (
        <>
        <TeamFilterBar
          members={project.members}
          selectedIds={assigneeIds}
          counts={assigneeCounts.counts}
          unassignedCount={assigneeCounts.unassigned}
          showUnassigned={showUnassigned}
          onToggleUnassigned={() => setShowUnassigned((v) => !v)}
          onToggle={(id) =>
            setAssigneeIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }
          onClear={() => { setAssigneeIds([]); setShowUnassigned(false); }}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id]}
                onAddTask={openNewTask}
                onOpenTask={openTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCardView task={activeTask} dragging /> : null}
          </DragOverlay>
        </DndContext>
        </>
      )}

      {tab === 'sprints' && (
        <SprintPanel
          projectId={projectId}
          sprints={sprints}
          activeSprintId={selectedSprintId}
          onSelect={setSelectedSprintId}
          onChanged={reloadSprints}
        />
      )}

      {tab === 'dashboard' && (
        <div className="space-y-4">
          {sprints.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="burndown-sprint" className="text-sm text-slate-500">Sprint</label>
              <select
                id="burndown-sprint" className="input w-64"
                value={selectedSprintId || ''}
                onChange={(e) => setSelectedSprintId(e.target.value)}
              >
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                ))}
              </select>
            </div>
          )}
          <BurndownPanel
            projectId={projectId}
            sprint={selectedSprint}
            refreshKey={refreshKey}
          />
        </div>
      )}

      {tab === 'team' && (
        <MembersPanel
          project={project}
          currentUserId={user.id}
          onChanged={loadAll}
        />
      )}

      <TaskDialog
        open={dialogOpen}
        task={editingTask}
        defaultStatus={newTaskStatus}
        members={project.members}
        sprints={sprints}
        projectId={projectId}
        allTasks={tasks}
        currentUserId={user.id}
        onClose={() => setDialogOpen(false)}
        onSave={saveTask}
        onDelete={deleteTask}
        onDependencyChange={handleDependencyChange}
      />
    </main>
  );
}
