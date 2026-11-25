// A blind test of the two defect signs (a jog, a run on the line of a distant size) on pieces the
// owner's reference set does not hold: windows of the FILL's outline, flagged and unflagged mixed
// in random order, with nothing on the picture to tell them apart. The owner says for each
// whether the outline follows the right line there; the key is kept beside the pictures.
//   npx vite-node scripts/pattern-import/diag/blind-windows.ts <reference.json> <clone with .runs> <out prefix> [panels=40] [seed=1]
// Writes <prefix>-1.png … (20 panels each, 20 × 20 mm, every printed stroke and the outline) and
// <prefix>-key.json. Thresholds are the product's as they stand (`WALK`): nothing is tuned here.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { segNearest, simplify } from 'lib/pattern-import/pieces/geom';
import { jogsOf, WALK, walkLines } from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

const require = createRequire(`${process.cwd()}/`);
const { createCanvas } = require('@napi-rs/canvas');
const [refPath, base, prefix, nArg, seedArg] = process.argv.slice(2);
const WANT = +(nArg ?? 40);
let seed = +(seedArg ?? 1);
const rnd = () => {
  // a small deterministic generator: the same seed gives the same test
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const inRef = new Set<string>(
  (Array.isArray(raw) ? raw : raw.pieces).map((p: { file: string }) => p.file),
);
type Win = {
  kind: 'jog' | 'far' | 'corner' | 'run';
  file: string;
  label: string;
  size: string;
  at: PtMm;
  outer: PtMm[];
  paths: PtMm[][];
};
const pool: Win[] = [];
for (const root of ['.runs/snap-set40', '.runs/snap-holdout40']) {
  const dirRoot = `${base}/${root}`;
  if (!existsSync(dirRoot)) continue;
  for (const d of readdirSync(dirRoot)) {
    if ([...inRef].some((f) => d.includes(f))) continue; // a file the reference set knows
    const dir = `${dirRoot}/${d}`;
    if (!existsSync(`${dir}/cells.json`)) continue;
    const snapFile = readdirSync(dir)
      .filter((x) => x.endsWith('.snap.gz'))
      .sort()
      .pop();
    if (!snapFile) continue;
    const snap = deserialize(gunzipSync(readFileSync(`${dir}/${snapFile}`))) as {
      fields: { chains: ChainSet; run: SizeRun; sheet: { paths: { pts: PtMm[] }[] } };
      ranks: { rank: number; label: string }[];
    };
    const rankOf = new Map(snap.ranks.map((r) => [r.label, r.rank]));
    const L = walkLines(snap.fields.chains, snap.fields.run);
    if (L.bySize.size < 3) continue;
    const cells: {
      label: string | null;
      cells: { size: string; outcome: string; outer?: [number, number][] }[];
    }[] = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
    const near = (at: PtMm) =>
      snap.fields.sheet.paths
        .filter(
          (p) =>
            p.pts.length &&
            p.pts.some((q) => Math.abs(q.x - at.x) < 16 && Math.abs(q.y - at.y) < 16),
        )
        .map((p) => p.pts);
    for (const fam of cells)
      for (const c of fam.cells) {
        const rank = rankOf.get(c.size);
        if (c.outcome !== 'closed' || rank === undefined || !c.outer || c.outer.length < 8)
          continue;
        const outer = c.outer.map(([x, y]) => ({ x, y }));
        const mk = (kind: Win['kind'], at: PtMm) =>
          pool.push({
            kind,
            file: d,
            label: (fam.label ?? '').trim(),
            size: c.size,
            at,
            outer,
            paths: near(at),
          });
        const jogs = jogsOf(outer);
        for (const j of jogs) mk('jog', j.at);
        // the longest run on the line of a distant size
        let run: PtMm[] = [];
        let best: PtMm[] = [];
        for (let k = 0; k < outer.length; k++) {
          const p = outer[k];
          const q = outer[(k + 1) % outer.length];
          const n = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y)));
          for (let t = 0; t < n; t++) {
            const m = {
              x: p.x + ((q.x - p.x) * (t + 0.5)) / n,
              y: p.y + ((q.y - p.y) * (t + 0.5)) / n,
            };
            const ranks = new Set<number>();
            L.grid.near(m, WALK.onOwnMm, (o, i) => {
              if (segNearest(m, L.lines[o][i], L.lines[o][i + 1]).d <= WALK.onOwnMm)
                ranks.add(L.rankOf[o]);
            });
            const far =
              ranks.size > 0 &&
              ranks.size <= 3 &&
              !ranks.has(rank) &&
              Math.min(...[...ranks].map((r) => Math.abs(r - rank))) >= WALK.farSizes;
            if (far) run.push(m);
            else {
              if (run.length > best.length) best = run;
              run = [];
            }
          }
        }
        if (run.length > best.length) best = run;
        const farFlag = best.length >= WALK.farLineMm;
        if (farFlag) mk('far', best[best.length >> 1]);
        // controls: only from an outline neither sign touches
        if (jogs.length || farFlag) continue;
        const s = simplify([...outer, outer[0]], 1).slice(0, -1);
        const n = s.length;
        for (let i = 0; i < n; i++) {
          const a = s[(i - 1 + n) % n];
          const b = s[i];
          const cN = s[(i + 1) % n];
          let turn = Math.atan2(cN.y - b.y, cN.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
          while (turn > Math.PI) turn -= 2 * Math.PI;
          while (turn <= -Math.PI) turn += 2 * Math.PI;
          if (Math.abs(turn) > Math.PI / 4 && rnd() < 0.02) mk('corner', b);
          const len = Math.hypot(cN.x - b.x, cN.y - b.y);
          if (len > 40 && rnd() < 0.02) mk('run', { x: (b.x + cN.x) / 2, y: (b.y + cN.y) / 2 });
        }
      }
  }
}
const take = (kind: Win['kind'], n: number) => {
  const all = pool.filter((w) => w.kind === kind);
  const out: Win[] = [];
  // no two windows of one piece and size: a piece with ten jogs is one piece
  const seen = new Set<string>();
  while (all.length && out.length < n) {
    const w = all.splice(Math.floor(rnd() * all.length), 1)[0];
    const k = `${w.file}|${w.label}|${w.size}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
};
const counts = {
  jog: pool.filter((w) => w.kind === 'jog').length,
  far: pool.filter((w) => w.kind === 'far').length,
};
const half = WANT / 2;
const picked = [
  ...take('jog', Math.round(half * 0.6)),
  ...take('far', Math.round(half * 0.4)),
  ...take('corner', Math.round(half / 2)),
  ...take('run', Math.round(half / 2)),
];
for (let i = picked.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [picked[i], picked[j]] = [picked[j], picked[i]];
}
const P = 440;
const H = 10;
const PER = 20;
for (let sheet = 0; sheet * PER < picked.length; sheet++) {
  const part = picked.slice(sheet * PER, sheet * PER + PER);
  const cols = 5;
  const rows = Math.ceil(part.length / cols);
  const cv = createCanvas(cols * P, rows * (P + 26) + 34);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#000';
  g.font = '15px "Helvetica Neue", Arial, sans-serif';
  g.fillText(
    'КРАСНЫЙ = контур · зелёный = все напечатанные штрихи листа · панель 20 × 20 мм · вопрос к каждой: контур здесь идёт по верной линии?',
    8,
    20,
  );
  part.forEach((w, n) => {
    const ox = (n % cols) * P;
    const oy = 34 + Math.floor(n / cols) * (P + 26);
    const k = P / (2 * H);
    const X = (x: number) => ox + (x - w.at.x + H) * k;
    const Y = (y: number) => oy + 24 + (y - w.at.y + H) * k;
    g.save();
    g.beginPath();
    g.rect(ox + 2, oy + 24, P - 4, P - 2);
    g.clip();
    const line = (pts: PtMm[], col: string, wd: number, dash: number[] = []) => {
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.setLineDash(dash);
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))));
      g.stroke();
    };
    for (const p of w.paths) line(p.length > 1 ? p : [p[0], p[0]], '#6b6', 1.2);
    line([...w.outer, w.outer[0]], '#e11', 3, [10, 6]);
    g.restore();
    g.setLineDash([]);
    g.strokeStyle = '#888';
    g.lineWidth = 1;
    g.strokeRect(ox + 2, oy + 24, P - 4, P - 2);
    g.fillStyle = '#000';
    g.font = 'bold 18px "Helvetica Neue", Arial, sans-serif';
    g.fillText(`${sheet * PER + n + 1}`, ox + 8, oy + 18);
    g.font = '15px "Helvetica Neue", Arial, sans-serif';
  });
  writeFileSync(`${prefix}-${sheet + 1}.png`, cv.toBuffer('image/png'));
}
writeFileSync(
  `${prefix}-key.json`,
  JSON.stringify(
    picked.map((w, i) => ({
      n: i + 1,
      kind: w.kind,
      file: w.file,
      label: w.label,
      size: w.size,
      at: w.at,
    })),
    null,
    1,
  ),
);
console.log(
  `unseen files: jogs ${counts.jog}, distant-line outlines ${counts.far} · windows ${picked.length}: ${['jog', 'far', 'corner', 'run'].map((k) => `${k} ${picked.filter((w) => w.kind === k).length}`).join(', ')}`,
);
