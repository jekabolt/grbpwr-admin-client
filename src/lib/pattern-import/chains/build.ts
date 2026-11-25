// chains/ (F3) — buildChains: sheet → chains, line classes (legend), graded bundles.
//
// Order: link items into chains (link.ts) → page furniture (classify.ts) → size recovery
// (sizes/recover.ts: encoding, identity units, bundles, ranks, shared stretches) → LineClass rows.
// The legend the operator confirms is exactly `classes`: one row per size rank (role 'size'), the
// common outline, the shared stretches drawn in a size's style (role 'common', flagged), internal
// lines, and page furniture (role 'ignore', one row per reason).
import type {
  BuildChainsFn,
  Chain,
  ChainOpts,
  ChainSet,
  ClassEvidence,
  LineClass,
  PathId,
  Progress,
  PtMm,
  Sheet,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { LABEL_FRAME_WHY } from '../sizes/label-frame';
import { recoverSizes, type RecoverOut } from '../sizes/recover';
import { furniture, GREY_COLOUR_ONLY, overprintLines } from './classify';
import { rolesByFaces, type FaceRoleOpts, type FaceSizeCtx } from './face-role';
import { rolesByLayer } from './layer-role';
import { overlaidFiles } from './link';
import { makeChains } from './make';
import { recoverRingPanels } from './ring-boundary';
import { seamPens, type SeamPen } from './seam';

export const DEFAULT_CHAIN_OPTS: ChainOpts = {
  joinGapMm: PATIMPORT.joinGapMm,
  joinAngleDeg: PATIMPORT.joinAngleDeg,
  joinLateralMm: PATIMPORT.joinLateralMm,
};

export type BuildExtras = {
  /** Instruction-page texts (size runs, legends) — the worker passes every page's text. */
  extraTexts?: string[];
  fileNames?: Map<string, string>;
  /** A0.3: sheet path ids the clean stage offered as background and the operator did not take. */
  offeredPaths?: ReadonlySet<PathId>;
  /** gb2: what feeds the selected sheet (count-evidence sheetFeed) — the face pass's size count. */
  countFeed?: FaceSizeCtx;
  /** Probe switches of the face pass (mutation; the worker never sets them). */
  faceOpts?: FaceRoleOpts;
  /** P2: the reader proved an AAMA/CLO DXF dialect — numbered layers are AAMA layers. */
  aamaLayers?: boolean;
};

function buildOnce(
  sheet: Sheet,
  opts: ChainOpts,
  extras: BuildExtras = {},
  progress?: Progress,
): { set: ChainSet; recover: RecoverOut } {
  progress?.(0, 3, 'chains');
  const mk = makeChains(sheet, opts);
  progress?.(1, 3, 'classes');
  const styles = new Map<number, Style>(sheet.styles.map((s) => [s.id, s]));
  const pathFile = new Map(sheet.paths.map((p) => [p.id, p.src.file]));
  const fileOf = overlaidFiles(sheet)
    ? (i: number) => pathFile.get(mk.chains[i].ranges[0]?.path ?? -1) ?? ''
    : undefined;
  const furn = furniture(
    mk.chains,
    styles,
    sheet.poses,
    sheet.texts,
    fileOf,
    opts.keepGuides,
    opts.keepRepeats,
  );
  if (fileOf)
    for (const i of overprintLines(mk.chains, fileOf, furn))
      furn[i] = furn[i] ?? 'overprint (drawn over every file)';
  const opLinked = mk.work.map((w) => {
    const ops = new Set(w.items.map((l) => l.it.op));
    return w.items.length >= 3 && ops.size < w.items.length / 2;
  });
  const rec = recoverSizes({
    sheet,
    chains: mk.chains,
    sigs: mk.sigs,
    furniture: furn,
    opLinked,
    sizeCount: opts.sizeCount,
    extraTexts: extras.extraTexts,
    fileNames: extras.fileNames,
  });
  progress?.(2, 3, 'legend');
  // A0.3: where no row carries the outlines, the faces they close (and the layer name) decide
  // P2: where the file names its layers the AAMA/ASTM way, the layer is the role (the cut line is
  // the outline, the pleat lines on the internal layer are not)
  const set = rolesByLayer(
    rolesByFaces(
      sheet,
      toChainSet(rec, mk.stats, seamPens(rec, styles), styles),
      styles,
      extras.offeredPaths,
      extras.faceOpts,
      extras.countFeed,
    ),
    styles,
    { aama: extras.aamaLayers },
  );
  recoverRingPanels(sheet, set);
  progress?.(3, 3);
  return { set, recover: rec };
}

/**
 * How badly the read left the sizes of the legend: a size with no line counts 2, a size with less
 * than half the line the middle size has counts 1 (its lines went elsewhere: Lanai's dotted
 * sizes, a third of their length, the rest taken for tile frames).
 */
function lackOf(r: { set: ChainSet }): number {
  const rows = r.set.classes.filter((c) => c.role === 'size');
  const lens = rows.map((c) => c.totalLengthMm).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)] ?? 0;
  let lack = 0;
  for (const c of rows) {
    if (c.chains.length === 0) lack += 2;
    else if (median > 0 && c.totalLengthMm < 0.5 * median) lack += 1;
  }
  return lack;
}

/**
 * Full pipeline with its diagnostics (the probe and the worker stage use this).
 *
 * A file is read as it is drawn first. When that leaves a size of the legend with no line, or with
 * far too little (see `lackOf`), the likely reasons are dashes drawn as separate strokes with a wide
 * gap (Cassandra: 6.1 mm dashes 7.7 mm apart), a size drawn only in straight dashed lines taken
 * for a guide (Lanai), and straight lines of one length repeated taken for tile frames (Lanai's
 * rectangles). The file is read again with them joined and those rules off. The second read is
 * kept only when it lacks less, so a file that reads well is never changed by it.
 */
export function buildChainsDetailed(
  sheet: Sheet,
  opts: ChainOpts,
  extras: BuildExtras = {},
  progress?: Progress,
): { set: ChainSet; recover: RecoverOut; used: ChainOpts } {
  const first = buildOnce(sheet, opts, extras, progress);
  if (opts.dashTrains || lackOf(first) === 0) return { ...first, used: opts };
  const wide = { ...opts, dashTrains: true, keepGuides: true, keepRepeats: true };
  const again = buildOnce(sheet, wide, extras);
  return lackOf(again) < lackOf(first) ? { ...again, used: wide } : { ...first, used: opts };
}

/** A row of marks the plain read drops, to be SHOWN in a size's row of the legend. */
export type ShownRow = { classId: number; pts: PtMm[] };

const SHOWN = {
  /** A shown row is a line: at least this many marks… */
  minMarks: 20,
  /** …over at least this length, mm. */
  minLenMm: 40,
  /** The row is cut where two of its marks are farther apart than this many usual steps (≥ 6 mm). */
  gapSteps: 3,
};

/**
 * The marks that are in NO line of `base` and that a second read with `ChainOpts.keepRows` puts in
 * a size's line — as polylines through the marks' centres, each under the size row of `base` with
 * that label. They are for the sizes step to light: nothing of `base` changes, and no later stage
 * is given them. `used` = the options `base` was built with.
 *
 * Why by marks and not by chains: after the rows are kept the size recovery joins them with the
 * size's other lines, so the chains of the two reads do not correspond one to one. A printed mark
 * does: it is either in a line of `base` or it is not.
 */
export function shownOnlyRows(
  sheet: Sheet,
  used: ChainOpts,
  extras: BuildExtras,
  base: ChainSet,
): ShownRow[] {
  const again = buildOnce(sheet, { ...used, keepRows: true }, extras).set;
  const inBase = new Set<PathId>();
  for (const c of base.chains) for (const r of c.ranges) inBase.add(r.path);
  const centre = new Map<PathId, PtMm>();
  for (const p of sheet.paths) {
    if (inBase.has(p.id) || !p.pts.length) continue;
    let x = 0;
    let y = 0;
    for (const q of p.pts) {
      x += q.x;
      y += q.y;
    }
    centre.set(p.id, { x: x / p.pts.length, y: y / p.pts.length });
  }
  const out: ShownRow[] = [];
  for (const cls of again.classes) {
    if (cls.role !== 'size' || !cls.sizeLabel) continue;
    const to = base.classes.find((c) => c.role === 'size' && c.sizeLabel === cls.sizeLabel);
    if (!to) continue;
    for (const id of cls.chains) {
      const ch = again.chains[id];
      if (!ch) continue;
      // runs of consecutive marks of this line that no line of the plain read holds
      let run: PtMm[] = [];
      const flush = () => {
        if (run.length >= SHOWN.minMarks) {
          const steps = run.slice(1).map((p, i) => Math.hypot(p.x - run[i].x, p.y - run[i].y));
          const usual = [...steps].sort((a, b) => a - b)[steps.length >> 1] ?? 0;
          const cut = Math.max(6, SHOWN.gapSteps * usual);
          let part: PtMm[] = [run[0]];
          const emit = () => {
            const len = part
              .slice(1)
              .reduce((a, p, i) => a + Math.hypot(p.x - part[i].x, p.y - part[i].y), 0);
            if (part.length >= SHOWN.minMarks && len >= SHOWN.minLenMm)
              out.push({ classId: to.id, pts: part });
          };
          for (let k = 1; k < run.length; k++) {
            if (steps[k - 1] > cut) {
              emit();
              part = [];
            }
            part.push(run[k]);
          }
          emit();
        }
        run = [];
      };
      let last: PathId | null = null;
      for (const r of ch.ranges) {
        if (r.path === last) continue;
        last = r.path;
        const c = centre.get(r.path);
        if (c) run.push(c);
        else flush();
      }
      flush();
    }
  }
  return out;
}

export const buildChains: BuildChainsFn = (sheet, opts, progress) =>
  buildChainsDetailed(sheet, opts, {}, progress).set;

function toChainSet(
  rec: RecoverOut,
  stats: { items: number; freeBeads: number; ignoredPaths: number },
  seam: SeamPen[] = [],
  styles?: ReadonlyMap<number, Style>,
): ChainSet {
  const chains: Chain[] = rec.chains;
  const classes: LineClass[] = [];
  const total = (ids: number[]) => ids.reduce((a, i) => a + chains[i].lengthMm, 0);
  // a seam line in a pen of its own is not a size (chains/seam.ts): out of every other row
  const seamIds = new Set(seam.flatMap((p) => p.chains));
  if (seamIds.size) {
    const keep = (ids: number[]) => ids.filter((i) => !seamIds.has(i));
    rec = {
      ...rec,
      // a size row that was only the seam pen goes with it
      sizes: rec.sizes
        .map((s) => ({ ...s, chains: keep(s.chains), was: s.chains.length }))
        .filter((s) => s.chains.length || !s.was)
        .map(({ was: _was, ...s }) => s),
      orphans: keep(rec.orphans),
      common: keep(rec.common),
      internal: keep(rec.internal),
    };
  }
  // sizes no line carries are not sizes: a one-size file whose pens recovery could not rank (every
  // PLT/SVG fixture, BLAZER) showed two nameless empty rows — it is one size (detectSizeRun: single)
  const noSizes = rec.sizes.length > 0 && rec.sizes.every((s) => !s.chains.length);
  for (const s of noSizes ? [] : rec.sizes) {
    classes.push({
      id: classes.length,
      role: 'size',
      sizeLabel: s.label,
      chains: s.chains,
      totalLengthMm: total(s.chains),
      evidence: s.evidence,
      confidence: s.confidence,
    });
  }
  const plainCommon = rec.common.filter((i) => !rec.sharedFrom.has(i));
  const shared = rec.common.filter((i) => rec.sharedFrom.has(i));
  if (plainCommon.length)
    classes.push({
      id: classes.length,
      role: 'common',
      sizeLabel: null,
      chains: plainCommon,
      totalLengthMm: total(plainCommon),
      evidence: [],
      confidence: 0.7,
    });
  if (shared.length) {
    // one row per size whose style drew the shared stretch: the operator sees "drawn as 88, used by all"
    const byRank = new Map<number, number[]>();
    for (const i of shared) {
      const r = rec.sharedFrom.get(i)!;
      const a = byRank.get(r);
      if (a) a.push(i);
      else byRank.set(r, [i]);
    }
    for (const [r, ids] of [...byRank].sort((a, b) => a[0] - b[0])) {
      const ev: ClassEvidence[] = [{ kind: 'nesting-order', rank: r }];
      classes.push({
        id: classes.length,
        role: 'common',
        sizeLabel: null,
        chains: ids,
        totalLengthMm: total(ids),
        evidence: ev,
        confidence: 0.6,
      });
    }
  }
  for (const p of seam)
    classes.push({
      id: classes.length,
      role: 'seam',
      sizeLabel: null,
      chains: p.chains,
      totalLengthMm: total(p.chains),
      evidence: [{ kind: 'seam-offset', offsetMm: p.offsetMm }],
      confidence: 0.7,
    });
  if (rec.notches.length)
    classes.push({
      id: classes.length,
      role: 'notch',
      sizeLabel: null,
      chains: rec.notches,
      totalLengthMm: total(rec.notches),
      evidence: [],
      confidence: 0.5,
    });
  if (rec.internal.length)
    classes.push({
      id: classes.length,
      role: 'internal',
      sizeLabel: null,
      chains: rec.internal,
      totalLengthMm: total(rec.internal),
      evidence: [],
      confidence: 0.5,
    });
  const byWhy = new Map<string, number[]>();
  // one row per line: a line given two reasons keeps the first (LINEASSIGN-2)
  const ignored = new Set<number>();
  for (const { id, why } of rec.ignore) {
    if (ignored.has(id)) continue;
    ignored.add(id);
    const key = why.replace(/\d+/g, '#');
    const a = byWhy.get(key);
    if (a) a.push(id);
    else byWhy.set(key, [id]);
  }
  for (const [why, ids] of byWhy) {
    const greyOnly = why.startsWith(GREY_COLOUR_ONLY);
    const rgb = greyOnly ? styles?.get(chains[ids[0]].style)?.strokeRgb : null;
    classes.push({
      id: classes.length,
      role: 'ignore',
      sizeLabel: null,
      chains: ids,
      totalLengthMm: total(ids),
      evidence: rgb ? [{ kind: 'colour-only', rgb }] : [],
      // colour alone is no proof (a grey cut line): the legend asks
      confidence: greyOnly ? 0.4 : 0.8,
    });
  }
  const warnings = [
    `chains ${chains.length} from ${stats.items} items (${stats.ignoredPaths} paths not line work, ${stats.freeBeads} loose beads)`,
    noSizes
      ? `size encoding single, 1 sizes (${rec.encoding} found ${rec.n} looks, no line ranked)`
      : `size encoding ${rec.encoding}, ${rec.n} sizes`,
    ...seam.map(
      (p) =>
        `seam line: ${p.chains.length} chains drawn ${p.offsetMm} mm inside the cut line (allowance evidence)`,
    ),
  ];
  // questions about size rows that are not shown any more
  const sizeQs = new Set<string>(['size-count', 'labels-missing', 'rank-direction', 'size-empty']);
  return {
    chains,
    classes,
    bundles: rec.bundles,
    orphans: rec.orphans,
    ambiguities: noSizes ? rec.ambiguities.filter((a) => !sizeQs.has(a.kind)) : rec.ambiguities,
    warnings,
    ...(rec.bracketedOutlines?.length && !noSizes
      ? { bracketedOutlines: rec.bracketedOutlines }
      : {}),
    ...(rec.cornerWalls?.length && !noSizes ? { cornerWalls: rec.cornerWalls } : {}),
    ...(byWhy.get(LABEL_FRAME_WHY)?.length ? { labelFrames: byWhy.get(LABEL_FRAME_WHY) } : {}),
  };
}

/** Rank of a size class (its nesting-order evidence), or null for non-size classes. */
export function rankOfClass(c: LineClass): number | null {
  if (c.role !== 'size') return null;
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
}
