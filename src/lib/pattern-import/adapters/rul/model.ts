// RUL · the geometry model both directions share: a DXF piece block as entities whose coordinate
// tags are addressable SLOTS (so a grade can rewrite exactly those tags and nothing else), plus the
// `# n` grade-rule texts of the block. Pure, worker-safe.

import type { RawBlock, RawDxf, RawEntity } from '../dxf/ast';
import { rawStr, str } from '../dxf/ast';
import type { Tag } from '../dxf/tags';
import { decodeMText, decodeTextValue } from '../dxf/text';

/** One coordinate pair of an entity: where its x and y tags sit (child -1 = the entity itself). */
export type Slot = { child: number; xi: number; yi: number; x: number; y: number };

export type EntityKind =
  | 'chain' // POLYLINE / LWPOLYLINE / LINE / SPLINE: an ordered line of points
  | 'point' // POINT / CIRCLE / ARC / ELLIPSE / nested INSERT: one located point
  | 'label' // TEXT / MTEXT / ATTDEF that is not a rule number: positioned, never graded
  | 'rule' // `# n` grade-rule text (n = -1: a curve point, explicitly without a rule)
  | 'other'; // an entity whose coordinates we do not interpret (left as drawn)

export type ModelEntity = {
  raw: RawEntity;
  kind: EntityKind;
  layer: string;
  /** Chains: the points in order; points: one slot; labels: their insertion slots. */
  slots: Slot[];
  closed: boolean;
  /** Rule texts: the rule number (-1 = explicitly none). */
  rule?: number;
  /** Labels / rules: the decoded text. */
  text?: string;
};

export type PieceBlock = {
  block: RawBlock;
  entities: ModelEntity[];
  /** The `SIZE:` label of the block (decoded value), when it has one. */
  sizeLabel: string | null;
  /** The `PIECE NAME:` label, when it has one. */
  pieceLabel: string | null;
};

/** Conservative piece-name alias used by the RUL packer when sizes split between `X` / `X_MAIN`. */
export function normalizedRulPieceName(value: string): string {
  const normalized = value.trim().replace(/([_-])MAIN$/i, '');
  return normalized || value.trim();
}

/** `# <rule>[, <alternate grade reference>]` (D6673 §4.3.1.4). */
const RULE_TEXT = /^#\s*([^,\s][^,]*?)\s*(?:,.*)?$/;
const LABEL = /^\s*([A-Za-z][A-Za-z .]{0,30}?)\s*:\s*(.*?)\s*$/;

/** Decoded text value of a TEXT / MTEXT / ATTDEF entity. */
export function textOf(e: RawEntity): string {
  const v = rawStr(e.tags, 1) ?? '';
  return e.type === 'MTEXT' ? decodeMText(v) : decodeTextValue(v);
}

/** `KEY: value` of a label text, upper-cased key with single spaces. */
export function labelOf(text: string): { key: string; value: string } | null {
  const m = LABEL.exec(text);
  return m ? { key: m[1].trim().replace(/\s+/g, ' ').toUpperCase(), value: m[2] } : null;
}

/** All 10/20 (or 11/21 …) pairs of a tag list, in order: a 10 followed by its 20. */
function pairs(tags: Tag[], xc: number, child: number): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < tags.length; i++) {
    if (tags[i].code !== xc) continue;
    let j = i + 1;
    while (j < tags.length && tags[j].code !== xc + 10 && tags[j].code !== xc) j++;
    if (j >= tags.length || tags[j].code !== xc + 10) continue;
    const x = Number(tags[i].value.trim());
    const y = Number(tags[j].value.trim());
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ child, xi: i, yi: j, x, y });
  }
  return out;
}

const flag = (tags: Tag[], code: number) => {
  const t = tags.find((x) => x.code === code);
  const v = t ? Math.trunc(Number(t.value.trim())) : 0;
  return Number.isFinite(v) ? v : 0;
};

export function modelEntity(e: RawEntity): ModelEntity {
  const layer = e.layer;
  const base = { raw: e, layer, closed: false };
  switch (e.type) {
    case 'POLYLINE': {
      const slots: Slot[] = [];
      e.children.forEach((c, k) => {
        // polyface / mesh face records carry no position of their own
        if (c.type !== 'VERTEX' || flag(c.tags, 70) & 128) return;
        slots.push(...pairs(c.tags, 10, k).slice(0, 1));
      });
      return { ...base, kind: 'chain', slots, closed: (flag(e.tags, 70) & 1) === 1 };
    }
    case 'LWPOLYLINE':
      return {
        ...base,
        kind: 'chain',
        slots: pairs(e.tags, 10, -1),
        closed: (flag(e.tags, 70) & 1) === 1,
      };
    case 'LINE':
      return {
        ...base,
        kind: 'chain',
        slots: [...pairs(e.tags, 10, -1).slice(0, 1), ...pairs(e.tags, 11, -1).slice(0, 1)],
      };
    case 'SPLINE': {
      const ctrl = pairs(e.tags, 10, -1);
      return {
        ...base,
        kind: 'chain',
        slots: ctrl.length ? ctrl : pairs(e.tags, 11, -1),
        closed: (flag(e.tags, 70) & 1) === 1,
      };
    }
    case 'POINT':
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
    case 'INSERT':
      return { ...base, kind: 'point', slots: pairs(e.tags, 10, -1).slice(0, 1) };
    case 'TEXT':
    case 'MTEXT':
    case 'ATTDEF': {
      const text = textOf(e).trim();
      const r = RULE_TEXT.exec(text);
      const slots = pairs(e.tags, 10, -1).slice(0, 1);
      // a non-integer id is kept as NaN: the grader refuses it by name instead of dropping it
      if (r)
        return {
          ...base,
          kind: 'rule',
          slots,
          rule: /^-?\d+$/.test(r[1]) && Number.isSafeInteger(Number(r[1])) ? Number(r[1]) : NaN,
          text,
        };
      return {
        ...base,
        kind: 'label',
        slots: [...slots, ...pairs(e.tags, 11, -1).slice(0, 1)],
        text,
      };
    }
    default:
      return { ...base, kind: 'other', slots: [] };
  }
}

/** Top-level INSERTed, named blocks (= pieces) in file order of their first insert. */
export function pieceBlocks(raw: RawDxf): PieceBlock[] {
  const seen = new Set<string>();
  const out: PieceBlock[] = [];
  for (const e of raw.entities) {
    if (e.type !== 'INSERT' || e.paper) continue;
    const name = str(e.tags, 2) ?? '';
    if (!name || name.startsWith('*') || seen.has(name)) continue;
    const block = raw.blocks.get(name);
    if (!block) continue;
    seen.add(name);
    const entities = block.entities.map(modelEntity);
    let sizeLabel: string | null = null;
    let pieceLabel: string | null = null;
    for (const m of entities) {
      if (m.kind !== 'label' || !m.text) continue;
      const l = labelOf(m.text);
      if (!l) continue;
      if ((l.key === 'SIZE' || l.key === 'SIZE NAME') && sizeLabel === null) sizeLabel = l.value;
      if ((l.key === 'PIECE NAME' || l.key === 'PIECE') && pieceLabel === null)
        pieceLabel = l.value;
    }
    out.push({ block, entities, sizeLabel, pieceLabel });
  }
  return out;
}

/** A spatial hash of points for "at the same place" lookups (tolerance `eps`, file units). */
export class PointIndex<T> {
  private cells = new Map<string, { x: number; y: number; v: T }[]>();
  constructor(private eps: number) {}
  private key(ix: number, iy: number) {
    return `${ix},${iy}`;
  }
  add(x: number, y: number, v: T) {
    const k = this.key(Math.round(x / this.eps), Math.round(y / this.eps));
    const c = this.cells.get(k);
    if (c) c.push({ x, y, v });
    else this.cells.set(k, [{ x, y, v }]);
  }
  near(x: number, y: number): T[] {
    const ix = Math.round(x / this.eps);
    const iy = Math.round(y / this.eps);
    const out: T[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const p of this.cells.get(this.key(ix + dx, iy + dy)) ?? [])
          if (Math.abs(p.x - x) <= this.eps && Math.abs(p.y - y) <= this.eps) out.push(p.v);
    return out;
  }
}
