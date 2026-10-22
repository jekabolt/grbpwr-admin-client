// What the print dialog remembers between prints, in this browser: the last roll (width + sheet
// profile), the recent widths (newest first) and the last sizes × copies per card. The marker's
// download corner reads `last` too (lib/pattern-export/roll-strips.ts). Every access is guarded:
// a private window or blocked storage just means nothing is prefilled.
import { ROLL_DEFAULTS, type RollSpec, type SizeCopies } from 'lib/pattern-export/roll-print';

export const PRINT_ROLL_KEY = 'grbpwr.printRoll';
const RECENT_MAX = 4;

export type PrintRollMemory = {
  last?: RollSpec;
  recent: number[];
  picks: Record<string, SizeCopies>;
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export function readPrintRoll(): PrintRollMemory {
  const empty: PrintRollMemory = { recent: [], picks: {} };
  try {
    const raw = window.localStorage.getItem(PRINT_ROLL_KEY);
    if (!raw) return empty;
    const v = JSON.parse(raw) as Partial<Record<keyof PrintRollMemory, unknown>>;
    const l = (v.last ?? {}) as Partial<Record<keyof RollSpec, unknown>>;
    const widthCm = num(l.widthCm);
    const last: RollSpec | undefined =
      widthCm != null
        ? {
            widthCm,
            maxSheetM: num(l.maxSheetM) ?? ROLL_DEFAULTS.maxSheetM,
            edgeMm: typeof l.edgeMm === 'number' && l.edgeMm >= 0 ? l.edgeMm : ROLL_DEFAULTS.edgeMm,
          }
        : undefined;
    const recent = Array.isArray(v.recent)
      ? v.recent
          .map(num)
          .filter((n): n is number => n != null)
          .slice(0, RECENT_MAX)
      : [];
    const picks =
      v.picks && typeof v.picks === 'object' ? (v.picks as Record<string, SizeCopies>) : {};
    return { last, recent, picks };
  } catch {
    return empty;
  }
}

/** One print done (or laid out): the roll goes first in `recent`, the picks under the card. */
export function rememberPrintRoll(roll: RollSpec, cardKey: string, copies: SizeCopies): void {
  try {
    const m = readPrintRoll();
    const recent = [roll.widthCm, ...m.recent.filter((w) => w !== roll.widthCm)].slice(
      0,
      RECENT_MAX,
    );
    const next: PrintRollMemory = {
      last: roll,
      recent,
      picks: cardKey ? { ...m.picks, [cardKey]: copies } : m.picks,
    };
    window.localStorage.setItem(PRINT_ROLL_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the next print simply asks again with nothing prefilled.
  }
}
