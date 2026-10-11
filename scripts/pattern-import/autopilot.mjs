#!/usr/bin/env node
// PATTERN-IMPORT · A10 AUTOPILOT metric runner — bundles autopilot-entry.ts once (React aliased to
// the one-component shim, so the REAL wizard hook runs), then every case in its own node process,
// and writes reports/AUTOPILOT-<date>.json with a table: reached apply / stopped, the top stop
// reasons, wrong exports by kind and by the assumption that gave them.
//   node scripts/pattern-import/autopilot.mjs [case…] [--mutate=qty|size|drop|page-role] [--page-roles]
//   (--page-roles: the AI page roles from the recorded fixture; --mutate=page-role: a real tile
//   answered "instructions" 0.99 must stay a tile)
//   yarn patimport:autopilot · yarn patimport:e2e --autopilot
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, AUTOPILOT_REPORT (file name)
// Exit 1 when a mutation run does not see its injected wrong answer, or a written manifest does
// not carry the run's assumptions.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';

if (process.env.AP_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.AP_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const bundle = resolve(tmpdir(), `patimport-autopilot-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'autopilot-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MUTATE = FLAGS.find((f) => f.startsWith('--mutate='))?.slice(9) ?? '';
// A9: the recorded AI page roles (fixtures/page-roles.json) — never a paid call
const PAGE_ROLES = FLAGS.includes('--page-roles') ? '1' : process.env.AUTOPILOT_PAGE_ROLES ?? '';

const child = (args) => {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...args],
    {
      env: {
        ...process.env,
        AP_CHILD: bundle,
        PATIMPORT_REPO: REPO,
        AUTOPILOT_MUTATE: MUTATE,
        AUTOPILOT_PAGE_ROLES: PAGE_ROLES,
      },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    },
  );
  const lines = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('@@RESULT '));
  if (!lines.length)
    return {
      id: args[0],
      verdict: 'crashed',
      status: r.status,
      signal: r.signal,
      stderr: (r.stderr ?? '').slice(-1500),
    };
  return JSON.parse(lines[0].slice(9));
};

const ids = ARGS.length
  ? ARGS
  : JSON.parse(
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'list'], {
        env: { ...process.env, AP_CHILD: bundle },
        encoding: 'utf8',
      }).stdout,
    );

const results = [];
for (const id of ids) {
  const t = Date.now();
  const r = child([id]);
  results.push(r);
  const stop = r.stop ? `${r.stop.step}: ${String(r.stop.reason).slice(0, 90)}` : '';
  console.log(
    `${id.padEnd(46)} ${String(r.verdict).padEnd(8)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  as ${String(r.assumptions?.total ?? '—').padStart(3)}/${String(r.assumptions?.strong ?? '—').padStart(2)}!  wrong ${String(r.wrong?.total ?? '—').padStart(2)}  ${stop}${r.error ? ` ERROR ${String(r.error).split('\n')[0]}` : ''}`,
  );
}

// ── summary ────────────────────────────────────────────────────────────────────────────────────
const sum = (f) => results.reduce((a, r) => a + (f(r) ?? 0), 0);
const merge = (get) =>
  results.reduce((a, r) => {
    for (const [k, v] of Object.entries(get(r) ?? {})) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {});
const top = (o, n = 12) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
const real = results.filter((r) => r.group !== 'refusal' && r.group !== 'control');
// A10 card controls: a card that names nothing / a model not on the sheet / two — must stop
const controls = results.filter((r) => r.group === 'control');
// a control that picked, did not reach its question (Codex #7: unreached FAILS) or crashed
const controlsFailed = controls
  .filter((r) => !r.control?.ok)
  .map(
    (r) =>
      `${r.id} (${!r.control ? r.verdict : r.control.picked ? 'picked' : !r.control.reached ? `not reached: ${r.stop?.step}` : r.control.bypassed ? 'next imported a sheet' : (r.control.failed ?? []).join('; ') || 'rename not re-chosen'})`,
  );
// the dry card match (the pages' labels at extraction) on the truth cases that name a model/sheet
const cardMatched = real.filter((r) => r.cardMatch?.sheet != null || r.cardMatch?.model != null);
const cardWrong = real.flatMap((r) => (r.cardMatch?.wrong ?? []).map((w) => `${r.id}: ${w}`));
const reached = real.filter((r) => r.verdict === 'apply');
const stopReasons = {};
for (const r of real)
  if (r.verdict !== 'apply') {
    const why = r.stop
      ? `${r.stop.step}: ${String(r.stop.reason)
          .replace(/\d+(\.\d+)?/g, 'N')
          .slice(0, 110)}`
      : r.verdict;
    stopReasons[why] = (stopReasons[why] ?? 0) + 1;
  }
const summary = {
  cases: real.length,
  reachedApply: reached.length,
  stopped: real.length - reached.length,
  refusalsStopped: results.filter((r) => r.group === 'refusal' && r.verdict === 'stopped').length,
  refusals: results.filter((r) => r.group === 'refusal').length,
  wrongByKind: merge((r) => r.wrong?.byKind),
  wrongReachedByKind: merge((r) => (r.verdict === 'apply' ? r.wrong?.byKind : null)),
  wrongByAssumption: merge((r) => r.wrong?.assumedByKind),
  wrongPassing: sum((r) => r.wrongPassing),
  assumptions: sum((r) => r.assumptions?.total),
  strongAssumptions: sum((r) => r.assumptions?.strong),
  assumptionsByKind: merge((r) => r.assumptions?.byKind),
  strongByKind: merge((r) => r.assumptions?.strongByKind),
  topStops: top(stopReasons),
  // the rule runs on sheets only (a DXF carries its grain): scored there, DXF shown apart
  grainRule: {
    n: sum((r) => (r.grainRule?.dxf ? 0 : r.grainRule?.n)),
    within5: sum((r) => (r.grainRule?.dxf ? 0 : r.grainRule?.within5)),
    within15: sum((r) => (r.grainRule?.dxf ? 0 : r.grainRule?.within15)),
  },
  grainRuleDxf: {
    n: sum((r) => (r.grainRule?.dxf ? r.grainRule?.n : 0)),
    within5: sum((r) => (r.grainRule?.dxf ? r.grainRule?.within5 : 0)),
  },
  manifestProblems: results.flatMap((r) =>
    (r.write ?? []).filter((w) => !w.manifestOk).map((w) => `${r.id} ${w.scope}`),
  ),
  // the policy's own "now" against the wizard's on every question (must be 0)
  fingerprintDrift: sum((r) => r.fingerprintDrift),
  controls: controls.length,
  controlsFailed,
  cardMatch: cardMatched.map(
    (r) =>
      `${r.id}: ${r.cardMatch.sheet != null ? `sheet ${r.cardMatch.sheet}` : ''}${r.cardMatch.model != null ? ` model ${r.cardMatch.model}` : ''}`,
  ),
  cardWrong,
  mutate: MUTATE || null,
  pageRoles: !!PAGE_ROLES || MUTATE === 'page-role',
  mutated: results.flatMap((r) => (r.mutated ?? []).map((m) => `${r.id}: ${m}`)),
};
console.log(
  `\nreached apply ${summary.reachedApply}/${summary.cases} (${Math.round((100 * summary.reachedApply) / Math.max(1, summary.cases))} %) · stopped ${summary.stopped} · refusals stopped ${summary.refusalsStopped}/${summary.refusals}`,
);
console.log(
  `assumptions ${summary.assumptions} (strong ${summary.strongAssumptions}) · wrong in reached exports: ${JSON.stringify(summary.wrongReachedByKind)} · wrongPassing ${summary.wrongPassing}`,
);
console.log(`wrong by kind (all cases): ${JSON.stringify(summary.wrongByKind)}`);
console.log(`wrong by the assumption that gave it: ${JSON.stringify(summary.wrongByAssumption)}`);
console.log(
  `grain fallback vs drawn grainlines (sheets): ${summary.grainRule.within5}/${summary.grainRule.n} within 5°, ${summary.grainRule.within15}/${summary.grainRule.n} within 15° · (DXF blocks, never used there: ${summary.grainRuleDxf.within5}/${summary.grainRuleDxf.n})`,
);
console.log('top stop reasons:');
for (const [k, v] of summary.topStops) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`assumptions by kind: ${JSON.stringify(summary.assumptionsByKind)}`);
console.log(`strong by kind: ${JSON.stringify(summary.strongByKind)}`);
if (summary.manifestProblems.length)
  console.log(`✗ manifest does not carry the assumptions: ${summary.manifestProblems.join(', ')}`);
if (controls.length)
  console.log(
    controlsFailed.length
      ? `✗ card controls failed${MUTATE === 'card' ? ' (expected under --mutate=card)' : ''}: ${controlsFailed.join(', ')}`
      : `✓ card controls: every one stopped on its question, picked nothing ${controls.length}/${controls.length}`,
  );
console.log(
  `card match (dry, pages' labels): ${summary.cardMatch.join(' · ') || 'none'} · wrong ${cardWrong.length}${cardWrong.length ? ` ✗ ${cardWrong.join(', ')}` : ''}`,
);

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const out = resolve(
  REPORTS,
  process.env.AUTOPILOT_REPORT ?? `AUTOPILOT-${date}${MUTATE ? `-mutate-${MUTATE}` : ''}.json`,
);
writeFileSync(out, JSON.stringify({ summary, results }, null, 1));
console.log(`→ ${out}`);

if (summary.fingerprintDrift)
  console.log(
    `✗ the policy's answer fingerprint drifted from the wizard's ${summary.fingerprintDrift}×`,
  );
let bad =
  summary.manifestProblems.length > 0 ||
  summary.fingerprintDrift > 0 ||
  (MUTATE !== 'card' && controlsFailed.length > 0) ||
  cardWrong.length > 0;
if (MUTATE === 'card') {
  // the control: a pick injected at each control's question must make that control fail
  const injected = controls.filter((r) => r.mutated?.length);
  const caught = injected.filter((r) => !r.control?.ok);
  console.log(
    `mutation card: injected in ${injected.length} control(s), caught in ${caught.length}`,
  );
  if (!injected.length || caught.length !== injected.length) bad = true;
} else if (MUTATE) {
  // the control: every injected wrong answer must be counted wrong, attributed to an assumption
  // only a case that wrote its export can show the wrong answer (a stop before the write is not
  // a miss of the control — it is reported apart)
  const injected = results.filter((r) => r.mutated?.length);
  // 'drop' tests the truth matcher itself: every case it was injected in counts
  // 'page-role' (A9): the injected wrong AI answer must change nothing — every mutated tile kept
  const seen =
    MUTATE === 'drop' || MUTATE === 'page-role' ? injected : injected.filter((r) => r.write);
  const caught = seen.filter((r) =>
    MUTATE === 'page-role'
      ? // kept as a tile, and an export that was written has its whole piece set (Codex #6)
        r.mutated.every((m) => / kept as a tile$/.test(m)) &&
        !(r.wrong?.items ?? []).some((x) => x.startsWith('piece-set'))
      : (r.wrong?.items ?? []).some((x) =>
          MUTATE === 'drop'
            ? x.startsWith('piece-set') && /missing/.test(x)
            : x.startsWith(MUTATE === 'qty' ? 'quantity' : 'size') &&
              /\[(quantity|size-guess)\]/.test(x),
        ),
  );
  console.log(
    `mutation ${MUTATE}: injected in ${injected.length} case(s), ${seen.length} reached the export, caught in ${caught.length}`,
  );
  if (!seen.length || caught.length !== seen.length) bad = true;
}
process.exit(bad ? 1 : 0);
