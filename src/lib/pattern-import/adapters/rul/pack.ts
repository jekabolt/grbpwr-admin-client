// RUL · WRITE (alternative storage): a per-size DXF (a block per piece × size — our R12 output, or a
// graded CAD export) → base-size DXF + grade rule table. Only for pieces whose sizes are the SAME
// drawing (every notch / drill / grain line present in every size). Matching polylines with
// different simplification vertices are first corresponded and resampled on their own segments;
// each resulting point gets the rule of its per-size deltas (identical rows share one rule). The
// package is proved before it is handed out: the RUL is expanded back with our own reader and the
// imported geometry must stay within `tolMm` of every original per-size block. Any piece failing →
// the whole package is refused with the reasons; the per-size DXF stays the file to use. The base
// DXF is never mixed with per-size blocks.

import type { PtMm } from '../../types';
import { closestOnPolyline } from '../../semantics/geom';
import type { RawDxf } from '../dxf/ast';
import { buildAst, str } from '../dxf/ast';
import { bareSize } from '../dxf/segment';
import { loadDxf } from '../dxf/tags';
import { INSUNITS_MM, modelLabelsOf, unitsOf } from '../dxf/extract';
import { bulgePolyline } from '../dxf/geometry';
import { isUnsupportedFormat } from '../sniff/errors';
import { correspondLines } from './correspond';
import { expandRul, sizeNameToken } from './expand';
import {
  type ModelEntity,
  type PieceBlock,
  PointIndex,
  labelOf,
  normalizedRulPieceName,
  pieceBlocks,
} from './model';
import { formatRul, parseRul } from './parse';
import type { RulDelta } from './types';

export const RUL_PACK_TOL_MM = 0.1;
/** Grade deltas are written to 1/10000 of a RUL unit (mm): far below the tolerance. */
const DIGITS = 4;

export type RulPackOptions = {
  /** The sizes in grade order (small → large), as the per-size blocks spell them. */
  sizes: string[];
  /** Base (sample) size; default: the middle of `sizes`. */
  base?: string;
  /** GRADE RULE TABLE name (the style). */
  name: string;
  tolMm?: number;
  now?: Date;
  /** Pack only these pieces (probes: the gradable part of a file); default every piece. */
  pick?: (piece: string) => boolean;
  /** Who wrote it (RUL PRODUCT / AUTHOR). */
  product?: string;
  author?: string;
};

export type RulPackage = {
  ok: true;
  baseDxf: string;
  rulText: string;
  base: string;
  sizes: string[];
  rules: number;
  pieces: number;
  /** Largest distance between an expanded point and its per-size point, mm. */
  maxErrMm: number;
  /** Base-size coordinates separated by at most 0.02 mm to carry distinct rules. */
  nudges: number;
  /** Missing per-size point entities inserted on an existing segment. */
  insertions: number;
};
export type RulPackRefusal = { ok: false; reasons: string[] };

type Family = {
  piece: string;
  uni: boolean;
  bySize: Map<string, PieceBlock>;
};

const gradable = (m: ModelEntity) => m.kind === 'chain' || m.kind === 'point';
const sig = (m: ModelEntity) =>
  `${m.raw.type} on layer ${m.layer}${m.kind === 'chain' ? (m.closed ? ' (closed)' : ' (open)') : ''}`;
const notchPoint = (m: ModelEntity) => m.raw.type === 'POINT' && m.layer === '4';
const shapeType = (m: ModelEntity) =>
  m.raw.type === 'LWPOLYLINE' || m.raw.type === 'POLYLINE'
    ? 'POLYLINE'
    : notchPoint(m)
      ? 'LINE'
      : m.raw.type;
const shapeOrderKey = (m: ModelEntity) => `${m.layer}|${shapeType(m)}|${m.closed ? 1 : 0}`;
const compareShapeOrder = (a: ModelEntity, b: ModelEntity) =>
  shapeOrderKey(a) < shapeOrderKey(b) ? -1 : shapeOrderKey(a) > shapeOrderKey(b) ? 1 : 0;

/**
 * The gradable entities of a block, in file order. Grade markers (turn / curve points, layers 2–3)
 * and the ASTM quality-validation copies (84–87) are left out: CAD exports draw them in the sample
 * size only, and they follow their line's rules when the base is expanded.
 */
const MARKER_LAYERS = new Set(['2', '3', '84', '85', '86', '87']);
function shapeOf(p: PieceBlock, markers = false): ModelEntity[] {
  const list = p.entities.filter((m) => gradable(m) && (markers || !MARKER_LAYERS.has(m.layer)));
  // grouped by kind (stable: file order within one kind), so sizes written in another entity order
  // still pair line with line
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => compareShapeOrder(a.m, b.m) || a.i - b.i)
    .map((x) => x.m);
}
/** The markers of a block (turn / curve points, quality-validation copies) as a signature. */
const markerSig = (p: PieceBlock) =>
  p.entities
    .filter((m) => gradable(m) && MARKER_LAYERS.has(m.layer))
    .map((m) => `${sig(m)}:${m.slots.length}`)
    .sort()
    .join(';');
/** Entity types whose whole geometry is their points + `SHAPE_CODES` tags. */
const PACKABLE = new Set(['POLYLINE', 'LWPOLYLINE', 'LINE', 'POINT', 'CIRCLE', 'ARC']);

/** Tags that shape an entity besides its points: arcs (bulge), radii, angles, notch depth. */
const SHAPE_CODES = new Set([30, 38, 39, 40, 41, 42, 43, 50, 51]);
const shapeTags = (m: ModelEntity) =>
  [m.raw, ...m.raw.children]
    .map((r) =>
      r.tags
        .filter((t) => SHAPE_CODES.has(t.code))
        .map((t) => `${t.code}=${Number(t.value).toFixed(6)}`)
        .join(','),
    )
    .join('|');

const entityKey = (m: ModelEntity) => `${m.raw.type}|${m.layer}|${m.kind}|${m.closed ? 1 : 0}`;

function arcPosition(points: readonly PtMm[], closed: boolean, seg: number, t: number): number {
  let before = 0;
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const length = Math.hypot(
      points[(i + 1) % points.length].x - points[i].x,
      points[(i + 1) % points.length].y - points[i].y,
    );
    if (i < seg) before += length;
    total += length;
    if (i === seg) before += length * t;
  }
  return total > 0 ? before / total : 0;
}

function atArcPosition(points: readonly PtMm[], closed: boolean, fraction: number): PtMm {
  const count = closed ? points.length : points.length - 1;
  const lengths = Array.from({ length: count }, (_, i) =>
    Math.hypot(
      points[(i + 1) % points.length].x - points[i].x,
      points[(i + 1) % points.length].y - points[i].y,
    ),
  );
  const target = lengths.reduce((sum, length) => sum + length, 0) * fraction;
  let before = 0;
  for (let i = 0; i < count; i++) {
    if (before + lengths[i] >= target || i === count - 1) {
      const t = lengths[i] > 0 ? (target - before) / lengths[i] : 0;
      const a = points[i];
      const b = points[(i + 1) % points.length];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    before += lengths[i];
  }
  return points[0];
}

/** Map every item of `short` to an ordered subset of `reference`, minimizing point distance. */
function subsequenceMap(reference: ModelEntity[], short: ModelEntity[]): number[] | null {
  if (short.length > reference.length) return null;
  if (!short.length) return [];
  const rows = short.length + 1;
  const cols = reference.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(Infinity));
  const take = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  for (let j = 0; j < cols; j++) dp[0][j] = 0;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const a = reference[j - 1].slots[0];
      const b = short[i - 1].slots[0];
      const match = dp[i - 1][j - 1] + Math.hypot(a.x - b.x, a.y - b.y);
      const skip = dp[i][j - 1];
      if (match < skip) {
        dp[i][j] = match;
        take[i][j] = true;
      } else dp[i][j] = skip;
    }
  }
  if (!Number.isFinite(dp[short.length][reference.length])) return null;
  const out = Array<number>(short.length);
  let i = short.length;
  let j = reference.length;
  while (i > 0 && j > 0) {
    if (take[i][j]) {
      out[i - 1] = j - 1;
      i--;
      j--;
    } else j--;
  }
  return i === 0 ? out : null;
}

function insertedOnCarrier(
  template: ModelEntity,
  reference: ModelEntity[],
  target: ModelEntity[],
  mmPerUnit: number,
): ModelEntity | null {
  const point = template.slots[0];
  if (!point) return null;
  const carriers = reference
    .map((entity, index) => ({ entity, index }))
    .filter(
      ({ entity }) => entity.kind === 'chain' && entity.layer !== '4' && entity.slots.length >= 2,
    )
    .map(({ entity, index }) => ({
      entity,
      index,
      hit: closestOnPolyline(point, entity.slots, entity.closed),
    }))
    .sort((a, b) => a.hit.d - b.hit.d);
  const carrier = carriers[0];
  if (!carrier || carrier.hit.d * mmPerUnit > 0.1) return null;
  const key = entityKey(carrier.entity);
  const ordinal = reference
    .slice(0, carrier.index)
    .filter((entity) => entityKey(entity) === key).length;
  const counterpart = target.filter((entity) => entityKey(entity) === key)[ordinal];
  if (!counterpart || counterpart.slots.length < 2) return null;
  const fraction = arcPosition(
    carrier.entity.slots,
    carrier.entity.closed,
    carrier.hit.seg,
    carrier.hit.t,
  );
  const at = atArcPosition(counterpart.slots, counterpart.closed, fraction);
  return { ...template, slots: [{ ...point, x: at.x, y: at.y }] };
}

function unionPointTopology(
  shapes: ModelEntity[][],
  baseIndex: number,
  mmPerUnit: number,
): { ok: true; shapes: ModelEntity[][]; insertions: number } | { ok: false; reason: string } {
  const keys: string[] = [];
  for (const shape of shapes)
    for (const entity of shape) if (!keys.includes(entityKey(entity))) keys.push(entityKey(entity));
  const out = shapes.map(() => [] as ModelEntity[]);
  let insertions = 0;
  for (const key of keys) {
    const groups = shapes.map((shape) => shape.filter((entity) => entityKey(entity) === key));
    const counts = new Set(groups.map((group) => group.length));
    if (counts.size === 1) {
      groups.forEach((group, sizeIndex) => out[sizeIndex].push(...group));
      continue;
    }
    if (
      groups.some((group) =>
        group.some((entity) => entity.raw.type !== 'POINT' || entity.layer !== '4'),
      )
    )
      return { ok: false, reason: `${key} differs in entity count and is not layer-4 points` };
    const candidates = groups
      .map((group, index) => ({ group, index }))
      .sort(
        (a, b) =>
          b.group.length - a.group.length ||
          (a.index === baseIndex ? -1 : b.index === baseIndex ? 1 : a.index - b.index),
      );
    let chosen:
      | { reference: ModelEntity[]; referenceIndex: number; maps: (number[] | null)[] }
      | undefined;
    for (const candidate of candidates) {
      const maps = groups.map((group) => subsequenceMap(candidate.group, group));
      if (maps.every((mapping) => mapping !== null)) {
        chosen = {
          reference: candidate.group,
          referenceIndex: candidate.index,
          maps,
        };
        break;
      }
    }
    if (!chosen) return { ok: false, reason: `${key} has no ordered union of point entities` };
    groups.forEach((group, sizeIndex) => {
      const byReference = new Map(chosen!.maps[sizeIndex]!.map((at, i) => [at, group[i]]));
      chosen!.reference.forEach((template, referenceIndex) => {
        const existing = byReference.get(referenceIndex);
        if (existing) {
          out[sizeIndex].push(existing);
          return;
        }
        const inserted = insertedOnCarrier(
          template,
          shapes[chosen!.referenceIndex],
          shapes[sizeIndex],
          mmPerUnit,
        );
        if (inserted) {
          out[sizeIndex].push(inserted);
          insertions++;
        }
      });
      if (
        out[sizeIndex].filter((entity) => entityKey(entity) === key).length !==
        chosen!.reference.length
      )
        out[sizeIndex] = [];
    });
    if (out.some((shape) => !shape.length))
      return {
        ok: false,
        reason: `${key} has a missing point that cannot be inserted on its corresponding segment`,
      };
  }
  out.forEach((shape) => shape.sort(compareShapeOrder));
  return { ok: true, shapes: out, insertions };
}

/** The base writer converts the card's R2000 LWPOLYLINE to its R12 POLYLINE spelling. */
const sameProofShape = (a: ModelEntity, b: ModelEntity) => {
  if (a.raw.type === 'LINE' && notchPoint(b) && a.layer === b.layer) return true;
  if (a.kind !== b.kind || a.layer !== b.layer || a.closed !== b.closed) return false;
  if (shapeType(a) === 'POLYLINE' && shapeType(b) === 'POLYLINE') return true;
  if (a.raw.type === b.raw.type) return shapeTags(a) === shapeTags(b);
  return false;
};

/** An INSERT that only translates (no scale, rotation, extrusion, array): where it puts the block. */
function plainInsert(tags: { code: number; value: string }[]): { x: number; y: number } | null {
  const v = (c: number, d: number) => {
    const t = tags.find((x) => x.code === c);
    return t ? Number(t.value) : d;
  };
  const plain =
    v(41, 1) === 1 &&
    v(42, 1) === 1 &&
    v(43, 1) === 1 &&
    v(50, 0) === 0 &&
    v(70, 1) <= 1 &&
    v(71, 1) <= 1 &&
    v(210, 0) === 0 &&
    v(220, 0) === 0 &&
    v(230, 1) === 1;
  return plain ? { x: v(10, 0), y: v(20, 0) } : null;
}

/** Cyclic shift of a closed chain of `size` that best matches `base` (least spread of deltas). */
function bestShift(base: PtMm[], other: PtMm[], closed: boolean): number {
  const n = base.length;
  if (!closed || n < 3 || n > 4000) return 0;
  const closingDup = n > 1 && base[0].x === base[n - 1].x && base[0].y === base[n - 1].y;
  if (closingDup) return 0; // a written closing vertex pins the start
  let best = 0;
  let bestCost = Infinity;
  for (let s = 0; s < n; s++) {
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      const o = other[(i + s) % n];
      mx += o.x - base[i].x;
      my += o.y - base[i].y;
    }
    mx /= n;
    my /= n;
    let cost = 0;
    for (let i = 0; i < n && cost < bestCost; i++) {
      const o = other[(i + s) % n];
      cost += (o.x - base[i].x - mx) ** 2 + (o.y - base[i].y - my) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
}

const FLATTEN_TOL_MM = 0.02;
const RULE_NUDGE_MM = 0.02;

/** A polyline's actual centreline points. Bulges are flattened because R12 point grading can move
 * the sampled points but cannot carry a different bulge value in every size. */
function pointsOf(m: ModelEntity, mmPerUnit: number): PtMm[] {
  if (notchPoint(m) && m.slots.length) {
    const at = m.slots[0];
    const depth = Number(m.raw.tags.find((tag) => tag.code === 30)?.value ?? 0) || 5 / mmPerUnit;
    const angle = (Number(m.raw.tags.find((tag) => tag.code === 50)?.value ?? 0) * Math.PI) / 180;
    return [
      { x: at.x, y: at.y },
      { x: at.x + depth * Math.cos(angle), y: at.y + depth * Math.sin(angle) },
    ];
  }
  if (shapeType(m) !== 'POLYLINE') return m.slots.map((p) => ({ x: p.x, y: p.y }));
  const vertices: { x: number; y: number; bulge: number }[] = [];
  if (m.raw.type === 'LWPOLYLINE') {
    for (const tag of m.raw.tags) {
      if (tag.code === 10) vertices.push({ x: Number(tag.value), y: 0, bulge: 0 });
      else if (tag.code === 20 && vertices.length)
        vertices[vertices.length - 1].y = Number(tag.value);
      else if (tag.code === 42 && vertices.length)
        vertices[vertices.length - 1].bulge = Number(tag.value);
    }
  } else {
    for (const child of m.raw.children) {
      if (child.type !== 'VERTEX') continue;
      const x = Number(child.tags.find((tag) => tag.code === 10)?.value ?? 0);
      const y = Number(child.tags.find((tag) => tag.code === 20)?.value ?? 0);
      const bulge = Number(child.tags.find((tag) => tag.code === 42)?.value ?? 0);
      vertices.push({ x, y, bulge });
    }
  }
  return bulgePolyline(vertices, m.closed, FLATTEN_TOL_MM / mmPerUnit);
}

function familiesOf(
  raw: RawDxf,
  sizes: string[],
  reasons: string[],
  pick?: (piece: string) => boolean,
): Family[] {
  const pieces = pieceBlocks(raw);
  const toks = new Map(sizes.map((s) => [bareSize(s), s]));
  const fams = new Map<string, Family>();
  const parsed = pieces.map((piece) => {
    const parts = piece.block.name.split('_');
    const tail = parts.length > 1 ? parts[parts.length - 1] : '';
    const stem = parts.length > 1 ? parts.slice(0, -1).join('_') : piece.block.name;
    return { piece, tail, stem };
  });
  const tailSizes = new Map<string, Set<string>>();
  for (const { stem, tail } of parsed) {
    const size = toks.get(bareSize(tail));
    if (size) (tailSizes.get(stem) ?? tailSizes.set(stem, new Set()).get(stem)!).add(size);
  }
  for (const { piece: p, tail, stem } of parsed) {
    const uni = bareSize(tail) === 'UNI';
    const tailSize = toks.get(bareSize(tail)) ?? null;
    const labelSize = p.sizeLabel ? toks.get(bareSize(p.sizeLabel)) ?? null : null;
    // Some CAD files copy a style annotation such as `size: S` into every block. A complete
    // `PIECE_XS` … `PIECE_XL` block-name series is stronger evidence than that repeated text.
    const size = uni
      ? null
      : (tailSizes.get(stem)?.size ?? 0) >= 2
        ? tailSize
        : labelSize ?? tailSize;
    if (pick && !pick(stem)) continue;
    if (!uni && size === null) {
      reasons.push(
        `${p.block.name}: its size (${p.sizeLabel ?? tail ?? '—'}) is not one of ${sizes.join(' ')}`,
      );
      continue;
    }
    const f = fams.get(stem) ?? { piece: stem, uni, bySize: new Map() };
    fams.set(stem, f);
    if (uni) {
      if (f.bySize.size) reasons.push(`${stem}: drawn both ungraded (UNI) and per size`);
      for (const s of sizes) f.bySize.set(s, p);
      f.uni = true;
      continue;
    }
    if (f.uni) reasons.push(`${stem}: drawn both ungraded (UNI) and per size`);
    if (f.bySize.has(size!)) reasons.push(`${stem}: two blocks of size ${size}`);
    f.bySize.set(size!, p);
  }

  // A few production files rename one piece between sizes (`FP` / `FP_MAIN`). Merge only a
  // complementary, geometry-compatible split; overlapping sizes or a different entity topology
  // stay separate and receive the ordinary explicit missing-size refusal below.
  const topologySig = (p: PieceBlock) => {
    const counts = new Map<string, number>();
    for (const entity of shapeOf(p)) {
      if (notchPoint(entity)) continue;
      const key = entityKey(entity);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, count]) => `${key}:${count}`)
      .join('|');
  };
  const aliasGroups = new Map<string, Family[]>();
  for (const family of fams.values()) {
    const key = normalizedRulPieceName(family.piece).toUpperCase();
    aliasGroups.set(key, [...(aliasGroups.get(key) ?? []), family]);
  }
  const merged: Family[] = [];
  for (const group of aliasGroups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const allSizes = group.flatMap((family) => [...family.bySize.keys()]);
    const representatives = group.flatMap((family) => [...family.bySize.values()].slice(0, 1));
    const compatible =
      new Set(allSizes).size === allSizes.length &&
      new Set(representatives.map(topologySig)).size === 1;
    if (!compatible) {
      merged.push(...group);
      continue;
    }
    const canonical = normalizedRulPieceName(group[0].piece);
    const family: Family = {
      piece: canonical,
      uni: group.some((item) => item.uni),
      bySize: new Map(),
    };
    for (const item of group)
      for (const [size, piece] of item.bySize) family.bySize.set(size, piece);
    merged.push(family);
  }
  for (const f of merged) {
    const missing = sizes.filter((s) => !f.bySize.has(s));
    if (missing.length) reasons.push(`${f.piece}: no block for size ${missing.join(', ')}`);
  }
  return merged;
}

/** Structured labels that must not change with the size (name, quantity, material…). Free text
 * is often the style/title annotation written only in the sample-size block. */
function fixedLabels(p: PieceBlock): string {
  return p.entities
    .filter((m) => m.kind === 'label')
    .map((m) => labelOf(m.text ?? ''))
    .filter((l): l is { key: string; value: string } =>
      Boolean(l && l.key !== 'SIZE' && l.key !== 'SIZE NAME'),
    )
    .map(
      (l) =>
        `${l.key}: ${l.key === 'PIECE NAME' || l.key === 'PIECE' ? normalizedRulPieceName(l.value) : l.value}`,
    )
    .sort()
    .join(' | ');
}

/**
 * Per-size DXF (bytes or text) → base DXF + RUL, or the reasons it cannot be done exactly.
 */
export function packRul(
  perSize: ArrayBuffer | string,
  opts: RulPackOptions,
): RulPackage | RulPackRefusal {
  const tol = opts.tolMm ?? RUL_PACK_TOL_MM;
  const sizes = opts.sizes;
  if (sizes.length < 2)
    return { ok: false, reasons: ['one size only: there is no grading to store'] };
  const base = opts.base ?? sizes[Math.floor((sizes.length - 1) / 2)];
  const bi = sizes.indexOf(base);
  if (bi < 0) return { ok: false, reasons: [`base size ${base} is not one of ${sizes.join(' ')}`] };
  if (new Set(sizes.map(bareSize)).size !== sizes.length)
    return { ok: false, reasons: [`two sizes read as one: ${sizes.join(' ')}`] };
  const bad = sizes.filter((s) => /\s/.test(s.trim()) || !s.trim());
  if (bad.length)
    return { ok: false, reasons: [`size names with blanks cannot be listed: ${bad.join(', ')}`] };

  const bytes =
    typeof perSize === 'string'
      ? (new TextEncoder().encode(perSize).buffer as ArrayBuffer)
      : perSize;
  const raw = buildAst(loadDxf(bytes).tok.tags);
  const units = unitsOf(raw, modelLabelsOf(raw));
  const reasons: string[] = [];
  if (!Object.values(INSUNITS_MM).includes(units.mmPerUnit))
    return {
      ok: false,
      reasons: [`the drawing's unit (${units.mmPerUnit} mm) has no $INSUNITS code`],
    };
  const fams = familiesOf(raw, sizes, reasons, opts.pick);
  if (!fams.length) reasons.push('the DXF has no piece blocks');
  if (reasons.length) return { ok: false, reasons };

  // ── rules: per base point, its delta in every size ──
  const rows = new Map<string, number>(); // delta row key → rule id
  const rules = new Map<number, RulDelta[]>();
  let nextRule = 1;
  const ruleOf: Map<PieceBlock, Map<ModelEntity, number[]>> = new Map();
  const basePointsOf = new Map<PieceBlock, Map<ModelEntity, PtMm[]>>();
  const proofPointsOf = new Map<PieceBlock, Map<ModelEntity, PtMm[]>>();
  const proofShapeOf = new Map<PieceBlock, ModelEntity[]>();
  let nudges = 0;
  let insertions = 0;
  const mmU = units.mmPerUnit; // RUL is METRIC (mm); the drawing is in its own units
  const markersOf = new Map<Family, boolean>();
  const insertsOf = new Map<string, ({ x: number; y: number } | null)[]>();
  for (const e of raw.entities)
    if (e.type === 'INSERT' && !e.paper) {
      const nm = str(e.tags, 2) ?? '';
      (insertsOf.get(nm) ?? insertsOf.set(nm, []).get(nm)!).push(plainInsert(e.tags));
    }
  for (const f of fams) {
    const b = f.bySize.get(base)!;
    // Markers drawn alike in every size are graded and proved too. When a CAD regenerates its
    // turn/curve/validation markers independently per size, they are auxiliary samples rather
    // than piece geometry: keep the base markers and let the reader make them follow the graded
    // lines, but do not require their per-size point sets to match.
    // Turn/curve/QV points get explicit grades when every size carries the same marker topology.
    // A coincident marker that needs its own rule is nudged along the line it samples below.
    const mk = markerSig(b);
    const markers = !!mk && sizes.every((z) => markerSig(f.bySize.get(z)!) === mk);
    markersOf.set(f, markers);
    const nested = sizes.find((z) =>
      f.bySize.get(z)!.entities.some((m) => m.raw.type === 'INSERT'),
    );
    if (nested) {
      reasons.push(
        `${f.piece}: size ${nested} inserts another block inside the piece — not packed`,
      );
      continue;
    }
    const at = sizes.map((z) => insertsOf.get(f.bySize.get(z)!.block.name) ?? []);
    const bad = at.findIndex((list) => list.length !== 1 || !list[0]);
    if (bad >= 0) {
      reasons.push(
        `${f.piece}: size ${sizes[bad]} is inserted ${at[bad].length === 1 ? 'scaled, rotated or mirrored' : `${at[bad].length} times`} — only a plain placement packs`,
      );
      continue;
    }
    if (at.some((list) => list[0]!.x !== at[bi][0]!.x || list[0]!.y !== at[bi][0]!.y)) {
      reasons.push(`${f.piece}: its sizes are placed at different insert points`);
      continue;
    }
    let bShape = shapeOf(b, markers);
    const per = new Map<string, ModelEntity[]>();
    let ok = true;
    const sourceShapes = sizes.map((s) => shapeOf(f.bySize.get(s)!, markers));
    const topology = unionPointTopology(sourceShapes, bi, mmU);
    if (!topology.ok) {
      const counts = sourceShapes.map((shape, i) => `${sizes[i]}: ${shape.length}`).join(', ');
      reasons.push(`${f.piece}: sizes are not the same drawing (${counts}): ${topology.reason}`);
      continue;
    }
    insertions += topology.insertions;
    bShape = topology.shapes[bi];
    const bSig = bShape.map(sig);
    for (const s of sizes) {
      const shape = topology.shapes[sizes.indexOf(s)];
      const sg = shape.map(sig);
      if (sg.length !== bSig.length || sg.some((x, i) => x !== bSig[i])) {
        reasons.push(
          `${f.piece}: size ${s} is not the same drawing as ${base} (${sg.length} vs ${bSig.length} lines/points, or in another order)`,
        );
        ok = false;
        break;
      }
      const arc = shape.findIndex(
        (m, i) =>
          shapeType(m) !== 'POLYLINE' && !notchPoint(m) && shapeTags(m) !== shapeTags(bShape[i]),
      );
      if (arc >= 0) {
        reasons.push(
          `${f.piece}: ${sig(bShape[arc])} differs from ${base} in size ${s} by more than its points (arc, radius, angle or depth) — not expressible as point grades`,
        );
        ok = false;
        break;
      }
      if (fixedLabels(f.bySize.get(s)!) !== fixedLabels(b)) {
        reasons.push(`${f.piece}: its labels (name, quantity, material…) differ in size ${s}`);
        ok = false;
        break;
      }
      per.set(s, shape);
    }
    if (!ok) continue;
    const aligned = new Map(sizes.map((s) => [s, [] as PtMm[][]]));
    for (let ei = 0; ei < bShape.length; ei++) {
      const entities = sizes.map((s) => per.get(s)![ei]);
      const points = entities.map((m) => pointsOf(m, mmU));
      const counts = new Set(points.map((p) => p.length));
      if (counts.size === 1) {
        for (let si = 0; si < sizes.length; si++) {
          const shift = bestShift(points[bi], points[si], bShape[ei].closed);
          aligned
            .get(sizes[si])!
            .push(points[si].map((_, k) => points[si][(k + shift) % points[si].length]));
        }
        continue;
      }
      if (!entities.every((m) => m.kind === 'chain' && shapeType(m) === 'POLYLINE')) {
        const countsBySize = sizes.map((s, i) => `${s}: ${entities[i].slots.length}`).join(', ');
        reasons.push(
          `${f.piece}: ${sig(bShape[ei])} has different point counts (${countsBySize}) and cannot be corresponded`,
        );
        ok = false;
        break;
      }
      const match = correspondLines(
        points.map((line) => line.map((p) => ({ x: p.x * mmU, y: p.y * mmU }))),
        bShape[ei].closed,
      );
      if (!match.ok) {
        reasons.push(`${f.piece}: ${sig(bShape[ei])} cannot be corresponded: ${match.reason}`);
        ok = false;
        break;
      }
      sizes.forEach((s, si) =>
        aligned.get(s)!.push(match.lines[si].map((p) => ({ x: p.x / mmU, y: p.y / mmU }))),
      );
    }
    if (!ok) continue;
    const baseLines = aligned.get(base)!;
    const originalRows = new PointIndex<{ layer: string; key: string }>(0.01 / mmU);
    const written = new Set<string>();
    const rowKey = (ei: number, k: number, bs: PtMm) =>
      sizes
        .map((s) => {
          const os = aligned.get(s)![ei][k];
          return `${((os.x - bs.x) * mmU).toFixed(DIGITS)},${((os.y - bs.y) * mmU).toFixed(DIGITS)}`;
        })
        .join(' ');
    const toward = (line: PtMm[], k: number, amount: number): PtMm | null => {
      const order = [k + 1, k - 1];
      if (bShape.find((_, i) => baseLines[i] === line)?.closed && line.length > 1)
        order.push((k + 1) % line.length, (k - 1 + line.length) % line.length);
      for (const j of order) {
        if (j < 0 || j >= line.length) continue;
        const dx = line[j].x - line[k].x;
        const dy = line[j].y - line[k].y;
        const length = Math.hypot(dx, dy);
        if (length <= 1e-9) continue;
        const d = Math.min(amount, length / 2);
        return { x: line[k].x + (dx / length) * d, y: line[k].y + (dy / length) * d };
      }
      return null;
    };
    const towardCarrier = (point: PtMm, amount: number): PtMm | null => {
      const candidates = bShape
        .map((entity, i) => ({ entity, line: baseLines[i] }))
        .filter(({ entity, line }) => entity.kind === 'chain' && line.length >= 2)
        .map(({ entity, line }) => ({
          entity,
          line,
          hit: closestOnPolyline(point, line, entity.closed),
        }))
        .filter(({ hit }) => hit.d <= 0.02 / mmU)
        .sort((a, b) => a.hit.d - b.hit.d);
      for (const { line, hit } of candidates) {
        const a = line[hit.seg];
        const b = line[(hit.seg + 1) % line.length];
        const target = hit.t <= 0.5 ? b : a;
        const dx = target.x - point.x;
        const dy = target.y - point.y;
        const length = Math.hypot(dx, dy);
        if (length <= 1e-9) continue;
        const d = Math.min(amount, length / 2);
        return { x: point.x + (dx / length) * d, y: point.y + (dy / length) * d };
      }
      return null;
    };
    bShape.forEach((m, ei) => {
      baseLines[ei].forEach((point, k) => {
        const key = rowKey(ei, k, point);
        const clash = originalRows
          .near(point.x, point.y)
          .some((other) => other.layer === m.layer && other.key !== key);
        if (clash) {
          let moved: PtMm | null = null;
          for (let step = 10; step >= 1 && !moved; step--) {
            const amount = (RULE_NUDGE_MM * step) / 10 / mmU;
            const candidate =
              toward(baseLines[ei], k, amount) ??
              (MARKER_LAYERS.has(m.layer) ? towardCarrier(point, amount) : null);
            if (!candidate) break;
            const place = `${m.layer}|${candidate.x.toFixed(6)}|${candidate.y.toFixed(6)}`;
            if (!written.has(place)) moved = candidate;
          }
          if (!moved) {
            reasons.push(
              `${f.piece}: coincident ${sig(m)} point at (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) cannot move ${RULE_NUDGE_MM} mm toward a neighbour`,
            );
          } else {
            baseLines[ei][k] = moved;
            nudges++;
          }
        }
        originalRows.add(point.x, point.y, { layer: m.layer, key });
        const at = baseLines[ei][k];
        written.add(`${m.layer}|${at.x.toFixed(6)}|${at.y.toFixed(6)}`);
      });
    });
    basePointsOf.set(b, new Map(bShape.map((m, i) => [m, baseLines[i]])));
    for (const size of sizes)
      proofPointsOf.set(
        f.bySize.get(size)!,
        new Map(per.get(size)!.map((m, i) => [m, aligned.get(size)![i]])),
      );
    for (const size of sizes) proofShapeOf.set(f.bySize.get(size)!, per.get(size)!);
    const ids = new Map<ModelEntity, number[]>();
    bShape.forEach((m, ei) => {
      const list: number[] = [];
      aligned.get(base)![ei].forEach((bs, k) => {
        const row: RulDelta[] = sizes.map((s, si) => {
          const os = aligned.get(s)![ei][k];
          return si === bi
            ? { dx: 0, dy: 0 }
            : { dx: (os.x - bs.x) * mmU, dy: (os.y - bs.y) * mmU };
        });
        const rounded = row.map((d) => ({
          dx: Number(d.dx.toFixed(DIGITS)),
          dy: Number(d.dy.toFixed(DIGITS)),
        }));
        const key = rounded.map((d) => `${d.dx.toFixed(DIGITS)},${d.dy.toFixed(DIGITS)}`).join(' ');
        let id = rows.get(key);
        if (id === undefined) {
          // AAMA's conventional stationary/no-grade row is rule 0. Keeping it out of the
          // positive sequence means every positive id names an actual movement, while an explicit
          // # 0 still prevents the reader from interpolating a stationary point between two
          // moving neighbours.
          id = rounded.every((d) => d.dx === 0 && d.dy === 0) ? 0 : nextRule++;
          rows.set(key, id);
          rules.set(id, rounded);
        }
        list.push(id);
      });
      ids.set(m, list);
    });
    ruleOf.set(b, ids);
  }
  if (reasons.length) return { ok: false, reasons };

  // ── the base DXF: base-size blocks + a `# n` text on every point, nothing of the other sizes ──
  const now = opts.now ?? new Date();
  const baseDxf = writeBase(raw, fams, base, ruleOf, basePointsOf, opts.name, units.mmPerUnit);
  const rulText = formatRul({
    product: opts.product ?? 'grbpwr pattern-import',
    author: opts.author ?? 'GRBPWR',
    date: now,
    units: 'metric',
    name: opts.name,
    sizes: sizes.map((s) => s.trim()),
    sample: base.trim(),
    rules,
    digits: DIGITS,
  });

  // ── the proof: expand with our own reader, every point of every size within tol ──
  let maxErr = 0;
  try {
    const rul = parseRul(
      new TextEncoder().encode(rulText).buffer as ArrayBuffer,
      'the written RUL',
    );
    const ex = expandRul({
      dxf: new TextEncoder().encode(baseDxf).buffer as ArrayBuffer,
      dxfName: 'the base DXF',
      rul,
      rulName: 'the written RUL',
    });
    const back = buildAst(
      loadDxf(new TextEncoder().encode(ex.text).buffer as ArrayBuffer).tok.tags,
    );
    const got = new Map(pieceBlocks(back).map((p) => [p.block.name, p]));
    for (const f of fams) {
      for (const s of sizes) {
        const want = f.bySize.get(s)!;
        const name = `${f.piece}_${sizeNameToken(s)}`;
        const g = got.get(name);
        if (!g) {
          reasons.push(`${f.piece}: size ${s} does not come back from the RUL`);
          continue;
        }
        const ws = proofShapeOf.get(want) ?? shapeOf(want, markersOf.get(f));
        const gs = shapeOf(g, markersOf.get(f));
        if (ws.length !== gs.length) {
          reasons.push(`${f.piece} ${s}: ${gs.length} lines/points back, ${ws.length} drawn`);
          continue;
        }
        ws.forEach((w, i) => {
          const gm = gs[i];
          if (!sameProofShape(gm, w)) {
            reasons.push(`${f.piece} ${s}: ${sig(w)} comes back as ${sig(gm)}`);
            return;
          }
          const gotPts = gm.slots.map((p) => ({ x: p.x * mmU, y: p.y * mmU }));
          const wantPts = (proofPointsOf.get(want)?.get(w) ?? w.slots).map((p) => ({
            x: p.x * mmU,
            y: p.y * mmU,
          }));
          if (gm.kind === 'chain' && gotPts.length >= 2 && wantPts.length >= 2) {
            for (const p of gotPts)
              maxErr = Math.max(maxErr, closestOnPolyline(p, wantPts, w.closed).d);
            for (const p of wantPts)
              maxErr = Math.max(maxErr, closestOnPolyline(p, gotPts, gm.closed).d);
          } else {
            if (gotPts.length !== wantPts.length) {
              reasons.push(`${f.piece} ${s}: ${sig(w)} does not come back point for point`);
              return;
            }
            gotPts.forEach((p, k) => {
              maxErr = Math.max(maxErr, Math.hypot(p.x - wantPts[k].x, p.y - wantPts[k].y));
            });
          }
        });
        if (fixedLabels(g) !== fixedLabels(want))
          reasons.push(`${f.piece} ${s}: its labels do not come back as drawn`);
      }
    }
  } catch (e) {
    reasons.push(
      `the written RUL does not read back: ${isUnsupportedFormat(e) ? e.detail ?? e.message : e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (maxErr > tol)
    reasons.push(
      `expanded back, a point lands ${maxErr.toFixed(3)} mm from its size (allowed ${tol} mm)`,
    );
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    baseDxf,
    rulText,
    base,
    sizes: [...sizes],
    rules: rules.size,
    pieces: fams.length,
    maxErrMm: maxErr,
    nudges,
    insertions,
  };
}

// ── base DXF emitter ──────────────────────────────────────────────────────────────────────────

const HANDLE_CODES = new Set([5, 105, 330, 360]);
const R2000_ONLY_CODES = new Set([100]);
const RULE_TEXT_HEIGHT = 0.25; // as CLO writes its point numbers: present, never in the way

function writeBase(
  raw: RawDxf,
  fams: Family[],
  base: string,
  ruleOf: Map<PieceBlock, Map<ModelEntity, number[]>>,
  pointsOf: Map<PieceBlock, Map<ModelEntity, PtMm[]>>,
  tableName: string,
  mmPerUnit: number,
): string {
  const T: [number, string][] = [];
  const E = (c: number, v: string) => T.push([c, v]);
  const fmt = (v: number) => {
    const s = v.toFixed(6);
    return s === '-0.000000' ? '0.000000' : s;
  };
  const clean = (tags: { code: number; value: string }[]) => {
    const out: [number, string][] = [];
    let inGroup = false;
    for (const t of tags) {
      if (t.code === 102) {
        inGroup = t.value.trim().startsWith('{');
        continue;
      }
      if (inGroup || HANDLE_CODES.has(t.code) || R2000_ONLY_CODES.has(t.code)) continue;
      out.push([t.code, t.value]);
    }
    return out;
  };
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1009');
  // the units the per-size drawing was READ in, said explicitly ($INSUNITS, $MEASUREMENT or a
  // UNITS text may have carried them there; a reader of the base must not guess)
  const INS: Record<string, string> = {
    '1': '4',
    '25.4': '1',
    '10': '5',
    '1000': '6',
    '304.8': '2',
  };
  E(9, '$INSUNITS');
  E(70, INS[String(mmPerUnit)] ?? '4');
  E(0, 'ENDSEC');
  // layers the pieces use (AAMA readers take them from the entities; declared for AutoCAD)
  const layers = new Set<string>(['0', '1']);
  for (const f of fams) for (const m of f.bySize.get(base)!.entities) layers.add(m.layer);
  E(0, 'SECTION');
  E(2, 'TABLES');
  E(0, 'TABLE');
  E(2, 'LAYER');
  E(70, String(layers.size));
  for (const l of layers) {
    const src = raw.layers.find((x) => x.name === l);
    E(0, 'LAYER');
    E(2, l);
    E(70, '0');
    E(62, String(src?.color ?? 7));
    E(6, 'CONTINUOUS');
  }
  E(0, 'ENDTAB');
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  const names: string[] = [];
  for (const f of fams) {
    const b = f.bySize.get(base)!;
    const name = `${f.piece}_${sizeNameToken(base)}`;
    names.push(name);
    E(0, 'BLOCK');
    E(8, '0');
    E(2, name);
    E(70, '0');
    E(10, fmt(b.block.base.x));
    E(20, fmt(b.block.base.y));
    E(30, '0.0');
    E(3, name);
    let wroteSize = false;
    const texts = new Map<string, { layer: string; x: number; y: number; id: number }>();
    const ids = ruleOf.get(b);
    const entities = ids
      ? [...b.entities.filter((entity) => !ids.has(entity)), ...ids.keys()]
      : b.entities;
    for (const m of entities) {
      if (m.kind === 'rule') continue; // the source's own point numbers are replaced by ours
      // A POINT notch stores its direction and depth as fixed entity attributes. Those can differ
      // per size but a RUL only grades coordinates, so emit the equivalent two-point layer-4 line
      // and grade both endpoints. The ordinary DXF importer reads both forms as the same notch.
      if (notchPoint(m)) {
        const points = pointsOf.get(b)?.get(m) ?? m.slots;
        if (points.length !== 2) continue;
        E(0, 'LINE');
        E(8, m.layer);
        E(10, fmt(points[0].x));
        E(20, fmt(points[0].y));
        E(30, '0.0');
        E(11, fmt(points[1].x));
        E(21, fmt(points[1].y));
        E(31, '0.0');
        const list = ids?.get(m);
        if (list)
          points.forEach((point, index) => {
            const key = `${m.layer}|${point.x.toFixed(6)}|${point.y.toFixed(6)}`;
            if (!texts.has(key))
              texts.set(key, {
                layer: m.layer,
                x: point.x,
                y: point.y,
                id: list[index],
              });
          });
        continue;
      }
      // The card stores our graded drawing as R2000 LWPOLYLINEs. An AAMA exchange is R12, where
      // that entity does not exist, so spell the same vertices as classic POLYLINE / VERTEX.
      if (shapeType(m) === 'POLYLINE') {
        const points = pointsOf.get(b)?.get(m) ?? m.slots;
        E(0, 'POLYLINE');
        E(8, m.layer);
        E(66, '1');
        E(70, m.closed ? '1' : '0');
        points.forEach((s) => {
          E(0, 'VERTEX');
          E(8, m.layer);
          E(10, fmt(s.x));
          E(20, fmt(s.y));
          E(30, '0.0');
        });
        E(0, 'SEQEND');
        E(8, m.layer);
        const list = ids?.get(m);
        if (list)
          points.forEach((s, k) => {
            const key = `${m.layer}|${s.x.toFixed(6)}|${s.y.toFixed(6)}`;
            if (!texts.has(key)) texts.set(key, { layer: m.layer, x: s.x, y: s.y, id: list[k] });
          });
        continue;
      }
      E(0, m.raw.type);
      for (const [c, v] of clean(m.raw.tags)) {
        if (m.kind === 'label' && c === 1) {
          const l = labelOf(m.text ?? '');
          if (l && (l.key === 'SIZE' || l.key === 'SIZE NAME')) {
            E(1, `${v.slice(0, v.indexOf(':') + 1)} ${base}`);
            wroteSize = true;
            continue;
          }
        }
        E(c, v);
      }
      for (const c of m.raw.children) {
        E(0, c.type);
        for (const [cc, v] of clean(c.tags)) E(cc, v);
      }
      if (m.raw.type === 'POLYLINE' || m.raw.seqend) {
        E(0, 'SEQEND');
        E(8, m.layer);
      }
      const list = ids?.get(m);
      if (list)
        m.slots.forEach((s, k) => {
          const key = `${m.layer}|${s.x.toFixed(6)}|${s.y.toFixed(6)}`;
          if (!texts.has(key)) texts.set(key, { layer: m.layer, x: s.x, y: s.y, id: list[k] });
        });
    }
    if (!wroteSize) {
      const at = b.entities.find((m) => m.slots.length)?.slots[0] ?? { x: 0, y: 0 };
      E(0, 'TEXT');
      E(8, '1');
      E(10, fmt(at.x));
      E(20, fmt(at.y));
      E(30, '0.0');
      E(40, '3.0');
      E(1, `Size: ${base}`);
    }
    for (const t of texts.values()) {
      E(0, 'TEXT');
      E(8, t.layer);
      E(10, fmt(t.x));
      E(20, fmt(t.y));
      E(30, '0.0');
      E(40, String(RULE_TEXT_HEIGHT));
      E(1, `# ${t.id}`);
    }
    E(0, 'ENDBLK');
    E(8, '0');
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  // one INSERT per base block, where the source inserted that block
  const insertAt = new Map<string, { x: number; y: number }>();
  for (const e of raw.entities)
    if (e.type === 'INSERT' && !e.paper) {
      const nm = str(e.tags, 2) ?? '';
      const x = Number(e.tags.find((t) => t.code === 10)?.value ?? 0);
      const y = Number(e.tags.find((t) => t.code === 20)?.value ?? 0);
      if (!insertAt.has(nm)) insertAt.set(nm, { x, y });
    }
  fams.forEach((f, i) => {
    const at = insertAt.get(f.bySize.get(base)!.block.name) ?? { x: 0, y: 0 };
    E(0, 'INSERT');
    E(8, '0');
    E(2, names[i]);
    E(10, fmt(at.x));
    E(20, fmt(at.y));
    E(30, '0.0');
  });
  // the AAMA file header (model space, layer 1), our sample size and rule table named
  const header = modelLabelsOf(raw).filter(
    (l) => l.key !== 'sampleSize' && l.key !== 'gradeRuleTable',
  );
  const lines = [
    ...header.map((l) => `${l.rawKey}: ${l.value}`),
    `Sample Size: ${base}`,
    `Grade Rule Table: ${tableName}`,
  ];
  for (const s of lines) {
    E(0, 'TEXT');
    E(8, '1');
    E(10, '0.0');
    E(20, '0.0');
    E(30, '0.0');
    E(40, '0.25');
    E(1, s);
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  let text = '';
  for (const [c, v] of T) text += `${String(c).padStart(3)}\r\n${v}\r\n`;
  return text;
}
