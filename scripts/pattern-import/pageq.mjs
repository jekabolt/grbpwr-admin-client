#!/usr/bin/env node
// PATTERN-IMPORT · PAGEQ runner — how many files stop on the files step's page-role question
// ("page N was set aside as instructions but holds line work — is it a pattern page?"), no AI:
// extract + clean only (pageq-entry.ts), every file in its own node process. Cheap next to the
// archive runner (no assembly, no pieces), so it can sweep the whole archive.
//   node scripts/pattern-import/pageq.mjs <out-dir> [cat/file.pdf | /abs/file.pdf …]
//   node scripts/pattern-import/pageq.mjs <out-dir> --summary
//   node scripts/pattern-import/pageq.mjs <out-dir> --replay=<cache-dir> [name-part …]
//     → results.jsonl recomputed from a cache in seconds (PAGEQ_CACHE=<cache-dir> on a live run
//     keeps every page-ink input; exact while only clean/page-ink.ts + autopilot/policy.ts move).
//   env PATIMPORT_ARCHIVE_DIR (default: the owner's archive, read in place, never written),
//   PAGEQ_PAR (2), PAGEQ_CAP_S (300), PAGEQ_DIAG=1 (every unexplained line of a page asked),
//   PATIMPORT_ARCHIVE_FILTER (glob on "cat/file.pdf"). <out-dir> must be under /private/tmp/.
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.PQ_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.PQ_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const OUT = resolve(process.argv[2] ?? '');
if (!/^\/private\/tmp\//.test(OUT)) {
  console.error('usage: pageq.mjs <out-dir under /private/tmp/> [files…] [--summary]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const JSONL = resolve(OUT, 'results.jsonl');
const ARGS = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const REPLAY = process.argv
  .slice(3)
  .find((a) => a.startsWith('--replay='))
  ?.slice(9);
const FLAGS = process.argv.slice(3).filter((a) => a.startsWith('--'));
const DIR = process.env.PATIMPORT_ARCHIVE_DIR ?? '/Users/jekabolt/Downloads/archive 600 pcs';
const readResults = () =>
  existsSync(JSONL)
    ? readFileSync(JSONL, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

if (FLAGS.includes('--summary')) {
  const rs = readResults();
  const asked = rs.filter((r) => r.question != null);
  const err = rs.filter((r) => r.error);
  const mood = (r) => /^(mdf|moodfabrics)/i.test(String(r.file).split('/').pop());
  console.log(
    `files ${rs.length} · page-role question ${asked.length} (Mood ${asked.filter(mood).length}/${rs.filter(mood).length}, other ${asked.filter((r) => !mood(r)).length}/${rs.filter((r) => !mood(r)).length}) · errors ${err.length}`,
  );
  const why = new Map();
  for (const r of asked) {
    const p = r.asked.find((x) => x.p === r.question);
    const k = String(p?.unexplained ?? `(${p?.cls}, no ink reading)`)
      .replace(/\d+(\.\d+)?/g, 'N')
      .replace(/rgb\([^)]*\)/g, 'rgb')
      .slice(0, 110);
    why.set(k, (why.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 40))
    console.log(`${String(n).padStart(5)}  ${k}`);
  process.exit(0);
}

function listArchive() {
  const out = [];
  for (const cat of readdirSync(DIR).sort()) {
    const p = resolve(DIR, cat);
    if (!statSync(p).isDirectory()) continue;
    for (const f of readdirSync(p).sort()) if (/\.pdf$/i.test(f)) out.push(`${cat}/${f}`);
  }
  const g = process.env.PATIMPORT_ARCHIVE_FILTER;
  if (!g) return out;
  const re = new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
    'i',
  );
  return out.filter((x) => re.test(x));
}

const bundle = resolve(tmpdir(), `patimport-pageq-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'pageq-entry.ts')],
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

if (REPLAY) {
  // PAGEQ_BUNDLE: replay with a bundle kept from an earlier build (the "before" code)
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.PAGEQ_BUNDLE ?? bundle).href);
  process.exit(await m.main(['--replay', resolve(REPLAY), JSONL, ...ARGS]));
}
if (process.env.PAGEQ_CACHE) mkdirSync(process.env.PAGEQ_CACHE, { recursive: true });

const done = new Set(readResults().map((r) => r.file));
const files = (ARGS.length ? ARGS : listArchive()).filter((f) => !done.has(f));
const PAR = Math.max(1, +(process.env.PAGEQ_PAR ?? 2));
const CAP = +(process.env.PAGEQ_CAP_S ?? 300) * 1000;
let next = 0;
let n = 0;
const runOne = (rel) =>
  new Promise((res) => {
    const abs = isAbsolute(rel) ? rel : resolve(DIR, rel);
    const t0 = Date.now();
    const ch = spawn(
      process.execPath,
      ['--max-old-space-size=4096', fileURLToPath(import.meta.url), abs, rel],
      { env: { ...process.env, PQ_CHILD: bundle }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const kill = setTimeout(() => ch.kill('SIGKILL'), CAP);
    ch.on('close', (code) => {
      clearTimeout(kill);
      const line = out.split('\n').find((l) => l.startsWith('@@PAGEQ '));
      const rec = line
        ? JSON.parse(line.slice(8))
        : {
            file: rel,
            error: `exit ${code}${Date.now() - t0 >= CAP ? ' (timeout)' : ''}: ${err.slice(-300)}`,
          };
      appendFileSync(JSONL, `${JSON.stringify(rec)}\n`);
      n++;
      console.log(
        `[${n}/${files.length}] ${rel} · ${rec.error ? 'ERROR' : rec.question != null ? `asks p${rec.question}` : 'no question'} · ${Math.round((Date.now() - t0) / 1000)}s`,
      );
      res();
    });
  });
await Promise.all(
  Array.from({ length: PAR }, async () => {
    while (next < files.length) await runOne(files[next++]);
  }),
);
