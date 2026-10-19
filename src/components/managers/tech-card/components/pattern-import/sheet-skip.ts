// A0.2 (AUTO): a sheet that is ONE page has nothing to assemble and nothing to choose — the sheet
// step is passed over like the DXF fast path passes it (Next on scale lands on sizes). The stepper
// still shows it ("sheet · 1 page") and the door back to it stays open. Pure: the e2e probe counts
// the same skip (scripts/pattern-import/e2e-entry.ts, A7).
import type { GridOverride, PageClassification, StageIO } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

export function singlePageSheet(
  pages: readonly PageClassification[],
  assembled: StageIO['assemble']['out'] | null | undefined,
  gridOverride?: GridOverride,
): boolean {
  if (!assembled || gridOverride) return false;
  // one tile page in all the files: one sheet, nothing to pick between
  if (pages.filter((p) => p.cls === 'tile').length !== 1) return false;
  const { poses, missing } = assembled.sheet;
  return (
    poses.length === 1 &&
    missing.length === 0 &&
    poses[0].residualMm <= PATIMPORT.registrationMaxResidualMm
  );
}
