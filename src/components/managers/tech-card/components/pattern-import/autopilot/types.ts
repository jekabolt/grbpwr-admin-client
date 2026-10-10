// A10 · AUTOPILOT — the assumption record (rule D5). The manifest carries `AutopilotAssumption`
// (lib/pattern-import/types.ts); the wizard keeps the seed it was about, to drop the answers of a
// piece that was set aside later and to show it on the piece.
import type { AutopilotAssumption, SeedId } from 'lib/pattern-import/types';

export type AssumptionKind =
  | 'scale-confirmed'
  | 'scale-1to1'
  | 'scale-anisotropic'
  | 'sheet-choice'
  | 'residuals'
  | 'drawn-sizes'
  | 'legend-row'
  | 'size-guess'
  | 'size-ordinal'
  | 'size-dropped'
  | 'model'
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
  | 'fabric';

export type Assumption = AutopilotAssumption & { kind: AssumptionKind; seed?: SeedId };

/** One record per question: a later answer to the same question replaces the earlier one. */
export const assumptionKey = (a: Pick<Assumption, 'kind' | 'subject'>) => `${a.kind}|${a.subject}`;
