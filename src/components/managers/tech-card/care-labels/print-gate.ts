// WHAT HOLDS THE PRINT, in one word. A hole matters only where the generator has to make the label: a
// colour whose every size is an own file prints whatever its text says, and with one file for
// everything the text does not count at all.
import {
  oneFileOf,
  ownCellOf,
  type ArtworkChoice,
} from '../components/composition-label/composition-artwork-model';
import type { ArtworkFile } from '../components/sewn-label-model';
import type { CareLabelRun } from './adapter';
import { isBlocking, type Hole } from './holes';
import { isRunStale, toQty } from './quantities';
import type { Readiness } from './readiness';
import type { QuantitySource } from './use-care-label-prefs';

export type PrintReason = 'no file' | 'no text' | 'no data' | 'no fonts';

const NOT_LOADED: ReadonlySet<string> = new Set([
  'colorway-unavailable',
  'materials-unavailable',
  'dictionary-unavailable',
]);

function reasonOf(holes: readonly Hole[]): PrintReason | null {
  if (!holes.length) return null;
  if (holes.some((h) => h.code === 'fonts-failed')) return 'no fonts';
  return holes.some((h) => NOT_LOADED.has(h.code)) ? 'no data' : 'no text';
}

export type PrintGate = {
  reason: PrintReason | null;
  /** Colours the print leaves out because of `reason`. */
  blocked: ReadonlySet<number>;
};

export function printGate(input: {
  choice: ArtworkChoice;
  files: readonly ArtworkFile[];
  /** Readiness of the whole card: nothing unticked, no quantities. */
  readiness: Readiness;
  colorwayIds: readonly number[];
  sizeIds: readonly number[];
}): PrintGate {
  const { choice, files, readiness, colorwayIds, sizeIds } = input;
  const fonts = readiness.global.filter((h) => h.code === 'fonts-failed');
  if (fonts.length) return { reason: 'no fonts', blocked: new Set(colorwayIds) };
  if (choice === 'one') {
    return oneFileOf(files)
      ? { reason: null, blocked: new Set() }
      : { reason: 'no file', blocked: new Set(colorwayIds) };
  }
  const global = readiness.global.filter(isBlocking);
  const blocked = new Set<number>();
  const holding: Hole[] = [];
  for (const id of colorwayIds) {
    if (sizeIds.length > 0 && sizeIds.every((s) => ownCellOf(files, id, s))) continue;
    const own = (readiness.colorways.find((r) => r.colorwayId === id)?.holes ?? []).filter(
      isBlocking,
    );
    if (own.length || global.length) {
      blocked.add(id);
      holding.push(...own, ...global);
    }
  }
  return { reason: reasonOf(holding), blocked };
}

/** Where the numbers come from: the run asked for, else the first that is still a plan, else manual. */
export function printSource(
  stored: QuantitySource,
  runs: readonly CareLabelRun[],
  manualOn: boolean,
): CareLabelRun | 'manual' {
  if (manualOn) return 'manual';
  const asked = typeof stored === 'object' ? runs.find((r) => r.id === stored.runId) : undefined;
  return asked ?? runs.find((r) => !isRunStale(r)) ?? 'manual';
}

export const runCaption = (run: CareLabelRun): string =>
  `run ${run.id} · ${run.lines.reduce((sum, l) => sum + toQty(l.plannedQty), 0)} pcs`;
