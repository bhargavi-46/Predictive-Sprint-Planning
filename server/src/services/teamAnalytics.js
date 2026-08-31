/**
 * Per-member workload analysis.
 *
 * A deliberate distinction runs through this file: **velocity stays a team
 * metric**. Per-person velocity is a well-known Agile anti-pattern — it
 * rewards hoarding easy tasks and penalises helping a teammate, and story
 * points are relative estimates agreed by the team, so they do not carry the
 * same meaning person to person. The forecast therefore continues to sample
 * team velocity and nothing here feeds into it.
 *
 * What is computed instead is *load*: how much committed work sits with each
 * person right now, how much of it is blocked, and how much they have
 * completed. That answers "is anyone overloaded this sprint?" — a capacity
 * question, not a ranking.
 */

/**
 * @param {Array}  tasks    plain task objects for one sprint
 * @param {Array}  members  [{ user: { id, name, email } }]
 * @returns per-member load plus a distribution summary
 */
export function analyseTeamWorkload(tasks, members) {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const blank = () => ({
    total: 0,
    totalPoints: 0,
    done: 0,
    donePoints: 0,
    inProgress: 0,
    blocked: 0,
    overdue: 0,
    remainingPoints: 0,
  });

  const stats = new Map();
  for (const m of members) {
    stats.set(String(m.user.id), {
      user: { id: m.user.id, name: m.user.name, email: m.user.email },
      ...blank(),
    });
  }

  const unassigned = { user: null, ...blank() };
  const now = new Date();

  for (const task of tasks) {
    const key = task.assignee ? String(task.assignee) : null;
    const bucket = key && stats.has(key) ? stats.get(key) : unassigned;

    const points = task.storyPoints || 0;
    bucket.total += 1;
    bucket.totalPoints += points;

    if (task.status === 'done') {
      bucket.done += 1;
      bucket.donePoints += points;
    } else {
      bucket.remainingPoints += points;

      if (task.status === 'inprogress') bucket.inProgress += 1;

      // Blocked means at least one dependency is not finished.
      const isBlocked = (task.dependsOn || []).some((depId) => {
        const dep = byId.get(String(depId));
        return dep && dep.status !== 'done';
      });
      if (isBlocked) bucket.blocked += 1;

      if (task.dueDate && new Date(task.dueDate) < now) bucket.overdue += 1;
    }
  }

  const withCompletion = (s) => ({
    ...s,
    completionPercent: s.totalPoints
      ? Math.round((s.donePoints / s.totalPoints) * 100)
      : 0,
  });

  const perMember = [...stats.values()]
    .map(withCompletion)
    .sort((a, b) => b.remainingPoints - a.remainingPoints);

  const loads = perMember.map((m) => m.remainingPoints);
  const assignedTotal = loads.reduce((a, b) => a + b, 0);
  const mean = perMember.length ? assignedTotal / perMember.length : 0;

  /**
   * Spread of remaining work across the team, 0-1. Higher means more
   * lopsided. Reported as a hint to rebalance, never as a target: some
   * imbalance is normal and expected.
   */
  const spread =
    mean > 0
      ? Number(
          (
            Math.sqrt(
              loads.reduce((acc, v) => acc + (v - mean) ** 2, 0) / loads.length
            ) / mean
          ).toFixed(2)
        )
      : 0;

  const busiest = perMember[0] || null;

  return {
    perMember,
    unassigned: withCompletion(unassigned),
    summary: {
      assignedPoints: assignedTotal,
      unassignedPoints: unassigned.remainingPoints,
      averageLoad: Math.round(mean * 10) / 10,
      loadSpread: spread,
      balanced: spread <= 0.5,
      busiest: busiest && busiest.remainingPoints > 0
        ? { name: busiest.user.name, remainingPoints: busiest.remainingPoints }
        : null,
    },
    note:
      'Load is shown for capacity planning. Velocity is deliberately reported ' +
      'for the team as a whole, not per person: individual velocity encourages ' +
      'hoarding easy work and discourages helping teammates, and story points ' +
      'are relative estimates agreed by the team rather than a personal rate.',
  };
}
