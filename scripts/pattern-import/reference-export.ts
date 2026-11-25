// REFERENCE EXPORT — the pieces the owner confirms by eye (the reference set, 23 Nov 2026).
// Replays a pieces snapshot on the current code and writes, per chosen piece, the sheet lines
// around it and our outline of every exported size — the data of the review page. The owner's
// answers on that page plus this file make reference.json (reference-build.ts).
//   npx vite-node scripts/pattern-import/reference-export.ts <pick.txt> <out.json>
// pick.txt: one piece per line, `<shot dir>\t<file id substring>\t<label | seed:N>\t<group>\t<id>`.
// <id> keys the owner's answer: keep it when the list grows, or the answer is orphaned.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readSnapshot, replaySnapshot } from './pieces-bench-lib';

type P = { x: number; y: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const flat = (pts: readonly P[]) => pts.flatMap((p) => [r1(p.x), r1(p.y)]);

/** Douglas-Peucker: drops points within `tol` mm of the chord (the drawing only, never the data). */
function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const [A0, Z] = [pts[0], pts[pts.length - 1]];
  if (Math.hypot(A0.x - Z.x, A0.y - Z.y) < 1e-6) {
    // a ring: the chord of its ends is a point, so split it at the vertex farthest from the start
    let far = 1;
    pts.forEach((p, k) => {
      if (Math.hypot(p.x - A0.x, p.y - A0.y) > Math.hypot(pts[far].x - A0.x, pts[far].y - A0.y))
        far = k;
    });
    return [...simplify(pts.slice(0, far + 1), tol), ...simplify(pts.slice(far), tol).slice(1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a],
      B = pts[b];
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1e-9;
    let far = -1,
      dmax = tol;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((B.x - A.x) * (A.y - pts[k].y) - (A.x - pts[k].x) * (B.y - A.y)) / L;
      if (d > dmax) (dmax = d), (far = k);
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** The runs of a path inside the box (one point of margin each side so a crossing stays drawn). */
function clip(pts: P[], inBox: (p: P) => boolean): P[][] {
  const runs: P[][] = [];
  let cur: P[] = [];
  pts.forEach((p, k) => {
    const near =
      inBox(p) || (k > 0 && inBox(pts[k - 1])) || (k + 1 < pts.length && inBox(pts[k + 1]));
    if (near) cur.push(p);
    else if (cur.length) runs.push(cur), (cur = []);
  });
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}

const [pickFile, outFile] = process.argv.slice(2);
const picks = readFileSync(pickFile, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.split('\t'));

const byFile = new Map<string, { want: string; group: string; pid: string }[]>();
for (const [root, id, want, group, pid] of picks) {
  const d = readdirSync(root).find((n) => n.includes(id));
  if (!d) throw new Error(`no ${id} in ${root}`);
  const k = resolve(root, d);
  byFile.set(k, [...(byFile.get(k) ?? []), { want, group, pid }]);
}

const pieces: { id: string }[] = [];
for (const [dir, wants] of byFile) {
  const snap = readdirSync(dir)
    .filter((f) => /^pieces-\d+\.snap\.gz$/.test(f))
    .sort((a, b) => +b.match(/\d+/)![0] - +a.match(/\d+/)![0])[0];
  const s = readSnapshot(readFileSync(resolve(dir, snap)));
  const out = await replaySnapshot(s);
  const f = s.fields as Record<string, any>;
  const label = new Map((s.ranks ?? []).map((r) => [r.rank, r.label]));
  const exp = s.ranks ? new Set(s.ranks.filter((r) => r.exported).map((r) => r.rank)) : null;
  const sheetPaths = f.sheet.paths as { pts: P[]; closed: boolean }[];
  for (const { want, group, pid } of wants) {
    const fam = out.families.find((fm) => {
      const sd = out.seeds.find((x) => x.id === fm.seed);
      return want.startsWith('seed:') ? fm.seed === +want.slice(5) : sd?.text?.text === want;
    });
    if (!fam) {
      console.error(`MISSING ${s.id} ${want}`);
      continue;
    }
    const cands = fam.candidates.filter((c) => !exp || exp.has(c.rank));
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const c of cands)
      for (const p of c.outer) {
        box.x0 = Math.min(box.x0, p.x);
        box.y0 = Math.min(box.y0, p.y);
        box.x1 = Math.max(box.x1, p.x);
        box.y1 = Math.max(box.y1, p.y);
      }
    const m = 15;
    const inBox = (p: P) =>
      p.x >= box.x0 - m && p.x <= box.x1 + m && p.y >= box.y0 - m && p.y <= box.y1 + m;
    const lines = sheetPaths
      .filter((p) => p.pts.some(inBox))
      .flatMap((p) => {
        const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
        return clip(pts, inBox).map((r) => flat(simplify(r, 0.15)));
      });
    const sd = out.seeds.find((x) => x.id === fam.seed);
    pieces.push({
      id: pid,
      key: `${s.id.slice(0, 40)}|${want}`,
      file: s.id,
      label: sd?.text?.text ?? null,
      want,
      group,
      box: [r1(box.x0 - m), r1(box.y0 - m), r1(box.x1 + m), r1(box.y1 + m)],
      lines,
      sizes: cands.map((c) => ({
        size: label.get(c.rank) ?? `r${c.rank}`,
        outcome: c.outcome,
        d: flat(simplify([...c.outer, c.outer[0]].filter(Boolean), 0.1)),
      })),
    });
    console.log(`${s.id} ${want}: ${cands.length} sizes, ${lines.length} lines`);
  }
}
const order = picks.map((p) => p[4]);
pieces.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
writeFileSync(outFile, JSON.stringify(pieces));
console.log(`wrote ${pieces.length} pieces`);
