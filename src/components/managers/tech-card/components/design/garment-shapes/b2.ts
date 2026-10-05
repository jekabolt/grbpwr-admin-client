/**
 * Drawing batch B2 knits, hoodies, vests, lounge — 95-GARMENT-TAXONOMY.md §4.2.
 * Families: cardigan, turtleneck, knit_vest, zip_hoodie, crop_hoodie, puffer_vest, gilet, utility_vest, robe, pyjamas, lounge_set, boxers.
 *
 * Edit ONLY this file. A family missing from SHAPES renders its manifest `base` drawing (and the
 * base's marks for the parts both share); once drawn, it needs a PARTS entry with a mark for every
 * token of its manifest `parts` (same view, `zone` where the token says `(z)`) — the probe
 * (`node scripts/garment-manifest-probe.mjs`) fails a drawn family whose marks and tokens differ.
 * House rules: header comment of ../garment-pictograms.tsx; derive from the base, keep its hem
 * heights. Do not import runtime values from garment-pictograms / garment-parts (import cycle):
 * copy base path strings instead. Helpers `mark` / `zone` live in ./kit.
 */
import type { GarmentFamily, PartKey } from '../garment-manifest';
import type { GarmentShape, PartMark } from './kit';

export const SHAPES: Partial<Record<GarmentFamily, GarmentShape>> = {};

export const PARTS: Partial<Record<GarmentFamily, Partial<Record<PartKey, PartMark>>>> = {};
