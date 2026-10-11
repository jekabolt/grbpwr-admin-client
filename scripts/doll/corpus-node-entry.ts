// The doll requests yarn doll:corpus captured from the live overlay (req/<prodId>.json), solved
// again in node by the same solveDoll the worker runs — for iterating on the solver without a
// browser. Prints every seam with its state, kind and origin, the floating pieces and the time.
import { readFileSync } from 'node:fs';
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
const graph = readSeamGraph(input.facts);
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
    `   ${s.state.padEnd(9)} ${String(s.kind).padEnd(18)} ${s.origin.padEnd(13)} ${s.a.map(nm).join('+') || 'free loop'} ↔ ${s.b.map(nm).join('+') || 'free loop'} · max ${Math.round(s.residualMaxMm)} mm · ${Math.round(s.lenA)}/${Math.round(s.lenB)}${s.note ? ` · ${s.note.slice(0, 90)}` : ''}`,
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
