/**
 * P3-13 — fail-closed baseline comparison for the k6 smoke gate.
 *
 * Usage: node k6/compare-baseline.mjs <baseline.json> <summary.json>
 *
 * The absolute SLOs are enforced by k6 thresholds themselves. This script adds
 * three independent guards:
 *   1. threshold definitions cannot be silently weakened (exact key match),
 *   2. latency/error/check regressions beyond the committed tolerance fail,
 *   3. a run with too few samples cannot pass on noise.
 */
import fs from 'node:fs';

const [, , baselinePath, summaryPath] = process.argv;
const issues = [];
const rows = [];

if (!baselinePath || !summaryPath) {
  console.error('usage: node k6/compare-baseline.mjs <baseline.json> <summary.json>');
  process.exit(1);
}

function load(path, label) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    issues.push(`${label} could not be read/parsed: ${err.message}`);
    return null;
  }
}

const baseline = load(baselinePath, 'baseline');
const summary = load(summaryPath, 'summary');
const metrics = summary?.metrics ?? {};

if (baseline && baseline.schemaVersion !== 1) {
  issues.push(`baseline schemaVersion ${baseline.schemaVersion} != 1`);
}

const tolerance = baseline?.tolerance;
if (!tolerance || !Number.isFinite(tolerance.latencyMultiplier) ||
    !Number.isFinite(tolerance.latencyAbsoluteMs) ||
    !Number.isFinite(tolerance.errorRateAbsolute) ||
    !Number.isFinite(tolerance.minChecksRate) ||
    !Number.isFinite(tolerance.minRequestCount)) {
  issues.push('baseline.tolerance is missing or malformed');
}

const finite = v => typeof v === 'number' && Number.isFinite(v);
const n = v => (finite(v) ? v.toFixed(2) : 'n/a');

// 1) Threshold definitions are part of the contract. A removed or renamed
//    threshold is a weakening even if the current run happens to be fast.
for (const [metric, expected] of Object.entries(baseline?.thresholds ?? {})) {
  const actual = Object.keys(metrics[metric]?.thresholds ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    issues.push(
      `thresholds drift for ${metric}: expected ${wanted.join(', ')}, got ${actual.join(', ')}`,
    );
  }
}

// 2) Sample-size floor: a 5-request run must never establish a "pass".
const requestCount = metrics.http_reqs?.count;
if (!finite(requestCount) || requestCount < (tolerance?.minRequestCount ?? Infinity)) {
  issues.push(
    `http_reqs.count ${n(requestCount)} < minimum ${tolerance?.minRequestCount}`,
  );
}
rows.push(`| http_reqs.count | ${n(requestCount)} | >= ${tolerance?.minRequestCount} |`);

// 3) Error and check rates. Baseline error rate is 0 and the approved absolute
//    allowance is 0, so any failed request fails the gate.
const errorRate = metrics.http_req_failed?.value;
const allowedErrorRate = (baseline?.metrics?.http_req_failed?.rate ?? 0) +
  (tolerance?.errorRateAbsolute ?? 0);
if (!finite(errorRate) || errorRate > allowedErrorRate) {
  issues.push(`http_req_failed.rate ${n(errorRate)} > allowed ${n(allowedErrorRate)}`);
}
rows.push(`| http_req_failed.rate | ${n(errorRate)} | <= ${n(allowedErrorRate)} |`);

const checkRate = metrics.checks?.value;
if (!finite(checkRate) || checkRate < (tolerance?.minChecksRate ?? 1)) {
  issues.push(`checks.rate ${n(checkRate)} < minimum ${tolerance?.minChecksRate}`);
}
rows.push(`| checks.rate | ${n(checkRate)} | >= ${tolerance?.minChecksRate} |`);

// 4) Latency drift. Allowed = baseline * multiplier + absolute allowance.
for (const [metric, expected] of Object.entries(baseline?.metrics ?? {})) {
  if (!expected || !('p(95)' in expected)) continue;
  for (const stat of ['avg', 'p(95)', 'p(99)']) {
    const baseValue = expected[stat];
    const actualValue = metrics[metric]?.[stat];
    const allowed = finite(baseValue)
      ? baseValue * tolerance.latencyMultiplier + tolerance.latencyAbsoluteMs
      : NaN;
    if (!finite(baseValue) || !finite(actualValue)) {
      issues.push(`${metric}.${stat}: missing or non-finite value (${n(actualValue)})`);
    } else if (actualValue > allowed) {
      issues.push(
        `${metric}.${stat} ${n(actualValue)}ms > allowed ${n(allowed)}ms ` +
        `(baseline ${n(baseValue)}ms)`,
      );
    }
    rows.push(`| ${metric}.${stat} | ${n(actualValue)} ms | <= ${n(allowed)} ms |`);
  }
}

const report = [
  '## k6 smoke — baseline comparison',
  '',
  '| Metric | Actual | Allowed |',
  '|---|---:|---:|',
  ...rows,
  '',
  ...(issues.length ? ['**FAIL**', '', ...issues.map(i => `- ${i}`)] : ['**PASS** — no regression beyond the committed tolerance.']),
  '',
].join('\n');

console.log(report);
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) {
  try { fs.appendFileSync(stepSummary, report + '\n', 'utf8'); } catch { /* non-fatal */ }
}

if (issues.length) {
  console.error(`${issues.length} baseline regression(s) detected.`);
  process.exit(1);
}
