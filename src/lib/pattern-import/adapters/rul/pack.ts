// RUL · WRITE (alternative storage): a per-size DXF (a block per piece × size — our R12 output, or a
// graded CAD export) → base-size DXF + grade rule table. Only for pieces whose sizes are the SAME
// drawing point for point (every line the same number of points, every notch / drill / grain line
// present in every size): each point gets the rule of its own per-size deltas (identical rows share
// one rule). The package is proved before it is handed out: the RUL is expanded back with our own
// reader and every point of every size must land within `tolMm` of the per-size block. Any piece
// failing → the whole package is refused with the reasons; the per-size DXF stays the file to use.
// The base DXF is never mixed with per-size blocks.

import type { RawDxf } from '../dxf/ast';
import { buildAst, str } from '../dxf/ast';
import { bareSize } from '../dxf/segment';
import { loadDxf } from '../dxf/tags';
import { INSUNITS_MM, modelLabelsOf, unitsOf } from '../dxf/extract';
import { isUnsupportedFormat } from '../sniff/errors';
import { expandRul, sizeNameToken } from './expand';
import { type ModelEntity, type PieceBlock, PointIndex, labelOf, pieceBlocks } from './model';
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
  const key = (m: ModelEntity) => `${m.layer}|${m.raw.type}|${m.closed ? 1 : 0}`;
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (key(a.m) < key(b.m) ? -1 : key(a.m) > key(b.m) ? 1 : a.i - b.i))
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
function bestShift(base: ModelEntity, other: ModelEntity): number {
  const n = base.slots.length;
  if (!base.closed || n < 3 || n > 4000) return 0;
  const closingDup =
    n > 1 && base.slots[0].x === base.slots[n - 1].x && base.slots[0].y === base.slots[n - 1].y;
  if (closingDup) return 0; // a written closing vertex pins the start
  let best = 0;
  let bestCost = Infinity;
  for (let s = 0; s < n; s++) {
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      const o = other.slots[(i + s) % n];
      mx += o.x - base.slots[i].x;
      my += o.y - base.slots[i].y;
    }
    mx /= n;
    my /= n;
    let cost = 0;
    for (let i = 0; i < n && cost < bestCost; i++) {
      const o = other.slots[(i + s) % n];
      cost += (o.x - base.slots[i].x - mx) ** 2 + (o.y - base.slots[i].y - my) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
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
  for (const p of pieces) {
    const parts = p.block.name.split('_');
    const tail = parts.length > 1 ? parts[parts.length - 1] : '';
    const uni = bareSize(tail) === 'UNI';
    const size = uni ? null : toks.get(bareSize(p.sizeLabel ?? tail)) ?? null;
    const stem = parts.length > 1 ? parts.slice(0, -1).join('_') : p.block.name;
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
  for (const f of fams.values()) {
    const missing = sizes.filter((s) => !f.bySize.has(s));
    if (missing.length) reasons.push(`${f.piece}: no block for size ${missing.join(', ')}`);
  }
  return [...fams.values()];
}

/** Text a block carries that must not change with the size (name, quantity, material…). */
function fixedLabels(p: PieceBlock): string {
  return p.entities
    .filter((m) => m.kind === 'label')
    .map((m) => m.text ?? '')
    .filter((t) => {
      const l = labelOf(t);
      return !(l && (l.key === 'SIZE' || l.key === 'SIZE NAME'));
    })
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
  const ruleOf: Map<PieceBlock, Map<ModelEntity, number[]>> = new Map();
  const shiftsOf = new Map<Family, Map<string, number[]>>();
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
    // markers drawn alike in every size are graded and proved too; sample-only ones follow
    const mk = markerSig(b);
    const markers = !!mk && sizes.every((z) => markerSig(f.bySize.get(z)!) === mk);
    // left out of the proof only when the base alone draws them (a CAD's sample-size markers)
    const baseOnly = sizes.every((z) => z === base || !markerSig(f.bySize.get(z)!));
    if (mk !== '' && !markers && !baseOnly) {
      reasons.push(`${f.piece}: its turn / curve / validation points differ between sizes`);
      continue;
    }
    if (!mk && sizes.some((z) => markerSig(f.bySize.get(z)!))) {
      reasons.push(
        `${f.piece}: turn / curve / validation points drawn in other sizes but not in ${base}`,
      );
      continue;
    }
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
    const bShape = shapeOf(b, markers);
    const bSig = bShape.map(sig);
    const per = new Map<string, ModelEntity[]>();
    let ok = true;
    for (const s of sizes) {
      const shape = shapeOf(f.bySize.get(s)!, markers);
      const sg = shape.map(sig);
      if (sg.length !== bSig.length || sg.some((x, i) => x !== bSig[i])) {
        reasons.push(
          `${f.piece}: size ${s} is not the same drawing as ${base} (${sg.length} vs ${bSig.length} lines/points, or in another order)`,
        );
        ok = false;
        break;
      }
      const diff = shape.findIndex((m, i) => m.slots.length !== bShape[i].slots.length);
      if (diff >= 0) {
        reasons.push(
          `${f.piece}: ${sig(bShape[diff])} has ${bShape[diff].slots.length} points in ${base} but ${shape[diff].slots.length} in ${s} — no point-to-point grade`,
        );
        ok = false;
        break;
      }
      const arc = shape.findIndex((m, i) => shapeTags(m) !== shapeTags(bShape[i]));
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
    const shifts = new Map<string, number[]>();
    for (const s of sizes)
      shifts.set(
        s,
        per.get(s)!.map((m, i) => bestShift(bShape[i], m)),
      );
    shiftsOf.set(f, shifts);
    const ids = new Map<ModelEntity, number[]>();
    // two points of one layer at one place get ONE rule text: they must grade alike
    const place = new PointIndex<{ layer: string; key: string; what: string }>(0.01 / mmU);
    bShape.forEach((m, ei) => {
      const list: number[] = [];
      m.slots.forEach((bs, k) => {
        const row: RulDelta[] = sizes.map((s) => {
          const o = per.get(s)![ei];
          const sh = shifts.get(s)![ei];
          const os = o.slots[(k + sh) % o.slots.length];
          return { dx: (os.x - bs.x) * mmU, dy: (os.y - bs.y) * mmU };
        });
        const key = row.map((d) => `${d.dx.toFixed(DIGITS)},${d.dy.toFixed(DIGITS)}`).join(' ');
        const clash = place.near(bs.x, bs.y).find((p) => p.layer === m.layer && p.key !== key);
        if (clash)
          reasons.push(
            `${f.piece}: two points at (${bs.x.toFixed(2)}, ${bs.y.toFixed(2)}) on layer ${m.layer} grade differently (${clash.what} and ${sig(m)})`,
          );
        place.add(bs.x, bs.y, { layer: m.layer, key, what: sig(m) });
        let id = rows.get(key);
        if (id === undefined) {
          id = rows.size + 1;
          rows.set(key, id);
          rules.set(
            id,
            row.map((d) => ({
              dx: Number(d.dx.toFixed(DIGITS)),
              dy: Number(d.dy.toFixed(DIGITS)),
            })),
          );
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
  const baseDxf = writeBase(raw, fams, base, ruleOf, opts.name, units.mmPerUnit);
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
        const ws = shapeOf(want, markersOf.get(f));
        const gs = shapeOf(g, markersOf.get(f));
        if (ws.length !== gs.length) {
          reasons.push(`${f.piece} ${s}: ${gs.length} lines/points back, ${ws.length} drawn`);
          continue;
        }
        const sh = shiftsOf.get(f)!.get(s)!;
        ws.forEach((w, i) => {
          const gm = gs[i];
          if (
            gm.slots.length !== w.slots.length ||
            sig(gm) !== sig(w) ||
            shapeTags(gm) !== shapeTags(w)
          ) {
            reasons.push(`${f.piece} ${s}: ${sig(w)} does not come back point for point`);
            return;
          }
          gm.slots.forEach((gp, k) => {
            const wp = w.slots[(k + sh[i]) % w.slots.length];
            const d = Math.hypot(gp.x - wp.x, gp.y - wp.y) * mmU;
            if (d > maxErr) maxErr = d;
          });
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
  };
}

// ── base DXF emitter ──────────────────────────────────────────────────────────────────────────

const HANDLE_CODES = new Set([5, 105, 330, 360]);
const RULE_TEXT_HEIGHT = 0.25; // as CLO writes its point numbers: present, never in the way

function writeBase(
  raw: RawDxf,
  fams: Family[],
  base: string,
  ruleOf: Map<PieceBlock, Map<ModelEntity, number[]>>,
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
      if (inGroup || HANDLE_CODES.has(t.code)) continue;
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
    for (const m of b.entities) {
      if (m.kind === 'rule') continue; // the source's own point numbers are replaced by ours
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
