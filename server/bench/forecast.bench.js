/**
 * Micro-benchmark for the Monte Carlo forecast.
 *
 *   npm run bench
 *
 * Reports throughput across trial counts and remaining-work sizes so the cost
 * of the simulation is a measured number rather than an assumption. Run before
 * and after any change to the simulation loop.
 */
import { forecastCompletion } from '../src/services/forecast.js';

const VELOCITY_SAMPLES = [3, 5, 8, 2, 13, 5, 8, 3, 5, 8];

function timeIt(label, fn, repeats = 5) {
  // One untimed pass so JIT warm-up is not charged to the first measurement.
  fn();

  const runs = [];
  for (let i = 0; i < repeats; i += 1) {
    const start = process.hrtime.bigint();
    fn();
    runs.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  runs.sort((a, b) => a - b);
  const median = runs[Math.floor(runs.length / 2)];
  const best = runs[0];
  return { label, median, best };
}

const scenarios = [
  { trials: 1_000, remainingPoints: 40 },
  { trials: 5_000, remainingPoints: 40 },
  { trials: 5_000, remainingPoints: 200 },
  { trials: 20_000, remainingPoints: 40 },
  { trials: 50_000, remainingPoints: 40 },
];

console.log('\nMonte Carlo forecast benchmark');
console.log(`node ${process.version}\n`);
console.log(
  'trials'.padEnd(9) +
    'points'.padEnd(9) +
    'median ms'.padEnd(12) +
    'best ms'.padEnd(11) +
    'trials/sec'
);
console.log('-'.repeat(56));

for (const { trials, remainingPoints } of scenarios) {
  const { median, best } = timeIt(`${trials}`, () =>
    forecastCompletion({
      remainingPoints,
      velocitySamples: VELOCITY_SAMPLES,
      daysRemaining: 10,
      trials,
    })
  );

  const perSec = Math.round(trials / (median / 1000)).toLocaleString();
  console.log(
    String(trials).padEnd(9) +
      String(remainingPoints).padEnd(9) +
      median.toFixed(2).padEnd(12) +
      best.toFixed(2).padEnd(11) +
      perSec
  );
}

// Determinism is a correctness property of the seeded generator, and cheap to
// assert here so a regression shows up alongside the timing numbers.
const a = forecastCompletion({
  remainingPoints: 40,
  velocitySamples: VELOCITY_SAMPLES,
  daysRemaining: 10,
});
const b = forecastCompletion({
  remainingPoints: 40,
  velocitySamples: VELOCITY_SAMPLES,
  daysRemaining: 10,
});
console.log(
  `\ndeterministic across runs: ${
    a.probabilityOnTime === b.probabilityOnTime && a.daysNeeded.p85 === b.daysNeeded.p85
      ? 'yes'
      : 'NO — seeding regression'
  }`
);
console.log(`sample result: ${a.probabilityOnTime}% on time, p85 = ${a.daysNeeded.p85} days\n`);
