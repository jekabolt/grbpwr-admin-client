#!/usr/bin/env node
// PATTERN-IMPORT · MOOD probe runner (MOOD-DIAG §4) — bundles mood-entry.ts once, runs every sample
// file in its own node process (MOOD_PAR at a time, MOOD_CAP_S seconds each), writes
// $PATIMPORT_REPORTS/MOOD-<date>.json + a table. Exit 1 when any gate-passing block is wrong.
//   node scripts/pattern-import/mood.mjs [id…]
//   env PATIMPORT_MOOD_DIR (default: the Mood archive), PATIMPORT_REPORTS, MOOD_PAR (3), MOOD_CAP_S (900)
//   MOOD_F0_OFF=1: the Ф0 safety switched off (the "before" column on the same code)
import { build as esbuild } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';

if (process.env.MOOD_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.MOOD_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const bundle = resolve(tmpdir(), `patimport-mood-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'mood-entry.ts')],
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

const tag = process.env.MOOD_F0_OFF ? 'MOOD-F0OFF' : 'MOOD';
const outDir = resolve(REPORTS, `${tag}-out`);
mkdirSync(outDir, { recursive: true });
const env = {
  ...process.env,
  MOOD_CHILD: bundle,
  PATIMPORT_REPO: REPO,
  // runCase writes its DXF / PNG next to the reports, never into the plans tree
  PATIMPORT_E2E_OUT: outDir,
  E2E_OUT: outDir,
};
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = ARGS.length
  ? ARGS
  : JSON.parse(
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'list'], {
        env,
        encoding: 'utf8',
      }).stdout,
    );
const PAR = Number(process.env.MOOD_PAR ?? 3);
const CAP = Number(process.env.MOOD_CAP_S ?? 900) * 1000;

const runOne = (id) =>
  new Promise((done) => {
    const t = Date.now();
    const ch = spawn(
      process.execPath,
      ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), id],
      { env },
    );
    let out = '';
    let err = '';
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const timer = setTimeout(() => ch.kill('SIGKILL'), CAP);
    ch.on('close', (code, signal) => {
      clearTimeout(timer);
      // MOOD_ECHO=<dir>: the child's diagnostics (@@KINK lines of the gate, …) kept per file
      if (process.env.MOOD_ECHO) writeFileSync(resolve(process.env.MOOD_ECHO, `${id}.stdout`), out);
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      const r = line
        ? JSON.parse(line.slice(9))
        : {
            id,
            verdict: signal === 'SIGKILL' ? 'timeout' : 'crashed',
            code,
            wrongPassing: 0,
            stderr: err.slice(-600),
          };
      r.wallS = +((Date.now() - t) / 1000).toFixed(1);
      done(r);
    });
  });

const results = [];
const queue = ids.slice();
await Promise.all(
  Array.from({ length: Math.min(PAR, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const r = await runOne(id);
      results.push(r);
      console.log(
        `${String(r.id).padEnd(12)} ${String(r.verdict).padEnd(15)} ${String(r.wallS).padStart(6)}s enc ${r.encoding ?? '-'} ${r.found ?? '?'}/${r.keyN ?? '?'} closed ${r.closed ?? 0}/${r.candidates ?? 0} pass ${r.passing ?? 0}/${r.blocks ?? 0} notches ${r.notches ?? 0} kinks ${r.kinks ?? '-'} autoKinks ${r.autoKinks ?? '-'}/${r.autoKinkOutlines ?? '-'}/${r.autoKinkJudged ?? '-'} wrongPassing ${r.wrongPassing}`,
      );
    }
  }),
);
results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
const sum = (k) => results.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const total = {
  files: results.length,
  wrongPassing: sum('wrongPassing'),
  wrongBlocked: sum('wrongBlocked'),
  candidates: sum('candidates'),
  closed: sum('closed'),
  closedShare: +(sum('closed') / Math.max(1, sum('candidates'))).toFixed(3),
  blocks: sum('blocks'),
  passing: sum('passing'),
  passingRight: sum('passingRight'),
  passingUnverified: sum('passingUnverified'),
  notches: sum('notches'),
  // (4) kinks: stretches of written outlines off their own pen's lines (MOOD-DIAG Ф2)
  kinks: sum('kinks'),
  kinkOutlines: sum('kinkOutlines'),
  kinkJudged: sum('kinkJudged'),
  kinksPassing: sum('kinksPassing'),
  autoKinks: sum('autoKinks'),
  autoKinkOutlines: sum('autoKinkOutlines'),
  autoKinkJudged: sum('autoKinkJudged'),
  // pen-verified right blocks the gate holds back, by the check that holds them
  rightBlockedBy: results.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.rightBlockedBy ?? {})) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {}),
  timeouts: results.filter((r) => r.verdict === 'timeout' || r.verdict === 'crashed').length,
  // a file whose written blocks could not be judged is no evidence of 0 wrong
  unjudged: results
    .filter(
      (r) =>
        r.analyseError ||
        (r.unmatched ?? 0) > 0 ||
        r.verdict === 'timeout' ||
        r.verdict === 'crashed',
    )
    .map((r) => r.id),
};
console.log(
  `\n${'file'.padEnd(12)} gen      enc            found closed     pass  right unver wrongP  kinks    autoKinks`,
);
for (const r of results)
  console.log(
    `${String(r.id).padEnd(12)} ${String(r.gen ?? '').padEnd(8)} ${String(r.encoding ?? '-').padEnd(14)} ${String(`${r.found ?? '?'}/${r.keyN ?? '?'}`).padStart(5)} ${String(`${r.closed ?? 0}/${r.candidates ?? 0}`).padStart(8)} ${String(`${r.passing ?? 0}/${r.blocks ?? 0}`).padStart(7)} ${String(r.passingRight ?? 0).padStart(6)} ${String(r.passingUnverified ?? 0).padStart(5)} ${String(r.wrongPassing).padStart(6)} ${String(r.kinkJudged != null ? `${r.kinks}/${r.kinkOutlines}/${r.kinkJudged}` : '-').padStart(9)} ${String(r.autoKinkJudged != null ? `${r.autoKinks}/${r.autoKinkOutlines}/${r.autoKinkJudged}` : '-').padStart(11)}${r.wrongList?.length ? `  ${r.wrongList.slice(0, 2).join(' | ')}` : ''}`,
  );
console.log(
  `\nTOTAL wrongPassing ${total.wrongPassing} · closed share ${total.closedShare} (${total.closed}/${total.candidates}) · passing ${total.passing}/${total.blocks} (right ${total.passingRight}, unverified ${total.passingUnverified}) · notches ${total.notches} · wrong but blocked ${total.wrongBlocked} · kinks ${total.kinks} in ${total.kinkOutlines}/${total.kinkJudged} outlines (passing ${total.kinksPassing}) · auto closed: kinks ${total.autoKinks} in ${total.autoKinkOutlines}/${total.autoKinkJudged}${total.timeouts ? ` · ${total.timeouts} timeout/crash` : ''}${total.unjudged.length ? ` · unjudged ${total.unjudged.length}` : ''}`,
);
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const file = resolve(REPORTS, `${tag}-${date}.json`);
writeFileSync(file, JSON.stringify({ total, results }, null, 1));
console.log(`right but held back, by check: ${JSON.stringify(total.rightBlockedBy)}`);
console.log(`→ ${file}`);
if (total.unjudged.length)
  console.log(`✗ written blocks not judged in: ${total.unjudged.join(', ')}`);
process.exit(total.wrongPassing || total.unjudged.length ? 1 : 0);
