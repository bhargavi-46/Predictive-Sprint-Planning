/**
 * Scope-creep detection and estimation-accuracy analysis.
 *
 * Both answer questions a burndown chart structurally cannot: a burndown that
 * trends flat looks identical whether the team stalled or whether they
 * delivered steadily while new work was added at the same rate.
 */

/**
 * Compares the sprint's current contents against the commitment baseline
 * frozen when the sprint started.
 *
 * @param {object} commitment  { capturedAt, taskIds[], totalPoints, pointsByTask }
 * @param {Array}  currentTasks tasks presently in the sprint
 */
export function analyseScopeCreep(commitment, currentTasks) {
  if (!commitment || !commitment.capturedAt) {
    return {
      hasBaseline: false,
      message:
        'No commitment baseline recorded. Start the sprint to freeze its scope and enable creep detection.',
    };
  }

  const baselineIds = new Set(commitment.taskIds.map(String));
  const currentById = new Map(currentTasks.map((t) => [t.id, t]));
  const currentIds = new Set(currentById.keys());

  const added = currentTasks.filter((t) => !baselineIds.has(t.id));
  const removed = [...baselineIds].filter((id) => !currentIds.has(id));

  // Re-estimation: same task, different points than at commitment time.
  const pointsByTask = commitment.pointsByTask
    ? Object.fromEntries(commitment.pointsByTask)
    : {};

  const reEstimated = currentTasks
    .filter((t) => baselineIds.has(t.id))
    .map((t) => {
      const before = pointsByTask[t.id];
      if (before === undefined || before === t.storyPoints) return null;
      return {
        id: t.id,
        reference: t.reference,
        title: t.title,
        pointsBefore: before,
        pointsAfter: t.storyPoints,
        delta: t.storyPoints - before,
      };
    })
    .filter(Boolean);

  const addedPoints = added.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const removedPoints = commitment.totalPoints
    ? removed.reduce((s, id) => s + (pointsByTask[id] || 0), 0)
    : 0;
  const reEstimatedDelta = reEstimated.reduce((s, r) => s + r.delta, 0);

  const currentPoints = currentTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const netChange = currentPoints - commitment.totalPoints;

  const creepPercent = commitment.totalPoints
    ? Math.round((netChange / commitment.totalPoints) * 100)
    : 0;

  return {
    hasBaseline: true,
    capturedAt: commitment.capturedAt,
    baseline: {
      taskCount: commitment.taskIds.length,
      totalPoints: commitment.totalPoints,
    },
    current: { taskCount: currentTasks.length, totalPoints: currentPoints },
    added: added.map((t) => ({
      id: t.id,
      reference: t.reference,
      title: t.title,
      storyPoints: t.storyPoints,
    })),
    removedCount: removed.length,
    reEstimated,
    totals: { addedPoints, removedPoints, reEstimatedDelta, netChange, creepPercent },
    // A tenth of the sprint appearing after kickoff is the usual danger line.
    verdict:
      creepPercent > 10 ? 'significant' : creepPercent > 0 ? 'moderate' : 'controlled',
  };
}

/**
 * Estimation accuracy across completed tasks.
 *
 * Reports the ratio of actual to estimated effort. A team consistently above
 * 1.0 is optimistic; consistently below is padding. Either way, knowing the
 * bias lets the next sprint's plan be adjusted deliberately.
 */
export function analyseEstimationAccuracy(tasks) {
  const measurable = tasks.filter(
    (t) => t.status === 'done' && t.actualPoints !== null && t.actualPoints !== undefined
  );

  if (!measurable.length) {
    return {
      hasData: false,
      message:
        'No completed tasks have recorded actual effort yet. Record actuals on completion to enable calibration.',
      sampleSize: 0,
    };
  }

  const ratios = measurable.map((t) => ({
    id: t.id,
    reference: t.reference,
    title: t.title,
    estimated: t.storyPoints,
    actual: t.actualPoints,
    ratio: t.storyPoints > 0 ? t.actualPoints / t.storyPoints : 1,
    variance: t.actualPoints - t.storyPoints,
  }));

  const meanRatio = ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length;

  // Mean absolute percentage error — the standard estimation-accuracy measure.
  const mape =
    (ratios
      .filter((r) => r.estimated > 0)
      .reduce((s, r) => s + Math.abs(r.variance) / r.estimated, 0) /
      ratios.filter((r) => r.estimated > 0).length) *
    100;

  const totalEstimated = measurable.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const totalActual = measurable.reduce((s, t) => s + (t.actualPoints || 0), 0);

  let bias = 'well calibrated';
  if (meanRatio > 1.15) bias = 'optimistic (work takes longer than estimated)';
  else if (meanRatio < 0.85) bias = 'conservative (estimates are padded)';

  return {
    hasData: true,
    sampleSize: measurable.length,
    meanRatio: Number(meanRatio.toFixed(2)),
    mape: Number(mape.toFixed(1)),
    totalEstimated,
    totalActual,
    bias,
    // Multiply next sprint's raw estimates by this to correct known bias.
    suggestedAdjustment: Number(meanRatio.toFixed(2)),
    worstEstimates: [...ratios]
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 5),
  };
}
