// A10 · AUTOPILOT — the assumption record (rule D5). The manifest carries `AutopilotAssumption`
// (lib/pattern-import/types.ts); the wizard keeps the seed it was about, to drop the answers of a
// piece that was set aside later and to show it on the piece.
import type { AutopilotAssumption, AutopilotRecord, SeedId } from 'lib/pattern-import/types';

export type AssumptionKind =
  | 'clean-accept'
  | 'pages-as-read'
  | 'scale-confirmed'
  | 'scale-1to1'
  | 'scale-anisotropic'
  | 'sheet-choice'
  // D6: a piece / a whole tile sheet drawn twice, kept once (pieces/sheets.ts)
  | 'sheet-copy'
  | 'sheet-alternative'
  // D6: the operator confirmed that the tile sheets' different size rows are as read
  | 'sheet-legend'
  | 'residuals'
  // UXHOOKS: a missing tile taken as a blank page (two evidences, assemble/holes.ts)
  | 'missing-accepted'
  // UXHOOKS: the operator's "looked at the outlines set aside" — replayed only, never the policy's
  | 'asides-reviewed'
  | 'drawn-sizes'
  | 'legend-row'
  | 'legend-outline'
  | 'size-guess'
  | 'size-ordinal'
  | 'size-dropped'
  | 'model'
  | 'seed-click'
  | 'set-aside'
  | 'size-flag'
  | 'not-a-piece'
  | 'dropped-piece'
  | 'name-code'
  | 'name-confirmed'
  | 'grain-proposal'
  | 'grain-axis'
  | 'fold-edge'
  | 'not-a-fold'
  | 'cutting-list'
  | 'outline'
  | 'quantity'
  | 'fabric'
  // AP-replay: answers only a replay gives (the operator's own, reused)
  | 'sheet-grid'
  | 'sheet-passed'
  | 'piece-edits'
  | 'piece-override'
  | 'name-typed'
  // LINEFIX: lines the operator put in a size by hand (never the autopilot's own answer)
  | 'line-assign';

/**
 * `seed` and `ref` are the machine handles of the subject (a piece, a page "file:page", a source
 * size "rank:n", a legend row, an outline); the subject itself is for people. Neither is written.
 */
export type Assumption = AutopilotAssumption & {
  kind: AssumptionKind;
  seed?: SeedId;
  ref?: string;
};

/** One record per question: a later answer to the same question replaces the earlier one. */
export const assumptionKey = (a: Pick<Assumption, 'kind' | 'subject' | 'seed' | 'ref'>) =>
  `${a.kind}|${a.seed != null ? `#${a.seed}` : a.ref ?? a.subject}`;

/**
 * The record a manifest carries: piece answers of pieces no longer written are left out (a piece
 * set aside keeps its "not a piece" answer), the seed is not written.
 */
export function autopilotRecordOf(
  list: readonly Assumption[],
  exported?: ReadonlySet<SeedId>,
): AutopilotRecord {
  const keep = (a: Assumption) =>
    a.seed == null ||
    !exported ||
    exported.has(a.seed) ||
    a.kind === 'not-a-piece' ||
    a.kind === 'dropped-piece';
  return { v: 1, assumptions: list.filter(keep).map(({ seed: _s, ref: _r, ...a }) => a) };
}

/** The list with these answers merged in: one per question, a later answer replaces the earlier. */
export function mergeAssumptions(
  list: readonly Assumption[],
  more: readonly Assumption[],
): Assumption[] {
  if (!more.length) return [...list];
  const keys = new Set(more.map(assumptionKey));
  return [...list.filter((a) => !keys.has(assumptionKey(a))), ...more];
}
