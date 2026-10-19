// The gate's OWN tag-level reader of the BLOCKS section.
//
// Why a second reader next to the card's parser: the card parser (lib/nesting/dxf/*) does NOT read
// the CLO R2000 grain arrow (3-vertex L7 LWPOLYLINE — K2 pitfall 1: `groupToPieces` only takes
// 2-point open chains as grain candidates) and drops R12 POINT notches (pitfall 2). Feature counts
// and the grain must be verified on what the FILE carries, so G5/G12 read entities here; G1/G3/G4/
// G8 use the card parser (roundtrip.ts) because that is what the card will see. Task F15 teaches
// the card parser the arrow and POINT notches; until then this reader is the only grain witness.

import type { PtMm } from '../types';

export type RawEntity = {
  type: 'LWPOLYLINE' | 'POLYLINE' | 'LINE' | 'POINT' | 'TEXT' | 'OTHER';
  layer: string;
  pts: PtMm[];
  closed: boolean;
  /** POINT: code 30 (CLO-AAMA: notch depth) and 50 (inward angle, degrees). */
  z?: number;
  angleDeg?: number;
  text?: string;
};

export type RawDxf = {
  acadver: string | null;
  insunits: number | null;
  blocks: Map<string, RawEntity[]>;
  inserts: string[];
  /** Index of the first `0 SECTION` pair; everything before it is the comment preamble. */
  firstSectionLine: number;
};

function tagsOf(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = Number(lines[i].trim());
    if (!Number.isFinite(c)) throw new Error(`DXF tag ${i / 2}: bad group code "${lines[i]}"`);
    out.push([c, lines[i + 1]]);
  }
  return out;
}

function entityOf(type: string, body: [number, string][]): RawEntity {
  const t = (
    ['LWPOLYLINE', 'POLYLINE', 'LINE', 'POINT', 'TEXT'].includes(type) ? type : 'OTHER'
  ) as RawEntity['type'];
  const e: RawEntity = { type: t, layer: '', pts: [], closed: false };
  let x: number | null = null;
  let x2: number | null = null;
  let y2: number | null = null;
  for (const [c, v] of body) {
    if (c === 8) e.layer = v.trim();
    else if (c === 70 && (t === 'LWPOLYLINE' || t === 'POLYLINE')) e.closed = (Number(v) & 1) === 1;
    else if (c === 10) x = Number(v);
    else if (c === 20 && x != null) {
      e.pts.push({ x, y: Number(v) });
      x = null;
    } else if (c === 11) x2 = Number(v);
    else if (c === 21) y2 = Number(v);
    else if (c === 30 && t === 'POINT') e.z = Number(v);
    else if (c === 50 && t === 'POINT') e.angleDeg = Number(v);
    else if (c === 1 && t === 'TEXT') e.text = v;
  }
  if (t === 'LINE' && x2 != null && y2 != null) e.pts.push({ x: x2, y: y2 });
  return e;
}

export function readRawDxf(text: string): RawDxf {
  const tags = tagsOf(text);
  const out: RawDxf = {
    acadver: null,
    insunits: null,
    blocks: new Map(),
    inserts: [],
    firstSectionLine: -1,
  };
  let section = '';
  for (let i = 0; i < tags.length; i++) {
    const [c, v] = tags[i];
    if (c === 0 && v === 'SECTION') {
      if (out.firstSectionLine < 0) out.firstSectionLine = i * 2;
      section = tags[i + 1]?.[0] === 2 ? tags[i + 1][1] : '';
      continue;
    }
    if (c === 0 && v === 'ENDSEC') {
      section = '';
      continue;
    }
    if (section === 'HEADER' && c === 9) {
      if (v === '$ACADVER') out.acadver = tags[i + 1]?.[1] ?? null;
      if (v === '$INSUNITS') out.insunits = Number(tags[i + 1]?.[1]);
      continue;
    }
    if (section === 'ENTITIES' && c === 0 && v === 'INSERT') {
      for (let j = i + 1; j < tags.length && tags[j][0] !== 0; j++) {
        if (tags[j][0] === 2) out.inserts.push(tags[j][1]);
      }
      continue;
    }
    if (section !== 'BLOCKS' || c !== 0 || v !== 'BLOCK') continue;
    // BLOCK header up to the first entity
    let j = i + 1;
    let name = '';
    for (; j < tags.length && tags[j][0] !== 0; j++) if (tags[j][0] === 2) name = tags[j][1];
    const ents: RawEntity[] = [];
    while (j < tags.length && !(tags[j][0] === 0 && tags[j][1] === 'ENDBLK')) {
      const type = tags[j][1];
      const body: [number, string][] = [];
      j++;
      for (; j < tags.length && tags[j][0] !== 0; j++) body.push(tags[j]);
      if (type === 'POLYLINE') {
        const e = entityOf('POLYLINE', body);
        while (j < tags.length && tags[j][0] === 0 && tags[j][1] === 'VERTEX') {
          const vb: [number, string][] = [];
          j++;
          for (; j < tags.length && tags[j][0] !== 0; j++) vb.push(tags[j]);
          e.pts.push(...entityOf('POINT', vb).pts);
        }
        if (j < tags.length && tags[j][1] === 'SEQEND') {
          j++;
          for (; j < tags.length && tags[j][0] !== 0; j++);
        }
        ents.push(e);
      } else {
        ents.push(entityOf(type, body));
      }
    }
    out.blocks.set(name, ents);
    i = j;
  }
  return out;
}
