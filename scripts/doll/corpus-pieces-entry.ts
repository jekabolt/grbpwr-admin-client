// Piece dump of a captured doll request: hand, twins, grain, and per edge its length, straightness,
// turn and angle to the grain (scratch inspection for yarn doll:corpus).
import { readFileSync } from 'node:fs';
import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';

const [file, filter] = process.argv.slice(2);
const reqs = JSON.parse(readFileSync(file, 'utf8'));
const input = reqs[reqs.length - 1];
const log = console.log;
console.log = () => {};
console.warn = () => {};
const graph = readSeamGraph(input.facts);
console.log = log;
const fact = new Map(input.facts.pieces.map((p: { pieceKey: string }) => [p.pieceKey, p]));
const re = filter ? new RegExp(filter, 'i') : null;
console.log('category', input.facts.category);
for (const g of graph.pieces) {
  if (re && !re.test(g.name)) continue;
  const f = fact.get(g.pieceKey) as { piece: { grain?: { angleDeg: number; layer: string }[] } };
  const gr = f?.piece.grain?.map((x) => `${x.layer}:${x.angleDeg.toFixed(0)}`).join(',') ?? '-';
  const xs = g.rs.map((q) => q[0]);
  const ys = g.rs.map((q) => q[1]);
  console.log(
    `${g.name.padEnd(16)} hand=${g.hand ?? '-'} cloth=${g.cloth} bbox ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)}×${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} grain=${gr} twins=${g.twinOf.map((t) => `${graph.pieces.find((x) => x.pieceKey === t.key)?.name ?? t.key}/${t.kind}`).join(',')}`,
  );
  for (const e of g.edges.filter((x) => x.kind === 'edge')) {
    const a = e.pts[0];
    const b = e.pts[e.pts.length - 1];
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    console.log(
      `   #${e.k} len ${e.lenMm.toFixed(0)} chord ${(e.chordMm / e.lenMm).toFixed(2)} turn ${e.turnDeg.toFixed(0)} dir ${ang.toFixed(0)}° from (${a[0].toFixed(0)},${a[1].toFixed(0)}) to (${b[0].toFixed(0)},${b[1].toFixed(0)}) notches ${e.notchesMm.length}`,
    );
  }
}
for (const s of graph.chosen) {
  const nm = (id: string) => {
    const at = id.lastIndexOf('#');
    return `${graph.pieces.find((p) => p.pieceKey === id.slice(0, at))?.name}#${id.slice(at + 1)}`;
  };
  if (re && !re.test(nm(s.a)) && !re.test(nm(s.b))) continue;
  console.log(
    `SEAM ${s.kind} ${nm(s.a)} ~ ${nm(s.b)} ${s.score.toFixed(2)} twin=${s.evidence.twin} hand=${s.evidence.hand} rule=${s.evidence.rule ?? ''}`,
  );
}
