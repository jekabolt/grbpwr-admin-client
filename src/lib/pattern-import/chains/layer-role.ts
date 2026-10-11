// chains/ (P2) — the legend role of a line from its LAYER, where the file names its layers the
// AAMA/ASTM way (DXF without CLO blocks: our own marker export RC28, a foreign CAD's loose DXF).
//
// AAMA/ASTM D6673 numbers its layers — 1 the piece boundary (cut line), 14 the sew line, 4 notches,
// 7 the grain line, 8 internal lines, 6 a mirror line, 15/19 annotation, 84–87 QV copies — and
// CAD that names them says CUT / INNER / NOTCH / GRAIN … (adapters/dxf/segment layerKind). Where
// that evidence is there, the layer IS the role: the face pass (chains/face-role) read RC28-test-3's
// pleat lines on INNER as the piece outlines and filed its CUT outlines as strays and internal
// lines (10 junk faces, the leg panels split edge to edge, 7 pieces of 11).
//
// Evidence: no size row carries lines (one size), the lines on a layer of known meaning are most of
// the line work (≥ 60 % of its length) and the cut layer draws closed outlines. Then
//   cut                         → the outline row ('common'), sure;
//   notch                       → 'notch';   grain → 'grain';   sew line → 'seam';
//   internal, mirror, drill …   → 'internal', except a line of that layer that
//       runs ON a cut outline (a copy of the cut line, ≥ 80 % of it within 0.5 mm) → 'ignore',
//       runs at a constant distance inside one (3–30 mm, spread ≤ 1 mm: the sew line) → 'seam',
//       lies outside every cut outline (≥ 80 % of it, farther than 2 mm)          → 'ignore',
//       is drawn as CLO's grain arrow (lib/nesting isGrainArrow)                   → 'grain';
//   annotation, QV, grade points → 'ignore'.
// Lines on a layer of no known meaning keep the row the earlier passes gave them. Without the
// evidence the set comes back unchanged.
import type {
  Chain,
  ChainId,
  ChainRole,
  ChainSet,
  ClassEvidence,
  LineClass,
  PtMm,
  Style,
} from 'lib/pattern-import/types';

import { isGrainArrow } from 'lib/nesting/dxf/grain-arrow';

import { layerKind } from '../adapters/dxf/segment';
import { pointInPoly } from '../pieces/geom';
import { median, resample, SegGrid, segNearest } from './geom';

type LayerKind = ReturnType<typeof layerKind>;

/** Probe switches (mutation): the whole pass, or the sub-rules of the internal layer. */
export type LayerRoleOpts = { off?: ReadonlySet<'all' | 'split'> };

/** Share of the line work (length) that must sit on layers of known meaning. */
const KNOWN_SHARE = 0.6;
const STEP_MM = 2;
const ON_MM = 0.5;
const SEAM_MIN_MM = 3;
const SEAM_MAX_MM = 30;
const SEAM_SPREAD_MM = 1;
const OUT_MM = 2;

type Row = { role: ChainRole; meaning: string };

const ROLE: Partial<Record<LayerKind, Row>> = {
  cut: { role: 'common', meaning: 'cut line' },
  notch: { role: 'notch', meaning: 'notches' },
  grain: { role: 'grain', meaning: 'grain line' },
  seam: { role: 'seam', meaning: 'sew line' },
  internal: { role: 'internal', meaning: 'internal lines' },
  mirror: { role: 'internal', meaning: 'mirror line' },
  drill: { role: 'internal', meaning: 'drill holes' },
  cutout: { role: 'internal', meaning: 'internal cut-outs' },
  ref: { role: 'internal', meaning: 'reference lines' },
  annotation: { role: 'ignore', meaning: 'annotation' },
  qv: { role: 'ignore', meaning: 'quality-validation copy' },
  turn: { role: 'ignore', meaning: 'grade points' },
  curve: { role: 'ignore', meaning: 'grade points' },
};

/** P2: give the lines their AAMA/ASTM layer meaning (see the header); unchanged without evidence. */
export function rolesByLayer(
  set: ChainSet,
  styles: ReadonlyMap<number, Style>,
  o: LayerRoleOpts = {},
): ChainSet {
  const off = o.off ?? new Set();
  // probe mutation: the whole pass off (e2e / autopilot run with P2_NOLAYER=1)
  const envOff = typeof process !== 'undefined' && !!process.env?.P2_NOLAYER;
  if (off.has('all') || (!o.off && envOff)) return set;
  if (set.classes.some((c) => c.role === 'size' && c.chains.length)) return set;
  const layerOf = (ch: Chain) => styles.get(ch.style)?.layer ?? null;
  const lines = set.chains.filter((ch) => ch && ch.pts.length >= 2);
  const total = lines.reduce((a, ch) => a + ch.lengthMm, 0);
  if (!total) return set;
  const kindOf = new Map<ChainId, LayerKind>();
  let known = 0;
  for (const ch of lines) {
    const l = layerOf(ch);
    const k = l == null ? 'unknown' : layerKind(l);
    if (k === 'unknown' || !ROLE[k]) continue;
    kindOf.set(ch.id, k);
    known += ch.lengthMm;
  }
  if (known < KNOWN_SHARE * total) return set;
  const cut = lines.filter((ch) => kindOf.get(ch.id) === 'cut');
  const outlines = cut.filter((ch) => ch.closed && ch.pts.length >= 3);
  if (!outlines.length) return set;
  // a line of the internal layer: on a cut outline, the sew line inside one, or outside them all
  const grid = new SegGrid(8);
  for (const ch of cut) {
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    grid.addPolyline(ch.id, pts);
  }
  const ptsOf = new Map(cut.map((ch) => [ch.id, ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts]));
  const nearest = (p: PtMm, reach: number) => {
    let d = Infinity;
    grid.near(p, reach, (owner, seg) => {
      const pts = ptsOf.get(owner)!;
      const s = segNearest(p, pts[seg], pts[seg + 1]);
      if (s.d < d) d = s.d;
    });
    return d;
  };
  const inside = (p: PtMm) => outlines.some((ch) => pointInPoly(p, ch.pts));
  const split = (ch: Chain): Row | null => {
    const sm = resample(ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts, STEP_MM).map((s) => s.p);
    if (!sm.length) return null;
    // CLO's grain arrow (3-vertex shaft + barb) drawn on the internal layer is the grain line: an
    // internal line of that shape is what the card parser takes for a second grain
    if (!ch.closed && isGrainArrow(ch.pts)) return { role: 'grain', meaning: 'grain arrow' };
    const ds = sm.map((p) => nearest(p, SEAM_MAX_MM + 2));
    const on = ds.filter((d) => d <= ON_MM).length;
    if (on >= 0.8 * sm.length) return { role: 'ignore', meaning: 'a copy of the cut line' };
    const out = sm.filter((p, i) => ds[i] > OUT_MM && !inside(p)).length;
    if (out >= 0.8 * sm.length) return { role: 'ignore', meaning: 'outside every cut outline' };
    if (ch.closed && ch.lengthMm >= 100 && sm.every(inside)) {
      const m = median(ds);
      const spread = Math.max(...ds) - Math.min(...ds);
      if (m >= SEAM_MIN_MM && m <= SEAM_MAX_MM && spread <= 2 * SEAM_SPREAD_MM)
        return { role: 'seam', meaning: 'sew line' };
    }
    return null;
  };
  // the rows: one per (role, meaning), in the order roles are listed to the operator
  const rows = new Map<string, { row: Row; layers: Set<string>; ids: ChainId[] }>();
  const taken = new Set<ChainId>();
  for (const ch of lines) {
    const k = kindOf.get(ch.id);
    if (!k) continue;
    let row = ROLE[k]!;
    if (row.role === 'internal' && !off.has('split')) row = split(ch) ?? row;
    const key = `${row.role}|${row.meaning}`;
    const r = rows.get(key) ?? { row, layers: new Set<string>(), ids: [] };
    r.layers.add(layerOf(ch) ?? '');
    r.ids.push(ch.id);
    rows.set(key, r);
    taken.add(ch.id);
  }
  const len = (ids: ChainId[]) => ids.reduce((a, i) => a + set.chains[i].lengthMm, 0);
  const classes: LineClass[] = [];
  const push = (c: Omit<LineClass, 'id'>) => classes.push({ ...c, id: classes.length });
  const order: ChainRole[] = ['common', 'seam', 'notch', 'grain', 'internal', 'ignore'];
  for (const role of order)
    for (const { row, layers, ids } of rows.values()) {
      if (row.role !== role) continue;
      const evidence: ClassEvidence[] = [...layers].map((layer) => ({
        kind: 'layer',
        layer,
        meaning: row.meaning,
      }));
      push({
        role,
        sizeLabel: null,
        chains: ids,
        totalLengthMm: len(ids),
        evidence,
        confidence: role === 'common' ? 0.9 : 0.8,
      });
    }
  // lines on a layer of no known meaning keep their row (the marker's STRIP border stays a stray)
  for (const c of set.classes) {
    const rest = c.chains.filter((id) => !taken.has(id));
    if (rest.length) push({ ...c, chains: rest, totalLengthMm: len(rest) });
  }
  const outline = new Set(rows.get('common|cut line')?.ids ?? []);
  const n = (role: ChainRole) =>
    [...rows.values()].filter((r) => r.row.role === role).reduce((a, r) => a + r.ids.length, 0);
  return {
    ...set,
    classes,
    orphans: set.orphans.filter((id) => !taken.has(id)),
    // the rows the earlier passes asked about are gone: the layers answered them
    ambiguities: (set.ambiguities ?? []).filter((a) => !a.classes.length),
    warnings: [
      ...set.warnings,
      `P2: AAMA/ASTM layers (${Math.round((100 * known) / total)} % of the line work) → ${outline.size} cut-line outlines, ${n('internal')} internal, ${n('seam')} sew, ${n('notch')} notch, ${n('grain')} grain, ${n('ignore')} set aside`,
    ],
  };
}
