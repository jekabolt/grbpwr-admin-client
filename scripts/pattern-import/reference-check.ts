// REFERENCE CHECK — replays the snapshots of the reference set on the current code and holds every
// size against the outline the owner judged (reference.json, reference-lib.ts).
//   npx vite-node scripts/pattern-import/reference-check.ts <reference.json>
//       [--base <repo root>] [--env KEY=VAL …] [--tol <mm>] [--only <id>] [--out <result.json>]
// Per size, the current outline of that size nearest to the judged one (by geometry):
// tol per size = min(--tol, half the worst-point distance to the nearest neighbouring size of the
// same piece): where sizes run closer than 2 mm, an outline that jumped onto the neighbour must not
// count as the same one.
//   ok  → held (≤ tol everywhere) · MOVED (a closed outline, farther) · LOST (no closed outline)
//   bad → RETURNED (the rejected outline is still/again there, ≤ tol) · changed (it differs now — look at it)
// Exit 1 when anything is MOVED or LOST. RETURNED is not a failure: the reference was cut from the
// current code, so every bad size starts RETURNED — that count only has to go down over time.
// Runs with AUTO_GAP_OFF=1 unless --env sets it:
// the browser does not run the automatic gap (worker/session.ts), so neither does the check.
// --base: where the snapshot roots of reference.json resolve (default: the working directory) —
// a worktree points it at the clone that holds `.runs/`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readSnapshot, replaySnapshot } from './pieces-bench-lib';
import { type ReferencePiece, boxOf, boxShift, ringDistance, unflat } from './reference-lib';

const argv = process.argv.slice(2);
const many = (k: string) => argv.flatMap((a, i) => (argv[i - 1] === k ? [a] : []));
const one = (k: string) => many(k)[0];
const VALUED = new Set(['--base', '--env', '--tol', '--only', '--out']);
const [refFile] = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));
const base = one('--base') ?? '.';
const tol = +(one('--tol') ?? 1);
const env: Record<string, string> = { AUTO_GAP_OFF: '1' };
for (const kv of many('--env')) env[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1);
// `--env AUTO_GAP_OFF=` (empty) runs with the automatic gap, as the Node default does
for (const [k, v] of Object.entries(env)) if (v === '') delete env[k];
Object.assign(process.env, env);

type Row = {
  id: string;
  size: string;
  verdict: 'ok' | 'bad';
  result: 'held' | 'MOVED' | 'LOST' | 'RETURNED' | 'changed';
  maxMm: number | null;
  p95Mm: number | null;
  tolMm: number;
};

/** Per size: min(tol, half the distance to the nearest neighbouring size in the reference). */
function tolsOf(p: ReferencePiece): number[] {
  const rings = p.sizes.map((z) => unflat(z.outer));
  const gap = rings.slice(1).map((r, k) => ringDistance(rings[k], r).max);
  return rings.map((_, k) =>
    Math.min(tol, 0.5 * Math.min(gap[k - 1] ?? Infinity, gap[k] ?? Infinity)),
  );
}

const ref: ReferencePiece[] = JSON.parse(readFileSync(refFile, 'utf8'));
const byDir = new Map<string, ReferencePiece[]>();
for (const p of ref) {
  if (one('--only') && p.id !== one('--only')) continue;
  const root = resolve(base, p.root);
  const d = readdirSync(root).find((n) => n.includes(p.file));
  if (!d) throw new Error(`${p.id}: no ${p.file} in ${root}`);
  const k = resolve(root, d);
  byDir.set(k, [...(byDir.get(k) ?? []), p]);
}

const rows: Row[] = [];
for (const [dir, ps] of byDir) {
  const snap = readdirSync(dir)
    .filter((f) => /^pieces-\d+\.snap\.gz$/.test(f))
    .sort((a, b) => +b.match(/\d+/)![0] - +a.match(/\d+/)![0])[0];
  const s = readSnapshot(readFileSync(resolve(dir, snap)));
  const out = await replaySnapshot(s);
  const label = new Map((s.ranks ?? []).map((r) => [r.rank, r.label]));
  // every current outline per size label, across all families: the piece is found by where it is
  const bySize = new Map<string, { closed: boolean; ring: { x: number; y: number }[] }[]>();
  for (const fam of out.families)
    for (const c of fam.candidates) {
      if (!c.outer?.length) continue;
      const size = label.get(c.rank) ?? `r${c.rank}`;
      bySize.set(size, [
        ...(bySize.get(size) ?? []),
        { closed: c.outcome === 'closed', ring: c.outer },
      ]);
    }
  for (const p of ps) {
    const tols = tolsOf(p);
    for (const [k, z] of p.sizes.entries()) {
      const want = unflat(z.outer);
      const wb = boxOf(want);
      let best: { closed: boolean; max: number; p95: number } | null = null;
      for (const c of bySize.get(z.size) ?? []) {
        if (boxShift(boxOf(c.ring), wb) > 30) continue;
        const d = ringDistance(want, c.ring);
        // a closed outline wins over an open one at the same place
        if (!best || (c.closed && !best.closed) || (c.closed === best.closed && d.max < best.max))
          best = { closed: c.closed, ...d };
      }
      const same = !!best && best.closed && best.max <= tols[k];
      const result: Row['result'] =
        z.verdict === 'ok'
          ? same
            ? 'held'
            : best?.closed
              ? 'MOVED'
              : 'LOST'
          : same
            ? 'RETURNED'
            : 'changed';
      rows.push({
        id: p.id,
        size: z.size,
        verdict: z.verdict,
        result,
        maxMm: best ? Math.round(best.max * 100) / 100 : null,
        p95Mm: best ? Math.round(best.p95 * 100) / 100 : null,
        tolMm: Math.round(tols[k] * 100) / 100,
      });
    }
  }
  console.log(`${s.id.slice(0, 50)}: ${ps.map((p) => p.id).join(', ')}`);
}

const count = (r: Row['result']) => rows.filter((x) => x.result === r).length;
for (const p of ref) {
  const rs = rows.filter((r) => r.id === p.id);
  if (!rs.length) continue;
  const bad = rs.filter((r) => r.result !== 'held' && r.result !== 'changed');
  const tag = `${p.id} [${p.set}]`.padEnd(26);
  console.log(
    `  ${tag} ${rs.length} sizes · held ${rs.filter((r) => r.result === 'held').length}` +
      (bad.length
        ? ` · ${bad.map((r) => `${r.result} ${r.size} (${r.maxMm ?? '—'} mm)`).join(', ')}`
        : '') +
      (rs.some((r) => r.result === 'changed')
        ? ` · changed ${rs.filter((r) => r.result === 'changed').map((r) => r.size)}`
        : ''),
  );
}
console.log(
  `reference: held ${count('held')} · MOVED ${count('MOVED')} · LOST ${count('LOST')} · RETURNED ${count('RETURNED')} · changed ${count('changed')} · tol ≤ ${tol} mm (min ${Math.min(...rows.map((r) => r.tolMm))}) · env ${
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ') || '—'
  }`,
);
if (one('--out')) writeFileSync(one('--out')!, JSON.stringify({ env, tol, rows }));
process.exit(count('MOVED') + count('LOST') ? 1 : 0);
