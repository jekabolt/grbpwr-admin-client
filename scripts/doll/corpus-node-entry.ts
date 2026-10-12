// The doll requests yarn doll:corpus captured from the live overlay (req/<prodId>.json), solved
// again in node by the same solveDoll the worker runs — for iterating on the solver without a
// browser. Prints every seam with its state, kind and origin, the floating pieces and the time.
import { readFileSync, writeFileSync } from 'node:fs';
import { readSeamGraph, segmentAll } from '../../src/lib/assembly-skeleton/pipeline';
import { solveDoll } from '../../src/lib/doll/doll';
import { grainDegOf } from '../../src/lib/seams/frame';

const [file, verbose] = process.argv.slice(2);
const reqs = JSON.parse(readFileSync(file, 'utf8'));
const input = reqs[reqs.length - 1];
if (!input) {
  console.log('  no doll request captured');
  process.exit(0);
}
const names = new Map<string, string>(
  input.facts.pieces.map((p: { pieceKey: string; name: string }) => [p.pieceKey, p.name]),
);
const nm = (id: string) => {
  const at = id.lastIndexOf('#');
  return `${names.get(id.slice(0, at)) ?? id.slice(0, at)}#${id.slice(at + 1)}`;
};
const log = console.log;
const warn = console.warn;
console.log = () => {};
console.warn = () => {};
const t0 = performance.now();
const graph = readSeamGraph(
  input.facts,
  undefined,
  undefined,
  undefined,
  undefined,
  input.options?.assignment,
);
const t1 = performance.now();
const anchors = (input.anchors ?? []).map((a: { size: string; facts: never }) => ({
  size: a.size,
  pieces: segmentAll(a.facts),
  grainDeg: grainDegOf(a.facts),
}));
const seams = input.options?.seams;
const report = solveDoll({
  graph,
  facts: input.facts,
  options: {
    ...input.options,
    ...(process.env.DOLL_DEBUG ? { debug: true } : {}),
    ...(process.env.DOLL_NOPROP ? { proposeComposite: false } : {}),
    ...(process.env.DOLL_TV ? { targetVertices: Number(process.env.DOLL_TV) } : {}),
    ...(process.env.DOLL_DROP ? { dropSeams: process.env.DOLL_DROP.split(',') } : {}),
    ...(seams ? { seams: { ...seams, sizes: [...(seams.sizes ?? []), ...anchors] } } : {}),
  },
});
const t2 = performance.now();
console.log = log;
console.warn = warn;
const c = { closed: 0, stretched: 0, proposed: 0, open: 0 };
for (const s of report.seams.filter((x) => x.origin !== 'layer')) {
  if (s.state === 'closed' || s.state === 'eased') c.closed++;
  else if (s.state === 'stretched') c.stretched++;
  else if (s.state === 'proposed') c.proposed++;
  else c.open++;
}
console.log(
  `  ${c.closed}c ${c.stretched}s ${c.proposed}p ${c.open}o ${report.floating.length}f · graph ${(t1 - t0).toFixed(0)} ms · solve ${(t2 - t1).toFixed(0)} ms · passes ${report.stats.passes ?? ''}`,
);
const rank: Record<string, number> = {
  open: 0,
  twisted: 1,
  proposed: 2,
  stretched: 3,
  eased: 4,
  closed: 5,
};
for (const s of [...report.seams]
  .filter((x) => x.origin !== 'layer')
  .sort((a, b) => rank[a.state] - rank[b.state])) {
  if (!verbose && (s.state === 'closed' || s.state === 'eased')) continue;
  console.log(
    `   ${s.state.padEnd(9)} ${String(s.kind).padEnd(18)} ${s.origin.padEnd(13)} ${s.a.map(nm).join('+') || 'free loop'} ↔ ${s.b.map(nm).join('+') || 'free loop'} · max ${Math.round(s.residualMaxMm)} p95 ${Math.round(s.residualP95Mm)} mm · ${Math.round(s.lenA)}/${Math.round(s.lenB)}${s.note ? ` · ${s.note.slice(0, verbose ? 2000 : 90)}` : ''}`,
  );
}
if (process.env.DOLL_PATHS)
  for (const s of report.seams.filter((x) => new RegExp(process.env.DOLL_PATHS!).test(x.id))) {
    const P = report.positions;
    const at = (path: Uint32Array, f: number) => {
      const v = path[Math.min(path.length - 1, Math.round(f * (path.length - 1)))];
      return [P[3 * v], P[3 * v + 1], P[3 * v + 2]].map((x) => x.toFixed(0)).join(',');
    };
    const pt = (path: Uint32Array, f: number) => {
      const v = path[Math.min(path.length - 1, Math.round(f * (path.length - 1)))];
      return [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
    };
    const gaps = Array.from({ length: 21 }, (_, k) => k / 20).map((f) => {
      const a = pt(s.pathA, f);
      const b0 = pt(s.pathB, 1 - f);
      const b1 = pt(s.pathB, f);
      return Math.min(
        Math.hypot(a[0] - b0[0], a[1] - b0[1], a[2] - b0[2]),
        Math.hypot(a[0] - b1[0], a[1] - b1[1], a[2] - b1[2]),
      ).toFixed(0);
    });
    console.log(`   GAPS ${s.id.slice(0, 40)}: ${gaps.join(' ')}`);
    console.log(
      `   PATH ${s.id.slice(0, 60)}: A ${[0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1].map((f) => at(s.pathA, f)).join(' | ')}\n        B ${[0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1].map((f) => at(s.pathB, f)).join(' | ')}`,
    );
  }
for (const f of report.floating)
  console.log(`   floating ${names.get(f.pieceKey)} · ${f.reason.slice(0, 120)}`);
for (const w of report.contradictions ?? []) console.log(`   contradiction ${w.slice(0, 160)}`);
if (verbose) {
  const P = report.positions;
  const bb = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3)
    for (let k = 0; k < 3; k++) {
      bb[2 * k] = Math.min(bb[2 * k], P[i + k]);
      bb[2 * k + 1] = Math.max(bb[2 * k + 1], P[i + k]);
    }
  console.log('  bbox', bb.map((x) => x.toFixed(0)).join(' '));
  for (const w of report.warnings) console.log('  W', w.slice(0, 300));
  console.log('  stats', JSON.stringify(report.stats));
  for (const s of graph.chosen)
    console.log(`  GRAPH ${s.kind.padEnd(9)} ${nm(s.a)} ~ ${nm(s.b)} ${s.score.toFixed(2)}`);
}
// DOLL_SVG=<file>: front and back views (orthographic, painter-sorted, flat light) — surface pieces
// (fly, pocket bags laid on a panel) tinted, to look at where they were laid.
if (process.env.DOLL_SVG) {
  const P = report.positions;
  const surf = new Set((report.surface ?? []).filter((x) => x.placed).map((x) => x.pieceKey));
  const views = [
    { name: 'front', sx: 1, sz: 1 },
    { name: 'back', sx: -1, sz: -1 },
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    minX = Math.min(minX, P[i], -P[i]);
    maxX = Math.max(maxX, P[i], -P[i]);
    minY = Math.min(minY, P[i + 1]);
    maxY = Math.max(maxY, P[i + 1]);
  }
  const w = maxX - minX + 40;
  const parts: string[] = [];
  views.forEach((V, k) => {
    const polys: { z: number; d: string; fill: string }[] = [];
    for (const pan of report.panels) {
      const tint = surf.has(pan.pieceKey);
      for (let t = 0; t < pan.tris.length; t += 3) {
        const v = [0, 1, 2].map((j) => pan.offset + pan.tris[t + j]);
        const q = v.map((i) => [V.sx * P[3 * i], P[3 * i + 1], V.sz * P[3 * i + 2]]);
        const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
        const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
        const n = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0],
        ];
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        const lum = 0.35 + 0.6 * Math.abs((0.3 * n[0] + 0.4 * n[1] + 0.85 * n[2]) / nl);
        const c = Math.round(255 * Math.min(1, lum));
        const fill = tint
          ? `rgb(${c},${Math.round(c * 0.45)},${Math.round(c * 0.3)})`
          : `rgb(${c},${c},${c})`;
        const z = (q[0][2] + q[1][2] + q[2][2]) / 3 + (tint ? 3 : 0);
        const ox = k * w - minX + 20;
        polys.push({
          z,
          fill,
          d:
            q
              .map(
                (p, j) =>
                  `${j ? 'L' : 'M'}${(ox + p[0]).toFixed(1)},${(maxY - p[1] + 20).toFixed(1)}`,
              )
              .join('') + 'Z',
        });
      }
    }
    polys.sort((a, b) => a.z - b.z);
    for (const p of polys)
      parts.push(`<path d="${p.d}" fill="${p.fill}" stroke="${p.fill}" stroke-width="0.4"/>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(2 * w).toFixed(0)}" height="${(maxY - minY + 40).toFixed(0)}" style="background:#f4f4f2">${parts.join('')}</svg>`;
  writeFileSync(process.env.DOLL_SVG, svg);
}
