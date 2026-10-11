#!/usr/bin/env node
// PATTERN-IMPORT · P2 + P3 probe runner (auto/LEAKS-ANALYSIS rows P2, P3) — bundles p23-entry.ts,
// runs the synthetic checks, then the real cases with each fix on and with it off (mutation):
//   P2  dxf:RC28-RC28-001-test-3 — the AAMA/ASTM layer roles: every face closes, more pieces pass;
//       test-2 and Shell_Fabric no worse; with P2_NOLAYER=1 test-3 leaks again.
//   P3  wm — the sleeve click (ID: 3) closes in every size; with P3_NOFACE=1 XS–M leak again.
//   node scripts/pattern-import/p23.mjs [--synth-only]      (yarn patimport:p23)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, PATIMPORT_E2E_OUT
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

if (process.env.P23_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.P23_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const bundle = resolve(tmpdir(), `patimport-p23-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'p23-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const child = (a, env = {}) => {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...a],
    {
      env: { ...process.env, P23_CHILD: bundle, ...env },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    },
  );
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@RESULT '));
  if (!line) {
    console.log((r.stdout ?? '').slice(-2000) + (r.stderr ?? '').slice(-2000));
    return null;
  }
  return JSON.parse(line.slice(9));
};

let fails = 0;
const ck = (ok, name, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
};

console.log('# synthetic');
const syn = child(['synth']);
if (!syn) ck(false, 'synthetic crashed');
else for (const c of syn.checks) ck(c.ok, c.name, c.detail);

const out = { synthetic: syn, cases: {} };
if (!process.argv.includes('--synth-only')) {
  const fam = (row, label) => (row?.withClicks?.per ?? []).find((f) => f.label === label);
  const passing = (row) => (row?.write ?? []).reduce((a, w) => a + w.passing, 0);
  const blocks = (row) => (row?.write ?? []).reduce((a, w) => a + w.blocks, 0);

  console.log('\n# P2 — dxf:RC28-RC28-001-test-3 (AAMA/ASTM layers)');
  const t3 = child(['case', 'dxf:RC28-RC28-001-test-3']);
  const t3m = child(['case', 'dxf:RC28-RC28-001-test-3'], { P2_NOLAYER: '1' });
  out.cases.test3 = { on: t3, off: t3m };
  console.log(
    `  on: ${t3?.verdict} · families ${t3?.auto?.closedFamilies}/${t3?.auto?.families} closed · leaks ${t3?.auto?.leak} · blocks ${passing(t3)}/${blocks(t3)} passing · clicks ${t3?.clicks?.total}`,
  );
  console.log(
    `  off: ${t3m?.verdict} · families ${t3m?.auto?.closedFamilies}/${t3m?.auto?.families} closed · leaks ${t3m?.auto?.leak} · blocks ${passing(t3m)}/${blocks(t3m)} passing · clicks ${t3m?.clicks?.total}`,
  );
  ck(
    t3 && t3.auto.leak === 0 && t3.auto.closedFamilies === t3.auto.families,
    'P2 test-3: every seeded outline closes (no junk faces)',
  );
  ck(t3 && t3.legend?.roles?.common === 1, 'P2 test-3: one outline row (the CUT layer)');
  ck(
    t3 && passing(t3) > passing(t3m),
    'P2 test-3: more pieces pass the gate than with the pass off',
  );
  ck(t3m && t3m.auto.leak > 0, 'P2 mutation (P2_NOLAYER=1): test-3 leaks again');
  ck((t3?.wrongPassing ?? 1) === 0, 'P2 test-3: wrongPassing 0');
  for (const id of [
    'dxf:RC28-RC28-001-test-2',
    'dxf:RC28-RC28-001-Shell_Fabric_-_Alt_(substitute)',
  ]) {
    const on = child(['case', id]);
    const off = child(['case', id], { P2_NOLAYER: '1' });
    out.cases[id] = { on, off };
    console.log(
      `  ${id}: on ${on?.verdict} ${passing(on)}/${blocks(on)} clicks ${on?.clicks?.total} · off ${off?.verdict} ${passing(off)}/${blocks(off)} clicks ${off?.clicks?.total}`,
    );
    ck(
      on &&
        off &&
        on.auto.leak === 0 &&
        passing(on) >= passing(off) &&
        on.clicks.total <= off.clicks.total,
      `P2 ${id}: no worse than without the pass (leaks 0, passing, clicks)`,
    );
  }

  console.log('\n# P3 — wm (file per size, the sleeve click)');
  const wm = child(['case', 'wm']);
  const wmm = child(['case', 'wm'], { P3_NOFACE: '1' });
  out.cases.wm = { on: wm, off: wmm };
  const f = fam(wm, 'ID: 3');
  const fm = fam(wmm, 'ID: 3');
  console.log(
    `  on: ID: 3 ${f?.outcomes} ${JSON.stringify(f?.areasCm2)} · blocks ${blocks(wm)} · clicks ${wm?.clicks?.total}`,
  );
  console.log(
    `  off: ID: 3 ${fm?.outcomes} ${JSON.stringify(fm?.areasCm2)} · blocks ${blocks(wmm)} · clicks ${wmm?.clicks?.total}`,
  );
  ck(
    f && f.outcomes === 'CCCCCCC' && f.monotone,
    'P3 wm: the sleeve click closes in all 7 sizes, monotone',
  );
  ck(fm && fm.outcomes.startsWith('LLL'), 'P3 mutation (P3_NOFACE=1): XS–M leak again');
  ck((wm?.wrongPassing ?? 1) === 0, 'P3 wm: wrongPassing 0');
  ck(
    (wm?.truth?.matched ?? 0) >= (wmm?.truth?.matched ?? 0),
    'P3 wm: truth matches no fewer than without the pass',
  );
}
writeFileSync(resolve(REPORTS, 'P23.json'), JSON.stringify(out, null, 1));
console.log(`\n${fails ? `✗ ${fails} failed` : '✓ all checks pass'}`);
process.exit(fails ? 1 : 0);
