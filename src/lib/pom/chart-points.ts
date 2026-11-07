import { DICTIONARY_NAMES, DICTIONARY_POM } from './dictionary';
import { POM_DEFS } from './poms';
import type { GarmentKind, PomCode } from './types';

/** Measurement names added for the pattern-backed size chart. */
export const PATTERN_CHART_NAMES = [
  'length-cb',
  'shoulder-length',
  'neck-width',
  'neck-drop-front',
  'neck-drop-back',
  'armhole',
  'underarm',
  'bicep',
  'sleeve-opening',
  'collar-length',
  'stand-height',
  'collar-point',
  'back-rise',
  'thigh',
  'knee',
] as const;

export type PatternChartName = (typeof PATTERN_CHART_NAMES)[number];
export type ChartMeasurementName = (typeof DICTIONARY_NAMES)[number] | PatternChartName;

/**
 * One stable chart row for every POM. Existing dictionary names stay where the old mapping already
 * made them garment measurements; the new names cover the POMs the old 16-name chart could not
 * express. `height` is the old, otherwise-unused vertical name for outseam, keeping the mapping
 * one-to-one while `length` remains the established top body length.
 */
export const POM_CHART_NAME: Record<PomCode, ChartMeasurementName> = {
  chest: 'chest',
  waist: 'waist',
  hip: 'hip',
  hem: 'bottom-width',
  'length-hps': 'length',
  'length-cb': 'length-cb',
  'across-shoulder': 'shoulders',
  shoulder: 'shoulder-length',
  'neck-width': 'neck-width',
  'neck-drop-front': 'neck-drop-front',
  'neck-drop-back': 'neck-drop-back',
  armhole: 'armhole',
  'sleeve-length': 'sleeve',
  underarm: 'underarm',
  bicep: 'bicep',
  'sleeve-opening': 'sleeve-opening',
  'collar-length': 'collar-length',
  'stand-height': 'stand-height',
  'collar-point': 'collar-point',
  'front-rise': 'rise',
  'back-rise': 'back-rise',
  inseam: 'inseam',
  outseam: 'height',
  thigh: 'thigh',
  knee: 'knee',
  'leg-opening': 'leg-opening',
};

export const DEFAULT_POINTS: Record<GarmentKind, PomCode[]> = {
  bottom: ['waist', 'hip', 'front-rise', 'thigh', 'knee', 'leg-opening', 'inseam', 'outseam'],
  top: [
    'chest',
    'waist',
    'hem',
    'length-hps',
    'across-shoulder',
    'sleeve-length',
    'bicep',
    'sleeve-opening',
  ],
};

export const POM_CODES_BY_GARMENT: Record<GarmentKind, PomCode[]> = {
  top: [...new Set(POM_DEFS.filter((def) => def.garment === 'top').map((def) => def.code))],
  bottom: [...new Set(POM_DEFS.filter((def) => def.garment === 'bottom').map((def) => def.code))],
};

export function isGirth(code: PomCode): boolean {
  return POM_DEFS.some((def) => def.code === code && def.girth);
}

/** The old dictionary mapping retained for the codes it can express, useful in coverage tests. */
export const MAPPED_DICTIONARY_POMS = new Set(
  Object.values(DICTIONARY_POM).flatMap((mapping) =>
    mapping ? Object.values(mapping).filter((code): code is PomCode => !!code) : [],
  ),
);
