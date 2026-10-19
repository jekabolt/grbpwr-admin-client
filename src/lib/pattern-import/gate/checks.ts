// G1–G13 + G15 (08-CONTRACT §5; G15 = F14b, Codex C1) + G16–G18 (A8 safety net). Each check is a pure function of the gate
// context and returns one (rarely two) GateCheck naming the blocks it failed.

import type { PieceDTO } from 'lib/nesting/types';
import type {
  ChromeLine,
  ConversionManifest,
  DerivedEdge,
  DerivedEdgeAudit,
  DerivedEdgeKind,
  GateCheck,
  GateCheckId,
  GateExpectation,
  IdentityGeometry,
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
import { LAYERS, continuityOfBlock } from '../write/manifest-build';
import {
  GRAIN_BARB_BACK_MM,
  GRAIN_BARB_SIDE_MM,
  GRAIN_SHAFT_MM,
  UNI_TOKEN,
  blockNameOf,
} from '../write/plan';
import { identityProblem } from '../manifest/identity';
import { f0Off } from '../pieces/identity';
import { SIZE_RUN, sizeRunProblems } from '../pieces/gfit/silent';
import { foldShapeProblem } from '../semantics/fold';
import { GRAIN_INSIDE_TOL_MM, grainOutsideMm, pointOnRings } from '../semantics/grain-inside';
import { MITER_LIMIT, parallelDeviation } from '../semantics/offset';
import { glyphCellKey, undashed } from '../semantics/glyphs';
import { CHROME_GATE, ChromeIndex, hairpins, onChrome } from './chrome';
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
  const ppgOf = new Map(ctx.m.pieces.map((p) => [ci(p.identity), p.piecesPerGarment]));
  for (const { block, mb } of ctx.blocks) {
    const layers = ctx.contours.get(block);
    if (!layers?.has(LAYERS.cut)) {
      failed.push(block);
      notes.push(`${block}: no closed contour on layer 1`);
    }
    // W1: the card counts a piece by its cut-layer contours (one per instance). One INSERT per block
    // + the AAMA `QUANTITY:` label must read back as exactly × per garment — not 1, not N×N.
    const ppg = Math.max(1, Math.floor(ppgOf.get(ci(mb.identity)) ?? 1));
    const read = (ctx.rtByBlock.get(block) ?? []).filter((p) => p.layer === LAYERS.cut).length;
    if (layers?.has(LAYERS.cut) && read !== ppg) {
      failed.push(block);
      notes.push(`${block}: the card reads ×${read}, the piece is cut ×${ppg} per garment`);
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
    // GRADE P1: a notch drawn as the outline is crossed by its chord — the bump's walls are the
    // notch (layer 4), not the line: G3 does not count them, G4 does not hold the chord to them
    const nch = ctx.expect.notchChordsByBlock?.[b.block] ?? [];
    const bumpIdx = nch.length
      ? new SegmentIndex(
          nch.map((c) => ({ pts: c.bump, closed: false })),
          5,
        )
      : null;
    const chordIdx = nch.length
      ? new SegmentIndex(
          nch.map((c) => ({ pts: [...c.chord], closed: false })),
          5,
        )
      : null;
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
        const on0 = lineIdx.nearest(p, snap) <= snap;
        if (!on0 && bumpIdx && bumpIdx.nearest(p, snap) <= snap) {
          off = null;
          prev = p;
          continue;
        }
        total++;
        const on = on0;
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
      if (dw > snap && chordIdx && chordIdx.nearest(p, snap) <= snap) {
        excused++;
        continue;
      }
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
 *                     the same 30 mm bound;
 *   grade-fill      — GRADE P2: a hole in a repaired size's own line filled from the grade model of its
 *                     two neighbouring anchors (E2: ≤ 15 mm, both ends ends of its own line).
 */
export const DERIVED_OFF_MAX_MM: Record<DerivedEdgeKind, number> = {
  bridge: 3,
  'operator-bridge': 30,
  'band-cut': 30,
  'grade-fill': 15,
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
  'grade-fill': DERIVED_OFF_MAX_MM['grade-fill'] + 2 * DERIVED_LAND_REACH_MM,
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

/** W3: AAMA layers the R12 writer adds (write/r12.ts). */
const AAMA_MIRROR_LAYER = '6';
const AAMA_DRILL_LAYER = '13';

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
    // notches: one LINE from the cut line inward in both dialects (W3: AAMA layer 4 slit notch)
    const notches = onLayer(ents, LAYERS.notch).filter((e) => e.type === 'LINE');
    if (onLayer(ents, LAYERS.notch).length !== notches.length)
      bad('layer 4 carries something other than notch LINEs');
    if (notches.length !== s.notches.length)
      bad(`notches ${notches.length} ≠ source ${s.notches.length}`);
    if (b.mb.notches !== notches.length)
      bad(`manifest notches ${b.mb.notches} ≠ file ${notches.length}`);
    for (const n of notches) {
      if (cut) {
        const d = closestOnPolyline(n.pts[0], cut, true).d;
        if (d > PATIMPORT.snapMm) bad(`notch ${d.toFixed(2)} mm off the cut line`);
      }
      const depth = n.pts.length === 2 ? dist(n.pts[0], n.pts[1]) : 0;
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
        // GRAIN lane: the written arrow is centred on the piece (its 180 mm shaft may outrun a
        // short piece by design; its middle may not leave it)
        if (cut && cut.length >= 3) {
          const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          if (!pointOnRings(mid, [cut])) bad('the grain arrow is centred outside the cut line');
        }
      }
    }
    if (!s.grain) bad('source has no grain (export blocked)');
    // GRAIN lane: the grainline lies on its piece — one measured on another size's outline, on an
    // unfolded half's mirror image, or clicked beside the piece would lay the marker by a line the
    // piece does not have. A source DXF's own grain arrow (its layer, its author) is a fixed-length
    // marker that may outrun a short piece (CLO's 180 mm shaft on a 116 mm collar): its middle only.
    else if (s.cut.length >= 3) {
      const g = s.grain;
      if (g.origin !== 'operator' && (g.evidence ?? []).includes('dxf-layer')) {
        const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
        if (!pointOnRings(mid, [s.cut]))
          bad(`the source's grain arrow (${g.origin}) is centred outside the cut line`);
      } else {
        const off = grainOutsideMm(g.a, g.b, [s.cut]);
        if (off > 0)
          bad(
            `grainline (${g.origin}${g.evidence?.length ? ` [${g.evidence.join('+')}]` : ''}) runs ${off.toFixed(1)} mm outside the cut line (> ${GRAIN_INSIDE_TOL_MM} mm off it)`,
          );
      }
    }
    if (!b.mb.hasGrain) bad('manifest hasGrain = false');
    // drills / internal (layer 8)
    const l8 = onLayer(ents, LAYERS.internal).filter(isPoly);
    const drills = l8.filter(isDrill);
    // W3 (R12): a half's fold line is the AAMA mirror line on layer 6 — still one of the piece's
    // internal lines for the manifest; every drill square has its AAMA drill POINT on layer 13
    const mirror = onLayer(ents, AAMA_MIRROR_LAYER).filter(isPoly);
    const internal = [...l8.filter((e) => !isDrill(e)), ...mirror];
    if (r12) {
      const holes = onLayer(ents, AAMA_DRILL_LAYER).filter((e) => e.type === 'POINT');
      const unmatched = drills.filter((q) => {
        const xs = q.pts.map((p) => p.x);
        const ys = q.pts.map((p) => p.y);
        const c = {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: (Math.min(...ys) + Math.max(...ys)) / 2,
        };
        return !holes.some((h) => h.pts[0] && dist(h.pts[0], c) <= 0.01);
      });
      if (holes.length !== drills.length || unmatched.length)
        bad(`drill POINTs on layer 13: ${holes.length}, drill squares: ${drills.length}`);
      if (mirror.length !== (s.fold && !b.spec.unfoldedFold ? 1 : 0))
        bad(`${mirror.length} mirror line(s) on layer 6 (a half's fold line only)`);
    }
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
  // SHAPE (owner 16.10): one piece, one shape — the sizes of an identity carry the same features
  // and the same cut-line structure (gate/shape.ts)
  // (SHAPE-KINK: the turn hold is its own G5 check with shapeIssues and the check-step door —
  // gate/shape.ts g5Shape; this check keeps the per-block feature findings)
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
    if (s.fold && spec.halfFold) {
      // L13 (owner decision 19.10 a): a half on fold is written as drawn — its fold line is the cut
      // line's own straight run (end to end on the cut, the cut along it all the way), never a
      // line across the piece; no unfold to judge
      if (spec.unfoldedFold) bad('a half on fold marked unfolded');
      else if (cut) {
        const da = closestOnPolyline(s.fold.a, cut, true).d;
        const db = closestOnPolyline(s.fold.b, cut, true).d;
        if (Math.max(da, db) > PATIMPORT.snapMm)
          bad(`fold line ends ${da.toFixed(2)}/${db.toFixed(2)} mm off the cut line`);
        const len = dist(s.fold.a, s.fold.b);
        const steps = Math.max(2, Math.ceil(len / 2));
        let on = 0;
        for (let k = 0; k <= steps; k++) {
          const q = {
            x: s.fold.a.x + ((s.fold.b.x - s.fold.a.x) * k) / steps,
            y: s.fold.a.y + ((s.fold.b.y - s.fold.a.y) * k) / steps,
          };
          if (closestOnPolyline(q, cut, true).d <= PATIMPORT.snapMm) on++;
        }
        if (on < 0.95 * (steps + 1))
          bad(
            `half on fold: the cut runs along only ${Math.round((100 * on) / (steps + 1))} % of its fold line`,
          );
      }
    } else if (s.fold) {
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
    else if (spec.halfFold) bad('a half on fold carries no fold line');
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
    // Independent check on the FILE (W2): the DERIVED line, read back, is the mitred allowance
    // offset of the line it came from — never closer than the allowance anywhere (a bitten bay, a
    // bevelled corner, a hull collapse across a neck), never further except inside a convex corner's
    // mitre (sides extended to their intersection) or, past MITER_LIMIT × allowance, its square cut.
    // A round join's arc stays inside the mitre and passes; a lobe or a corner overshoot does not.
    const allowance = spec.allowance.allowanceMm;
    const dev = parallelDeviation(
      derivedLine,
      baseLine,
      spec.allowance.meaning === 'seam' ? allowance : -allowance,
      // L13: a half on fold keeps no allowance across its fold line
      { lenient: true, fold: spec.halfFold && s.fold ? { a: s.fold.a, b: s.fold.b } : null },
    );
    worstDev = Math.max(worstDev, dev);
    if (dev > OFFSET_MAX_DEV_MM)
      bad(`derived line deviates ${dev.toFixed(3)} mm from a ${allowance} mm parallel`);
  }
  return check(
    'G6-offset',
    failed,
    'block',
    notes.join('; ') ||
      'derived lines are mitred allowance offsets (1 loop, no hull collapse, sides parallel, corners = mitre or square cut)',
    fmt(worstDev),
    `1 loop, no self-intersection, hull < ${OFFSET_HULL_RATIO}, dev ≤ ${OFFSET_MAX_DEV_MM} mm from the mitred offset (limit ${MITER_LIMIT} × allowance)`,
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
  const ev = ctx.expect.gradeByBlock;
  for (const [identity, bs] of byId) {
    if (bs.length < 2) continue;
    // SILENT-TAIL (17.10): the run is measured on the DRAWN line (layer 14 for a piece drawn on its
    // seam, layer 1 for one drawn on its cut), never on the allowance offset: the offset's corner
    // treatment is not a grade (palto SL: a 60 mm mitre spike at the underarm tip in 76–84 and a
    // bevel in 88 read "88 is 28 mm shorter than 84" on the cut while the seams grow 1321 → 1333).
    // The cut layer only when a size has no drawn line in the file (G1 names that block).
    const drawn = bs.map((b) => linesFor(ctx, b).line);
    const lineOf = (b: BlockInfo, i: number) =>
      drawn.every((l) => l) ? drawn[i] : ctx.contours.get(b.block)?.get(LAYERS.cut);
    const rows = bs
      .map((b, i) => {
        const c = lineOf(b, i);
        return {
          b,
          c,
          rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
          area: c ? areaOf(c) : NaN,
        };
      })
      .sort((x, y) => x.rank - y.rank);
    let bad = false;
    let silent = false;
    for (let i = 1; i < rows.length; i++) {
      if (!(rows[i].area > rows[i - 1].area)) {
        bad = true;
        // SILENT: a size under half its smaller neighbour is a sliver, whatever the run's length
        if (rows[i].area < 0.5 * rows[i - 1].area) silent = true;
        notes.push(
          `${identity}: ${rows[i - 1].b.mb.sizeToken} ${(rows[i - 1].area / 100).toFixed(1)} cm² ≥ ${rows[i].b.mb.sizeToken} ${(rows[i].area / 100).toFixed(1)} cm²`,
        );
        break;
      }
    }
    // SILENT: the run's own band — perimeter grows by about its median step (no drop, no loop),
    // and no two sizes on one outline where the drawing grades them (Anne Waistcoat 5XL a sliver,
    // XL through 5XL's crotch curve; Albuca's 9 sizes on one outline over graded lines)
    const tokenOf = new Map(rows.map((r) => [r.b.block, r.b.mb.sizeToken]));
    for (const p of sizeRunProblems(
      rows.flatMap((r) => (r.c ? [{ key: r.b.block, rank: r.rank, ring: r.c }] : [])),
    )) {
      // one outline the drawing draws once for both sizes (neither draws a line of its own beside
      // it): the run shares it by design — G8's area order says the rest
      if (p.kind === 'collapse' && ev && p.keys.every((k) => ev[k]?.drawsOwn === false)) continue;
      bad = true;
      silent = true;
      const named = p.keys.map((k) => tokenOf.get(k) ?? k);
      notes.push(
        `${identity}: ${
          p.kind === 'collapse'
            ? `sizes ${named.join(' and ')} are written on one outline, the drawing grades them`
            : p.note
        }`,
      );
    }
    if (bad) {
      failed.push(...rows.map((r) => r.b.block));
      // a two-size family's area order alone warns (as before); a SILENT problem holds at any length
      worstSizes = Math.max(worstSizes, silent ? 3 : rows.length);
    }
  }
  // SILENT (G26): the grade model's other disagreements — shown here, never held
  const warns = Object.entries(ev ?? {})
    .filter(([b, e]) => e.warn && ctx.blocks.some((x) => x.block === b))
    .map(([b, e]) => `${b}: ${e.warn}`);
  const grade = warns.length
    ? ` · grade model (warning only): ${warns.slice(0, 8).join('; ')}${warns.length > 8 ? ` … +${warns.length - 8}` : ''}`
    : '';
  return check(
    'G8-monotone',
    failed,
    worstSizes > 2 ? 'block' : failed.length ? 'warn' : 'block',
    (notes.join('; ') ||
      'area and outline length grow with size rank for every identity, no two sizes on one outline') +
      grade,
    null,
    `on the drawn line: strictly increasing area (block when > 2 sizes); perimeter: no drop > ${SIZE_RUN.dropMm} mm / ${SIZE_RUN.dropShare * 100} %, no step > ${SIZE_RUN.spikeMul}× / +${SIZE_RUN.spikeAddMm} mm the run's median; no two sizes on one outline`,
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

const cellKey = glyphCellKey;

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

// ── G20 (A2) ─────────────────────────────────────────────────────────────────────────────
//
// wm M (10.10): the collar drawn inside the back was written as a rectangle on the back's layer 8
// — a piece lost and a line cut into the back. The pieces stage now seeds such an outline and keeps
// it off the host's internal lines; this check refuses to vouch for a file where it happened anyway.

const shoelace = (pts: readonly PtMm[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
};

/** Layer-8 contours of one block that look like a piece drawn inside it: [area mm², at]. */
export function nestedPieces(ents: readonly RawEntity[]): { areaMm2: number; at: PtMm }[] {
  const cut = ents.find((e) => e.layer === LAYERS.cut && isPoly(e) && e.closed && e.pts.length > 2);
  if (!cut) return [];
  const A = shoelace(cut.pts);
  const out: { areaMm2: number; at: PtMm }[] = [];
  for (const e of ents) {
    if (e.layer !== LAYERS.internal || e.pts.length < 3 || !(isPoly(e) || e.type === 'LINE'))
      continue;
    const n = e.pts.length;
    const shut =
      e.closed || Math.hypot(e.pts[0].x - e.pts[n - 1].x, e.pts[0].y - e.pts[n - 1].y) <= 0.5;
    if (!shut || isDrill(e)) continue;
    const a = shoelace(e.pts);
    // its own shape (a seam line or another size's outline is ≥ 45 % of the cut and stays a copy)
    if (a < PATIMPORT.nestedPieceMinMm2 || a > 0.45 * A) continue;
    const b = bboxOf(e.pts);
    out.push({ areaMm2: a, at: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } });
  }
  return out;
}

export function g20(ctx: GateCtx): GateCheck {
  if (!ctx.raw)
    return check('G20-nested-piece', ['*'], 'block', `own reader failed: ${ctx.rawError}`);
  const failed: string[] = [];
  const notes: string[] = [];
  let worst = 0;
  for (const { block } of ctx.blocks) {
    const hits = nestedPieces(rawOf(ctx, block));
    if (!hits.length) continue;
    const big = hits.sort((x, y) => y.areaMm2 - x.areaMm2)[0];
    worst = Math.max(worst, big.areaMm2);
    failed.push(block);
    notes.push(
      `${block}: a closed ${(big.areaMm2 / 100).toFixed(0)} cm² outline inside at (${big.at.x.toFixed(0)}, ${big.at.y.toFixed(0)})`,
    );
  }
  return check(
    'G20-nested-piece',
    failed,
    'block',
    failed.length
      ? ['a piece seems drawn inside another piece — seed it on the pieces step', ...notes].join(
          '; ',
        )
      : 'no closed outline of a piece inside another piece',
    `${(worst / 100).toFixed(0)} cm²`,
    `< ${PATIMPORT.nestedPieceMinMm2 / 100} cm² (a shape ≤ 45 % of the cut)`,
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

// ── G19 (A8b): the cut line traced around tile chrome ─────────────────────────────────────

const CHROME_WHY = 'the cut line runs around a registration mark / tile chrome';

/**
 * One block's written rings (cut, seam) against the tile chrome near it, in words:
 *  - `block`: a hairpin round a 1 mm bar within 1 mm of chrome (the bracket-trace signature — a
 *    standalone hairpin, a slit notch, a narrow dart, a belt loop, is not judged), and a stretch
 *    ≥ 5 mm ON a mark (a bracket, a tile label);
 *  - `warn`: a stretch ≥ 5 mm ON a frame line — a CF / fold / hem may lie on a tile edge.
 * Chrome the operator kept as line work never reaches here: there is always a way out.
 */
export function chromeProblems(
  ents: readonly RawEntity[],
  chrome: readonly ChromeLine[] | undefined,
  /** A traced scan: its line wobbles in 2 mm steps (leonie), and a scan has no vector chrome. */
  raster = false,
): { block: string[]; warn: string[] } {
  const out = { block: [] as string[], warn: [] as string[] };
  if (!chrome?.length) return out;
  const marks = new ChromeIndex(chrome.filter((c) => c.mark).map((c) => c.pts));
  const frames = new ChromeIndex(chrome.filter((c) => !c.mark).map((c) => c.pts));
  const r = CHROME_GATE.hairpinNearMm;
  const nearChrome = (p: PtMm) => marks.near(p, r) || frames.near(p, r);
  const onFrame: { word: string; run: ReturnType<typeof onChrome>[number] }[] = [];
  for (const layer of [LAYERS.cut, LAYERS.seam]) {
    for (const e of ents) {
      if (e.layer !== layer || !isPoly(e) || e.pts.length < 4) continue;
      const word = layer === LAYERS.cut ? 'cut' : 'seam';
      for (const h of raster ? [] : hairpins(e.pts, e.closed))
        if ([h.at, ...h.pts].some(nearChrome))
          out.block.push(
            `the ${word} line goes out and back round a ${h.capMm.toFixed(1)} mm bar ${h.legMm.toFixed(0)} mm long at (${h.at.x.toFixed(0)}, ${h.at.y.toFixed(0)})`,
          );
      for (const run of onChrome(e.pts, e.closed, marks))
        out.block.push(
          `the ${word} line runs ${run.lengthMm.toFixed(0)} mm on a registration mark from (${run.from.x.toFixed(0)}, ${run.from.y.toFixed(0)})`,
        );
      // a frame: a short contact may be a CF / fold on the tile edge (warn); a long one — more
      // than 100 mm per block, cut and seam together — is the frame traced as the piece edge
      // (Redcafe BP_L_53_52: the seam ran 273 mm along a tile frame and passed)
      for (const run of onChrome(e.pts, e.closed, frames)) onFrame.push({ word, run });
    }
  }
  if (onFrame.length) {
    const total = onFrame.reduce((a, f) => a + f.run.lengthMm, 0);
    const words = [...new Set(onFrame.map((f) => f.word))].join(' and ');
    const at = onFrame[0].run.from;
    const where = `from (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`;
    if (CHROME_GATE.frameBlocks || total > CHROME_GATE.frameBlockMm)
      out.block.push(
        `the ${words} runs ${total.toFixed(0)} mm along a tile frame ${where} — the frame was traced as the piece edge; if the edge truly lies on the tile edge, keep the frame on the Files step`,
      );
    else
      out.warn.push(
        `the ${words} line runs ${total.toFixed(0)} mm on a tile frame ${where} — check it is the garment edge (a CF / fold on the tile edge)`,
      );
  }
  return out;
}

export function g19(ctx: GateCtx): GateCheck {
  if (!ctx.raw) return check('G19-chrome', ['*'], 'block', `own reader failed: ${ctx.rawError}`);
  const hard: string[] = [];
  const soft: string[] = [];
  const notes: string[] = [];
  let n = 0;
  for (const { block } of ctx.blocks) {
    const why = chromeProblems(
      rawOf(ctx, block),
      ctx.expect.chromeByBlock?.[block],
      ctx.expect.hausdorffP95Mm > PATIMPORT.hausdorffP95VectorMm,
    );
    const all = [...why.block, ...why.warn];
    if (!all.length) continue;
    n += all.length;
    (why.block.length ? hard : soft).push(block);
    notes.push(
      `${block}: ${all.slice(0, 3).join('; ')}${all.length > 3 ? ` (+${all.length - 3})` : ''}`,
    );
  }
  return check(
    'G19-chrome',
    [...hard, ...soft],
    hard.length ? 'block' : 'warn',
    hard.length || soft.length
      ? [
          hard.length
            ? CHROME_WHY
            : 'a cut line lies on a tile frame — check it is the garment edge (a CF / fold on the tile edge), not the frame',
          ...notes,
        ].join('; ')
      : 'no cut or seam line traced around tile chrome',
    n,
    'no hairpin ≤ 2 mm wide, 3–25 mm long within 1 mm of tile chrome; no stretch ≥ 5 mm on a mark (block); on frames > 100 mm per block blocks, less warns',
  );
}

// ── G21 (P1): continuity provenance ────────────────────────────────────────────────────────────

/** G21: a stretch lies on the chains it names: share of it (ends' junction hops left out). */
export const CONTINUITY_ON_CHAIN_SHARE = 0.98;
/** G21: the written line runs along the used stretch: share of it within reach of the line. */
export const CONTINUITY_COVER_SHARE = 0.9;
/** Roles an R0 path may never lie on (pieces/walls.ts NOT_EDGE_ROLES). */
const CONT_NOT_EDGE = new Set(['notch', 'internal', 'grain', 'seam']);
/** Roles an R1 / R2 stretch may never lie on (pieces/walls.ts NOT_SPAN_ROLES). */
const CONT_NOT_SPAN = new Set(['internal', 'grain', 'seam']);

/**
 * G21 (P1): a size closed through continuity walls must carry its proof, and the proof must hold —
 * the manifest entry matches the run's record (rules, chains, anchors); every edge's rule holds
 * (R0 never on a notch / internal / grain / seam line, R1 / R2 never on an internal / grain / seam
 * line and on one line, a bracketed path between anchors on both sides); the stretch lies on the chains it
 * names (ownership) and the written line runs along it (coverage); the D3 verdict is recorded, on
 * ≥ 2 anchor ranks, and every measured check is within what it allowed. Any mismatch blocks.
 */
export function g21(ctx: GateCtx): GateCheck {
  const failed: string[] = [];
  const notes: string[] = [];
  let n = 0;
  const reach = Math.max(PATIMPORT.snapMm, 0.5);
  for (const b of ctx.blocks) {
    const rec = b.size?.continuity;
    const mc = b.mb.continuity;
    if (!rec && !mc) continue;
    n++;
    const bad = (why: string) => {
      failed.push(b.block);
      notes.push(`${b.block}: ${why}`);
    };
    if (!rec || !mc) {
      bad(
        rec
          ? 'the manifest does not record its continuity closure'
          : 'a continuity entry with no closure behind it',
      );
      continue;
    }
    if (JSON.stringify(continuityOfBlock(rec)) !== JSON.stringify(continuityOfBlock(mc))) {
      bad('the manifest entry does not match the run');
      continue;
    }
    // from here on the DURABLE record (the manifest's) is what is checked
    if (!mc.edges.length) {
      bad('closed through continuity walls but names none');
      continue;
    }
    const v = mc.verdict;
    if (!v || v.anchors.length < 2 || !v.checks.length) {
      bad('no D3 verdict on ≥ 2 anchor ranks');
      continue;
    }
    const off = v.checks.find(
      (c) =>
        !(c.hMm <= c.hAllowMm) ||
        !(c.hu <= c.huAllow) ||
        !(c.growth >= c.band[0] && c.growth <= c.band[1]) ||
        !(c.dk <= c.kMax),
    );
    if (off) {
      bad(`the recorded verdict against rank ${off.vs} is outside what it allowed`);
      continue;
    }
    const geo = ctx.expect.continuityByBlock?.[b.block];
    if (!geo || geo.edges.length !== mc.edges.length) {
      bad('its continuity stretches cannot be checked (no geometry)');
      continue;
    }
    mc.edges.forEach((e, k) => {
      const what = `${e.rule} on chain ${e.chains.join('+')}`;
      if (e.roles.some((r) => (e.rule === 'R0' ? CONT_NOT_EDGE : CONT_NOT_SPAN).has(r)))
        bad(`${what}: lies on a ${e.roles.join('/')} line`);
      else if (e.rule !== 'R0' && e.chains.length !== 1) bad(`${what}: ${e.rule} names one line`);
      else if (
        e.bracket &&
        !(v.anchors.some((a) => a < rec.rank) && v.anchors.some((a) => a > rec.rank))
      )
        bad(`${what}: through an unclassified line without anchors on both sides`);
      const g = geo.edges[k];
      const chainIdx = new SegmentIndex(
        g.chainLines.map((l) => ({ pts: l, closed: false })),
        5,
      );
      const { line } = linesFor(ctx, b);
      const lineIdx = line ? new SegmentIndex([{ pts: line, closed: true }], 5) : null;
      let tot = 0;
      let onChain = 0;
      let covered = 0;
      for (const pl of g.pts) {
        const s = sampleAlong(pl, false, 0.25);
        const L = polylineLength(pl, false);
        let arc = 0;
        for (let i = 0; i < s.length; i++) {
          if (i) arc += dist(s[i - 1], s[i]);
          if (arc < 1.2 || L - arc < 1.2) continue; // the junction hops onto the line
          tot++;
          if (chainIdx.nearest(s[i], 2) <= 0.35) onChain++;
          if (lineIdx && lineIdx.nearest(s[i], 2) <= reach) covered++;
        }
      }
      if (!tot) return;
      if (onChain / tot < CONTINUITY_ON_CHAIN_SHARE)
        bad(
          `${what}: ${((onChain / tot) * 100).toFixed(1)} % of the stretch lies on the chains it names`,
        );
      else if (covered / tot < CONTINUITY_COVER_SHARE)
        bad(`${what}: the written line runs along ${((covered / tot) * 100).toFixed(1)} % of it`);
    });
  }
  return check(
    'G21-continuity',
    failed,
    'block',
    notes.length
      ? notes.slice(0, 6).join('; ')
      : n
        ? `${n} block(s) closed through continuity walls: provenance and verdict hold`
        : 'no block closed through continuity walls',
  );
}

// ── G23 (D6): every tile sheet in the export, no piece twice or in halves ─────────────────────

/**
 * G23 (D6, one PDF = one garment): every tile sheet the pages carry is in the drawing; every sheet
 * that holds pieces exports at least one (none dropped silently); and no cross-sheet question that
 * would put a piece in the export twice (a copy, an alternative rendering of the whole pattern) or
 * in halves (a piece split between sheets) is left open. The passport's expected pieces (when it
 * lists them) are compared in the note — an expectation, never a block.
 */
export function g23(ctx: GateCtx): GateCheck {
  const sc = ctx.expect.sheets;
  if (!sc) return check('G23-sheets', [], 'block', 'one tile sheet (nothing to check)');
  const problems: string[] = [];
  const inDrawing = new Set(sc.parts.map((p) => p.sheet));
  const gone = sc.tileSheets.filter((k) => !inDrawing.has(k));
  if (gone.length)
    problems.push(`tile sheet ${gone.map((k) => k + 1).join(', ')} is not in the drawing`);
  for (const p of sc.parts)
    if (p.pieces > 0 && p.exported === 0)
      problems.push(
        `sheet ${p.sheet + 1} holds ${p.pieces} ${p.pieces === 1 ? 'piece' : 'pieces'}, none is in the export`,
      );
  problems.push(...sc.open);
  const found = sc.parts.map((p) => `sheet ${p.sheet + 1}: ${p.exported}/${p.pieces}`).join(', ');
  const passport =
    sc.expected != null
      ? `; passport expects ${sc.expected} pieces${sc.expectedMissing?.length ? `, not found: ${sc.expectedMissing.slice(0, 6).join(', ')}` : ''}`
      : '';
  return check(
    'G23-sheets',
    problems.length ? ['*'] : [],
    'block',
    problems.length
      ? `${problems.join('; ')} (exported per sheet ${found})${passport}`
      : `every tile sheet is in the export (${found})${passport}`,
    `${sc.parts.length} sheets`,
    'every sheet with pieces exports; no piece twice or in halves',
  );
}

// ── G22 / G24 (MOOD Ф0) ───────────────────────────────────────────────────────────────────

/** G22: share of the written line that must lie on the rank's own pen (off the common edges). */
export const IDENTITY_SHARE_MIN = 0.85;
/** G22: a written sample lies on a source line within this distance, mm. */
export const IDENTITY_REACH_MM = 0.5;
/** G22: below this share of the line off the common edges the size claims no pen (a band). */
const IDENTITY_OWN_FLOOR = 0.2;

/**
 * G22: a pen measured off the drawing (a recovered rhythm; the class's own lines) reads off by
 * more — a size drawn in such a rhythm passes at this share (palto's sleeve: 80 % own, 20 % on a
 * line the neighbour size was ranked with where the two coincide).
 */
export const IDENTITY_SHARE_MIN_MEASURED = 0.75;
/** G22: at least this share of the line (off the common edges) on the size's own pen at all. */
export const IDENTITY_OWN_MIN = 0.5;

/**
 * G22 measure on a written closed line: per 0.5 mm sample, on the size's own pen (`own`), on an
 * edge every size uses (`excused`: common lines; `shared`: another pen's line this size lands on,
 * at most half the line), on a line provably another size's (`foreign`), or on nothing known.
 * `share` = own / (own + foreign) — the pen it lies on; `ownAll` = own / everything not excused.
 * `share` null: the line runs on the excused edges almost everywhere (no pen claim to check).
 */
export function identityShare(
  line: readonly PtMm[],
  g: {
    own: readonly PtMm[][];
    excused: readonly PtMm[][];
    shared?: readonly PtMm[][];
    foreign?: readonly PtMm[][];
  },
  reachMm = IDENTITY_REACH_MM,
): { share: number | null; ownAll: number; foreignAll: number; samples: number } {
  const s = sampleAlong(line, true, 0.5);
  const idx = (ls: readonly PtMm[][] = []) =>
    new SegmentIndex(
      ls.map((pts) => ({ pts, closed: false })),
      5,
    );
  const ownIdx = idx(g.own);
  const excIdx = idx(g.excused);
  const shIdx = idx(g.shared);
  const forIdx = idx(g.foreign);
  const near = (ix: SegmentIndex, p: PtMm) => !ix.empty && ix.nearest(p, reachMm) <= reachMm;
  let on = 0;
  let off = 0;
  let counted = 0;
  let sharedN = 0;
  for (const p of s) {
    if (near(ownIdx, p)) {
      on++;
      counted++;
      continue;
    }
    if (near(excIdx, p)) continue;
    // an edge drawn once by another pen that this size lands on: excused up to half the line
    if (sharedN < 0.5 * s.length && near(shIdx, p)) {
      sharedN++;
      continue;
    }
    counted++;
    if (near(forIdx, p)) off++;
  }
  // the line runs on edges every size uses almost everywhere: no pen claim — unless what is left
  // lies mostly on another size's line (the one stretch that tells the sizes apart is foreign)
  if (!s.length || !counted || (counted < IDENTITY_OWN_FLOOR * s.length && off <= 0.5 * counted))
    return { share: null, ownAll: 1, foreignAll: 0, samples: s.length };
  return {
    share: on + off ? on / (on + off) : 0,
    ownAll: on / counted,
    foreignAll: off / counted,
    samples: s.length,
  };
}

/**
 * G22 (MOOD Ф0, R12): a size block of an identity-encoded run lies on its rank's pen. The source
 * says which pen draws each size (declared dash, recovered motif, its key); a written size whose
 * line runs on another pen is another size under this one's label (Mood Paris: "16" = 00's line,
 * monotone, closed, every other check green). A rank whose pen is unknown proves nothing.
 */
export function g22(ctx: GateCtx): GateCheck {
  const by = ctx.expect.identityByBlock;
  // SILENT (G26, inside G22): the grade model's neighbour verdict — the size's outline leaves the
  // family's grade for ANOTHER size's drawn line. Evidence of the same claim G22 makes (a size lies
  // on its own line) read off the geometry, so it holds on every run with a wall model, keyed or not
  const gradeFailed: string[] = [];
  const gradeNotes: string[] = [];
  for (const b of ctx.blocks) {
    const e = ctx.expect.gradeByBlock?.[b.block];
    if (!e?.hold) continue;
    gradeFailed.push(b.block);
    gradeNotes.push(
      `${b.block}: off its own line onto another size's (grade model, G26) — ${e.hold}`,
    );
  }
  if (!by || f0Off())
    return gradeFailed.length
      ? check(
          'G22-identity',
          gradeFailed,
          'block',
          gradeNotes.join('; '),
          null,
          "no size outline on another size's line where the grade puts its own (G26)",
        )
      : check('G22-identity', [], 'block', 'no identity-encoded size run — not evaluated');
  const failed: string[] = [...gradeFailed];
  const notes: string[] = [...gradeNotes];
  let worst = 1;
  let measured = 0;
  let kinked = 0;
  for (const b of ctx.blocks) {
    const g = by[b.block];
    if (!g) continue;
    if (!g.pen) {
      failed.push(b.block);
      notes.push(`${b.block}: the size's own line is not known (no key sample matches it)`);
      continue;
    }
    const { line, layer } = linesFor(ctx, b);
    if (!line) {
      failed.push(b.block);
      notes.push(`${b.block}: no written line on layer ${layer}`);
      continue;
    }
    // KINKS: no bend off its own line, whatever the share (a stretch on a neighbour's line is a
    // few % of a long outline)
    const kinks = kinksOfBlock(ctx, b, g, line);
    if (kinks.length) {
      failed.push(b.block);
      kinked++;
      const k0 = kinks.reduce((a, r) => (r.offMm * r.lengthMm > a.offMm * a.lengthMm ? r : a));
      notes.push(
        `${b.block}: ${kinks.length} bend${kinks.length > 1 ? 's' : ''} off its own line (${g.pen}) the drawing does not make — worst ${k0.lengthMm.toFixed(1)} mm long, ${k0.offMm.toFixed(1)} mm off, turning ${k0.turnDeg.toFixed(0)}°`,
      );
    }
    const { share, ownAll, foreignAll } = identityShare(line, g);
    if (share == null) continue;
    measured++;
    worst = Math.min(worst, share);
    const min = g.exact ? IDENTITY_SHARE_MIN : IDENTITY_SHARE_MIN_MEASURED;
    if (share < min || ownAll < IDENTITY_OWN_MIN) {
      failed.push(b.block);
      notes.push(
        `${b.block}: ${(ownAll * 100).toFixed(0)} % on its own line (${g.pen}), ${(foreignAll * 100).toFixed(0)} % on another size's`,
      );
    }
  }
  return check(
    'G22-identity',
    failed,
    'block',
    notes.join('; ') ||
      `every size lies on its own line (${measured} measured, worst ${(worst * 100).toFixed(0)} %, no bend off it)`,
    fmt(worst),
    `≥ ${IDENTITY_SHARE_MIN} (declared pen) / ${IDENTITY_SHARE_MIN_MEASURED} (measured) of own + another size's line on its own pen, ≥ ${IDENTITY_OWN_MIN} of the line; no stretch > ${KINK.runMm} mm off it by ≥ ${KINK.offMm} mm${kinked ? ` (${kinked} kinked)` : ''}`,
  );
}

/** G24: an area step bigger than this × its neighbours' grade step is a face across two pieces. */
export const ONE_PIECE_JUMP = 1.25;
/** G24: the jump's excess over the neighbours' step, in median grade steps of the identity. */
export const ONE_PIECE_EXCESS = 2;
/** G24: …and at least this share of the smaller size's area. */
export const ONE_PIECE_SHARE = 0.1;

/**
 * G24 (MOOD Ф0): one outline holds one piece. The pieces stage names faces that hold another
 * piece's header or overlap another piece's outline of the same size (`onePieceByBlock`); here, per
 * identity over its written sizes, an area step larger than ×1.25 the steps on both sides of it (a
 * face that grew by a neighbouring piece — Mood Margaux's collar joining the front's neckline).
 */
export function g24(ctx: GateCtx): GateCheck {
  if (f0Off()) return check('G24-one-piece', [], 'block', 'probe switch: not evaluated');
  const failed: string[] = [];
  const notes: string[] = [];
  for (const [block, why] of Object.entries(ctx.expect.onePieceByBlock ?? {}))
    if (ctx.blocks.some((b) => b.block === block)) {
      failed.push(block);
      notes.push(`${block}: ${why}`);
    }
  const rankOf = new Map(ctx.m.sizes.map((s) => [s.token, s.rank]));
  const byId = new Map<string, { block: string; rank: number; area: number }[]>();
  for (const b of ctx.blocks) {
    if (b.mb.sizeToken === UNI_TOKEN) continue;
    const c = ctx.contours.get(b.block)?.get(LAYERS.cut);
    if (!c) continue;
    const list = byId.get(b.mb.identity) ?? [];
    list.push({
      block: b.block,
      rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
      area: areaOf(c),
    });
    byId.set(b.mb.identity, list);
  }
  let worst = 0;
  for (const [identity, rows0] of byId) {
    const rows = rows0.sort((x, y) => x.rank - y.rank);
    if (rows.length < 3) continue;
    // per-rank step between written neighbours (a skipped rank spreads the step)
    const step = rows.map((r, i) =>
      i ? (r.area - rows[i - 1].area) / Math.max(1, r.rank - rows[i - 1].rank) : NaN,
    );
    const pos = step.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const median = pos.length ? pos[pos.length >> 1] : 0;
    for (let i = 1; i < rows.length; i++) {
      const nb = [step[i - 1], step[i + 1]].filter((v) => Number.isFinite(v) && v > 0);
      if (!nb.length || !(step[i] > 0)) continue;
      const ratio = step[i] / Math.max(...nb);
      worst = Math.max(worst, ratio);
      // …and the excess is a piece, not a grade break: ≥ 2 median steps over the neighbours'
      // (leonie's 44 → 46 grows ×2 its neighbours' step on a real grade change, +1 median step)
      // …and a piece's worth: ≥ 10 % of the smaller outline (a grade breakpoint adds a few %)
      if (
        ratio > ONE_PIECE_JUMP &&
        step[i] - Math.max(...nb) >= ONE_PIECE_EXCESS * median &&
        step[i] - Math.max(...nb) >= ONE_PIECE_SHARE * rows[i - 1].area
      ) {
        failed.push(rows[i].block);
        notes.push(
          `${identity}: ${rows[i - 1].block} → ${rows[i].block} grows ${(step[i] / 100).toFixed(1)} cm² per size, ×${ratio.toFixed(2)} its neighbours' step`,
        );
      }
    }
  }
  return check(
    'G24-one-piece',
    failed,
    'block',
    notes.join('; ') || 'every outline holds one piece',
    fmt(worst),
    `no other piece's header or same-size overlap > 5 %; area step ≤ ×${ONE_PIECE_JUMP} its neighbours' or < ${ONE_PIECE_EXCESS} median steps / ${ONE_PIECE_SHARE * 100} % of the area over them`,
  );
}

// ── G25 (KINKS) ───────────────────────────────────────────────────────────────────────────

/**
 * G25 (inside G22): a written size line leaves its own drawn line. Samples every `stepMm`; a
 * sample is ON when it lies within `reachMm` of the size's own lines, their end tangents carried
 * `extMm` (a corner closed by its own stub, ramp or extended edges lies on them), a common edge or
 * a derived edge G15 audits (bridge, band cut). A KINK is a run of OFF samples longer than `runMm`
 * that is ≥ `offMm` off the own lines at its worst — the mood probe's (4) measure, read on the
 * gate's own evidence. Measured on the Mood sample (11 files, 452 outlines), no outline the probe
 * finds clean has such a run; a hold is a question, never a wrong export.
 */
export const KINK = {
  stepMm: 0.25,
  reachMm: 0.5,
  extMm: 12,
  runMm: 2,
  offMm: 0.5,
  /** own lines farther than this from a sample count as this far (no own line near at all) */
  farMm: 50,
};

export type KinkRun = { at: PtMm; lengthMm: number; offMm: number; turnDeg: number };

/** The open lines' end tangents (from ~2 mm back) carried `extMm` past each end. */
function tangentExtensions(lines: readonly PtMm[][], extMm: number): PtMm[][] {
  const out: PtMm[][] = [];
  for (const pts of lines) {
    const n = pts.length;
    if (n < 2 || dist(pts[0], pts[n - 1]) < 0.05) continue;
    if (polylineLength(pts, false) < 3) continue;
    for (const end of [0, 1] as const) {
      const p = end ? pts[n - 1] : pts[0];
      let k = end ? n - 1 : 0;
      const step = end ? -1 : 1;
      let acc = 0;
      while (k + step >= 0 && k + step < n && acc < 2) {
        acc += dist(pts[k], pts[k + step]);
        k += step;
      }
      const q = pts[k];
      const L = dist(p, q);
      if (L < 1e-6) continue;
      out.push([p, { x: p.x + ((p.x - q.x) / L) * extMm, y: p.y + ((p.y - q.y) / L) * extMm }]);
    }
  }
  return out;
}

/**
 * G25 measure: the kinks of a written closed line against its own lines (see `KINK`). `own` are the
 * size's own drawn lines; `excused` the common edges and audited derived edges (never measured as
 * own: a sample on them is simply not off).
 */
export function kinkRuns(
  line: readonly PtMm[],
  own: readonly PtMm[][],
  excused: readonly PtMm[][],
  k = KINK,
): KinkRun[] {
  if (line.length < 3) return [];
  const idx = (ls: readonly PtMm[][]) =>
    new SegmentIndex(
      ls.map((pts) => ({ pts, closed: false })),
      4,
    );
  const ownIdx = idx(own);
  const onIdx = idx([...own, ...tangentExtensions(own, k.extMm), ...excused]);
  const s = sampleAlong(line, true, k.stepMm);
  const n = s.length;
  if (!n) return [];
  const off = s.map((p) => onIdx.nearest(p, k.reachMm) > k.reachMm);
  const first = off.indexOf(false);
  // nowhere on a line it may lie on (Codex: no own line at all, or a line wholly another size's):
  // the whole outline is one run off its own line
  if (first < 0)
    return [
      {
        at: s[n >> 1],
        lengthMm: n * k.stepMm,
        offMm: own.length ? Math.min(k.farMm, ownIdx.nearest(s[n >> 1], k.farMm)) : k.farMm,
        turnDeg: 0,
      },
    ];
  // heading change over ±1.5 mm around sample i (degrees, 0…180)
  const w = Math.max(1, Math.round(1.5 / k.stepMm));
  const turnAt = (i: number) => {
    const a = s[(i - w + n) % n];
    const b = s[i];
    const c = s[(i + w) % n];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let t = Math.abs(((h2 - h1) * 180) / Math.PI) % 360;
    if (t > 180) t = 360 - t;
    return t;
  };
  const out: KinkRun[] = [];
  let run: number[] = [];
  const flush = () => {
    const L = run.length * k.stepMm;
    if (L > k.runMm) {
      let worst = 0;
      let turn = 0;
      for (const i of run) {
        worst = Math.max(worst, Math.min(k.farMm, ownIdx.nearest(s[i], k.farMm)));
        turn = Math.max(turn, turnAt(i));
      }
      // the bends where it leaves and rejoins its line count too
      turn = Math.max(turn, turnAt((run[0] - 1 + n) % n), turnAt((run[run.length - 1] + 1) % n));
      out.push({ at: s[run[run.length >> 1]], lengthMm: L, offMm: worst, turnDeg: turn });
    }
    run = [];
  };
  for (let j = 1; j <= n; j++) {
    const i = (first + j) % n;
    if (off[i]) run.push(i);
    else flush();
  }
  return out;
}

/** G25: is this run a kink — long enough off every line it may lie on, and off its own line? */
export const isKink = (r: KinkRun, k = KINK) => r.lengthMm > k.runMm && r.offMm >= k.offMm;

/**
 * G25 (KINKS) inside G22: per measured block, its kinks (`isKink` runs) — a size block of an
 * identity-encoded run has no bend its own drawn line does not have: no stretch where it leaves its
 * own pen's line (for a neighbouring size's line, a tile mark, a corner cut short) and comes back.
 * The owner (Ulmus, 12.10): "part of the lines in some sizes are crooked with bends — it must not
 * be so". A kinked outline that passed every other check is the silent wrong export D3 forbids.
 */
function kinksOfBlock(ctx: GateCtx, b: BlockInfo, g: IdentityGeometry, line: PtMm[]): KinkRun[] {
  // only a size the drawing's own KEY names (a printed size-line key sample): there the pen is the
  // size's identity and its line is the line the outline must lie on (palto measures a rhythm per
  // size with no key, and its sizes coincide along long edges)
  if (!g.keyed) return [];
  // an empty strict set (every line of the pen is another size's class line: S and L read as one
  // row) is no line of its own to lie on — one run off it, held (Codex)
  const own = g.ownStrict ?? g.own;
  const derived = (ctx.expect.derivedByBlock?.[b.block] ?? []).map((d) => d.pts);
  // GRADE P1: the chord across a notch drawn as the outline is no bend (the notch is on layer 4)
  const chords = (ctx.expect.notchChordsByBlock?.[b.block] ?? []).map((c) => [...c.chord]);
  const runs = kinkRuns(line, own, [...g.excused, ...derived, ...chords]);
  if (typeof process !== 'undefined' && process.env?.PATIMPORT_KINK_DEBUG)
    console.log(
      `@@KINK ${JSON.stringify({ block: b.block, runs: runs.map((r) => ({ ...r, kink: isKink(r) })) })}`,
    );
  return runs.filter((r) => isKink(r));
}
