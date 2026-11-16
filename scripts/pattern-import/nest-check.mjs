#!/usr/bin/env node
// Closed-but-wrong probe: a closed size that does not nest between its neighbours.
// `dxf-check.mjs` counts open cells only; a piece closed on a WRONG line (cut at an interior line,
// or on another size's line) is invisible to it. This finds those, precision first.
//
//   node scripts/pattern-import/nest-check.mjs <run-dir> [--out flags.json]
//   node scripts/pattern-import/nest-check.mjs <after-run-dir> --before <before-run-dir> [--out diff.json]
//   node scripts/pattern-import/nest-check.mjs --fixture        (labelled cells, exact verdict; exit 1 on a miss)
//
// A run dir is a `dxf-shot.mjs --out` directory (one sub-dir per PDF with `cells.json`).
//
// Rule (bracket, not pair: a pair test cannot tell which of two cells is wrong). For each closed
// cell c with closed neighbours lo (smaller) and hi (larger) in its piece:
//   lim(a, b) = max(10 mm, 3 · step · index gap); step = median over adjacent closed pairs of the
//               pair's p95 outline distance (the family grade step, floor 1 mm).
//   out(a, b) = longest run (mm, 3 mm samples) of a's outline outside b deeper than lim.
//   judged    = out(lo, hi) < 20  (the neighbours agree: lo lies inside hi).
//   TRUNC     = out(lo, c) >= 20  (the smaller size sticks out: c is cut short).
//   OVER      = out(c, hi) >= 20  (c sticks out of the larger size: closed on a bigger line).
// Pass 2 picks lo / hi among cells not flagged in pass 1 (one cut cell otherwise also flags its
// smaller neighbour OVER).
//
// BLIND, by construction — "0 new flags" is NOT "no new wrong closes":
//   - a run of sizes cut alike (the neighbours agree with each other; e.g. a tick knife cutting
//     sizes 00–16 at the same waist mark);
//   - edge sizes (no bracket);
//   - strip ladders (rectangles graded in length only).
// Pair it with media-diff's `moved` (it compares runs, not neighbours) when accepting a change.
//
// Acceptance reading (--before): judge per cell, never by the net count.
//   new       flagged after, not before                 → picture each
//   cleared   flagged before, judged and clean after     → picture each (fixed?)
//   unjudged  flagged before, not judged after          → NOT a fix (a neighbour went open)
// The header always prints flags / judged / unjudged.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ST = 3;
const RUN = 20;
const segD = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};
const inside = (p, P) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i];
    const [xj, yj] = P[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const resample = (o) => {
  const r = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i];
    const b = o[(i + 1) % o.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / ST));
    for (let k = 0; k < n; k++)
      r.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return r;
};
const dPoly = (p, P) => {
  let d = 1e9;
  for (let i = 0; i < P.length; i++) d = Math.min(d, segD(p, P[i], P[(i + 1) % P.length]));
  return d;
};
const sorted = (a) => [...a].sort((x, y) => x - y);
const pct = (a, q) => {
  const s = sorted(a);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const median = (a) => {
  const s = sorted(a);
  return s.length ? s[s.length >> 1] : 0;
};
const runMax = (arr, pred) => {
  const n = arr.length;
  const s = arr.findIndex((v) => !pred(v));
  if (s < 0) return n * ST;
  let best = 0;
  let cur = 0;
  for (let k = 1; k <= n; k++) {
    if (pred(arr[(s + k) % n])) best = Math.max(best, ++cur);
    else cur = 0;
  }
  return best * ST;
};

/** One piece (a `cells.json` family) → { verdicts: Map(size → verdict) }. */
export function judgeFamily(fam) {
  const verdicts = new Map();
  const C = fam.cells
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.outcome === 'closed' && c.outer?.length > 2);
  for (const { c } of C) verdicts.set(c.size, { kind: 'unjudged' });
  if (C.length < 3) return { verdicts, step: 0 };
  const S = C.map(({ c }) => resample(c.outer));
  const memo = new Map();
  const sd = (a, b) => {
    const k = `${a},${b}`;
    if (!memo.has(k)) {
      const P = C[b].c.outer;
      memo.set(
        k,
        S[a].map((q) => (inside(q, P) ? -1 : 1) * dPoly(q, P)),
      );
    }
    return memo.get(k);
  };
  const steps = [];
  for (let k = 0; k + 1 < C.length; k++) {
    const p95 = Math.max(
      pct(sd(k, k + 1).map(Math.abs), 0.95),
      pct(sd(k + 1, k).map(Math.abs), 0.95),
    );
    steps.push(p95 / (C[k + 1].i - C[k].i));
  }
  const step = Math.max(1, median(steps));
  const lim = (a, b) => Math.max(10, 3 * step * Math.abs(C[b].i - C[a].i));
  const out = (a, b) => runMax(sd(a, b), (v) => v > lim(a, b));
  let bad = new Set();
  for (let pass = 0; pass < 2; pass++) {
    const nb = new Set();
    for (let j = 1; j + 1 < C.length; j++) {
      let lo = -1;
      let hi = -1;
      for (let k = j - 1; k >= 0; k--) if (!bad.has(k)) { lo = k; break; } // prettier-ignore
      for (let k = j + 1; k < C.length; k++) if (!bad.has(k)) { hi = k; break; } // prettier-ignore
      if (lo < 0 || hi < 0 || out(lo, hi) >= RUN) continue;
      const trunc = out(lo, j);
      const over = out(j, hi);
      const kind = trunc >= RUN ? (over >= RUN ? 'both' : 'TRUNC') : over >= RUN ? 'OVER' : 'ok';
      if (kind !== 'ok') nb.add(j);
      if (pass === 1) {
        const v = { kind, lo: C[lo].c.size, hi: C[hi].c.size, trunc, over, from: C[j].c.from };
        verdicts.set(C[j].c.size, v);
      }
    }
    bad = nb;
  }
  return { verdicts, step: +step.toFixed(1) };
}

const isFlag = (v) => v && v.kind !== 'ok' && v.kind !== 'unjudged';

function judgeRun(dir) {
  const cells = new Map(); // key file|piece|size → verdict
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f, 'cells.json');
    if (!existsSync(p)) continue;
    for (const fam of JSON.parse(readFileSync(p, 'utf8'))) {
      for (const [size, v] of judgeFamily(fam).verdicts) cells.set(`${f}|${fam.label}|${size}`, v);
    }
  }
  return cells;
}

function totals(cells) {
  let flags = 0;
  let judged = 0;
  let unjudged = 0;
  for (const v of cells.values()) {
    if (v.kind === 'unjudged') unjudged++;
    else judged++;
    if (isFlag(v)) flags++;
  }
  return { flags, judged, unjudged };
}

const line = (k, v) =>
  `${v.kind.padEnd(8)} ${k.replaceAll('|', ' | ')}${v.lo ? `  (${v.lo} < · < ${v.hi}) trunc ${v.trunc} over ${v.over} [${v.from}]` : ''}`;
const BLIND = 'blind: runs cut alike, edge sizes, strip ladders — pair with media-diff moved';

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const outFile = opt('--out');
const before = opt('--before');

if (args[0] === '--fixture') {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = JSON.parse(readFileSync(resolve(here, 'nest-check.fixture.json'), 'utf8'));
  let bad = 0;
  for (const t of fx.cases) {
    const v = judgeFamily(fx.families[t.family]).verdicts.get(t.size) ?? { kind: 'absent' };
    // Exact verdict: a clean case drifting to `unjudged` (brackets broken) or a real one flipping
    // TRUNC ↔ OVER (blame moved to the neighbour) is a miss.
    const ok = t.expect === 'undecided' || v.kind === t.expect;
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'MISS'} expect ${t.expect.padEnd(9)} got ${v.kind.padEnd(8)} ${t.family} · ${t.size}  ${t.note ?? ''}`,
    );
  }
  console.log(`${fx.cases.length - bad} / ${fx.cases.length} as labelled`);
  process.exit(bad ? 1 : 0);
}

const [dir] = args;
if (!dir) {
  console.error('usage: nest-check.mjs <run-dir> [--before <run-dir>] [--out f.json] | --fixture');
  process.exit(2);
}
const after = judgeRun(dir);
const tA = totals(after);
if (!before) {
  console.log(`flags ${tA.flags} / judged ${tA.judged} / unjudged ${tA.unjudged}   (${BLIND})`);
  const rows = [...after].filter(([, v]) => isFlag(v));
  for (const [k, v] of rows) console.log(line(k, v));
  if (outFile)
    writeFileSync(
      outFile,
      JSON.stringify({ totals: tA, flags: rows.map(([k, v]) => ({ key: k, ...v })) }, null, 1),
    );
} else {
  const prev = judgeRun(before);
  const tB = totals(prev);
  const diff = { new: [], cleared: [], unjudged: [], unchanged: [] };
  for (const k of new Set([...prev.keys(), ...after.keys()])) {
    const a = after.get(k);
    const b = prev.get(k);
    if (isFlag(a) && !isFlag(b)) diff.new.push([k, a]);
    else if (isFlag(b) && !isFlag(a))
      (a?.kind === 'ok' ? diff.cleared : diff.unjudged).push([k, a ?? { kind: 'absent' }]);
    else if (isFlag(a)) diff.unchanged.push([k, a]);
  }
  console.log(`before flags ${tB.flags} / judged ${tB.judged} / unjudged ${tB.unjudged}`);
  console.log(
    `after  flags ${tA.flags} / judged ${tA.judged} / unjudged ${tA.unjudged}   (${BLIND})`,
  );
  console.log(
    `new ${diff.new.length} (picture each) · cleared ${diff.cleared.length} (picture each) · cleared-by-unjudged ${diff.unjudged.length} (NOT a fix) · unchanged ${diff.unchanged.length}`,
  );
  for (const g of ['new', 'cleared', 'unjudged'])
    for (const [k, v] of diff[g]) console.log(`${g.padEnd(9)} ${line(k, v)}`);
  if (outFile) {
    const o = Object.fromEntries(
      Object.entries(diff).map(([g, r]) => [g, r.map(([k, v]) => ({ key: k, ...v }))]),
    );
    writeFileSync(outFile, JSON.stringify({ before: tB, after: tA, ...o }, null, 1));
  }
}
