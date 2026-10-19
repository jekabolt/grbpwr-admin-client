#!/usr/bin/env node
// PATTERN-IMPORT · AP-REPLAY probe runner — bundles replay-entry.ts once (React aliased to the
// one-component shim, so the REAL wizard hook runs), then every case in its own node process, and
// writes reports/REPLAY-<date>.json. Per case: import #1 (autopilot + stand-in operator + a typed
// name), import #2 with #1's manifests on the card — the replay alone and the replay before the
// autopilot: 0 questions, the same files; a mutated file: nothing replayed; a moved piece: its
// answers not replayed, the question asked.
//   node scripts/pattern-import/replay.mjs [case…]      (yarn patimport:replay)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, REPLAY_REPORT (file name)
// Exit 1 when a replay case asks a question on the unchanged file, writes another file, replays
// onto a mutated file, or lands a moved piece's answers — or when no case reached the check step.
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

if (process.env.RP_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.RP_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const bundle = resolve(tmpdir(), `patimport-replay-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'replay-entry.ts')],
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

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const child = (args) => {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...args],
    {
      env: { ...process.env, RP_CHILD: bundle, PATIMPORT_REPO: REPO },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
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
        env: { ...process.env, RP_CHILD: bundle },
        encoding: 'utf8',
      }).stdout,
    );

const results = [];
for (const id of ids) {
  const t = Date.now();
  const r = child([id]);
  results.push(r);
  const q = (m) =>
    r[m] ? `${m} q${r[m].questions} ${r[m].identical ? '=' : '≠'} r${r[m].replayed}` : '';
  console.log(
    `${id.padEnd(46)} ${String(r.verdict).padEnd(12)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  ${q('manual')}  ${q('auto')}  ${r.mutated ? `mut r${r.mutated.answered}` : ''}  ${r.moved ? `moved ${r.moved.missed && r.moved.asked ? 'asked' : '✗'}` : ''}  ${r.verdict === 'not-reached' ? String(r.first?.stop ?? r.first?.error ?? '').slice(0, 90) : (r.failures ?? []).join('; ').slice(0, 140)}${r.error ? ` ERROR ${String(r.error).split('\n')[0]}` : ''}`,
  );
}

const cases = results.filter((r) => r.verdict === 'ok' || r.verdict === 'FAIL');
const sum = (f) => cases.reduce((a, r) => a + (f(r) ?? 0), 0);
const summary = {
  corpus: results.length,
  replayCases: cases.length,
  notReached: results.filter((r) => r.verdict === 'not-reached').length,
  crashed: results.filter((r) => r.verdict === 'crashed').map((r) => r.id),
  failed: cases
    .filter((r) => r.verdict === 'FAIL')
    .map((r) => `${r.id}: ${(r.failures ?? []).join('; ')}`),
  questionsManual: sum((r) => r.manual?.questions),
  questionsAuto: sum((r) => r.auto?.questions),
  identicalManual: cases.filter((r) => r.manual?.identical).length,
  identicalAuto: cases.filter((r) => r.auto?.identical).length,
  replayedAnswers: sum((r) => r.manual?.replayed),
  mutatedReplayed: sum((r) => r.mutated?.answered),
  movedCases: cases.filter((r) => r.moved).length,
  movedAsked: cases.filter((r) => r.moved?.missed && r.moved?.asked).length,
  operatorAnswersFirst: sum((r) => r.first?.ops?.length),
  lineageCases: cases.filter((r) => r.lineage).length,
  lineageApplied: cases.filter((r) => r.lineage?.applied?.ok && !r.lineage.created?.length).length,
  lineageGated: cases.filter((r) => /^the gate blocks/.test(r.lineage?.applied?.reason ?? ''))
    .length,
  movedNamedReached: cases.filter(
    (r) => r.movedNamed?.reached && !/^the gate blocks/.test(r.movedNamed.applied?.reason ?? ''),
  ).length,
  movedNamedOwnName: cases.filter((r) => r.movedNamed?.reached && !r.movedNamed.generated).length,
  movedNamedRefused: cases.filter(
    (r) =>
      r.movedNamed?.reached &&
      /generated code|no longer drawn/.test(r.movedNamed.applied?.reason ?? ''),
  ).length,
};
console.log(
  `\nreplay cases ${summary.replayCases}/${summary.corpus} (reached check on import #1) · not reached ${summary.notReached} · crashed ${summary.crashed.length}`,
);
console.log(
  `import #2 questions: manual ${summary.questionsManual}, auto ${summary.questionsAuto} · identical files: manual ${summary.identicalManual}/${summary.replayCases}, auto ${summary.identicalAuto}/${summary.replayCases} · replayed answers ${summary.replayedAnswers} (import #1 operator answers ${summary.operatorAnswersFirst})`,
);
console.log(
  `mutated file: replayed ${summary.mutatedReplayed} · moved piece: asked again ${summary.movedAsked}/${summary.movedCases}`,
);
console.log(
  `card lineage: honest re-import applied with no new card piece ${summary.lineageApplied}/${summary.lineageCases} (gate blocks the apply: ${summary.lineageGated}) · moved autopilot-named piece refused ${summary.movedNamedRefused}/${summary.movedNamedReached} (reached check, gate green; ${summary.movedNamedOwnName} read their own file name back)`,
);
if (summary.failed.length) console.log(`✗ failed: ${summary.failed.join(' | ')}`);
if (summary.crashed.length) console.log(`✗ crashed: ${summary.crashed.join(', ')}`);

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const out = resolve(REPORTS, process.env.REPLAY_REPORT ?? `REPLAY-${date}.json`);
writeFileSync(out, JSON.stringify({ summary, results }, null, 1));
console.log(`→ ${out}`);
const bad = !cases.length || summary.failed.length > 0 || summary.crashed.length > 0;
process.exit(bad ? 1 : 0);
