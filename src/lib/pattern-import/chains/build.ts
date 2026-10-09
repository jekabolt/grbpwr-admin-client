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
  Progress,
  Sheet,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { recoverSizes, type RecoverOut } from '../sizes/recover';
import { furniture } from './classify';
import { makeChains } from './make';

export const DEFAULT_CHAIN_OPTS: ChainOpts = {
  joinGapMm: PATIMPORT.joinGapMm,
  joinAngleDeg: PATIMPORT.joinAngleDeg,
  joinLateralMm: PATIMPORT.joinLateralMm,
};

export type BuildExtras = {
  /** Instruction-page texts (size runs, legends) — the worker passes every page's text. */
  extraTexts?: string[];
  fileNames?: Map<string, string>;
};

/** Full pipeline with its diagnostics (the probe and the worker stage use this). */
export function buildChainsDetailed(
  sheet: Sheet,
  opts: ChainOpts,
  extras: BuildExtras = {},
  progress?: Progress,
): { set: ChainSet; recover: RecoverOut } {
  progress?.(0, 3, 'chains');
  const mk = makeChains(sheet, opts);
  progress?.(1, 3, 'classes');
  const styles = new Map<number, Style>(sheet.styles.map((s) => [s.id, s]));
  const furn = furniture(mk.chains, styles, sheet.poses);
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
  const set = toChainSet(rec, mk.stats);
  progress?.(3, 3);
  return { set, recover: rec };
}

export const buildChains: BuildChainsFn = (sheet, opts, progress) =>
  buildChainsDetailed(sheet, opts, {}, progress).set;

function toChainSet(
  rec: RecoverOut,
  stats: { items: number; freeBeads: number; ignoredPaths: number },
): ChainSet {
  const chains: Chain[] = rec.chains;
  const classes: LineClass[] = [];
  const total = (ids: number[]) => ids.reduce((a, i) => a + chains[i].lengthMm, 0);
  for (const s of rec.sizes) {
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
  for (const { id, why } of rec.ignore) {
    const key = why.replace(/\d+/g, '#');
    const a = byWhy.get(key);
    if (a) a.push(id);
    else byWhy.set(key, [id]);
  }
  for (const [, ids] of byWhy)
    classes.push({
      id: classes.length,
      role: 'ignore',
      sizeLabel: null,
      chains: ids,
      totalLengthMm: total(ids),
      evidence: [],
      confidence: 0.8,
    });
  const warnings = [
    `chains ${chains.length} from ${stats.items} items (${stats.ignoredPaths} paths not line work, ${stats.freeBeads} loose beads)`,
    `size encoding ${rec.encoding}, ${rec.n} sizes`,
  ];
  return {
    chains,
    classes,
    bundles: rec.bundles,
    orphans: rec.orphans,
    ambiguities: rec.ambiguities,
    warnings,
  };
}

/** Rank of a size class (its nesting-order evidence), or null for non-size classes. */
export function rankOfClass(c: LineClass): number | null {
  if (c.role !== 'size') return null;
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
}
