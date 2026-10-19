import { readFile } from 'node:fs/promises';

import { skeletonDeps } from '../../../src/components/managers/tech-card/components/assembly-skeleton-deps';
import { seamPieceOf } from '../../../src/lib/assembly-skeleton/geometry';
import { proposeSkeleton } from '../../../src/lib/assembly-skeleton/pipeline';
import type { SkeletonFacts, SkeletonPieceInput } from '../../../src/lib/assembly-skeleton/types';
import { unionLayout, unitLeaves } from '../../../src/lib/assembly-skeleton/union';
import type { PieceDTO } from '../../../src/lib/nesting/types';
import { parseSheets } from '../../../src/lib/nesting/worker/parse-files';

const NO_BOM = {
  zipper: 0,
  buttons: 0,
  snaps: 0,
  tape: 0,
  elastic: 0,
  drawcord: 0,
  interlining: 0,
};

type Mutation =
  | 'none'
  | 'rename_numbers'
  | 'drop_notches'
  | 'mirror'
  | 'duplicate'
  | 'one_piece'
  | 'tile_120'
  | 'triangle'
  | 'zero_length'
  | 'self_intersection'
  | 'scale_0_1'
  | 'scale_10'
  | 'reverse_order';

type Loaded = {
  facts: SkeletonFacts;
  medianSize: string | null;
  parsedCandidates: number;
  selectedBlocks: number;
  selectionDrops: string[];
  parserWarnings: string[];
  skippedBlocks: number;
  blockNames: number;
};

const cleanSize = (s: string) => s.replace(/^<|>$/g, '').trim().toLowerCase();
const namedSizes = [
  'xxxxs',
  'xxxs',
  'xxs',
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  'xxxl',
  'xxxxl',
  'os',
  'uni',
];

function sizeValue(raw: string): number | null {
  const s = cleanSize(raw);
  const named = namedSizes.indexOf(s);
  if (named >= 0) return 10_000 + named;
  const x = /^(\d+)xl$/.exec(s);
  if (x) return 10_000 + namedSizes.indexOf('xl') + Number(x[1]);
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n >= 20 && n <= 250 ? n : null;
  }
  return null;
}

function blockParts(block: string): { stem: string; size: string; value: number } | null {
  const at = block.lastIndexOf('_');
  if (at <= 0 || at === block.length - 1) return null;
  const size = cleanSize(block.slice(at + 1));
  const value = sizeValue(size);
  return value === null ? null : { stem: block.slice(0, at), size, value };
}

function uniqueKey(want: string, used: Set<string>): string {
  const base = want.trim() || 'piece';
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}~${n}`;
  used.add(key);
  return key;
}

async function loadFacts(path: string): Promise<Loaded> {
  const buf = await readFile(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const parsed = await parseSheets([{ name: path, open: async () => bytes }], {
    unit: 'auto',
    tol: 0.05,
    tolChain: 0.05,
  });
  if (parsed.failedFiles) {
    throw new Error(`DXF parse failed: ${parsed.warnings.join('; ')}`);
  }

  const sizes = new Map<string, number>();
  for (const p of parsed.pieces) {
    const parts = blockParts(p.blockName ?? '');
    if (parts) sizes.set(parts.size, parts.value);
  }
  const orderedSizes = [...sizes].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const medianSize = orderedSizes.length
    ? orderedSizes[Math.floor((orderedSizes.length - 1) / 2)][0]
    : null;

  const groups = new Map<string, { name: string; candidates: PieceDTO[] }>();
  for (const p of parsed.pieces) {
    const block = p.blockName ?? '';
    const parts = blockParts(block);
    if (medianSize && parts?.size !== medianSize) continue;
    // No block means there is no layer-candidate identity to regroup: each parsed contour is a piece.
    const groupKey = block || `\u0000loose:${p.id}`;
    const display = parts && medianSize ? parts.stem : block || p.name;
    const current = groups.get(groupKey) ?? { name: display, candidates: [] };
    current.candidates.push(p);
    groups.set(groupKey, current);
  }

  const used = new Set<string>();
  const pieces: SkeletonPieceInput[] = [];
  const selectionDrops: string[] = [];
  for (const [block, group] of groups) {
    const piece = seamPieceOf(group.candidates);
    if (!piece) {
      selectionDrops.push(block);
      continue;
    }
    const key = uniqueKey(group.name, used);
    pieces.push({
      pieceKey: key,
      name: group.name,
      piece,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    });
  }
  return {
    facts: { pieces, category: 'generic', bom: NO_BOM, defaultMachineType: null },
    medianSize,
    parsedCandidates: parsed.pieces.length,
    selectedBlocks: groups.size,
    selectionDrops,
    parserWarnings: parsed.warnings,
    skippedBlocks: parsed.skippedBlocks,
    blockNames: parsed.blockNames.length,
  };
}

function clonePiece(piece: PieceDTO): PieceDTO {
  return {
    ...piece,
    poly: piece.poly.map((p) => ({ ...p })),
    inner: piece.inner?.map((p) => ({
      ...p,
      pts: p.pts.map((q) => ({ ...q })),
    })),
    grain: piece.grain?.map((g) => ({ ...g, a: { ...g.a }, b: { ...g.b } })),
  };
}

function mapGeometry(
  piece: PieceDTO,
  fn: (x: number, y: number) => { x: number; y: number },
): PieceDTO {
  const out = clonePiece(piece);
  out.poly = out.poly.map((p) => fn(p.x, p.y));
  out.inner = out.inner?.map((p) => ({ ...p, pts: p.pts.map((q) => fn(q.x, q.y)) }));
  out.grain = out.grain?.map((g) => ({
    ...g,
    a: fn(g.a.x, g.a.y),
    b: fn(g.b.x, g.b.y),
    lengthCm: Math.hypot(
      ...(() => {
        const a = fn(g.a.x, g.a.y);
        const b = fn(g.b.x, g.b.y);
        return [b.x - a.x, b.y - a.y] as [number, number];
      })(),
    ),
  }));
  if (out.poly.length) {
    const xs = out.poly.map((p) => p.x);
    const ys = out.poly.map((p) => p.y);
    out.bboxW = Math.max(...xs) - Math.min(...xs);
    out.bboxH = Math.max(...ys) - Math.min(...ys);
  }
  return out;
}

function shapePiece(base: PieceDTO, poly: { x: number; y: number }[]): PieceDTO {
  const out = clonePiece(base);
  out.poly = poly;
  out.inner = [];
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  out.bboxW = Math.max(...xs) - Math.min(...xs);
  out.bboxH = Math.max(...ys) - Math.min(...ys);
  out.areaCm2 = 0;
  return out;
}

function mutate(facts: SkeletonFacts, mutation: Mutation): SkeletonFacts {
  let pieces = facts.pieces.map((p) => ({ ...p, piece: clonePiece(p.piece) }));
  if (pieces.length === 0 || mutation === 'none') return { ...facts, pieces };
  switch (mutation) {
    case 'rename_numbers':
      pieces = pieces.map((p, i) => ({ ...p, pieceKey: String(i + 1), name: String(i + 1) }));
      break;
    case 'drop_notches':
      pieces = pieces.map((p) => ({
        ...p,
        piece: { ...p.piece, inner: p.piece.inner?.filter((x) => x.layer !== '4') },
      }));
      break;
    case 'mirror':
      pieces = pieces.map((p) => ({
        ...p,
        piece: mapGeometry(p.piece, (x, y) => ({ x: p.piece.bboxW - x, y })),
      }));
      break;
    case 'duplicate': {
      const p = pieces[0];
      pieces.push({
        ...p,
        pieceKey: `${p.pieceKey}__duplicate`,
        name: `${p.name} duplicate`,
        piece: { ...clonePiece(p.piece), id: 1_000_000 + p.piece.id },
      });
      break;
    }
    case 'one_piece':
      pieces = pieces.slice(0, 1);
      break;
    case 'tile_120': {
      const source = pieces;
      pieces = Array.from({ length: 120 }, (_, i) => {
        const p = source[i % source.length];
        return {
          ...p,
          pieceKey: `${p.pieceKey}__tile_${String(i + 1).padStart(3, '0')}`,
          name: `${p.name} tile ${i + 1}`,
          piece: { ...clonePiece(p.piece), id: 2_000_000 + i },
        };
      });
      break;
    }
    case 'triangle':
      pieces = [
        {
          ...pieces[0],
          pieceKey: 'triangle',
          name: 'triangle',
          piece: shapePiece(pieces[0].piece, [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
          ]),
        },
      ];
      break;
    case 'zero_length':
      pieces = [
        {
          ...pieces[0],
          pieceKey: 'zero',
          name: 'zero',
          piece: shapePiece(pieces[0].piece, [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ]),
        },
      ];
      break;
    case 'self_intersection':
      pieces = [
        {
          ...pieces[0],
          pieceKey: 'bowtie',
          name: 'bowtie',
          piece: shapePiece(pieces[0].piece, [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 10, y: 0 },
          ]),
        },
      ];
      break;
    case 'scale_0_1':
    case 'scale_10': {
      const scale = mutation === 'scale_0_1' ? 0.1 : 10;
      pieces = pieces.map((p) => ({
        ...p,
        piece: {
          ...mapGeometry(p.piece, (x, y) => ({ x: x * scale, y: y * scale })),
          areaCm2: p.piece.areaCm2 * scale * scale,
        },
      }));
      break;
    }
    case 'reverse_order':
      pieces.reverse();
      break;
  }
  return { ...facts, pieces };
}

const finite = (n: number) => Number.isFinite(n);

export async function run(
  path: string,
  mutation: Mutation = 'none',
  stopAfter: 'parse' | 'pipeline' | 'layouts' = 'layouts',
) {
  const started = performance.now();
  const loaded = await loadFacts(path);
  const facts = mutate(loaded.facts, mutation);
  const afterParse = performance.now();
  if (stopAfter === 'parse') {
    return {
      path,
      mutation,
      medianSize: loaded.medianSize,
      parsedCandidates: loaded.parsedCandidates,
      selectedBlocks: loaded.selectedBlocks,
      pieces: facts.pieces.length,
      ms: { parse: Math.round(afterParse - started), total: Math.round(afterParse - started) },
      selectionDrops: loaded.selectionDrops,
      parserWarnings: loaded.parserWarnings,
      skippedBlocks: loaded.skippedBlocks,
      blockNames: loaded.blockNames,
    };
  }
  const proposal = proposeSkeleton(facts, skeletonDeps);
  const afterPipeline = performance.now();
  const graph = proposal.graph!;
  if (stopAfter === 'pipeline') {
    return {
      path,
      mutation,
      medianSize: loaded.medianSize,
      parsedCandidates: loaded.parsedCandidates,
      selectedBlocks: loaded.selectedBlocks,
      pieces: facts.pieces.length,
      edges: graph.pieces.reduce((n, p) => n + p.edges.length, 0),
      seams: graph.chosen.length,
      steps: proposal.steps.length,
      ms: {
        parse: Math.round(afterParse - started),
        pipeline: Math.round(afterPipeline - afterParse),
        total: Math.round(afterPipeline - started),
      },
      selectionDrops: loaded.selectionDrops,
      parserWarnings: loaded.parserWarnings,
      skippedBlocks: loaded.skippedBlocks,
      blockNames: loaded.blockNames,
      warnings: proposal.warnings,
      graphWarnings: graph.warnings,
    };
  }
  const geoms = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const leaves = unitLeaves(proposal.steps, (k) => geoms.has(k));
  const layouts = [];
  for (const [unit, pieceKeys] of leaves) {
    const layout = unionLayout(pieceKeys, graph.chosen, geoms);
    const values = [
      ...layout.placements.flatMap((p) => p.T),
      layout.bbox.x0,
      layout.bbox.y0,
      layout.bbox.x1,
      layout.bbox.y1,
      layout.overlap ?? 0,
    ];
    const accounted = new Set([
      ...layout.placements.map((p) => p.pieceKey),
      ...layout.overflow,
      ...(layout.underlay ?? []),
    ]);
    layouts.push({
      unit,
      pieces: pieceKeys.length,
      nonFinite: values.filter((n) => !finite(n)).length,
      dropped: pieceKeys.filter((k) => !accounted.has(k)),
      overflow: layout.overflow.length,
    });
  }
  const afterLayouts = performance.now();

  const pieceKeys = new Set(facts.pieces.map((p) => p.pieceKey));
  const sweep = skeletonDeps.checkAssembly(
    facts.pieces.map((p) => ({ lineKey: p.pieceKey, name: p.name })),
    proposal.steps.map((s) => ({
      inputs: s.inputs.map((key) => ({
        kind: pieceKeys.has(key) ? ('piece' as const) : ('unit' as const),
        key,
      })),
      outputUnitKey: s.outputUnitKey,
      outputUnitName: s.outputUnitName,
    })),
  );
  const mentioned = new Set(
    proposal.steps.flatMap((s) => s.inputs.filter((k) => pieceKeys.has(k))),
  );
  const warningText = proposal.warnings.join('\n').toLowerCase();
  // A file refused as a whole (no contour, or more pieces than a garment) says so for all of them.
  const refusedWhole = graph.pieces.length === 0 && proposal.warnings.length > 0;
  const silentDrops = facts.pieces
    .filter(() => !refusedWhole)
    .filter((p) => !mentioned.has(p.pieceKey))
    .filter(
      (p) =>
        !warningText.includes(p.pieceKey.toLowerCase()) &&
        !warningText.includes(p.name.toLowerCase()),
    )
    .map((p) => p.pieceKey);
  const graphKeys = new Set(graph.pieces.map((p) => p.pieceKey));

  return {
    path,
    mutation,
    medianSize: loaded.medianSize,
    parsedCandidates: loaded.parsedCandidates,
    selectedBlocks: loaded.selectedBlocks,
    pieces: facts.pieces.length,
    edges: graph.pieces.reduce((n, p) => n + p.edges.length, 0),
    seams: graph.chosen.length,
    seamPairs: graph.chosen.map((c) => [c.a, c.b].sort().join('~')).sort(),
    twins: graph.pieces.reduce(
      (out, p) => {
        for (const t of p.twinOf) {
          if (p.pieceKey >= t.key) continue;
          out[t.kind]++;
        }
        return out;
      },
      { mirror: 0, identical: 0 },
    ),
    steps: proposal.steps.length,
    units: leaves.size,
    ms: {
      parse: Math.round(afterParse - started),
      pipeline: Math.round(afterPipeline - afterParse),
      layouts: Math.round(afterLayouts - afterPipeline),
      total: Math.round(afterLayouts - started),
    },
    sweepViolations: sweep.violations,
    releaseViolations: sweep.release,
    nonFiniteLayouts: layouts.filter((x) => x.nonFinite > 0),
    layoutDrops: layouts.filter((x) => x.dropped.length > 0),
    emptyEdges: graph.pieces.filter((p) => p.edges.length === 0).map((p) => p.pieceKey),
    selectionDrops: loaded.selectionDrops,
    graphDrops: facts.pieces.filter((p) => !graphKeys.has(p.pieceKey)).map((p) => p.pieceKey),
    silentDrops,
    warnings: proposal.warnings,
    graphWarnings: graph.warnings,
    parserWarnings: loaded.parserWarnings,
    skippedBlocks: loaded.skippedBlocks,
    blockNames: loaded.blockNames,
  };
}
