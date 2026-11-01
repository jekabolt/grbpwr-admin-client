// Golden CLO shirt: the real AAMA DXF + RUL pair must expand point-for-point in the piece's
// layer-7 grade axes. This is intentionally independent of expand.ts's grade propagation: it
// derives the expected boundary and notch coordinates from the source entities and the RUL rows,
// then compares those coordinates with the emitted per-size blocks.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { expandRul, parseRul } from 'lib/pattern-import/adapters/rul';
import {
  pieceBlocks,
  type ModelEntity,
  type PieceBlock,
} from 'lib/pattern-import/adapters/rul/model';
import type { RulTable } from 'lib/pattern-import/adapters/rul/types';

const GOLDEN =
  process.env.PATIMPORT_CLO_SHIRT ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/dxf-rul-export/golden-clo-shirt';
const OUT = process.env.PATIMPORT_CLO_SHIRT_OUT ?? resolve(GOLDEN, 'clo-shirt-grading-golden.svg');
const SAME = 0.01;
const EXACT = 1.1e-6;

type Point = { x: number; y: number };
type Axes = { cos: number; sin: number };
type DrawPiece = { name: string; boundaries: Point[][]; notches: Point[][] };

const ab = (path: string) => {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const point = (entity: ModelEntity) => entity.slots.map(({ x, y }) => ({ x, y }));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function axesOf(piece: PieceBlock): Axes {
  const refs = piece.entities.filter(
    (entity) => entity.layer === '7' && entity.kind === 'chain' && entity.slots.length >= 2,
  );
  if (refs.length !== 1)
    throw new Error(`${piece.block.name}: expected one layer-7 grade reference`);
  const a = refs[0].slots[0];
  const b = refs[0].slots[refs[0].slots.length - 1];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return { cos: Math.cos(angle), sin: Math.sin(angle) };
}

function moveOf(table: RulTable, axes: Axes, rule: number, size: number): Point {
  const delta = table.rules.get(rule)?.[size];
  if (!delta) throw new Error(`missing rule #${rule}, size ${table.sizes[size]}`);
  return {
    x: delta.dx * axes.cos - delta.dy * axes.sin,
    y: delta.dx * axes.sin + delta.dy * axes.cos,
  };
}

function ruleAt(piece: PieceBlock, layer: string, at: Point, table: RulTable): number | null {
  const candidates = piece.entities.flatMap((entity) => {
    if (entity.kind !== 'rule' || entity.rule === undefined || Number.isNaN(entity.rule)) return [];
    const d = Math.min(...entity.slots.map((slot) => distance(slot, at)));
    return d <= SAME ? [{ rule: entity.rule, layer: entity.layer, d }] : [];
  });
  const nearest = Math.min(...candidates.map((candidate) => candidate.d));
  const here = candidates.filter((candidate) => candidate.d <= nearest + 1e-7);
  const rank = (candidateLayer: string) => {
    if (candidateLayer === layer) return 0;
    const order = ['1', '14', '8'].indexOf(candidateLayer);
    return order >= 0 ? 10 + order : 100;
  };
  const best = Math.min(...here.map((candidate) => rank(candidate.layer)));
  const found = [
    ...new Set(
      here
        .filter((candidate) => rank(candidate.layer) === best && candidate.rule !== -1)
        .map((candidate) => candidate.rule),
    ),
  ];
  if (found.length <= 1) return found[0] ?? null;
  const same = found.every((rule) =>
    table.sizes.every((_, size) => {
      const a = table.rules.get(found[0])?.[size];
      const b = table.rules.get(rule)?.[size];
      return a?.dx === b?.dx && a?.dy === b?.dy;
    }),
  );
  if (!same) throw new Error(`${piece.block.name}: conflicting rules at ${at.x},${at.y}`);
  return found[0];
}

function arc(points: Point[], closed: boolean): { at: number[]; total: number } {
  const at = [0];
  for (let index = 1; index < points.length; index++)
    at.push(at[index - 1] + distance(points[index - 1], points[index]));
  return {
    at,
    total:
      at[at.length - 1] + (closed && points.length > 1 ? distance(points.at(-1)!, points[0]) : 0),
  };
}

function chainMoves(
  piece: PieceBlock,
  chain: ModelEntity,
  table: RulTable,
  axes: Axes,
  size: number,
): Point[] {
  const points = point(chain);
  const moves: (Point | null)[] = points.map((at) => {
    const rule = ruleAt(piece, chain.layer, at, table);
    return rule === null ? null : moveOf(table, axes, rule, size);
  });
  const known = moves.flatMap((move, index) => (move ? [index] : []));
  if (!known.length) return points.map(() => ({ x: 0, y: 0 }));
  const lengths = arc(points, chain.closed);
  const forward = (a: number, b: number) =>
    b >= a ? lengths.at[b] - lengths.at[a] : lengths.total - lengths.at[a] + lengths.at[b];
  return moves.map((move, index) => {
    if (move) return move;
    let before = -1;
    let after = -1;
    for (const candidate of known) {
      if (candidate < index) before = candidate;
      if (candidate > index && after < 0) after = candidate;
    }
    if (chain.closed) {
      if (before < 0) before = known[known.length - 1];
      if (after < 0) after = known[0];
    } else if (before < 0) return moves[after]!;
    else if (after < 0) return moves[before]!;
    if (before === after) return moves[before]!;
    const span = chain.closed ? forward(before, after) : lengths.at[after] - lengths.at[before];
    const offset = chain.closed ? forward(before, index) : lengths.at[index] - lengths.at[before];
    const t = span > 0 ? offset / span : 0;
    return {
      x: moves[before]!.x + (moves[after]!.x - moves[before]!.x) * t,
      y: moves[before]!.y + (moves[after]!.y - moves[before]!.y) * t,
    };
  });
}

function onChain(at: Point, chain: ModelEntity): { segment: number; t: number; d: number } | null {
  const points = point(chain);
  const segments = chain.closed ? points.length : points.length - 1;
  let best: { segment: number; t: number; d: number } | null = null;
  for (let segment = 0; segment < segments; segment++) {
    const a = points[segment];
    const b = points[(segment + 1) % points.length];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const length2 = vx * vx + vy * vy;
    const t = length2
      ? Math.max(0, Math.min(1, ((at.x - a.x) * vx + (at.y - a.y) * vy) / length2))
      : 0;
    const d = Math.hypot(a.x + vx * t - at.x, a.y + vy * t - at.y);
    if (d <= SAME && (!best || d < best.d)) best = { segment, t, d };
  }
  return best;
}

function notchMove(
  piece: PieceBlock,
  notch: ModelEntity,
  table: RulTable,
  axes: Axes,
  size: number,
): Point {
  const at = point(notch)[0];
  const own = ruleAt(piece, '4', at, table);
  if (own !== null) return moveOf(table, axes, own, size);
  const lines = piece.entities
    .filter((entity) => entity.kind === 'chain')
    .sort((a, b) => ['1', '14', '8'].indexOf(a.layer) - ['1', '14', '8'].indexOf(b.layer));
  for (const line of lines) {
    const hit = onChain(at, line);
    if (!hit) continue;
    const moves = chainMoves(piece, line, table, axes, size);
    const a = moves[hit.segment];
    const b = moves[(hit.segment + 1) % moves.length] ?? a;
    return { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t };
  }
  throw new Error(`${piece.block.name}: notch ${at.x},${at.y} has no rule or graded edge`);
}

function assertNear(got: Point, expected: Point, label: string): void {
  if (Math.abs(got.x - expected.x) > EXACT || Math.abs(got.y - expected.y) > EXACT)
    throw new Error(
      `${label}: ${got.x.toFixed(6)},${got.y.toFixed(6)} != ${expected.x.toFixed(6)},${expected.y.toFixed(6)}`,
    );
}

const dxf = ab(resolve(GOLDEN, 'allsizes.dxf'));
const table = parseRul(ab(resolve(GOLDEN, 'allsizes.rul')), 'allsizes.rul');
const source = pieceBlocks(buildAst(loadDxf(dxf).tok.tags));
const expanded = expandRul({ dxf, dxfName: 'allsizes.dxf', rul: table, rulName: 'allsizes.rul' });
const graded = new Map(
  pieceBlocks(buildAst(loadDxf(new TextEncoder().encode(expanded.text).buffer).tok.tags)).map(
    (piece) => [piece.block.name, piece],
  ),
);
const drawing: DrawPiece[] = [];
let boundaryChecks = 0;
let notchChecks = 0;
let movedNotches = 0;

for (const piece of source) {
  const axes = axesOf(piece);
  const boundary = piece.entities.find((entity) => entity.layer === '1' && entity.kind === 'chain');
  if (!boundary) throw new Error(`${piece.block.name}: no layer-1 boundary`);
  const notches = piece.entities.filter(
    (entity) => entity.layer === '4' && entity.kind === 'point',
  );
  const baseBoundary = point(boundary);
  const baseNotches = notches.map((notch) => point(notch)[0]);
  const boundaries: Point[][] = [];
  const notchSizes: Point[][] = [];
  for (const [size, sizeName] of table.sizes.entries()) {
    const stem = expanded.pieces[piece.block.name];
    const output = graded.get(`${stem}_${sizeName.replace(/[\s_]+/g, '-')}`);
    if (!output) throw new Error(`${piece.block.name}: no expanded ${sizeName} block`);
    const gotBoundary = output.entities.find(
      (entity) => entity.layer === '1' && entity.kind === 'chain',
    );
    if (!gotBoundary || gotBoundary.slots.length !== boundary.slots.length)
      throw new Error(`${piece.block.name} ${sizeName}: boundary point count changed`);
    const moves = chainMoves(piece, boundary, table, axes, size);
    const expectedBoundary = baseBoundary.map((at, index) => ({
      x: at.x + moves[index].x,
      y: at.y + moves[index].y,
    }));
    expectedBoundary.forEach((expected, index) => {
      assertNear(
        gotBoundary.slots[index],
        expected,
        `${piece.block.name} ${sizeName} boundary #${index}`,
      );
      boundaryChecks++;
    });
    const gotNotches = output.entities.filter(
      (entity) => entity.layer === '4' && entity.kind === 'point',
    );
    if (gotNotches.length !== notches.length)
      throw new Error(`${piece.block.name} ${sizeName}: notch count changed`);
    const expectedNotches = notches.map((notch, index) => {
      const move = notchMove(piece, notch, table, axes, size);
      const expected = { x: baseNotches[index].x + move.x, y: baseNotches[index].y + move.y };
      assertNear(
        gotNotches[index].slots[0],
        expected,
        `${piece.block.name} ${sizeName} notch #${index}`,
      );
      if (size > 0 && Math.hypot(move.x, move.y) > EXACT) movedNotches++;
      notchChecks++;
      return expected;
    });
    boundaries.push(expectedBoundary);
    notchSizes.push(expectedNotches);
  }
  drawing.push({ name: piece.pieceLabel ?? piece.block.name, boundaries, notches: notchSizes });
  console.log(
    `PASS ${piece.block.name} · ${boundary.slots.length} boundary vertices · ${notches.length} notches · ${table.sizes.length} sizes`,
  );
}

if (!movedNotches) throw new Error('the golden case exercised no moving notch');

const colors = ['#111111', '#1687a7', '#2ca25f', '#d9a400', '#9b5de5'];
const xml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const rowHeight = 250;
const width = 1200;
const height = 70 + drawing.length * rowHeight;
const svg: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  '<rect width="100%" height="100%" fill="#f3f3f3"/>',
  '<style>text{font-family:Arial,sans-serif;fill:#222}.piece{font-size:15px}.head{font-size:18px}.panel{fill:#fff;stroke:#ccc}.line{fill:none;stroke-width:1.3;vector-effect:non-scaling-stroke}.notch{fill:#fff;stroke-width:1.2;vector-effect:non-scaling-stroke}</style>',
  '<text class="head" x="24" y="32">CLO shirt · sample XS vs graded nest</text>',
  `<text x="24" y="53">${xml(table.sizes.join(' · '))} · layer 1 boundaries · layer 4 notches</text>`,
];
for (const [pieceIndex, piece] of drawing.entries()) {
  const top = 70 + pieceIndex * rowHeight;
  const all = piece.boundaries.flat();
  const minX = Math.min(...all.map((at) => at.x));
  const maxX = Math.max(...all.map((at) => at.x));
  const minY = Math.min(...all.map((at) => at.y));
  const maxY = Math.max(...all.map((at) => at.y));
  const scale = Math.min(480 / Math.max(maxX - minX, 1), 180 / Math.max(maxY - minY, 1));
  const draw = (points: Point[], left: number) =>
    [...points, points[0]]
      .map(
        (at) =>
          `${(left + 20 + (at.x - minX) * scale).toFixed(2)},${(top + 220 - (at.y - minY) * scale).toFixed(2)}`,
      )
      .join(' ');
  const dot = (at: Point, left: number, color: string) =>
    `<circle class="notch" cx="${(left + 20 + (at.x - minX) * scale).toFixed(2)}" cy="${(top + 220 - (at.y - minY) * scale).toFixed(2)}" r="2.5" stroke="${color}"/>`;
  svg.push(`<text class="piece" x="24" y="${top + 20}">${xml(piece.name)}</text>`);
  svg.push(`<rect class="panel" x="140" y="${top + 6}" width="500" height="230"/>`);
  svg.push(`<rect class="panel" x="660" y="${top + 6}" width="500" height="230"/>`);
  svg.push(`<text x="150" y="${top + 25}">sample XS</text>`);
  svg.push(`<text x="670" y="${top + 25}">graded nest</text>`);
  svg.push(
    `<polyline class="line" points="${draw(piece.boundaries[0], 140)}" stroke="${colors[0]}"/>`,
  );
  piece.notches[0].forEach((at) => svg.push(dot(at, 140, colors[0])));
  piece.boundaries.forEach((points, size) =>
    svg.push(`<polyline class="line" points="${draw(points, 660)}" stroke="${colors[size]}"/>`),
  );
  piece.notches.forEach((points, size) =>
    points.forEach((at) => svg.push(dot(at, 660, colors[size]))),
  );
}
svg.push('</svg>');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${svg.join('\n')}\n`);

console.log(
  `PASS golden · ${source.length} pieces · ${table.sizes.length} sizes · ${boundaryChecks} boundary coordinates · ${notchChecks} notch coordinates`,
);
console.log(`SVG ${OUT}`);
