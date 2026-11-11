// Smoke test for the committed sparrow wasm module (src/lib/nesting/sparrow/pkg).
// Usage: node scripts/sparrow-wasm-smoke.mjs [job.json] [seconds]
// Default job: tmp/plans/nest-sparrow/probe/jobs/summer_men.json next to the repo, or
// SPARROW_SMOKE_JOB. Asserts: >=1 report; the first one within 1 s after the solver starts (the
// instance import before it is measured by a ~zero-budget call and reported separately); the
// final strip == last report strip; the whole call stays within the budget (+1 s: sparrow
// checks the deadline only between separator strikes).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = resolve(root, 'src/lib/nesting/sparrow/pkg');
const { initSync, solve } = await import(resolve(pkg, 'sparrow_wasm.js'));

const candidates = [
  process.argv[2],
  process.env.SPARROW_SMOKE_JOB,
  resolve(root, 'tmp/plans/nest-sparrow/probe/jobs/summer_men.json'),
  resolve(root, '../tmp/plans/nest-sparrow/probe/jobs/summer_men.json'),
].filter(Boolean);
const jobPath = candidates.find((p) => existsSync(p));
if (!jobPath) {
  console.error('sparrow-wasm-smoke: no job file; pass a path or set SPARROW_SMOKE_JOB');
  process.exit(2);
}
const seconds = Number(process.argv[3] ?? 5);

initSync({ module: readFileSync(resolve(pkg, 'sparrow_wasm_bg.wasm')) });

const instance = readFileSync(jobPath, 'utf8');

// Import + initial construction cost: a 1 ms budget returns right after them.
const tp = performance.now();
solve(instance, 0.001, 1, () => {});
const prep = (performance.now() - tp) / 1000;

const t0 = performance.now();
const reports = [];
const out = JSON.parse(
  solve(instance, seconds, 1, (json) => {
    const r = JSON.parse(json);
    reports.push({
      kind: r.kind,
      elapsed: r.elapsed_sec,
      wall: (performance.now() - t0) / 1000,
      strip: r.strip_width,
    });
    if (reports.length === 2) throw new Error('callback errors must be ignored by the solver');
  }),
);
const wall = (performance.now() - t0) / 1000;

const fail = [];
if (reports.length < 1) fail.push('no reports');
const first = reports[0];
if (first && first.wall > prep + 1) {
  fail.push(
    `first report at ${first.wall.toFixed(2)}s, import ${prep.toFixed(2)}s (> import + 1s)`,
  );
}
if (wall > seconds + 1) fail.push(`call took ${wall.toFixed(2)}s on a ${seconds}s budget`);
const last = reports[reports.length - 1];
const finalStrip = out.solution.strip_width;
if (last && Math.abs(last.strip - finalStrip) > 1e-6) {
  fail.push(`final strip ${finalStrip} != last report strip ${last.strip}`);
}
if (last && last.kind !== 'Final') fail.push(`last report kind ${last.kind}, expected Final`);

const kinds = reports.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
console.log(
  `job ${jobPath.split('/').pop()} ${seconds}s wall ${wall.toFixed(2)}s elapsed ${out.elapsed_sec.toFixed(2)}s import ${prep.toFixed(2)}s`,
);
console.log(
  `reports ${reports.length} ${JSON.stringify(kinds)} first ${first?.kind}@${first?.wall.toFixed(3)}s strip ${first?.strip.toFixed(2)}`,
);
console.log(
  `final strip ${finalStrip.toFixed(2)} density ${(100 * out.solution.density).toFixed(1)}%`,
);
if (fail.length) {
  console.error('FAIL: ' + fail.join('; '));
  process.exit(1);
}
console.log('OK');
