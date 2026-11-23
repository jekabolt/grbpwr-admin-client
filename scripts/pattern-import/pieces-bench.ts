// PIECES BENCH — the pieces step of every captured PDF replayed on the CURRENT code in minutes,
// instead of a dxf-shot of the corpus in hours (owner, 23 Nov 2026: a bench before any new rule).
//   capture once:  PIECES_SNAPSHOT=1 node scripts/pattern-import/dxf-shot.mjs … --out <shot>
//   replay:        npx vite-node scripts/pattern-import/pieces-bench.ts <shot> [<shot> …]
//                    [--only <text>] [--env KEY=VAL …] [--out <bench.json>] [--ref <bench.json>]
//                    [--verify]
// Each file's LAST pieces call (the one dxf-shot's cells.json comes from) is replayed.
//   --verify   compare the replay with the shot's own cells.json, cell by cell. Run it on the code
//              the snapshots were captured with: it must report 0 differences, else the bench
//              cannot judge a patch (a field not carried, a cache, nondeterminism).
//   --ref      a previous --out: per file and per piece, what changed (pieces matched by label and
//              seed position, cells by size).
//   --env      env switches for this replay only (e.g. --env TILE_TEXT_JOIN_OFF=1).
//   --par N    N replay processes, files dealt round-robin (each holds one file's fill in memory:
//              on an 8 GB machine keep N ≤ 3, and nothing else heavy running).
// Limits: see pieces-bench-lib.ts — chains and sizes are frozen in the snapshot.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';

import { cellsOf, readSnapshot, replaySnapshot, type BenchPiece } from './pieces-bench-lib';

type FileResult = {
  id: string;
  call: number;
  ms: number;
  error?: string;
  pieces: BenchPiece[];
};
type Bench = { at: string; env: Record<string, string>; files: FileResult[] };

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(k);
const many = (k: string) => argv.flatMap((a, i) => (argv[i - 1] === k ? [a] : []));
const one = (k: string) => many(k)[0];
const VALUED = new Set(['--only', '--env', '--out', '--ref', '--par', '--shard']);
const roots = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));
const env: Record<string, string> = {};
for (const kv of many('--env')) {
  const i = kv.indexOf('=');
  env[kv.slice(0, i)] = kv.slice(i + 1);
}
Object.assign(process.env, env);

/** Every <root>/<file>/ with snapshots, the last call of each. */
function targets(): { dir: string; snap: string }[] {
  const out: { dir: string; snap: string }[] = [];
  for (const root of roots)
    for (const d of readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = resolve(root, d.name);
      const snaps = readdirSync(dir)
        .map((f) => /^pieces-(\d+)\.snap\.gz$/.exec(f))
        .filter((m): m is RegExpExecArray => !!m)
        .sort((a, b) => +b[1] - +a[1]);
      if (!snaps.length) continue;
      if (one('--only') && !d.name.includes(one('--only')!)) continue;
      out.push({ dir, snap: resolve(dir, snaps[0][0]) });
    }
  out.sort((a, b) => a.dir.localeCompare(b.dir));
  const sh = one('--shard');
  if (!sh) return out;
  const [k, n] = sh.split('/').map(Number);
  return out.filter((_, i) => i % n === k);
}

const tally = (ps: BenchPiece[]) => {
  const c = { closed: 0, cells: 0 };
  for (const p of ps)
    for (const x of p.cells) {
      c.cells++;
      if (x.outcome === 'closed') c.closed++;
    }
  return c;
};

/** A piece of one run matched in another: same label, seed within 30 mm (ids change between runs). */
function match(p: BenchPiece, others: BenchPiece[]): BenchPiece | undefined {
  const near = (q: BenchPiece) =>
    !p.at || !q.at ? p.seed === q.seed : Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y) <= 30;
  return others.find((q) => q.label === p.label && near(q)) ?? others.find((q) => near(q));
}

function diffPieces(before: BenchPiece[], after: BenchPiece[]): string[] {
  const lines: string[] = [];
  const seen = new Set<BenchPiece>();
  for (const a of after) {
    const b = match(a, before);
    if (b) seen.add(b);
    const name = a.label ?? `seed ${a.seed}`;
    if (!b) {
      lines.push(`  + ${name}: ${a.cells.length} cells (${tally([a]).closed} closed)`);
      continue;
    }
    const bySize = new Map(b.cells.map((c) => [c.size, c.outcome]));
    const moved = a.cells
      .filter((c) => bySize.get(c.size) !== c.outcome)
      .map((c) => `${c.size} ${bySize.get(c.size) ?? '∅'}→${c.outcome}`);
    if (moved.length) lines.push(`  ~ ${name}: ${moved.join(', ')}`);
  }
  for (const b of before)
    if (!seen.has(b))
      lines.push(
        `  - ${b.label ?? `seed ${b.seed}`}: ${b.cells.length} cells gone (${tally([b]).closed} closed)`,
      );
  return lines;
}

/** The shot's own cells.json in bench shape (outcome per size is what --verify compares). */
function shotCells(dir: string): BenchPiece[] | null {
  const p = resolve(dir, 'cells.json');
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    seed: number;
    label: string | null;
    cells: { size: string; outcome: string }[];
  }[];
  return raw.map((f) => ({
    seed: f.seed,
    label: f.label,
    at: null,
    cells: f.cells.map((c) => ({
      size: c.size,
      outcome: c.outcome,
      from: null,
      repair: null,
      nest: null,
      derivedMm: 0,
      gapRecovery: false,
    })),
  }));
}

/** --par N: N children (--shard k/N), each writes its files; the parent merges and reports. */
async function parallel(n: number): Promise<{ files: FileResult[]; bad: number }> {
  const pass = argv.filter((a, i) => {
    const prev = argv[i - 1] ?? '';
    return !['--par', '--out', '--ref'].includes(a) && !['--par', '--out', '--ref'].includes(prev);
  });
  const parts = Array.from({ length: n }, (_, k) =>
    resolve(tmpdir(), `pieces-bench-${process.pid}-${k}.json`),
  );
  let bad = 0;
  await Promise.all(
    parts.map(
      (out, k) =>
        new Promise<void>((done, fail) => {
          const p = spawn(
            'npx',
            ['vite-node', __filename, ...pass, '--shard', `${k}/${n}`, '--out', out, '--quiet'],
            { stdio: ['ignore', 'inherit', 'inherit'] },
          );
          p.on('exit', (code) => {
            if (code === 2) return fail(new Error(`shard ${k} failed`));
            if (code === 1) bad++; // --verify found a difference in this shard (printed above)
            done();
          });
        }),
    ),
  );
  const files = parts.flatMap((p) => {
    const b = JSON.parse(readFileSync(p, 'utf8')) as Bench;
    rmSync(p);
    return b.files;
  });
  return { files: files.sort((a, b) => a.id.localeCompare(b.id)), bad };
}

async function main() {
  if (!roots.length) throw new Error('usage: pieces-bench.ts <shotDir> [<shotDir> …] [flags]');
  const par = +(one('--par') ?? '1');
  if (par > 1) {
    const t0 = Date.now();
    const { files, bad } = await parallel(par);
    report(files, Date.now() - t0, bad, 'shard(s)');
    return flag('--verify') && bad ? 1 : 0;
  }
  const ref: Bench | null = one('--ref') ? JSON.parse(readFileSync(one('--ref')!, 'utf8')) : null;
  const files: FileResult[] = [];
  let bad = 0;
  const t0 = Date.now();
  for (const { dir, snap } of targets()) {
    const s = readSnapshot(readFileSync(snap));
    const t = Date.now();
    let r: FileResult;
    try {
      const out = await replaySnapshot(s);
      r = { id: s.id, call: s.call, ms: Date.now() - t, pieces: cellsOf(out, s.ranks) };
    } catch (e) {
      r = { id: s.id, call: s.call, ms: Date.now() - t, error: String(e), pieces: [] };
    }
    files.push(r);
    const c = tally(r.pieces);
    console.log(
      `${String(c.closed).padStart(4)}/${String(c.cells).padEnd(4)} ${String(Math.round(r.ms / 1000)).padStart(4)}s  ${r.id}${r.error ? `  ERROR ${r.error.slice(0, 160)}` : ''}`,
    );
    if (flag('--verify')) {
      const shot = shotCells(dir);
      // the shot's cells carry no seed position: pieces are matched by order, then label
      const d = shot
        ? diffPieces(
            shot.map((p, i) => ({ ...p, at: null, seed: i })),
            r.pieces.map((p, i) => ({ ...p, at: null, seed: i })),
          )
        : ['  no cells.json'];
      if (d.length) bad++;
      for (const l of d) console.log(l);
    }
    const rf = ref?.files.find((f) => f.id === r.id);
    if (rf) for (const l of diffPieces(rf.pieces, r.pieces)) console.log(l);
  }
  if (!flag('--quiet')) report(files, Date.now() - t0, bad);
  else if (one('--out'))
    writeFileSync(one('--out')!, JSON.stringify({ at: new Date().toISOString(), env, files }));
  return flag('--verify') && bad ? 1 : 0;
}

function report(files: FileResult[], ms: number, bad = 0, unit = 'file(s)') {
  const ref: Bench | null = one('--ref') ? JSON.parse(readFileSync(one('--ref')!, 'utf8')) : null;
  if (one('--par') && ref)
    for (const r of files) {
      const rf = ref.files.find((f) => f.id === r.id);
      const d = rf ? diffPieces(rf.pieces, r.pieces) : [];
      if (d.length) console.log(`${r.id}\n${d.join('\n')}`);
    }
  const all = tally(files.flatMap((f) => f.pieces));
  const errors = files.filter((f) => f.error).length;
  console.log(
    `\n${files.length} files · ${all.closed}/${all.cells} closed · ${Math.round(ms / 1000)}s` +
      (errors ? ` · ${errors} ERROR` : '') +
      (ref ? ` · ref ${tally(ref.files.flatMap((f) => f.pieces)).closed} closed` : '') +
      (flag('--verify') ? ` · verify: ${bad} ${unit} differ from the shot` : ''),
  );
  if (one('--out')) {
    const bench: Bench = { at: new Date().toISOString(), env, files };
    writeFileSync(one('--out')!, JSON.stringify(bench));
    console.log(`wrote ${basename(one('--out')!)}`);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
