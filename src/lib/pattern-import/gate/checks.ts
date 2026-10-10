// G1–G13 + G15 (08-CONTRACT §5; G15 = F14b, Codex C1) + G16–G18 (A8 safety net). Each check is a pure function of the gate
// context and returns one (rarely two) GateCheck naming the blocks it failed.

import type { PieceDTO } from 'lib/nesting/types';
import type {
  ConversionManifest,
  DerivedEdge,
  DerivedEdgeAudit,
  DerivedEdgeKind,
  GateCheck,
  GateCheckId,
  GateExpectation,
  ManifestBlock,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  ReadManifestFn,
  RoundTrip,
} from '../types';
import { PATIMPORT } from '../types';
import { SPIKE_GATE_TURN_DEG, SPIKE_GATE_WIDTH_MM, findSpikes } from '../spikes';
import {
  SegmentIndex,
  applyAffine,
  areaOf,
  bboxOf,
  closestOnPolyline,
  dist,
  hullRatio,
  polylineLength,
  quantile,
  reflection,
  sampleAlong,
} from '../write/geom';
import { LAYERS } from '../write/manifest-build';
import {
  GRAIN_BARB_BACK_MM,
  GRAIN_BARB_SIDE_MM,
  GRAIN_SHAFT_MM,
  UNI_TOKEN,
  blockNameOf,
} from '../write/plan';
import { identityProblem } from '../manifest/identity';
import { foldShapeProblem } from '../semantics/fold';
import type { RawDxf, RawEntity } from './reader';
import { contourMm } from './roundtrip';
import type { CardBlockRules } from './rules';

export type BlockInfo = {
  block: string;
  mb: ManifestBlock;
  spec: PieceSpec | null;
  size: PieceSizeSpec | null;
};

export type GateCtx = {
  text: string;
  expect: GateExpectation;
  rules: CardBlockRules;
  read: ReadManifestFn;
  rt: RoundTrip | null;
  rtError: string | null;
  raw: RawDxf | null;
  rawError: string | null;
  m: ConversionManifest;
  sizeBare: Set<string>;
  isSize: (t: string) => boolean;
  specById: Map<string, PieceSpec>;
  blocks: BlockInfo[];
  /** Card-parser contours per block (mm, absolute) by layer. */
  contours: Map<string, Map<string, PtMm[]>>;
  rtByBlock: Map<string, PieceDTO[]>;
};

const ci = (s: string) => s.trim().toLowerCase();
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

function check(
  id: GateCheckId,
  failed: string[],
  severity: GateCheck['severity'],
  note: string,
  value: GateCheck['value'] = null,
  threshold: GateCheck['threshold'] = null,
): GateCheck {
  return {
    id,
    ok: failed.length === 0,
    severity,
    value,
    threshold,
    blocks: [...new Set(failed)].sort(),
    note,
  };
}

export function buildCtx(
  base: Omit<
    GateCtx,
    'sizeBare' | 'isSize' | 'specById' | 'blocks' | 'contours' | 'rtByBlock' | 'm'
  >,
): GateCtx {
  const { expect, rules, rt } = base;
  const sizeBare = new Set([...expect.sizeTokens].map((t) => rules.bareToken(t)));
  const isSize = (t: string) => sizeBare.has(rules.bareToken(t));
  const specById = new Map(expect.pieces.map((p) => [p.identity, p]));
  const m = expect.manifest;
  const blocks: BlockInfo[] = m.blocks.map((mb) => {
    const spec = specById.get(mb.identity) ?? null;
    let size: PieceSizeSpec | null = null;
    if (spec) {
      const sizes = spec.ungraded
        ? [...spec.sizes].sort((a, b) => a.rank - b.rank).slice(0, 1)
        : spec.sizes;
      size = sizes.find((s) => blockNameOf(spec, s) === mb.block) ?? null;
    }
    return { block: mb.block, mb, spec, size };
  });
  const contours = new Map<string, Map<string, PtMm[]>>();
  const rtByBlock = new Map<string, PieceDTO[]>();
  for (const p of rt?.pieces ?? []) {
    const b = p.blockName ?? '';
    const list = rtByBlock.get(b) ?? [];
    list.push(p);
    rtByBlock.set(b, list);
    const byLayer = contours.get(b) ?? new Map<string, PtMm[]>();
    if (p.layer && !byLayer.has(p.layer)) byLayer.set(p.layer, contourMm(p));
    contours.set(b, byLayer);
  }
  return { ...base, m, sizeBare, isSize, specById, blocks, contours, rtByBlock };
}

const rawOf = (ctx: GateCtx, block: string): RawEntity[] => ctx.raw?.blocks.get(block) ?? [];
const onLayer = (ents: RawEntity[], layer: string) => ents.filter((e) => e.layer === layer);
const rawCut = (ctx: GateCtx, block: string): PtMm[] | null =>
  onLayer(rawOf(ctx, block), LAYERS.cut).find(
    (e) => (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.closed,
  )?.pts ?? null;
const isDrill = (e: RawEntity) => {
  if (!e.closed || e.pts.length !== 4) return false;
  const b = bboxOf(e.pts);
  return Math.abs(b.maxX - b.minX - 10) <= 0.05 && Math.abs(b.maxY - b.minY - 10) <= 0.05;
};
const isPoly = (e: RawEntity) => e.type === 'LWPOLYLINE' || e.type === 'POLYLINE';

// ── G1 ─────────────────────────────────────────────────────────────────────────────────────

export function g1(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  if (!ctx.rt) {
    return check(
      'G1-roundtrip',
      ['*'],
      'block',
      `card parser threw: ${ctx.rtError}`,
      null,
      'exact',
    );
  }
  if (ctx.rt.failedFiles) notes.push(`failedFiles ${ctx.rt.failedFiles}`);
  if (ctx.rt.skippedBlocks) notes.push(`skippedBlocks ${ctx.rt.skippedBlocks}`);
  if (ctx.rt.failedFiles || ctx.rt.skippedBlocks) failed.push('*');
  const want = new Set(ctx.m.blocks.map((b) => ci(b.block)));
  const got = new Set(ctx.rt.blockNames.map(ci));
  const missing = ctx.m.blocks.filter((b) => !got.has(ci(b.block))).map((b) => b.block);
  const extra = ctx.rt.blockNames.filter((b) => !want.has(ci(b)));
  if (missing.length) notes.push(`not in file: ${missing.join(', ')}`);
  if (extra.length) notes.push(`not in manifest: ${extra.join(', ')}`);
  failed.push(...missing, ...extra);
  for (const { block, mb } of ctx.blocks) {
    const layers = ctx.contours.get(block);
    if (!layers?.has(LAYERS.cut)) {
      failed.push(block);
      notes.push(`${block}: no closed contour on layer 1`);
    }
    // K1 obligation 13: layers 14 and 1 always as a pair (no seam = the card adds allowance again).
    if (!mb.hasSeam) {
      failed.push(block);
      notes.push(`${block}: manifest has no seam line (layers 1+14 must be a pair)`);
    } else if (!layers?.has(LAYERS.seam)) {
      failed.push(block);
      notes.push(`${block}: no closed contour on layer 14`);
    }
  }
  if (ctx.rt.warnings.length) notes.push(`parser: ${ctx.rt.warnings.join(' | ')}`);
  return check(
    'G1-roundtrip',
    failed,
    'block',
    notes.join('; ') || 'parser reads every block with layers 1 and 14',
    ctx.rt.pieces.length,
    'exact',
  );
}

// ── G2 (unit probe, computed once per process by index.ts) ─────────────────────────────────

export function g2From(errMm: number | null, note: string): GateCheck {
  const ok = errMm != null && errMm <= PATIMPORT.squareTolMm;
  return {
    id: 'G2-square',
    ok,
    severity: 'block',
    value: errMm == null ? null : fmt(errMm, 4),
    threshold: PATIMPORT.squareTolMm,
    blocks: ok ? [] : ['SQ_UNI'],
    note,
  };
}

// ── G3 / G4 ────────────────────────────────────────────────────────────────────────────────

/** Which written line the walls describe: the drawn line (seam meaning → layer 14). */
function linesFor(ctx: GateCtx, b: BlockInfo): { line: PtMm[] | null; layer: string } {
  const layer = b.spec?.allowance.meaning === 'seam' ? LAYERS.seam : LAYERS.cut;
  return { line: ctx.contours.get(b.block)?.get(layer) ?? null, layer };
}

/**
 * G3/G4 measure the written line against SOURCE geometry only (F14b, Codex C1): `wallsByBlock`
 * holds drawn chains, never a bridge or band cut. `derivedOk` = the derived edges G15 passed, per
 * block: where the written line runs on one, G4 also measures against the tick THAT edge runs
 * along (`along`, IR — only a band cut G15 found carried keeps it), and what is still off every
 * drawn line there — the part G15 bounded — is left out of G4's distances and named in the note.
 * Nothing else is excused; G3 is untouched.
 */
export function g3g4(
  ctx: GateCtx,
  derivedOk: ReadonlyMap<string, readonly DerivedEdge[]> = new Map(),
): [GateCheck, GateCheck] {
  const snap = PATIMPORT.snapMm;
  const p95Max = ctx.expect.hausdorffP95Mm;
  const hard: string[] = [];
  const soft: string[] = [];
  const unverified: string[] = [];
  const hd: string[] = [];
  let worstCov = 1;
  let worstP95 = 0;
  let worstMax = 0;
  const notes3: string[] = [];
  const notes4: string[] = [];
  let excusedMm = 0;
  let excusedBlocks = 0;
  let spiked = 0;
  for (const b of ctx.blocks) {
    // a written ring that folds back on itself (a zero-width out-and-back spike) is a needle on
    // the line, whatever the walls say — checked on both written lines, walls or not
    // the RAW written rings (the card parser drops a collinear needle tip, the file keeps it)
    for (const lay of [LAYERS.cut, LAYERS.seam]) {
      const rings = onLayer(rawOf(ctx, b.block), lay)
        .filter((e) => (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.closed)
        .map((e) => e.pts);
      const parsed = ctx.contours.get(b.block)?.get(lay);
      if (parsed) rings.push(parsed);
      const sp = rings.flatMap((r) => findSpikes(r));
      if (!sp.length) continue;
      spiked++;
      if (!hd.includes(b.block)) hd.push(b.block);
      const s0 = sp[0];
      notes4.push(
        `${b.block}: ${sp.length} zero-width spike(s) on layer ${lay} (at ${s0.at.x.toFixed(1)}, ${s0.at.y.toFixed(1)}: turns ${s0.turnDeg.toFixed(1)}°, ${s0.widthMm.toFixed(3)} mm wide)`,
      );
    }
    const walls = ctx.expect.wallsByBlock[b.block];
    const used = ctx.expect.coverageWallsByBlock?.[b.block] ?? walls;
    const { line, layer } = linesFor(ctx, b);
    if (!walls?.length) {
      unverified.push(b.block);
      continue;
    }
    if (!line) {
      hard.push(b.block);
      if (!hd.includes(b.block)) hd.push(b.block);
      notes3.push(`${b.block}: no written line on layer ${layer}`);
      continue;
    }
    const lineIdx = new SegmentIndex([{ pts: line, closed: true }], 5);
    let total = 0;
    let near = 0;
    // Longest contiguous stretch of wall off the written line (M7): a skipped corner or bump is
    // one run, and on a long piece its share alone may stay above the threshold.
    let gapMm = 0;
    for (const w of used) {
      const s = sampleAlong(w, false, 0.5);
      let off: PtMm | null = null;
      let offLen = 0;
      let prev: PtMm | null = null;
      for (const p of s) {
        total++;
        const on = lineIdx.nearest(p, snap) <= snap;
        if (on) near++;
        if (!on) {
          if (off && prev) offLen += Math.hypot(p.x - prev.x, p.y - prev.y);
          else offLen = 0;
          off = p;
          gapMm = Math.max(gapMm, offLen);
        } else off = null;
        prev = p;
      }
    }
    const cov = total ? near / total : 0;
    worstCov = Math.min(worstCov, cov);
    const gap = gapMm >= PATIMPORT.coverageGapMm;
    if (cov < PATIMPORT.coverageBlock || gap) hard.push(b.block);
    else if (cov < PATIMPORT.coverageWarn) soft.push(b.block);
    if (cov < PATIMPORT.coverageWarn || gap)
      notes3.push(
        `${b.block}: ${(cov * 100).toFixed(1)} %${gap ? `, ${gapMm.toFixed(1)} mm of wall in one run off the line` : ''}`,
      );

    const wallIdx = new SegmentIndex(
      walls.map((w) => ({ pts: w, closed: false })),
      5,
    );
    // on a derived edge G15 passed, the written line is measured against the walls AND the drawn
    // tick THAT edge runs along (a carried band cut; IR both) — per edge, never another edge's;
    // what is still off them there is the bounded invention
    const ok = (derivedOk.get(b.block) ?? []).map((e) => ({
      on: new SegmentIndex([{ pts: e.pts, closed: false }], 5),
      tick: e.along?.length
        ? new SegmentIndex(
            e.along.map((w) => ({ pts: w, closed: false })),
            5,
          )
        : null,
    }));
    const d: number[] = [];
    let excused = 0;
    for (const p of sampleAlong(line, true, 0.5)) {
      let dw = wallIdx.nearest(p, 20);
      if (dw > snap) {
        const here = ok.filter((e) => e.on.nearest(p, snap) <= snap);
        if (here.length) {
          for (const e of here) if (e.tick) dw = Math.min(dw, e.tick.nearest(p, 20));
          if (dw > snap) {
            excused++;
            continue;
          }
        }
      }
      d.push(dw);
    }
    if (excused) {
      excusedMm += excused * 0.5;
      excusedBlocks++;
    }
    const p95 = quantile(d, 0.95);
    const mx = Math.max(...d);
    worstP95 = Math.max(worstP95, p95);
    worstMax = Math.max(worstMax, mx);
    if (!(p95 <= p95Max) || !(mx <= PATIMPORT.hausdorffMaxMm)) {
      if (!hd.includes(b.block)) hd.push(b.block);
      notes4.push(
        `${b.block}: p95 ${p95.toFixed(3)} max ${Number.isFinite(mx) ? mx.toFixed(3) : '∞'} mm`,
      );
    }
  }
  if (unverified.length) {
    notes3.push(`no source walls for ${unverified.length} block(s) — not verified`);
    notes4.push(`no source walls for ${unverified.length} block(s) — not verified`);
  }
  if (excusedMm)
    notes4.push(
      `≈ ${excusedMm.toFixed(1)} mm of written line in ${excusedBlocks} block(s) runs on derived edges G15 audited — not measured here`,
    );
  // Any hard miss blocks; soft misses and unverified blocks only warn.
  const c3 = check(
    'G3-coverage',
    [...hard, ...soft, ...unverified],
    hard.length ? 'block' : soft.length || unverified.length ? 'warn' : 'block',
    notes3.join('; ') || 'every wall is on the written line',
    fmt(worstCov, 4),
    `≥ ${PATIMPORT.coverageWarn} (block < ${PATIMPORT.coverageBlock} or a ${PATIMPORT.coverageGapMm} mm run off)`,
  );
  const c4 = check(
    'G4-hausdorff',
    unverified.length && !hd.length ? unverified : hd,
    hd.length ? 'block' : unverified.length ? 'warn' : 'block',
    notes4.join('; ') || `p95 ≤ ${p95Max} mm, max ≤ ${PATIMPORT.hausdorffMaxMm} mm`,
    `p95 ${fmt(worstP95)} / max ${fmt(worstMax)}${spiked ? ` / ${spiked} spiked line(s)` : ''}`,
    `p95 ≤ ${p95Max}; max ≤ ${PATIMPORT.hausdorffMaxMm}; no line folding back ≥ ${SPIKE_GATE_TURN_DEG}° within ${SPIKE_GATE_WIDTH_MM} mm`,
  );
  return [c3, c4];
}

// ── G15 (F14b, Codex C1) ───────────────────────────────────────────────────────────────────

/**
 * The most one derived edge may add OFF the drawing (its length farther than `snapMm` from every
 * wall and, for a band cut its tick carries, from that tick), mm, by kind:
 *   bridge          — the fill's own gap close: `FillOpts.autoBridgeMm` default 3 (pieces/bridges.ts);
 *   operator-bridge — the wizard's "close gap": 30 mm. The tool is for a junction the drawing leaves
 *                     open (a dash phase, a line stopping short: palto 4.7 mm); 30 mm is 10× the
 *                     automatic close and still well under any real piece edge — a longer gap is an
 *                     outline the source does not draw, which only a drawn line ("use a line") may
 *                     supply, never a straight chord the operator invents;
 *   band-cut        — a size tick carried across its band where it stops short (reef's L: 8.5 mm):
 *                     the same 30 mm bound.
 */
export const DERIVED_OFF_MAX_MM: Record<DerivedEdgeKind, number> = {
  bridge: 3,
  'operator-bridge': 30,
  'band-cut': 30,
};
/** An end lands when the edge comes within `snapMm` of one of the piece's walls this close to that
 * end, mm (operator bridges overshoot their landing by 0.6 mm, pieces/operator.ts). */
export const DERIVED_LAND_REACH_MM = 1;
/**
 * The TOTAL length one derived edge may have, whatever runs beside it (F14e, Codex R1: a 100 mm
 * "bridge" along an unrelated line 0.2 mm away was 0 mm off the drawing and passed). A bridge is a
 * chord the pipeline drew: its off-drawing bound plus `DERIVED_LAND_REACH_MM` at each end (corpus:
 * auto ≤ 2.80 mm, palto's operator bridge 5.9 mm with its 0.6 mm overshoots). Only a band cut may
 * be longer, and only when it is CARRIED: its own tick (or the piece's walls) runs along it in one
 * contiguous stretch of ≥ `PATIMPORT.derivedAlongMinShare` of its length — then up to the longest
 * tick a band ladder takes (`bandTicks`: 250 mm) plus the reach (reef's L: 95.25 mm, 91.1 % on
 * its tick). An uncarried band cut is bounded like an operator bridge. A band cut's walls count
 * toward its carrying stretch (one that lies on the piece's own line invents nothing); a bridge's
 * never do.
 */
export const DERIVED_LEN_MAX_MM: Record<DerivedEdgeKind, number> = {
  bridge: DERIVED_OFF_MAX_MM.bridge + 2 * DERIVED_LAND_REACH_MM,
  'operator-bridge': DERIVED_OFF_MAX_MM['operator-bridge'] + 2 * DERIVED_LAND_REACH_MM,
  'band-cut': DERIVED_OFF_MAX_MM['band-cut'] + 2 * DERIVED_LAND_REACH_MM,
};
export const DERIVED_CARRIED_LEN_MAX_MM = 250 + 2 * DERIVED_LAND_REACH_MM;
/**
 * Per block: at most this many derived edges; what they INVENT — a bridge's whole length, a band
 * cut's stretch off its walls and carrying tick — at most this share of the written line and this
 * many mm in all. The corpus (F4 fill, every sample) has at most 3 per candidate (reef) and invents
 * ≤ 8.5 mm per piece (reef's L band cut; three auto bridges 7.3 mm; palto's bridge 5.9 mm), ≤ 0.32 %
 * of the line: 2×, ~7× and ~15× headroom, while a piece can never be 1/20 invented.
 */
export const DERIVED_MAX_PER_BLOCK = 6;
export const DERIVED_MAX_SHARE = 0.05;
export const DERIVED_MAX_TOTAL_MM = 60;

const r1 = (v: number) => Math.round(v * 10) / 10;

export type DerivedVerdict = {
  check: GateCheck;
  /** Per block: the derived edges that passed (the whole block passed) — G4 may excuse them. */
  ok: Map<string, DerivedEdge[]>;
  audit: DerivedEdgeAudit[];
};

/**
 * G15: every derived edge is anchored and short. Both ends land on the block's walls (≤ `snapMm`
 * within `DERIVED_LAND_REACH_MM` of the end); its total length is ≤ `DERIVED_LEN_MAX_MM` of its
 * kind — a band cut up to `DERIVED_CARRIED_LEN_MAX_MM` only when carried (its walls + its OWN
 * `along`, never another edge's, run along it in one contiguous stretch of ≥
 * `PATIMPORT.derivedAlongMinShare`); the stretch off the drawing (farther than `snapMm` from the
 * walls and, for a carried band cut, its tick) is ≤ its kind's `DERIVED_OFF_MAX_MM`. Per block
 * ≤ `DERIVED_MAX_PER_BLOCK` edges, inventing (a bridge whole, a band cut off its support) ≤
 * `DERIVED_MAX_SHARE` of the written line and ≤ `DERIVED_MAX_TOTAL_MM`. A block whose edges cannot
 * be checked (no walls) fails. The edges of a block that passes are the audited list the manifest
 * carries; an uncarried band cut's `along` is dropped there, so G4 never measures against it.
 */
export function g15(ctx: GateCtx): DerivedVerdict {
  const snap = PATIMPORT.snapMm;
  const failed: string[] = [];
  const notes: string[] = [];
  const ok = new Map<string, DerivedEdge[]>();
  const audit: DerivedEdgeAudit[] = [];
  let edges = 0;
  let worstShare = 0;
  for (const b of ctx.blocks) {
    const list = ctx.expect.derivedByBlock?.[b.block] ?? [];
    if (!list.length) continue;
    edges += list.length;
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    const walls = ctx.expect.wallsByBlock[b.block];
    if (!walls?.length) {
      bad(`${list.length} derived edge(s) and no drawn walls to land them on`);
      continue;
    }
    // ends land on the piece's own walls; "off the drawing" = off the walls and, for a carried
    // band cut, off its own tick — IR lines, never derived ones, never another edge's support
    const open = (ls: PtMm[][]) => ls.map((w) => ({ pts: w, closed: false }));
    const wallIdx = new SegmentIndex(open(walls), 5);
    const before = failed.length;
    let invented = 0;
    const rows: DerivedEdgeAudit[] = [];
    const passed: DerivedEdge[] = [];
    for (const e of list) {
      const len = polylineLength(e.pts, false);
      const s = sampleAlong(e.pts, false, 0.25);
      const dw = s.map((p) => wallIdx.nearest(p, 5));
      const tick =
        e.kind === 'band-cut' && e.along?.length ? new SegmentIndex(open(e.along), 5) : null;
      const dt = tick ? s.map((p) => tick.nearest(p, 5)) : null;
      const on = (i: number) => dw[i] <= snap || (!!dt && dt[i] <= snap);
      // the longest contiguous stretch on walls ∪ this edge's own tick, and the arc
      let arc = 0;
      let run = 0;
      let carry = 0;
      const arcs: number[] = [0];
      for (let i = 1; i < s.length; i++) {
        const l = dist(s[i - 1], s[i]);
        arc += l;
        arcs.push(arc);
        run = on(i - 1) && on(i) ? run + l : 0;
        carry = Math.max(carry, run);
      }
      const carried = e.kind === 'band-cut' && carry >= PATIMPORT.derivedAlongMinShare * len;
      // off the drawing: off the walls, and off the tick only when the tick carries the edge
      let off = 0;
      for (let i = 1; i < s.length; i++) {
        const offAt = (k: number) => (dw[k] > snap && !(carried && !!dt && dt[k] <= snap) ? 1 : 0);
        off += (arcs[i] - arcs[i - 1]) * ((offAt(i - 1) + offAt(i)) / 2);
      }
      // nearest approach to a wall within reach of each end
      let landA = Infinity;
      let landB = Infinity;
      for (let i = 0; i < s.length; i++) {
        if (arcs[i] <= DERIVED_LAND_REACH_MM) landA = Math.min(landA, dw[i]);
        if (arc - arcs[i] <= DERIVED_LAND_REACH_MM) landB = Math.min(landB, dw[i]);
      }
      const lenMax = carried ? DERIVED_CARRIED_LEN_MAX_MM : DERIVED_LEN_MAX_MM[e.kind];
      const what = `${e.kind} ${len.toFixed(1)} mm`;
      if (!Number.isFinite(len) || !(len > 0) || s.some((p) => !Number.isFinite(p.x + p.y)))
        bad(`${what}: not a finite edge`);
      else if (!(landA <= snap) || !(landB <= snap))
        bad(
          `${what}: an end does not land on a drawn wall (${fmt(landA, 2) ?? '∞'} / ${fmt(landB, 2) ?? '∞'} mm)`,
        );
      else if (!(len <= lenMax))
        bad(
          `${what}: longer than ${lenMax} mm${
            e.kind === 'band-cut'
              ? ` (its tick runs along ${((carry / len) * 100).toFixed(1)} % of it in one stretch; carried needs ≥ ${PATIMPORT.derivedAlongMinShare * 100} %)`
              : ' — whatever runs beside it, a bridge is a chord the pipeline drew'
          }`,
        );
      else if (!(off <= DERIVED_OFF_MAX_MM[e.kind]))
        bad(`${what}: ${off.toFixed(1)} mm off the drawing (≤ ${DERIVED_OFF_MAX_MM[e.kind]} mm)`);
      const a = e.pts[0];
      const z = e.pts[e.pts.length - 1];
      // what the edge invents: a bridge whole (a chord, wherever it runs), a band cut off its support
      invented += e.kind === 'band-cut' ? off : len;
      rows.push({
        block: b.block,
        kind: e.kind,
        lengthMm: r1(len),
        offSourceMm: r1(off),
        a: [r1(a.x), r1(a.y)],
        b: [r1(z.x), r1(z.y)],
      });
      passed.push(carried && e.along ? e : { kind: e.kind, pts: e.pts });
    }
    if (list.length > DERIVED_MAX_PER_BLOCK)
      bad(`${list.length} derived edges (≤ ${DERIVED_MAX_PER_BLOCK})`);
    const { line } = linesFor(ctx, b);
    const per = line ? polylineLength(line, true) : NaN;
    const share = invented / per;
    if (Number.isFinite(share)) worstShare = Math.max(worstShare, share);
    if (!(share <= DERIVED_MAX_SHARE))
      bad(
        `derived edges invent ${invented.toFixed(1)} mm${line ? ` = ${(share * 100).toFixed(1)} % of the line` : ' and there is no written line'} (≤ ${DERIVED_MAX_SHARE * 100} %)`,
      );
    else if (!(invented <= DERIVED_MAX_TOTAL_MM))
      bad(`derived edges invent ${invented.toFixed(1)} mm in all (≤ ${DERIVED_MAX_TOTAL_MM} mm)`);
    if (failed.length === before) {
      ok.set(b.block, passed);
      audit.push(...rows);
    }
  }
  return {
    check: check(
      'G15-derived',
      failed,
      'block',
      notes.join('; ') ||
        (edges
          ? `${edges} derived edge(s) land on drawn walls and stay short — listed in the manifest`
          : 'no derived edges'),
      `${edges} edge(s) / ${fmt(worstShare * 100, 2)} %`,
      `ends ≤ ${snap} mm on a wall; length ≤ ${DERIVED_LEN_MAX_MM.bridge} (auto) / ${DERIVED_LEN_MAX_MM['operator-bridge']} (operator, band cut) mm, a band cut its tick carries (≥ ${PATIMPORT.derivedAlongMinShare * 100} % in one stretch) ≤ ${DERIVED_CARRIED_LEN_MAX_MM} mm; off the drawing ≤ ${DERIVED_OFF_MAX_MM.bridge} / ${DERIVED_OFF_MAX_MM['operator-bridge']} mm; ≤ ${DERIVED_MAX_PER_BLOCK} per block inventing ≤ ${DERIVED_MAX_SHARE * 100} % of the line and ≤ ${DERIVED_MAX_TOTAL_MM} mm`,
    ),
    ok,
    audit,
  };
}

// ── G5 ─────────────────────────────────────────────────────────────────────────────────────

export function g5(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const r12 = ctx.raw?.acadver === 'AC1009';
  if (!ctx.raw) return check('G5-features', ['*'], 'block', `own reader failed: ${ctx.rawError}`);
  for (const b of ctx.blocks) {
    const ents = rawOf(ctx, b.block);
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    const s = b.size;
    if (!s || !b.spec) {
      bad('no spec for this block');
      continue;
    }
    const cut = rawCut(ctx, b.block);
    // notches
    const notches = onLayer(ents, LAYERS.notch).filter((e) =>
      r12 ? e.type === 'POINT' : e.type === 'LINE',
    );
    if (notches.length !== s.notches.length)
      bad(`notches ${notches.length} ≠ source ${s.notches.length}`);
    if (b.mb.notches !== notches.length)
      bad(`manifest notches ${b.mb.notches} ≠ file ${notches.length}`);
    for (const n of notches) {
      if (cut) {
        const d = closestOnPolyline(n.pts[0], cut, true).d;
        if (d > PATIMPORT.snapMm) bad(`notch ${d.toFixed(2)} mm off the cut line`);
      }
      const depth = r12 ? n.z ?? 0 : n.pts.length === 2 ? dist(n.pts[0], n.pts[1]) : 0;
      if (!(depth > 0 && depth < 10)) bad(`notch depth ${depth.toFixed(2)} mm (must be < 1 cm)`);
    }
    // grain: exactly one L7 entity; R2000 = CLO 3-vertex arrow, R12 = 2-point LINE, 180 mm shaft
    const grains = onLayer(ents, LAYERS.grain);
    if (grains.length !== 1) bad(`${grains.length} grain entities on layer 7 (exactly 1)`);
    else {
      const g = grains[0];
      const shapeOk = r12
        ? g.type === 'LINE' && g.pts.length === 2
        : g.type === 'LWPOLYLINE' && !g.closed && g.pts.length === 3;
      if (!shapeOk)
        bad(
          `grain is ${g.type}/${g.pts.length} pts, not the ${r12 ? 'R12 LINE' : 'CLO 3-vertex arrow'}`,
        );
      else {
        const [p0, p1] = g.pts;
        if (Math.abs(dist(p0, p1) - GRAIN_SHAFT_MM) > 0.01)
          bad(`grain shaft ${dist(p0, p1).toFixed(2)} mm ≠ 180`);
        if (!r12) {
          const u = { x: (p1.x - p0.x) / GRAIN_SHAFT_MM, y: (p1.y - p0.y) / GRAIN_SHAFT_MM };
          const want = {
            x: p1.x - GRAIN_BARB_BACK_MM * u.x - GRAIN_BARB_SIDE_MM * u.y,
            y: p1.y - GRAIN_BARB_BACK_MM * u.y + GRAIN_BARB_SIDE_MM * u.x,
          };
          if (dist(want, g.pts[2]) > 0.01) bad('grain barb is not the CLO barb (P1 − 27u + 13.5n)');
        }
        if (s.grain) {
          const a0 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          const a1 = Math.atan2(s.grain.b.y - s.grain.a.y, s.grain.b.x - s.grain.a.x);
          let dd = Math.abs(a0 - a1) % (2 * Math.PI);
          if (dd > Math.PI) dd = 2 * Math.PI - dd;
          if ((dd * 180) / Math.PI > 0.5)
            bad(`grain direction off by ${((dd * 180) / Math.PI).toFixed(2)}°`);
        }
      }
    }
    if (!s.grain) bad('source has no grain (export blocked)');
    if (!b.mb.hasGrain) bad('manifest hasGrain = false');
    // drills / internal (layer 8)
    const l8 = onLayer(ents, LAYERS.internal).filter(isPoly);
    const drills = l8.filter(isDrill);
    const internal = l8.filter((e) => !isDrill(e));
    if (drills.length !== s.drills.length)
      bad(`drills ${drills.length} ≠ source ${s.drills.length}`);
    const wantInternal = s.internal.length + (s.fold ? 1 : 0);
    if (internal.length !== wantInternal)
      bad(`internal lines ${internal.length} ≠ source ${wantInternal}`);
    if (b.mb.drills !== drills.length || b.mb.internal !== internal.length)
      bad('manifest drill/internal counts ≠ file');
    // K1 obligation 14: no 2-point open line ≥ 1 cm off layer 7 — the card takes it for the grain
    for (const e of internal)
      if (!e.closed && e.pts.length === 2) bad('2-point open line on layer 8');
    const cand = (ctx.rtByBlock.get(b.block)?.[0]?.grain ?? []).filter(
      (g) => g.layer !== LAYERS.grain,
    );
    if (cand.length)
      bad(
        `card parser sees grain candidates on layer(s) ${[...new Set(cand.map((g) => g.layer))].join(',')}`,
      );
    // The card parser reads the grain itself since F15 (the CLO 3-vertex arrow in R2000, the
    // 2-point LINE in R12): exactly one candidate on the grain layer.
    const own = (ctx.rtByBlock.get(b.block)?.[0]?.grain ?? []).filter(
      (g) => g.layer === LAYERS.grain,
    );
    if (own.length !== 1)
      bad(`card parser sees ${own.length} grain candidates on layer ${LAYERS.grain}`);
    // What the CARD carries onto the marker: its layer-1 piece's inner geometry (4000-point
    // budget in pieces.ts) must still hold every notch and drill. R12 POINT notches are read since
    // F15 (K2 pitfall 2), so both dialects count.
    const l1 = ctx.rtByBlock.get(b.block)?.find((p) => p.layer === LAYERS.cut);
    if (l1) {
      const inner = l1.inner ?? [];
      const n4 = inner.filter((p) => p.layer === LAYERS.notch).length;
      const n8 = inner.filter((p) => p.layer === LAYERS.internal).length;
      if (n4 !== s.notches.length) bad(`card parser keeps ${n4} of ${s.notches.length} notches`);
      if (!r12 && n8 !== s.drills.length + wantInternal)
        bad(`card parser keeps ${n8} of ${s.drills.length + wantInternal} layer-8 paths`);
    }
  }
  return check(
    'G5-features',
    failed,
    'block',
    (notes.length ? notes.join('; ') + '; ' : '') +
      'grain verified by the gate reader + manifest, and read by the card parser (CLO arrow / R12 LINE, F15)',
    null,
    'exact',
  );
}

// ── G6 ─────────────────────────────────────────────────────────────────────────────────────

export const OFFSET_HULL_RATIO = 0.995;
/** The base line must be at least this concave for a convex derived line to be a collapse (see
 * semantics/offset.ts HULL_SOURCE_CONCAVE_MAX: notch bays on a near-rectangle fill legitimately). */
export const OFFSET_HULL_SOURCE_MAX = 0.99;
export const OFFSET_MAX_DEV_MM = 0.2;

export function g6(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  let worstDev = 0;
  // E1a (D3): a fold the sheet claims but nobody resolved blocks the whole file, not just the piece
  for (const q of ctx.expect.openFolds ?? []) {
    failed.push('*');
    notes.push(`fold question open — ${q}`);
  }
  for (const b of ctx.blocks) {
    const s = b.size;
    const spec = b.spec;
    if (!s || !spec) continue;
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    const cut = ctx.contours.get(b.block)?.get(LAYERS.cut) ?? null;
    const seam = ctx.contours.get(b.block)?.get(LAYERS.seam) ?? null;
    // owner decision 8 + "fold edge offset 0": fold pieces are exported unfolded; the fold line
    // then spans the piece from cut line to cut line.
    if (s.fold) {
      if (!spec.unfoldedFold) bad('fold piece not unfolded');
      else if (cut) {
        const da = closestOnPolyline(s.fold.a, cut, true).d;
        const db = closestOnPolyline(s.fold.b, cut, true).d;
        if (Math.max(da, db) > PATIMPORT.snapMm)
          bad(`fold line ends ${da.toFixed(2)}/${db.toFixed(2)} mm off the cut line`);
        // E1a: the written whole must be a believable unfold — symmetric about its fold line, simple,
        // no slot along the fold (a half mirrored across the wrong edge)
        const why = foldShapeProblem(cut, [s.fold.a, s.fold.b]);
        if (why) bad(`unfold: ${why}`);
      }
    } else if (spec.unfoldedFold) bad('marked unfolded but carries no fold line');
    const derived = s.offset != null || spec.allowance.meaning === 'seam';
    if (!derived) continue;
    const r = s.offset;
    if (!r) {
      bad('cut line derived from the seam line without an OffsetReport');
      continue;
    }
    if (!r.ok) bad(`offset not ok${r.reason ? ` (${r.reason})` : ''}`);
    if (r.loops !== 1) bad(`offset gave ${r.loops} loops`);
    if (r.selfIntersects) bad('offset self-intersects');
    if (r.maxDeviationMm > OFFSET_MAX_DEV_MM)
      bad(`offset deviation ${r.maxDeviationMm.toFixed(3)} mm (semantics report)`);
    if (!cut || !seam) {
      bad('cut/seam pair missing — offset not verifiable');
      continue;
    }
    // Hull collapse: the derived line is (nearly) convex while the line it came from is not.
    const baseLine = spec.allowance.meaning === 'seam' ? seam : cut;
    const derivedLine = spec.allowance.meaning === 'seam' ? cut : seam;
    const hrBase = hullRatio(baseLine);
    const hrDerived = hullRatio(derivedLine);
    if (
      hrBase < OFFSET_HULL_SOURCE_MAX &&
      (hrDerived >= OFFSET_HULL_RATIO || r.hullRatio >= OFFSET_HULL_RATIO)
    ) {
      bad(
        `offset collapsed to the convex hull (hull ratio ${hrDerived.toFixed(4)} vs source ${hrBase.toFixed(4)})`,
      );
    }
    // Independent parallel-curve check on the FILE: every point of the DERIVED line sits exactly
    // `allowance` from the line it came from. Upper bound only where the nearest foot is inside a
    // base edge — at base vertices the join style (round / miter / square) legitimately decides how
    // far the corner reaches; the lower bound holds everywhere (closer than the allowance = wrong).
    const allowance = spec.allowance.allowanceMm;
    const idx = new SegmentIndex([{ pts: baseLine, closed: true }], 5);
    let dev = 0;
    for (const p of sampleAlong(derivedLine, true, 1)) {
      const f = idx.nearestFoot(p, allowance * 3 + 5);
      const interior = f.t > 1e-6 && f.t < 1 - 1e-6;
      const e = interior ? Math.abs(f.d - allowance) : Math.max(0, allowance - f.d);
      dev = Math.max(dev, e);
    }
    worstDev = Math.max(worstDev, dev);
    if (dev > OFFSET_MAX_DEV_MM)
      bad(`derived line deviates ${dev.toFixed(3)} mm from a ${allowance} mm parallel`);
  }
  return check(
    'G6-offset',
    failed,
    'block',
    notes.join('; ') || 'derived lines are true parallel curves (1 loop, no hull collapse)',
    fmt(worstDev),
    `1 loop, no self-intersection, hull < ${OFFSET_HULL_RATIO}, dev ≤ ${OFFSET_MAX_DEV_MM} mm`,
  );
}

// ── G7 ─────────────────────────────────────────────────────────────────────────────────────

export function g7(ctx: GateCtx): GateCheck {
  const ov = ctx.expect.overview;
  if (!ov || !Object.keys(ov).length) {
    return check('G7-overview', [], 'warn', 'no overview sheet — not evaluated');
  }
  const failed: string[] = [];
  const notes: string[] = [];
  for (const [identity, box] of Object.entries(ov)) {
    const bs = ctx.blocks.filter((b) => b.mb.identity === identity);
    if (!bs.length) continue;
    const W = box.maxX - box.minX;
    const H = box.maxY - box.minY;
    let best = Infinity;
    let bestBlock = '';
    for (const b of bs) {
      const c = ctx.contours.get(b.block)?.get(LAYERS.cut);
      if (!c) continue;
      const bb = bboxOf(c);
      const e = Math.max(
        Math.abs(bb.maxX - bb.minX - W) -
          Math.max(PATIMPORT.overviewBboxTolMm, W * PATIMPORT.overviewBboxTolRatio),
        Math.abs(bb.maxY - bb.minY - H) -
          Math.max(PATIMPORT.overviewBboxTolMm, H * PATIMPORT.overviewBboxTolRatio),
      );
      if (e < best) {
        best = e;
        bestBlock = b.block;
      }
    }
    if (best > 0) {
      failed.push(...bs.map((b) => b.block));
      notes.push(
        `${identity}: closest size ${bestBlock} off by ${best.toFixed(2)} mm beyond tolerance`,
      );
    }
  }
  return check(
    'G7-overview',
    failed,
    'warn',
    notes.join('; ') || 'overview bbox matches',
    null,
    '±1 mm or ±1 %',
  );
}

// ── G8 ─────────────────────────────────────────────────────────────────────────────────────

export function g8(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  let worstSizes = 0;
  const rankOf = new Map(ctx.m.sizes.map((s) => [s.token, s.rank]));
  const byId = new Map<string, BlockInfo[]>();
  for (const b of ctx.blocks) {
    if (b.mb.sizeToken === UNI_TOKEN) continue;
    const list = byId.get(b.mb.identity) ?? [];
    list.push(b);
    byId.set(b.mb.identity, list);
  }
  for (const [identity, bs] of byId) {
    if (bs.length < 2) continue;
    const rows = bs
      .map((b) => {
        const c = ctx.contours.get(b.block)?.get(LAYERS.cut);
        return {
          b,
          rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
          area: c ? areaOf(c) : NaN,
        };
      })
      .sort((x, y) => x.rank - y.rank);
    for (let i = 1; i < rows.length; i++) {
      if (!(rows[i].area > rows[i - 1].area)) {
        failed.push(...rows.map((r) => r.b.block));
        notes.push(
          `${identity}: ${rows[i - 1].b.mb.sizeToken} ${(rows[i - 1].area / 100).toFixed(1)} cm² ≥ ${rows[i].b.mb.sizeToken} ${(rows[i].area / 100).toFixed(1)} cm²`,
        );
        worstSizes = Math.max(worstSizes, rows.length);
        break;
      }
    }
  }
  return check(
    'G8-monotone',
    failed,
    worstSizes > 2 ? 'block' : failed.length ? 'warn' : 'block',
    notes.join('; ') || 'area grows with size rank for every identity',
    null,
    'strictly increasing (block when > 2 sizes)',
  );
}

// ── G9 ─────────────────────────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** JSON-normalised (drops `undefined`, the way the embedding does). */
export const sameManifest = (a: unknown, b: unknown) =>
  deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

export function g9(ctx: GateCtx): GateCheck[] {
  const failed: string[] = [];
  const silent: string[] = [];
  const notes: string[] = [];
  const names = ctx.rt?.blockNames ?? ctx.m.blocks.map((b) => b.block);
  const derived = ctx.rules.deriveBlockSizes(names, (t) => ctx.sizeBare.has(t));
  const bare = ctx.rules.bareToken;
  for (const b of ctx.blocks) {
    const d = derived.get(b.block);
    if (b.mb.sizeToken === UNI_TOKEN) {
      if (d !== undefined) {
        failed.push(b.block);
        notes.push(`${b.block}: card derives size ${d} for a UNI block`);
      }
      continue;
    }
    if (d === undefined) {
      silent.push(b.block);
      continue;
    }
    if (bare(d) !== bare(b.mb.sizeToken)) {
      failed.push(b.block);
      notes.push(`${b.block}: card derives ${d}, manifest says ${b.mb.sizeToken}`);
    } else if (ci(b.block.slice(0, b.block.length - d.length - 1)) !== ci(b.mb.identity)) {
      failed.push(b.block);
      notes.push(`${b.block}: card identity ≠ manifest ${b.mb.identity}`);
    }
  }
  try {
    const got = ctx.read(ctx.text);
    if (!got) {
      failed.push('*');
      notes.push('no manifest embedded');
    } else if (!sameManifest(got, ctx.m)) {
      failed.push('*');
      notes.push('embedded manifest ≠ expected manifest');
    }
  } catch (e) {
    failed.push('*');
    notes.push(`manifest unreadable: ${e instanceof Error ? e.message : e}`);
  }
  const out: GateCheck[] = [
    check(
      'G9-sizes',
      failed,
      'block',
      notes.join('; ') || 'card size derivation and embedded manifest agree',
      derived.size,
      'exact',
    ),
  ];
  if (silent.length) {
    out.push(
      check(
        'G9-sizes',
        silent,
        'warn',
        `without the manifest the card derives no size for ${silent.length} block(s) (single-size file or rare size, Codex C2) — the card relies on the manifest path (F6b) for them`,
        silent.length,
        null,
      ),
    );
  }
  return out;
}

// ── G10 ────────────────────────────────────────────────────────────────────────────────────

export function g10(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const has = { has: (t: string) => ctx.sizeBare.has(t) };
  const uni: { raw: string; uniBase: string }[] = [];
  const graded = new Set<string>();
  for (const b of ctx.blocks) {
    const code = ctx.rules.splitBlockSize(b.block, has);
    const declared = b.mb.sizeToken === UNI_TOKEN;
    if (code.uni !== declared) {
      failed.push(b.block);
      notes.push(
        `${b.block}: ${declared ? 'ungraded piece' : 'graded block'} but the card reads uni=${code.uni}`,
      );
    }
    if (code.uni) uni.push({ raw: b.block, uniBase: code.uniBase });
    else graded.add(ci(b.mb.identity));
  }
  const groups = ctx.rules.uniGroupsOf(uni);
  const conflicts = [
    ...ctx.rules.uniDuplicateConflicts(groups),
    ...ctx.rules.uniGradedConflicts(groups, graded),
  ];
  for (const c of conflicts) {
    failed.push(...c.blocks);
    notes.push(`${c.kind}: ${c.subject} (${c.blocks.join(', ')})`);
  }
  return check(
    'G10-uni',
    failed,
    'block',
    notes.join('; ') || 'no UNI conflicts',
    conflicts.length,
    0,
  );
}

// ── G11 ────────────────────────────────────────────────────────────────────────────────────

export function g11(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const seenBlocks = new Map<string, string>();
  const seenIds = new Map<string, string>();
  for (const p of ctx.m.pieces) {
    const k = ci(p.identity);
    if (seenIds.has(k)) {
      failed.push(p.identity);
      notes.push(`identity ${p.identity} not unique`);
    }
    seenIds.set(k, p.identity);
    // Grammar + "last token is not a size of the run" with the ONE exemption, the declared hand
    // of a pair (owner decision 9) — the same function the wizard's code cell runs
    // (manifest/identity.ts). G9 proves the card still splits FP_L_L right.
    const problem = identityProblem(p.identity, {
      isSizeToken: ctx.isSize,
      pair: { hand: p.pairHand, of: p.pairOf },
      isKnownCode: ctx.rules.isKnownCode,
    });
    if (problem) {
      failed.push(p.identity);
      notes.push(`${p.identity}: ${problem}`);
    }
    if ([p.code, ...p.mods].join('_') !== p.identity) {
      failed.push(p.identity);
      notes.push(`${p.identity}: ≠ code+mods ${[p.code, ...p.mods].join('_')}`);
    }
  }
  for (const b of ctx.m.blocks) {
    const want = `${b.identity}_${b.sizeToken}`;
    if (b.block !== want) {
      failed.push(b.block);
      notes.push(`${b.block}: not IDENTITY_SIZE (${want})`);
    }
    if (b.sizeToken !== UNI_TOKEN && !ctx.isSize(b.sizeToken)) {
      failed.push(b.block);
      notes.push(`${b.block}: size ${b.sizeToken} not in the card's run`);
    }
    if (/[^\x20-\x7e]/.test(b.block)) {
      failed.push(b.block);
      notes.push(`${b.block}: non-ASCII`);
    }
    const k = ci(b.block);
    if (seenBlocks.has(k)) {
      failed.push(b.block);
      notes.push(`block ${b.block} not unique`);
    }
    seenBlocks.set(k, b.block);
  }
  return check(
    'G11-grammar',
    failed,
    'block',
    notes.join('; ') || 'every block is IDENTITY_SIZE with a valid identity',
  );
}

// ── G12 ────────────────────────────────────────────────────────────────────────────────────

function grainOf(ctx: GateCtx, block: string): [PtMm, PtMm] | null {
  const g = onLayer(rawOf(ctx, block), LAYERS.grain)[0];
  return g && g.pts.length >= 2 ? [g.pts[0], g.pts[1]] : null;
}

export function g12(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  const pieces = new Map(ctx.m.pieces.map((p) => [p.identity, p]));
  let worstArea = 0;
  let worstBox = 0;
  let worstHd = 0;
  for (const L of ctx.m.pieces) {
    if (!L.pairHand) continue;
    const R = L.pairOf ? pieces.get(L.pairOf) : undefined;
    if (!R) {
      failed.push(L.identity);
      notes.push(`${L.identity}: pair sibling ${L.pairOf ?? '∅'} not in this file`);
      continue;
    }
    if (R.pairOf !== L.identity || R.pairHand === L.pairHand || !R.pairHand) {
      failed.push(L.identity, R.identity);
      notes.push(`${L.identity}/${R.identity}: pairOf/pairHand not reciprocal`);
      continue;
    }
    if (L.pairHand !== 'L') continue; // each pair once, from the left hand
    const lb = ctx.m.blocks.filter((b) => b.identity === L.identity);
    const rb = new Map(
      ctx.m.blocks.filter((b) => b.identity === R.identity).map((b) => [b.sizeToken, b]),
    );
    if (lb.length !== rb.size) {
      failed.push(L.identity, R.identity);
      notes.push(`${L.identity}/${R.identity}: size sets differ`);
    }
    for (const l of lb) {
      const r = rb.get(l.sizeToken);
      if (!r) continue;
      const lc = rawCut(ctx, l.block);
      const rc = rawCut(ctx, r.block);
      const bad = (why: string) => {
        failed.push(l.block, r.block);
        notes.push(`${l.block}/${r.block}: ${why}`);
      };
      if (!lc || !rc) {
        bad('cut line missing');
        continue;
      }
      // F14b (Codex C2): a zero / non-finite area made the ratio NaN, and NaN passed every `>`.
      const la = areaOf(lc);
      const ra = areaOf(rc);
      if (!(Number.isFinite(la) && la > 0 && Number.isFinite(ra) && ra > 0)) {
        bad(`cut area not a positive number (${fmt(la, 1)} / ${fmt(ra, 1)} mm²)`);
        continue;
      }
      const dA = Math.abs(la - ra) / Math.max(la, ra);
      worstArea = Math.max(worstArea, dA);
      if (!(dA <= PATIMPORT.pairAreaTol)) bad(`area differs ${(dA * 100).toFixed(3)} %`);
      if (l.notches !== r.notches) bad(`notches ${l.notches} ≠ ${r.notches}`);
      const lg = grainOf(ctx, l.block);
      const rg = grainOf(ctx, r.block);
      if (!lg || !rg || !(dist(lg[0], lg[1]) > 0) || !(dist(rg[0], rg[1]) > 0)) {
        // the mirror axis IS the grain (semantics/pairs.ts mirrorSizeAcrossGrain): without it the
        // mirror cannot be checked — G5 blocks a missing grain too
        bad('no grain axis — the mirror cannot be verified');
        continue;
      }
      // The writer's own transform (semantics/pairs.ts): `_R` = `_L` reflected across `_L`'s grain;
      // layout then translates the hands apart, so align the grain tails.
      const T = reflection(lg[0], lg[1]);
      const dx = rg[0].x - lg[0].x;
      const dy = rg[0].y - lg[0].y;
      const M = lc.map((p) => {
        const q = applyAffine(T, p);
        return { x: q.x + dx, y: q.y + dy };
      });
      const bm = bboxOf(M);
      const br = bboxOf(rc);
      const box = Math.max(
        Math.abs(bm.minX - br.minX),
        Math.abs(bm.minY - br.minY),
        Math.abs(bm.maxX - br.maxX),
        Math.abs(bm.maxY - br.maxY),
      );
      const ang = (g: [PtMm, PtMm]) => Math.atan2(g[1].y - g[0].y, g[1].x - g[0].x);
      let dd = Math.abs(ang(lg) - ang(rg)) % (2 * Math.PI);
      if (dd > Math.PI) dd = 2 * Math.PI - dd;
      if (!((dd * 180) / Math.PI <= 0.5)) bad('grain directions differ');
      worstBox = Math.max(worstBox, box);
      if (!(box <= PATIMPORT.pairBboxTolMm))
        bad(`R is not the mirror of L across the grain (bbox off ${box.toFixed(3)} mm)`);
      // The whole outline, not just its box (F14b, Codex C2): symmetric Hausdorff of mirrored L vs
      // R, both ways, sampled every 0.5 mm — an R with L's area and box but another shape fails.
      const h = pairHausdorff(M, rc);
      worstHd = Math.max(worstHd, Number.isFinite(h) ? h : Infinity);
      if (!(h <= PATIMPORT.pairHausdorffMm))
        bad(
          `R's outline is ${Number.isFinite(h) ? h.toFixed(3) : '∞'} mm off the mirror of L (≤ ${PATIMPORT.pairHausdorffMm})`,
        );
    }
  }
  return check(
    'G12-pair',
    failed,
    'block',
    notes.join('; ') || 'every _R is the mirror of its _L',
    `area ${fmt(worstArea * 100, 4)} % / bbox ${fmt(worstBox)} mm / outline ${fmt(worstHd)} mm`,
    `area ±${PATIMPORT.pairAreaTol * 100} %, bbox ±${PATIMPORT.pairBboxTolMm} mm, outline ≤ ${PATIMPORT.pairHausdorffMm} mm`,
  );
}

/** Symmetric Hausdorff distance of two closed lines, sampled every 0.5 mm (Infinity if far). */
function pairHausdorff(a: readonly PtMm[], b: readonly PtMm[]): number {
  const reach = 20;
  let h = 0;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const idx = new SegmentIndex([{ pts: y, closed: true }], 5);
    for (const p of sampleAlong(x, true, 0.5)) {
      h = Math.max(h, idx.nearest(p, reach));
      if (!(h <= reach)) return Infinity;
    }
  }
  return h;
}

// ── G13 ────────────────────────────────────────────────────────────────────────────────────

export function g13(m: ConversionManifest, requireGate: boolean): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  if (m.cutLayerIsFinal !== true) notes.push('cutLayerIsFinal is not true');
  if (m.units !== 'mm') notes.push(`units ${m.units}`);
  if (JSON.stringify(m.layers) !== JSON.stringify(LAYERS))
    notes.push('layer map differs from 1/14/7/4/8');
  for (const s of m.sizes) {
    if (!(s.sizeId > 0)) {
      failed.push(s.token);
      notes.push(`size ${s.token} has no card sizeId`);
    }
  }
  const ids = new Set(m.pieces.map((p) => p.identity));
  for (const p of m.pieces) {
    if (!p.fabrics.length) {
      failed.push(p.identity);
      notes.push(`${p.identity}: no fabric`);
    }
  }
  for (const b of m.blocks) {
    if (!ids.has(b.identity)) {
      failed.push(b.block);
      notes.push(`${b.block}: identity ${b.identity} not in pieces`);
    }
    if (!(b.sizeId > 0)) {
      failed.push(b.block);
      notes.push(`${b.block}: no card sizeId`);
    }
  }
  if (requireGate && !m.gate) notes.push('gate report not embedded');
  if (notes.length && !failed.length) failed.push('*');
  return check('G13-manifest', failed, 'block', notes.join('; ') || 'manifest invariants hold');
}

// ── G16 / G18 (A8 safety net) ────────────────────────────────────────────────────────
//
// The owner's wm M import (10.10) passed a DXF whose pieces carried the watermark WWW.PAFAVE.PL
// and stroke-font labels as ~300 layer-8 polylines per block, with grainlines taken from letter
// strokes. The real fix cleans the input sheet (stage A8 `clean`); these checks only refuse to
// vouch for such a file (D3: what the drawing does not prove, we ask).

/** One layer-8 item as the gate counts it (drill squares excluded). */
export type InternalStroke = { pts: PtMm[]; closed: boolean; lengthMm: number; cell: string };

export type GlyphStats = {
  strokes: InternalStroke[];
  short: InternalStroke[];
  /** Short strokes per 60 mm cell (absolute grid, by the stroke's first point). */
  cells: Map<string, number>;
  densest: { cell: string; n: number; at: PtMm } | null;
  lengthMm: number;
};

const cellKey = (p: PtMm) =>
  `${Math.floor(p.x / PATIMPORT.glyphCellMm)},${Math.floor(p.y / PATIMPORT.glyphCellMm)}`;

/** Layer-8 strokes of one block, short ones (< `glyphShortMm`) and their densest cell. */
export function glyphStats(ents: readonly RawEntity[]): GlyphStats {
  const strokes: InternalStroke[] = [];
  for (const e of ents) {
    if (e.layer !== LAYERS.internal || e.pts.length < 2) continue;
    if (!(isPoly(e) || e.type === 'LINE') || isDrill(e)) continue;
    strokes.push({
      pts: e.pts,
      closed: e.closed,
      lengthMm: polylineLength(e.pts, e.closed),
      cell: cellKey(e.pts[0]),
    });
  }
  const short = undashed(strokes.filter((s) => s.lengthMm < PATIMPORT.glyphShortMm));
  const cells = new Map<string, number>();
  for (const s of short) cells.set(s.cell, (cells.get(s.cell) ?? 0) + 1);
  let densest: GlyphStats['densest'] = null;
  for (const [cell, n] of cells) {
    if (densest && n <= densest.n) continue;
    const [i, j] = cell.split(',').map(Number);
    densest = {
      cell,
      n,
      at: { x: (i + 0.5) * PATIMPORT.glyphCellMm, y: (j + 0.5) * PATIMPORT.glyphCellMm },
    };
  }
  return { strokes, short, cells, densest, lengthMm: strokes.reduce((a, s) => a + s.lengthMm, 0) };
}

/**
 * Codex (G16 review): a dashed construction line (pocket placement, pleat, fold guide) drawn as
 * separate dashes is many short strokes too. A dash belongs to a run of straight strokes on one
 * line (direction ±3°, offset ≤ 0.5 mm) with lengths within ±30 % and gaps ≤ 3 × the dash — even
 * spacing lettering does not have (≥ 4 dashes, gaps within ±35 % of their median); those runs are
 * not counted as lettering.
 */
function undashed(short: InternalStroke[]): InternalStroke[] {
  if (short.length > 2000) return short;
  type Seg = { a: PtMm; ux: number; uy: number; len: number; t0: number; t1: number };
  const segs: (Seg | null)[] = short.map((s) => {
    const a = s.pts[0];
    const b = s.pts[s.pts.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // straight only: the chord carries the stroke's length
    if (s.closed || !(len > 0.5) || len < 0.97 * s.lengthMm) return null;
    return { a, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, len, t0: 0, t1: len };
  });
  const dash = new Set<number>();
  const cosTol = Math.cos((3 * Math.PI) / 180);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s || dash.has(i)) continue;
    // members on s's line, as intervals along it
    const run: { i: number; t0: number; t1: number }[] = [{ i, t0: 0, t1: s.len }];
    for (let j = 0; j < segs.length; j++) {
      const o = segs[j];
      if (!o || j === i) continue;
      if (Math.abs(s.ux * o.ux + s.uy * o.uy) < cosTol) continue;
      if (Math.abs(o.len / s.len - 1) > 0.3) continue;
      const dx = o.a.x - s.a.x;
      const dy = o.a.y - s.a.y;
      if (Math.abs(dx * -s.uy + dy * s.ux) > 0.5) continue;
      const ta = dx * s.ux + dy * s.uy;
      const tb = ta + o.len * (s.ux * o.ux + s.uy * o.uy);
      run.push({ i: j, t0: Math.min(ta, tb), t1: Math.max(ta, tb) });
    }
    if (run.length < 3) continue;
    run.sort((x, y) => x.t0 - y.t0);
    // keep the longest stretch whose gaps stay ≤ 3 × the dash
    let best: typeof run = [];
    let cur: typeof run = [run[0]];
    for (let k = 1; k < run.length; k++) {
      const gap = run[k].t0 - cur[cur.length - 1].t1;
      if (gap >= -0.5 && gap <= 3 * s.len) cur.push(run[k]);
      else {
        if (cur.length > best.length) best = cur;
        cur = [run[k]];
      }
    }
    if (cur.length > best.length) best = cur;
    if (best.length < 4) continue;
    // a dash pattern repeats: the gaps agree (lettering baselines do not)
    const gaps = best.slice(1).map((m, k) => m.t0 - best[k].t1);
    const sorted = [...gaps].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (sorted[sorted.length - 1] - sorted[0] > 0.35 * Math.max(med, 0) + 0.5) continue;
    for (const m of best) dash.add(m.i);
  }
  return dash.size ? short.filter((_, k) => !dash.has(k)) : short;
}

/** G16's verdict on one block's strokes: null = fine, else the reason (no block prefix). */
export function glyphProblem(st: GlyphStats): string | null {
  const nShort = st.short.length;
  const d = st.densest;
  const tooMany = nShort >= PATIMPORT.glyphMaxShortPerBlock;
  const tooDense = !!d && d.n >= PATIMPORT.glyphMaxShortPerCell;
  if (!tooMany && !tooDense) return null;
  return `${nShort} short strokes (< ${PATIMPORT.glyphShortMm} mm) inside, densest ${PATIMPORT.glyphCellMm} mm cell ${d?.n ?? 0} around (${d ? `${d.at.x.toFixed(0)}, ${d.at.y.toFixed(0)}` : '—'})`;
}

const glyphCache = new WeakMap<GateCtx, Map<string, GlyphStats>>();
function glyphsOf(ctx: GateCtx, block: string): GlyphStats {
  let m = glyphCache.get(ctx);
  if (!m) glyphCache.set(ctx, (m = new Map()));
  let st = m.get(block);
  if (!st) m.set(block, (st = glyphStats(rawOf(ctx, block))));
  return st;
}

const GLYPH_WHY =
  'lines inside the piece look like lettering or a watermark — the drawing has junk inside the piece';

export function g16(ctx: GateCtx): GateCheck {
  if (!ctx.raw) return check('G16-glyphs', ['*'], 'block', `own reader failed: ${ctx.rawError}`);
  const failed: string[] = [];
  const notes: string[] = [];
  let worstShort = 0;
  let worstCell = 0;
  for (const { block } of ctx.blocks) {
    const st = glyphsOf(ctx, block);
    worstShort = Math.max(worstShort, st.short.length);
    worstCell = Math.max(worstCell, st.densest?.n ?? 0);
    const why = glyphProblem(st);
    if (!why) continue;
    failed.push(block);
    notes.push(`${block}: ${why}`);
  }
  return check(
    'G16-glyphs',
    failed,
    'block',
    failed.length
      ? [GLYPH_WHY, ...notes].join('; ')
      : 'no lettering-like strokes inside the pieces',
    `${worstShort} short / ${worstCell} per cell`,
    `< ${PATIMPORT.glyphMaxShortPerBlock} short per block, < ${PATIMPORT.glyphMaxShortPerCell} per ${PATIMPORT.glyphCellMm} mm cell`,
  );
}

/** Distance from `p` to segment a–b. */
function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function g18(ctx: GateCtx): GateCheck {
  const near = PATIMPORT.grainStrokeNearMm;
  const dense = PATIMPORT.glyphMaxShortPerCell;
  const hard: string[] = [];
  const soft: string[] = [];
  const notes: string[] = [];
  for (const b of ctx.blocks) {
    const g = b.size?.grain;
    if (!g || g.origin === 'operator') continue; // two clicks are the operator's word
    const st = glyphsOf(ctx, b.block);
    if (!st.short.length) continue;
    const ev = g.evidence?.length ? g.evidence.join('+') : 'unrecorded';
    // the end's own cell, and the cells of the short strokes it touches (its "arrowheads")
    let lettered: { at: PtMm; n: number } | null = null;
    for (const end of [g.a, g.b]) {
      const heads = st.short.filter((s) => closestOnPolyline(end, s.pts, s.closed).d <= near);
      for (const c of [cellKey(end), ...heads.map((s) => s.cell)]) {
        const n = st.cells.get(c) ?? 0;
        if (n >= dense && (!lettered || n > lettered.n)) lettered = { at: end, n };
      }
    }
    if (lettered) {
      hard.push(b.block);
      notes.push(
        `${b.block}: the grainline (${g.origin}, ${ev}) ends among ${lettered.n} short strokes at (${lettered.at.x.toFixed(0)}, ${lettered.at.y.toFixed(0)}) — it was read from lettering; draw it in details`,
      );
      continue;
    }
    // a grain the source DXF draws on its own grain layer is its author's word: only lettering
    // around its ends speaks against it (CLO's notch-side marks sit beside the grain)
    if (g.evidence?.includes('dxf-layer')) continue;
    const touching = st.short.filter((s) => s.pts.some((p) => segDist(p, g.a, g.b) <= near));
    if (touching.length) {
      soft.push(b.block);
      notes.push(
        `${b.block}: the grainline (${g.origin}, ${ev}) touches ${touching.length} short stroke(s) inside the piece`,
      );
    }
  }
  return check(
    'G18-grain-source',
    [...hard, ...soft],
    hard.length ? 'block' : 'warn',
    notes.join('; ') || 'no found grainline stands on lettering',
    hard.length ? `${hard.length} from lettering` : soft.length ? `${soft.length} touching` : 0,
    `ends not in a ${PATIMPORT.glyphCellMm} mm cell of ≥ ${dense} short strokes; ≥ ${near} mm from short strokes`,
  );
}
