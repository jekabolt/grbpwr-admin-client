/**
 * Drawing batch B9 headwear, socks, small — 95-GARMENT-TAXONOMY.md §4.2.
 * Families: beanie, bucket_hat, ankle_sock, knee_sock, bandana, cardholder.
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
import { mark, type GarmentShape, type PartMark } from './kit';

export const SHAPES: Partial<Record<GarmentFamily, GarmentShape>> = {
  beanie: {
    body: 'M13 59 C13 42 20 29 32 29 C44 29 51 42 51 59 L51 64 L13 64 Z',
    front: [
      'M13 51 Q32 54 51 51 L51 64 Q32 61 13 64 Z',
      'M20 52.5 L20 62.5',
      'M26 53.5 L26 62',
      'M32 54 L32 61.5',
      'M38 53.5 L38 62',
      'M44 52.5 L44 62.5',
      'M28 55 L36 55 L36 61 L28 61 Z',
    ],
    back: [
      'M13 51 Q32 54 51 51 L51 64 Q32 61 13 64 Z',
      'M20 52.5 L20 62.5',
      'M26 53.5 L26 62',
      'M38 53.5 L38 62',
      'M44 52.5 L44 62.5',
      'M32 29 L32 53.5',
    ],
    side: [
      'M15 59 C14 42 23 29 35 29 C46 30 52 42 52 59 L52 64 L15 64 Z',
      'M15 51 Q33 54 52 51 L52 64 Q33 61 15 64 Z',
      'M22 52.5 L22 62.5',
      'M29 53.5 L29 62',
      'M36 53.5 L36 62',
      'M43 52.5 L43 62.5',
      'M35 29 Q31 41 32 53.5',
    ],
  },
  bucket_hat: {
    body: 'M18 33 L46 33 L49 56 Q32 59 15 56 Z',
    front: [
      'M17 48 Q32 51 47 48',
      'M15 55 Q32 58 49 55 L58 62 Q32 69 6 62 Z',
      'M32 33 L32 57.5',
      'M28 48 L36 48 L36 54 L28 54 Z',
    ],
    back: [
      'M17 48 Q32 51 47 48',
      'M15 55 Q32 58 49 55 L58 62 Q32 69 6 62 Z',
      'M32 33 L32 57.5',
      'M23 34 Q25 44 24 57',
      'M41 34 Q39 44 40 57',
    ],
    side: [
      'M18 34 L46 34 L49 56 Q34 59 18 56 Z',
      'M18 55 Q36 58 57 61 Q60 63 57 65 Q35 68 6 63 Q3 61 7 59 Q12 57 18 55 Z',
      'M18 48 Q33 51 48 48',
      'M34 34 Q30 44 30 57.5',
    ],
  },
  ankle_sock: {
    body: 'M24 52 L40 52 L40 72 Q40 86 32 86 Q24 86 24 72 Z',
    front: [
      'M24 60 L40 60',
      'M28 52 L28 60',
      'M32 52 L32 60',
      'M36 52 L36 60',
      'M24 64 Q32 69 40 64',
      'M26 80 Q32 77 38 80',
    ],
    back: [
      'M24 60 L40 60',
      'M28 52 L28 60',
      'M32 52 L32 60',
      'M36 52 L36 60',
      'M24.2 72 Q32 62 39.8 72',
    ],
    side: [
      'M24 52 L24 62 Q24 69 17 70 L11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86 Q45 86 45 77 Q45 70 40.5 64 L40 52 Z',
      'M24 60 L40 60',
      'M28 52 L28 60',
      'M32 52 L32 60',
      'M36 52 L36 60',
      'M36 86 Q36 72 43 67',
      'M11 70.5 Q8 78 11 86',
    ],
  },
  knee_sock: {
    body: 'M22 14 L42 14 L40 72 Q40 86 32 86 Q24 86 24 72 Z',
    front: [
      'M22.3 22 L41.7 22',
      'M27 14 L27 22',
      'M32 14 L32 22',
      'M37 14 L37 22',
      'M24 64 Q32 69 40 64',
      'M26 80 Q32 77 38 80',
    ],
    back: [
      'M22.3 22 L41.7 22',
      'M27 14 L27 22',
      'M32 14 L32 22',
      'M37 14 L37 22',
      'M24.2 72 Q32 62 39.8 72',
      'M32 22 L32 62',
    ],
    side: [
      'M22 14 L24 62 Q24 69 17 70 L11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86 Q45 86 45 77 Q45 70 40.5 64 Q43 49 40 36 L42 14 Z',
      'M22.3 22 L41.6 22',
      'M27 14.5 L27 22',
      'M32 14.5 L32 22',
      'M37 14.5 L37 22',
      'M36 86 Q36 72 43 67',
      'M11 70.5 Q8 78 11 86',
    ],
  },
  bandana: {
    body: 'M9 27 L49 27 L32 90 Z',
    front: [
      'M11 32 L47 32',
      'M49 24 L54 27 L49 32 L45 28 Z',
      'M53 27 Q58 21 61 19 L58 31 Z',
      'M53 29 Q59 34 61 40 L54 36 Z',
      'M27 40 L35 40 L35 47 L27 47 Z',
      'M15 36 L32 84 L43 36',
    ],
    back: [
      'M11 32 L47 32',
      'M49 24 L54 27 L49 32 L45 28 Z',
      'M53 27 Q58 21 61 19 L58 31 Z',
      'M53 29 Q59 34 61 40 L54 36 Z',
      'M13 29 L32 86 L46 29',
      'M32 32 L32 86',
    ],
    side: [
      'M29 27 L35 27 L33 87 L32 90 L31 87 Z',
      'M35 24 L39 27 L35 32 L32 28 Z',
      'M38 27 Q42 22 44 20 L42 31 Z',
      'M38 29 Q43 35 44 40 L39 36 Z',
      'M30.5 32 L34.5 32',
    ],
  },
  cardholder: {
    body: 'M13 38 L51 38 Q54 38 54 41 L54 63 Q54 66 51 66 L13 66 Q10 66 10 63 L10 41 Q10 38 13 38 Z',
    front: [
      'M13 41 L51 41 L51 63 L13 63 Z',
      'M16 47 L29 47 Q32 52 35 47 L49 47',
      'M16 54 L29 54 Q32 59 35 54 L49 54',
    ],
    back: ['M13 41 L51 41 L51 63 L13 63 Z', 'M28 48 L36 48 L36 55 L28 55 Z'],
    side: [
      'M29 38 L35 38 Q36 38 36 40 L36 64 Q36 66 34 66 L30 66 Q28 66 28 64 L28 40 Q28 38 29 38 Z',
      'M30.5 40 L30.5 64',
      'M33.5 40 L33.5 64',
    ],
  },
};

export const PARTS: Partial<Record<GarmentFamily, Partial<Record<PartKey, PartMark>>>> = {
  beanie: {
    whole: mark(
      'side_l',
      'M15 59 C14 42 23 29 35 29 C46 30 52 42 52 59 L52 64 L15 64 Z',
      'M15 51 Q33 54 52 51 L52 64 Q33 61 15 64 Z',
    ),
    crown: mark('side_l', 'M15 59 C14 42 23 29 35 29 C46 30 52 42 52 59'),
    cuff: mark('front', 'M13 51 Q32 54 51 51 L51 64 Q32 61 13 64 Z'),
    label: mark('front', 'M28 55 L36 55 L36 61 L28 61 Z'),
  },
  bucket_hat: {
    whole: mark(
      'side_l',
      'M18 34 L46 34 L49 56 Q34 59 18 56 Z',
      'M18 55 Q36 58 57 61 Q60 63 57 65 Q35 68 6 63 Q3 61 7 59 Q12 57 18 55 Z',
    ),
    crown: mark('side_l', 'M18 34 L46 34 L49 56 Q34 59 18 56 Z'),
    brim: mark('side_l', 'M18 55 Q36 58 57 61 Q60 63 57 65 Q35 68 6 63 Q3 61 7 59 Q12 57 18 55 Z'),
    band: mark('side_l', 'M18 48 Q33 51 48 48'),
    label: mark('front', 'M28 48 L36 48 L36 54 L28 54 Z'),
  },
  ankle_sock: {
    whole: mark(
      'side_l',
      'M24 52 L24 62 Q24 69 17 70 L11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86 Q45 86 45 77 Q45 70 40.5 64 L40 52 Z',
    ),
    cuff: mark('side_l', 'M24 60 L40 60', 'M28 52 L28 60', 'M32 52 L32 60', 'M36 52 L36 60'),
    leg: mark('side_l', 'M24 60 L24 62', 'M40 60 L40 64'),
    heel: mark('side_l', 'M36 86 Q36 72 43 67'),
    foot: mark('side_l', 'M11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86'),
    toe: mark('side_l', 'M11 70.5 Q8 78 11 86'),
  },
  knee_sock: {
    whole: mark(
      'side_l',
      'M22 14 L24 62 Q24 69 17 70 L11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86 Q45 86 45 77 Q45 70 40.5 64 Q43 49 40 36 L42 14 Z',
    ),
    cuff: mark(
      'side_l',
      'M22.3 22 L41.6 22',
      'M27 14.5 L27 22',
      'M32 14.5 L32 22',
      'M37 14.5 L37 22',
    ),
    leg: mark('side_l', 'M22.3 22 L24 62', 'M41.6 22 Q40 36 42 49 Q42 57 40.5 64'),
    heel: mark('side_l', 'M36 86 Q36 72 43 67'),
    foot: mark('side_l', 'M11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86'),
    toe: mark('side_l', 'M11 70.5 Q8 78 11 86'),
  },
  bandana: {
    whole: mark(
      'front',
      'M9 27 L49 27 L32 90 Z',
      'M49 24 L54 27 L49 32 L45 28 Z',
      'M53 27 Q58 21 61 19 L58 31 Z',
      'M53 29 Q59 34 61 40 L54 36 Z',
    ),
    edge: mark('front', 'M9 27 L49 27', 'M11 32 L47 32'),
    end: mark(
      'front',
      'M49 24 L54 27 L49 32 L45 28 Z',
      'M53 27 Q58 21 61 19 L58 31 Z',
      'M53 29 Q59 34 61 40 L54 36 Z',
    ),
    label: mark('front', 'M27 40 L35 40 L35 47 L27 47 Z'),
  },
  cardholder: {
    whole: mark(
      'front',
      'M13 38 L51 38 Q54 38 54 41 L54 63 Q54 66 51 66 L13 66 Q10 66 10 63 L10 41 Q10 38 13 38 Z',
    ),
    card_slot: mark(
      'front',
      'M16 47 L29 47 Q32 52 35 47 L49 47',
      'M16 54 L29 54 Q32 59 35 54 L49 54',
    ),
    edge: mark(
      'front',
      'M13 38 L51 38 Q54 38 54 41 L54 63 Q54 66 51 66 L13 66 Q10 66 10 63 L10 41 Q10 38 13 38 Z',
    ),
    back: mark(
      'back',
      'M13 38 L51 38 Q54 38 54 41 L54 63 Q54 66 51 66 L13 66 Q10 66 10 63 L10 41 Q10 38 13 38 Z',
    ),
  },
};
