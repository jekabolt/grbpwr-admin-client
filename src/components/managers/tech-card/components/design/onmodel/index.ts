/**
 * ON MODEL — THE ASIDE OF THE DESIGN BAND: a real photograph, repainted.
 *
 * Hand `OnModelStudio` the band and it draws the step — the shot this run repaints, what it is
 * repainted in, the doors of the run, and what came back. The organs under it are exported for a
 * composer who wants them apart, not because the screen is meant to be reassembled by hand.
 *
 * ONE READ — `GetDesignBand`, passed in as a prop (never a second call) — plus the card's fittings
 * (`ListFittings` by card, the sample panels' own read); ONE WRITE — `StartDesignRun` through the
 * shared `useStartDesignRun`. The select mark on an output goes through the band's frozen write
 * seam (`useDesignWrites`); a new cloth goes through the shelf's (`useAssetWrites`).
 *
 * THIS SCREEN DOES NOT POLL THE LIVE RUN: `useRunPolling` lives inside `GenerationHistory`, which
 * the composer mounts under this step as under every generative step. A second poll here would be
 * two intervals on one band.
 */
export { OnModelStudio } from './studio';
export { OnModelOutputs } from './outputs';
export { ShotGroup } from './shot-group';
export { PaintGroup } from './paint-group';
export { useOnModelPaint, useOnModelShot } from './drafts';
export type { PaintDraft, ShotDraft } from './drafts';
export {
  NO_PAINT,
  RECOLOR_SOURCES_MAX,
  addShots,
  asRowGate,
  chosenCloth,
  clothChoices,
  fittingDayStamp,
  fittingShots,
  fittingsWithShots,
  flatColours,
  lastRecolorCharge,
  onModelGate,
  paintModeWord,
  paintText,
  paintWire,
  recolorGate,
  recolorOutputs,
  recolorRuns,
  recolorShape,
  recolourWireColour,
  shotMediaIds,
  shotName,
  shotOrigin,
  targetIsStated,
} from './model';
export type {
  ClothChoice,
  FittingShot,
  FlatColour,
  OnModelDoor,
  OnModelGate,
  OnModelPaint,
  OnModelShot,
  RecolorCharge,
  ShotSource,
} from './model';
