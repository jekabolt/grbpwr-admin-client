// The card's size chart speaks in 16 free dictionary names (measurement_name: waist, inseam,
// length, rise, hips, shoulders, chest, sleeve, width, leg-opening, hip, bottom-width, depth,
// start-fit-length, end-fit-length, height). Until the card owns POM definitions (P4), each name
// maps to one standard POM here — chest / waist / hips in the HALF (flat) convention by default,
// labelled so, because no card on prod states its convention (every chart is empty, 10.10).

import {
  POM,
  type GarmentKind,
  type GirthConvention,
  type PomCode,
  type PomReport,
  type PomValue,
} from './types';

export const DICTIONARY_NAMES = [
  'waist',
  'inseam',
  'length',
  'rise',
  'hips',
  'shoulders',
  'chest',
  'sleeve',
  'width',
  'leg-opening',
  'hip',
  'bottom-width',
  'depth',
  'start-fit-length',
  'end-fit-length',
  'height',
] as const;
export type DictionaryName = (typeof DICTIONARY_NAMES)[number];

/** Dictionary name → the POM it reads, per garment kind; null = not a garment POM. */
export const DICTIONARY_POM: Record<DictionaryName, Partial<Record<GarmentKind, PomCode>> | null> =
  {
    chest: { top: 'chest' },
    waist: { top: 'waist', bottom: 'waist' },
    hips: { bottom: 'hip' },
    hip: { bottom: 'hip' },
    shoulders: { top: 'across-shoulder' },
    length: { top: 'length-hps', bottom: 'outseam' },
    sleeve: { top: 'sleeve-length' },
    inseam: { bottom: 'inseam' },
    rise: { bottom: 'front-rise' },
    'leg-opening': { bottom: 'leg-opening' },
    'bottom-width': { top: 'hem', bottom: 'leg-opening' },
    width: null,
    depth: null,
    height: null,
    'start-fit-length': null,
    'end-fit-length': null,
  };

export type DictionaryValue = {
  name: DictionaryName;
  size: string;
  pom: PomCode | null;
  /** In the requested convention for girths. */
  valueMm: number | null;
  halfMm?: number | null;
  fullMm?: number | null;
  convention: GirthConvention | null;
  exactness: PomValue['exactness'] | 'unmapped';
  reason?: string;
};

/** Every dictionary name for every size, read off the report. */
export function pomsToDictionary(
  report: PomReport,
  convention: GirthConvention = report.convention,
): DictionaryValue[] {
  const out: DictionaryValue[] = [];
  for (const s of report.sizes) {
    for (const name of DICTIONARY_NAMES) {
      const code = DICTIONARY_POM[name]?.[report.garment] ?? null;
      const v = code ? s.values.find((x) => x.code === code) : undefined;
      if (!code || !v) {
        out.push({
          name,
          size: s.size,
          pom: code,
          valueMm: null,
          convention: null,
          exactness: 'unmapped',
          reason: code
            ? 'POM not computed'
            : `«${name}» is not a ${report.garment === 'top' ? 'top' : 'bottom'} POM`,
        });
        continue;
      }
      const isGirth = v.halfMm !== undefined;
      out.push({
        name,
        size: s.size,
        pom: code,
        valueMm: isGirth
          ? convention === 'half'
            ? v.halfMm ?? null
            : v.fullMm ?? null
          : v.valueMm,
        ...(isGirth ? { halfMm: v.halfMm, fullMm: v.fullMm } : {}),
        convention: isGirth ? convention : null,
        exactness: v.exactness,
        reason: v.reason,
      });
    }
  }
  return out;
}

export type MeasurementUnit =
  | 'TECH_CARD_MEASUREMENT_UNIT_MM'
  | 'TECH_CARD_MEASUREMENT_UNIT_CM'
  | 'mm'
  | 'cm'
  | string;

export const unitToMm = (unit: MeasurementUnit) => (/cm$/i.test(unit) ? 10 : 1);

/** One cell of the card's chart: the size as the file / dictionary names it, the measurement name. */
export type ChartCell = { size: string; name: string; value: number };

export type ChartComparison = {
  name: string;
  size: string;
  specMm: number;
  patternMm: number | null;
  deltaMm: number | null;
  within: boolean | null;
  tolMm: number;
  tolSource: 'default' | 'card';
  convention: GirthConvention | null;
  conventionSource: 'default' | 'card';
  exactness: DictionaryValue['exactness'];
  reason?: string;
};

const normSize = (s: string) => s.replace(/[<>\s]/g, '').toLowerCase();

/**
 * The card's chart against the pattern: Δ = pattern − spec, within ±tolerance (default ±10 mm,
 * labelled «default» until the card stores one). Values in the card's unit (MM / CM).
 */
export function compareToSizeChart(
  report: PomReport,
  chart: readonly ChartCell[],
  unit: MeasurementUnit,
  opts: { convention?: GirthConvention; tolMm?: number; tolSource?: 'default' | 'card' } = {},
): ChartComparison[] {
  const convention = opts.convention ?? report.convention;
  const tolMm = opts.tolMm ?? POM.defaultTolMm;
  const k = unitToMm(unit);
  const dict = pomsToDictionary(report, convention);
  return chart.map((c) => {
    const d = dict.find((x) => x.name === c.name && normSize(x.size) === normSize(c.size));
    const specMm = c.value * k;
    const patternMm = d?.valueMm ?? null;
    const deltaMm = patternMm == null ? null : patternMm - specMm;
    return {
      name: c.name,
      size: c.size,
      specMm,
      patternMm,
      deltaMm,
      within: deltaMm == null ? null : Math.abs(deltaMm) <= tolMm,
      tolMm,
      tolSource: opts.tolSource ?? 'default',
      convention: d?.convention ?? null,
      conventionSource: report.conventionSource,
      exactness: d?.exactness ?? 'unmapped',
      reason: d?.reason,
    };
  });
}
