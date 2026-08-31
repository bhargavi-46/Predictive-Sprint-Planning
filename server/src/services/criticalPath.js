/**
 * Critical Path Method (CPM) over the task dependency graph.
 *
 * Tasks are the activities; `dependsOn` edges are the precedence relations;
 * story points stand in for activity duration. The critical path is the
 * longest path through the graph — the chain whose length sets the earliest
 * possible finish for the whole sprint. Any task on it has zero float, so
 * slipping it slips the sprint.
 *
 * Implemented from first principles (Kahn's topological sort + forward and
 * backward passes) rather than pulled from a library, so every step is ours
 * to explain.
 */

/**
 * Detects a cycle using depth-first search with three colours:
 * white = unvisited, grey = on the current recursion stack, black = finished.
 * An edge into a grey node closes a loop.
 *
 * @returns {string[]|null} the cycle as a list of task ids, or null if none.
 */
export function findCycle(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const colour = new Map(tasks.map((t) => [t.id, 'white']));
  const parent = new Map();

  for (const task of tasks) {
    if (colour.get(task.id) !== 'white') continue;

    const stack = [{ id: task.id, phase: 'enter' }];
    while (stack.length) {
      const { id, phase } = stack.pop();

      if (phase === 'exit') {
        colour.set(id, 'black');
        continue;
      }
      if (colour.get(id) === 'grey') continue;

      colour.set(id, 'grey');
      stack.push({ id, phase: 'exit' });

      const node = byId.get(id);
      if (!node) continue;

      for (const depId of node.dependsOn.map(String)) {
        if (!byId.has(depId)) continue; // edge out of scope — ignore

        if (colour.get(depId) === 'grey') {
          // Walk the parent chain back to close the loop.
          const cycle = [depId];
          let cur = id;
          while (cur && cur !== depId) {
            cycle.push(cur);
            cur = parent.get(cur);
          }
          cycle.push(depId);
          return cycle.reverse();
        }
        if (colour.get(depId) === 'white') {
          parent.set(depId, id);
          stack.push({ id: depId, phase: 'enter' });
        }
      }
    }
  }
  return null;
}

/**
 * Would adding `taskId -> dependsOnId` create a cycle? Checked before every
 * dependency write, so the stored graph is always acyclic.
 */
export function wouldCreateCycle(tasks, taskId, dependsOnId) {
  if (String(taskId) === String(dependsOnId)) return true;

  const projected = tasks.map((t) =>
    t.id === String(taskId)
      ? { ...t, dependsOn: [...t.dependsOn.map(String), String(dependsOnId)] }
      : { ...t, dependsOn: t.dependsOn.map(String) }
  );
  return findCycle(projected) !== null;
}

/**
 * Kahn's algorithm. Returns ids in an order where every dependency precedes
 * the task that needs it, or null when the graph is cyclic.
 */
export function topologicalOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const indegree = new Map(tasks.map((t) => [t.id, 0]));
  const dependents = new Map(tasks.map((t) => [t.id, []]));

  for (const task of tasks) {
    for (const depId of task.dependsOn.map(String)) {
      if (!byId.has(depId)) continue;
      indegree.set(task.id, indegree.get(task.id) + 1);
      dependents.get(depId).push(task.id);
    }
  }

  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  return order.length === tasks.length ? order : null;
}

/**
 * Full CPM analysis.
 *
 * Forward pass  -> earliest start / earliest finish for every task.
 * Backward pass -> latest start / latest finish.
 * Float         -> latestStart - earliestStart. Zero float => critical.
 *
 * @param {Array} tasks plain objects: { id, title, reference, storyPoints,
 *                      status, dependsOn[] }
 */
export function analyseCriticalPath(tasks) {
  if (!tasks.length) {
    return { criticalPath: [], projectDuration: 0, tasks: [], hasCycle: false };
  }

  const cycle = findCycle(tasks);
  if (cycle) {
    return { criticalPath: [], projectDuration: 0, tasks: [], hasCycle: true, cycle };
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const order = topologicalOrder(tasks);

  // Completed work no longer contributes duration to the remaining schedule.
  const duration = (t) => (t.status === 'done' ? 0 : Math.max(t.storyPoints || 0, 0));

  // ---- Forward pass ----
  const earliestStart = new Map();
  const earliestFinish = new Map();

  for (const id of order) {
    const task = byId.get(id);
    const deps = task.dependsOn.map(String).filter((d) => byId.has(d));
    const start = deps.length ? Math.max(...deps.map((d) => earliestFinish.get(d))) : 0;

    earliestStart.set(id, start);
    earliestFinish.set(id, start + duration(task));
  }

  const projectDuration = Math.max(...order.map((id) => earliestFinish.get(id)));

  // ---- Backward pass ----
  const dependents = new Map(tasks.map((t) => [t.id, []]));
  for (const task of tasks) {
    for (const depId of task.dependsOn.map(String)) {
      if (byId.has(depId)) dependents.get(depId).push(task.id);
    }
  }

  const latestFinish = new Map();
  const latestStart = new Map();

  for (const id of [...order].reverse()) {
    const task = byId.get(id);
    const nexts = dependents.get(id);
    const finish = nexts.length
      ? Math.min(...nexts.map((n) => latestStart.get(n)))
      : projectDuration;

    latestFinish.set(id, finish);
    latestStart.set(id, finish - duration(task));
  }

  // ---- Float and criticality ----
  const analysed = tasks.map((t) => {
    const float = latestStart.get(t.id) - earliestStart.get(t.id);
    return {
      id: t.id,
      reference: t.reference,
      title: t.title,
      status: t.status,
      storyPoints: t.storyPoints,
      dependsOn: t.dependsOn.map(String),
      earliestStart: earliestStart.get(t.id),
      earliestFinish: earliestFinish.get(t.id),
      latestStart: latestStart.get(t.id),
      latestFinish: latestFinish.get(t.id),
      float,
      // Finished tasks have zero duration, so they sit on the path
      // arithmetically without actually constraining anything.
      isCritical: float === 0 && t.status !== 'done',
    };
  });

  // The critical path is the zero-float chain, in schedule order.
  const criticalPath = analysed
    .filter((t) => t.isCritical)
    .sort((a, b) => a.earliestStart - b.earliestStart)
    .map((t) => t.id);

  return { criticalPath, projectDuration, tasks: analysed, hasCycle: false };
}

/**
 * Tasks that cannot be started because something they depend on is unfinished.
 * Surfacing these early is the main day-to-day payoff of the dependency graph.
 */
export function findBlockedTasks(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return tasks
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const blockers = t.dependsOn
        .map(String)
        .map((id) => byId.get(id))
        .filter((d) => d && d.status !== 'done');

      return blockers.length
        ? {
            id: t.id,
            reference: t.reference,
            title: t.title,
            status: t.status,
            blockedBy: blockers.map((b) => ({
              id: b.id,
              reference: b.reference,
              title: b.title,
              status: b.status,
            })),
          }
        : null;
    })
    .filter(Boolean);
}
