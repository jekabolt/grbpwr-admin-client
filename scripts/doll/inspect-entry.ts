import { readFile } from 'node:fs/promises';
import { loadFacts } from '../assembly-skeleton/seams-entry';
import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import { readName } from '../../src/lib/assembly-skeleton/skeleton';
import type { SkeletonCategory } from '../../src/lib/assembly-skeleton/types';

const [dxf, size, cat] = process.argv.slice(2);
const buf = await readFile(dxf);
const log = console.log;
const warn = console.warn;
console.log = () => {};
console.warn = () => {};
const { facts } = await loadFacts(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  size,
  cat as SkeletonCategory,
);
const graph = readSeamGraph(facts);
console.log = log;
console.warn = warn;
for (const p of graph.pieces) {
  const f = facts.pieces.find((x) => x.pieceKey === p.pieceKey)!;
  const xs = p.rs.map((q) => q[0]);
  const ys = p.rs.map((q) => q[1]);
  const r = readName(p.name);
  const g = f.piece.grain
    ?.map((x) => `${x.angleDeg.toFixed(0)}°/${x.lengthCm.toFixed(0)}`)
    .join(',');
  console.log(
    `${p.pieceKey.padEnd(12)} role=${String(r.role).padEnd(9)} hand=${p.hand ?? '-'} cloth=${p.cloth} w=${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} h=${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} perim=${p.perimMm.toFixed(0)} grain=${g} edges=${p.edges.map((e) => `${e.k}:${e.lenMm.toFixed(0)}`).join(' ')} twin=${p.twinOf.map((t) => t.key + '/' + t.kind).join(',')}`,
  );
}
for (const s of graph.chosen)
  console.log(
    `SEAM ${s.kind.padEnd(9)} ${s.a} ~ ${s.b} ${s.score.toFixed(2)} len ${s.evidence.aLenMm?.toFixed(0)}/${s.evidence.bLenMm?.toFixed(0)} ${s.aParts ? 'A[' + s.aParts.join(',') + ']' : ''} ${s.bParts ? 'B[' + s.bParts.join(',') + ']' : ''}`,
  );
for (const s of graph.rejected.filter((x) => x.kind === 'closure-not-seam'))
  console.log(`CLOSURE ${s.a} ~ ${s.b}`);
console.log('components', JSON.stringify(graph.components));
console.log('warnings', graph.warnings.join(' | '));
