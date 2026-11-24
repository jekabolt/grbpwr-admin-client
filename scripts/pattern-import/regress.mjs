#!/usr/bin/env node
// PATTERN-IMPORT · regression census over a folder of PDFs — and the check that no file got worse.
//   node scripts/pattern-import/regress.mjs <folder> [--fill] [--update] [--only <text>]
//                                          [--par 4] [--limit 240] [--out results.json]
//                                          [--files list.txt] [--ref results.json]
//   yarn patimport:regress <folder>
// Reads every PDF (one process each, `--limit` seconds at most), counts what the sizes step and
// (--fill) the pieces fill leave open, and compares with scripts/pattern-import/regress-baseline.json:
//   worse    more empty size rows — or, with the same, more pieces × sizes not closed — or, with the
//            same, more open ends on the first four sizes; a new error; a timeout where the file
//            was read before   → exit 1
//   better   fewer of those, judged in the same order (printed; --update writes the new baseline)
// --files reads only the PDFs named in a list (one per line, # comments): fast-set.txt is the
// screening set. --ref compares with an earlier --out instead of the baseline, and prints the net
// (totals of both runs over the same files) — a change is judged by the net, each WORSE is read
// (open-lines journal). Each result carries `ms`, the file's wall time.
// The PDFs are not in the repo: point it at the folder. Without --fill it takes minutes, with it
// an hour for ~180 files (the fill is the slow part).
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = args.find(
  (a, i) =>
    !a.startsWith('--') &&
    !['--only', '--par', '--limit', '--out', '--files', '--ref'].includes(args[i - 1]),
);
if (!dir) {
  console.error(
    'usage: regress.mjs <folder of PDFs> [--fill] [--update] [--only text] [--par 4] [--limit 240]',
  );
  process.exit(2);
}
const FILL = flag('--fill');
const BASELINE = resolve(HERE, 'regress-baseline.json');
const work = resolve(tmpdir(), 'patimport-regress');
mkdirSync(work, { recursive: true });
const outfile = resolve(work, `entry-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'regress-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const runner = resolve(work, `run-${process.pid}.mjs`);
writeFileSync(
  runner,
  `process.env.PATIMPORT_REPO=${JSON.stringify(REPO)};\nconst m = await import(${JSON.stringify(pathToFileURL(outfile).href)});\nawait m.main(process.argv.slice(2));\n`,
);

const only = opt('--only', '');
const listed = opt('--files', '')
  ? new Set(
      readFileSync(opt('--files', ''), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    )
  : null;
const files = readdirSync(dir)
  .filter((f) => /\.pdf$/i.test(f) && f.includes(only) && (!listed || listed.has(f)))
  .sort();
if (listed)
  for (const f of listed) if (!files.includes(f)) console.error(`--files: ${f} is not in ${dir}`);
const par = Number(opt('--par', 4));
const limitMs = Number(opt('--limit', 240)) * 1000;
const results = {};
let next = 0;
let running = 0;
await new Promise((done) => {
  const launch = () => {
    if (next >= files.length && !running) return done();
    while (running < par && next < files.length) {
      const f = files[next++];
      running++;
      const t0 = Date.now();
      const ch = spawn('node', ['--max-old-space-size=4096', runner, resolve(dir, f)], {
        env: { ...process.env, FILL: FILL ? '1' : '', REGRESS_CACHE: resolve(work, 'docs') },
      });
      mkdirSync(resolve(work, 'docs'), { recursive: true });
      let buf = '';
      ch.stdout.on('data', (d) => (buf += d));
      const timer = setTimeout(() => ch.kill('SIGKILL'), limitMs);
      ch.on('close', () => {
        clearTimeout(timer);
        const line = buf.split('\n').find((l) => l.startsWith('REGRESS '));
        results[f] = {
          ...(line ? JSON.parse(line.slice(8)) : { name: f, error: 'timeout' }),
          ms: Date.now() - t0,
        };
        running--;
        process.stderr.write(`\r${Object.keys(results).length}/${files.length}  `);
        launch();
      });
    }
  };
  launch();
});
process.stderr.write('\n');

const REF = opt('--ref', '');
const base = REF
  ? JSON.parse(readFileSync(REF, 'utf8'))
  : existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : {};
const num = (v) => (typeof v === 'number' ? v : 0);
const worse = [];
const better = [];
for (const [f, r] of Object.entries(results)) {
  const b = base[f];
  if (!b) continue;
  if (r.error && !b.error) worse.push(`${f}: ${r.error}`);
  if (r.error || b.error) continue;
  // in order of weight: a size with no line, then an outline not closed, then open ends. A better
  // earlier number settles it (lines that now exist bring ends of their own).
  const keys = [
    'emptyRows',
    ...(FILL && b.notClosed !== undefined ? ['notClosed'] : []),
    'litOpenCard',
  ];
  const parts = keys.map((k) => `${k} ${num(b[k])} → ${num(r[k])}`);
  let dir = 0;
  for (const k of keys) {
    if (num(r[k]) !== num(b[k])) {
      dir = num(r[k]) > num(b[k]) ? 1 : -1;
      break;
    }
  }
  if (dir > 0) worse.push(`${f}: ${parts.join(', ')}`);
  else if (dir < 0) better.push(`${f}: ${parts.join(', ')}`);
}
const sum = (k) => Object.values(results).reduce((a, r) => a + num(r[k]), 0);
console.log(
  `${files.length} files · errors ${Object.values(results).filter((r) => r.error).length} · empty size rows ${sum('emptyRows')} · open ends (card sizes) ${sum('litOpenCard')}` +
    (FILL
      ? ` · pieces ${sum('pieces')} (${sum('wholePieces')} close on every size, ${sum('junkSeeds')} seeds close on none) · sizes not closed ${sum('notClosed')} of ${sum('total')}`
      : ''),
);
if (better.length) console.log(`\nbetter (${better.length}):\n  ${better.join('\n  ')}`);
if (worse.length) console.log(`\nWORSE (${worse.length}):\n  ${worse.join('\n  ')}`);
if (REF) {
  // the net over the files both runs read
  const both = Object.keys(results).filter((f) => base[f] && !results[f].error && !base[f].error);
  const net = (k) => both.reduce((a, f) => a + num(results[f][k]) - num(base[f][k]), 0);
  const ks = ['emptyRows', ...(FILL ? ['notClosed'] : []), 'litOpenCard'];
  console.log(
    `\nnet vs ${REF} over ${both.length} files: ` +
      ks.map((k) => `${k} ${net(k) > 0 ? '+' : ''}${net(k)}`).join(' · ') +
      ` · better ${better.length} · WORSE ${worse.length}`,
  );
}
if (opt('--out', '')) writeFileSync(opt('--out', ''), JSON.stringify(results, null, 1) + '\n');
if (flag('--update')) {
  writeFileSync(BASELINE, JSON.stringify({ ...base, ...results }, null, 1) + '\n');
  console.log(`\nbaseline written: ${Object.keys({ ...base, ...results }).length} files`);
}
process.exit(worse.length ? 1 : 0);
