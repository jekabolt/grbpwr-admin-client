import type { Unit } from './types';

// $INSUNITS → cm-per-drawing-unit. AAMA/ASTM garment DXF is normatively mm; absent/0 means
// "unspecified", which we resolve to mm and surface in the warnings + unit dropdown so a
// 10× error is visible at a glance (a sleeve reads 6.2 cm instead of 62 cm). Feet/meters
// keep their exact factor but display as the nearest offered unit.
const INSUNITS_TO_CM: Record<number, { unit: Exclude<Unit, 'auto'>; cm: number }> = {
  1: { unit: 'in', cm: 2.54 },
  2: { unit: 'in', cm: 30.48 }, // feet
  4: { unit: 'mm', cm: 0.1 },
  5: { unit: 'cm', cm: 1 },
  6: { unit: 'cm', cm: 100 }, // meters
};

export function unitFactorCm(unit: Exclude<Unit, 'auto'>): number {
  switch (unit) {
    case 'mm':
      return 0.1;
    case 'cm':
      return 1;
    case 'in':
      return 2.54;
  }
}

export function detectUnit(insunits: number | undefined): {
  unit: Exclude<Unit, 'auto'>;
  cm: number;
  guessed: boolean;
} {
  const hit = insunits != null ? INSUNITS_TO_CM[insunits] : undefined;
  if (hit) return { unit: hit.unit, cm: hit.cm, guessed: false };
  return { unit: 'mm', cm: 0.1, guessed: true };
}
