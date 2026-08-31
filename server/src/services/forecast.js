/**
 * Probabilistic delivery forecasting by Monte Carlo simulation.
 *
 * Rather than dividing remaining work by an average velocity — which yields a
 * single date that is almost always wrong — we resample the team's own history
 * thousands of times and report the distribution of outcomes.
 *
 * The core idea: if past sprints delivered 12, 18, 9 and 15 points, then a
 * plausible future day looks like a random draw from those numbers. Repeat
 * the sprint 5,000 times and count how often the work finishes in time.
 */

const DEFAULT_TRIALS = 5000;

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Seeding matters here: an unseeded forecast returns slightly different
 * numbers on every page refresh, which makes the feature look broken and is
 * impossible to demonstrate reproducibly. Same inputs => same forecast.
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable seed derived from the inputs, so the same state forecasts the same. */
function seedFrom(remainingPoints, samples) {
  const base = samples.reduce((acc, v, i) => acc + v * (i + 1), remainingPoints * 31);
  return Math.floor(Math.abs(base) * 2654435761) % 2 ** 31 || 1;
}

/** Hard ceiling on simulated days; also bounds the histogram below. */
const MAX_DAYS = 365;

/**
 * Reads a percentile straight out of a histogram of day counts.
 *
 * The simulation produces small bounded integers (1..MAX_DAYS), so sorting the
 * raw results with a comparator was doing O(n log n) work — plus a function
 * call per comparison — to answer a question a cumulative count answers in a
 * single pass. Counting sort exploits the bounded domain: O(n + MAX_DAYS),
 * with no allocation per trial.
 */
function percentileFromHistogram(histogram, total, p) {
  if (!total) return 0;
  const target = Math.floor((p / 100) * total);
  let cumulative = 0;
  for (let days = 0; days <= MAX_DAYS; days += 1) {
    cumulative += histogram[days];
    if (cumulative > target) return days;
  }
  return MAX_DAYS;
}

/**
 * @param {object}   input
 * @param {number}   input.remainingPoints work still to deliver
 * @param {number[]} input.velocitySamples  historical points-per-day figures
 * @param {number}   input.daysRemaining    working days left in the sprint
 * @param {number}   [input.trials]
 */
export function forecastCompletion({
  remainingPoints,
  velocitySamples,
  daysRemaining,
  trials = DEFAULT_TRIALS,
}) {
  // No history yet — say so plainly instead of inventing a confident number.
  const samples = velocitySamples.filter((v) => v > 0);
  if (!samples.length) {
    return {
      hasEnoughData: false,
      message:
        'No completed work yet. The forecast becomes available once the team has finished some tasks.',
      probabilityOnTime: null,
      daysNeeded: null,
      percentiles: null,
      trials: 0,
    };
  }

  if (remainingPoints <= 0) {
    return {
      hasEnoughData: true,
      probabilityOnTime: 100,
      daysNeeded: { p50: 0, p85: 0, p95: 0 },
      percentiles: { p50: 0, p85: 0, p95: 0 },
      onTimeTrials: trials,
      trials,
      message: 'All committed work is complete.',
    };
  }

  const rng = makeRng(seedFrom(remainingPoints, samples));

  // Typed arrays: the sample pool is read once per simulated day, and the
  // histogram is written once per trial. Both stay in contiguous memory
  // instead of a boxed JS array.
  const pool = Float64Array.from(samples);
  const poolSize = pool.length;
  const histogram = new Int32Array(MAX_DAYS + 1);

  let onTime = 0;

  for (let i = 0; i < trials; i += 1) {
    let remaining = remainingPoints;
    let days = 0;

    // Simulate day by day, drawing a random historical velocity each day.
    // The cap stops a pathological run (very low velocities) looping forever.
    while (remaining > 0 && days < MAX_DAYS) {
      remaining -= pool[(rng() * poolSize) | 0];
      days += 1;
    }

    histogram[days] += 1;
    if (days <= daysRemaining) onTime += 1;
  }

  const p50 = percentileFromHistogram(histogram, trials, 50);
  const p85 = percentileFromHistogram(histogram, trials, 85);
  const p95 = percentileFromHistogram(histogram, trials, 95);

  return {
    hasEnoughData: true,
    probabilityOnTime: Math.round((onTime / trials) * 100),
    daysNeeded: { p50, p85, p95 },
    percentiles: { p50, p85, p95 },
    onTimeTrials: onTime,
    trials,
    daysRemaining,
    velocitySamplesUsed: samples.length,
  };
}

/**
 * Derives daily velocity samples from completed tasks: for each day on which
 * anything was finished, the total points completed that day.
 *
 * Days with zero completions are deliberately excluded — including them would
 * drag the mean toward zero and make every forecast pessimistic, since a team
 * that finishes three tasks on Friday is not "working at zero" Mon-Thu.
 */
export function deriveVelocitySamples(completedTasks) {
  const byDay = new Map();

  for (const task of completedTasks) {
    if (!task.completedAt) continue;
    const day = new Date(task.completedAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + (task.storyPoints || 0));
  }

  return [...byDay.values()].filter((v) => v > 0);
}

/** Whole days from now until the sprint ends (never negative). */
export function workingDaysRemaining(endDate, from = new Date()) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.ceil((end - from) / msPerDay));
}
