/**
 * Drawing batch B7 shoes — 95-GARMENT-TAXONOMY.md §4.2.
 * Families: tall_boot, heel, ballerina, derby, loafer, high_top, heel_sandal, mule, monk.
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

const TALL_BOOT: GarmentShape = {
  body: 'M22 18 Q32 16 42 18 L40 66 Q42 71 48 77 L48 86 L16 86 L16 78 Q20 73 24 67 Z',
  front: [
    'M22 24 Q32 22 42 24',
    'M27 18 L27 47 L26 64 Q32 68 38 64 L37 47 L37 18',
    'M26.5 49 L37.5 49 M26 55 L38 55 M26 61 L38 61',
    'M16 78 Q32 74 48 77',
    'M16 82 L48 82',
  ],
  back: [
    'M23 24 Q32 22 41 24',
    'M29 18 L29 10 L35 10 L35 18',
    'M32 18 L32 74',
    'M16 78 Q32 74 48 77',
    'M16 82 L48 82',
  ],
  side: [
    'M26 18 Q35 15 45 18 L43 63 Q46 69 55 73 Q61 76 61 82 L61 86 L5 86 Q3 86 3 82 Q3 76 10 74 L24 69 Q26 49 26 18 Z',
    'M26 24 Q35 22 44.5 24',
    'M25.5 49 L37 48 M25 55 L37 54 M24.5 61 L38 60',
    'M24 69 Q34 66 44 63',
    'M3 82 L61 82',
    'M52 72 L52 82',
    'M40 25 L43.8 25 L43 60 L39.5 60 M39 27 L42 29',
  ],
};

const HEEL: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 50 24 46 L28 40 Q32 36 36 40 L40 46 Q44 50 43.5 58',
    'M23 50 Q32 44 41 50',
    'M21.5 55 Q32 51 42.5 55',
  ],
  back: [
    'M20.5 58 Q20 50 24 44 Q27 40 31 43 Q32 44 33 43 Q37 40 40 44 Q44 50 43.5 58',
    'M32 43 L32 56',
    'M22 52 Q32 48 42 52',
  ],
  side: [
    'M3 56 L12 50 L29 47 Q35 47 40 52 L49 52 L54 45 Q56 42 59 43 L59 56 L56 56 L55 64 L52 64 L51 56 L12 59 Q5 59 3 56 Z',
    'M3 56 Q23 59 51 56',
    'M17 49 Q29 46 40 52',
    'M3 56 L12 50 L19 49',
    'M49 52 Q53 45 58 45',
    'M52 56 L52 64 L55 64 L56 56',
  ],
};

const BALLERINA: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 50 24 45 Q27 40 32 40 Q37 40 40 45 Q44 50 43.5 58',
    'M23 49 Q32 42 41 49',
    'M32 49 Q27 45 25 49 Q27 53 32 49 Q37 53 39 49 Q37 45 32 49',
    'M21.5 55 Q32 51 42.5 55',
  ],
  back: [
    'M20.5 58 Q20 50 24 44 Q28 41 32 45 Q36 41 40 44 Q44 50 43.5 58',
    'M32 45 L32 57',
    'M22 53 Q32 49 42 53',
  ],
  side: [
    'M4 57 Q5 52 12 50 Q22 46 32 48 L44 52 Q49 51 55 48 Q58 46 60 49 L60 60 Q60 64 57 64 L9 64 Q4 64 4 60 Z',
    'M4 60 L60 60',
    'M24 48 Q36 54 55 48',
    'M27 49 Q24 46 22 49 Q24 52 27 49 Q30 52 32 49 Q30 46 27 49',
    'M4 57 Q7 52 14 50',
    'M52 60 L52 64 L59 64 L59 60',
  ],
};

const DERBY: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 49 24 45 L27 38 L29 34 L35 34 L37 38 L40 45 Q44 49 43.5 58',
    'M26 39 L30 43 L32 40 L34 43 L38 39',
    'M26 43 L38 43 M25 47 L39 47 M24 51 L40 51',
    'M21 55 Q32 51 43 55',
  ],
  back: [
    'M20.5 58 Q20 50 23 43 Q27 39 31 42 Q32 43 33 42 Q37 39 41 43 Q44 50 43.5 58',
    'M32 42 L32 57',
    'M22 52 Q32 48 42 52',
    'M28 45 L36 45 L36 50 L28 50 Z',
  ],
  side: [
    'M4 56 Q5 52 12 50 L26 47 L32 42 L35 35 Q39 33 44 36 L50 43 L57 43 Q60 47 60 56 L60 61 Q60 64 57 64 L8 64 Q4 64 4 60 Z',
    'M4 58 Q30 60 60 57',
    'M5 61 L60 61',
    'M13 50 Q17 54 18 58',
    'M27 47 L32 42 L35 35 M30 48 L38 40 L47 43',
    'M30 43 L41 41 M29 46 L43 44 M29 49 L45 47',
    'M34 43 L35 35 Q39 33 44 36 L47 43',
    'M47 43 Q51 49 51 58',
    'M50 61 L50 64 L59 64 L59 61',
  ],
};

const LOAFER: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 49 25 44 Q32 39 39 44 Q44 49 43.5 58',
    'M23 48 Q32 43 41 48',
    'M23 48 L41 48 L39 53 L25 53 Z',
    'M28 49 L36 49',
    'M21.5 55 Q32 51 42.5 55',
  ],
  back: [
    'M20.5 58 Q20 50 24 44 Q28 41 32 45 Q36 41 40 44 Q44 50 43.5 58',
    'M32 45 L32 57',
    'M22 52 Q32 48 42 52',
    'M28 46 L36 46 L36 51 L28 51 Z',
  ],
  side: [
    'M4 56 Q5 51 12 49 L27 47 Q34 43 42 42 L50 43 Q58 44 60 51 L60 59 Q60 64 56 64 L9 64 Q4 64 4 60 Z',
    'M4 59 Q30 61 60 58',
    'M10 50 Q19 55 30 52',
    'M29 47 L42 44 L47 49 L34 52 Z',
    'M35 47.5 L42 46.2',
    'M50 60 L50 64 L59 64 L59 59',
    'M27 47 Q37 52 50 43',
  ],
};

const HIGH_TOP: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 49 24 44 L25 31 Q32 27 39 31 L40 44 Q44 49 43.5 58',
    'M28 33 L36 33 L38 51 L26 51 Z',
    'M27 36 L37 36 M27 39 L37 39 M26.5 42 L37.5 42 M26 45 L38 45 M26 48 L38 48',
    'M21.5 54 Q32 50 42.5 54',
  ],
  back: [
    'M20.5 58 Q20 49 24 44 L25 31 Q32 27 39 31 L40 44 Q44 49 43.5 58',
    'M28 31 Q32 36 36 31',
    'M32 34 L32 57',
    'M22 51 Q32 47 42 51',
    'M28 37 L36 37 L36 43 L28 43 Z',
  ],
  side: [
    'M4 58 Q5 52 13 49 L24 46 L28 30 Q34 26 42 29 L45 42 Q51 44 58 42 Q61 48 60 58 L60 61 Q60 64 57 64 L9 64 Q4 64 4 60 Z',
    'M4 58 L60 58',
    'M13 49 Q11 54 15 58',
    'M29 31 Q35 35 42 29',
    'M25 47 L28 31 Q34 27 39 33 L43 44',
    'M29 35 L40 33 M28.5 38 L40.5 36 M28 41 L41 39 M27.5 44 L41.5 42 M27 47 L42 45 M27 50 L43 48 M28 53 L44 51',
    'M45 42 Q51 47 51 58',
    'M52 43 Q50 51 52 58',
    'M38 36 A2.5 2.5 0 1 0 43 36 A2.5 2.5 0 1 0 38 36',
  ],
};

const HEEL_SANDAL: GarmentShape = {
  body: 'M16 69 Q16 62 22 59 L25 38 Q26 31 32 31 Q38 31 39 38 L42 59 Q48 62 48 69 L48 75 Q48 81 42 82 L22 82 Q16 81 16 75 Z',
  front: [
    'M21 64 Q32 57 43 64',
    'M25 54 Q32 49 39 54',
    'M24 40 Q32 45 40 40',
    'M24 40 L24 54 M40 40 L40 54',
    'M39 42 L44 42 L44 47 L39 47 Z',
    'M18 74 L46 74',
  ],
  back: [
    'M23 39 L23 56 Q32 62 41 56 L41 39',
    'M23 39 Q32 34 41 39',
    'M38 41 L43 41 L43 46 L38 46 Z',
    'M18 74 L46 74',
    'M21 79 L43 79',
  ],
  side: [
    'M4 74 Q5 71 11 69 L31 65 Q43 64 52 69 L58 72 L58 76 Q35 76 9 80 Q4 80 4 76 Z',
    'M4 74 Q29 70 52 69 L58 73',
    'M15 68 Q16 58 25 56 Q34 56 38 65',
    'M42 66 Q41 55 45 49 Q49 44 54 48 L56 53 Q51 56 49 68',
    'M51 47 L56 48 L56 53 L51 53 Z',
    'M50 76 L58 76 L58 83 L52 83 Z',
    'M4 77 Q29 74 50 74 M58 72 L58 76',
  ],
};

const MULE: GarmentShape = {
  body: 'M16 69 Q16 62 22 59 L25 38 Q26 31 32 31 Q38 31 39 38 L42 59 Q48 62 48 69 L48 75 Q48 81 42 82 L22 82 Q16 81 16 75 Z',
  front: ['M20 65 Q32 53 44 65', 'M23 58 Q32 49 41 58', 'M18 73 L46 73', 'M18 78 L46 78'],
  back: ['M19 68 Q32 60 45 68', 'M19 68 L19 74 M45 68 L45 74', 'M18 74 L46 74', 'M18 79 L46 79'],
  side: [
    'M4 73 Q4 65 12 60 Q23 53 35 56 Q42 57 45 64 L45 70 L56 70 Q60 72 60 77 L60 79 Q60 83 56 83 L9 83 Q4 83 4 79 Z',
    'M4 73 Q29 69 56 70',
    'M4 76 L60 76',
    'M18 58 Q30 65 45 64',
    'M4 73 Q5 65 12 60',
    'M49 76 L49 83 L59 83 L59 76',
  ],
};

const MONK: GarmentShape = {
  body: 'M20 58 L44 58 L44 61 Q44 64 41 64 L23 64 Q20 64 20 61 Z',
  front: [
    'M20.5 58 Q20 49 24 45 L28 38 Q32 35 36 38 L40 45 Q44 49 43.5 58',
    'M23 46 L38 40 L41 44 L26 51 Z',
    'M24 50 L40 44 L42 48 L27 54 Z',
    'M34 42 L39 40 L41 44 L36 46 Z M36 47 L41 45 L43 49 L38 51 Z',
    'M21.5 55 Q32 51 42.5 55',
  ],
  back: [
    'M20.5 58 Q20 50 23 43 Q27 39 31 42 Q32 43 33 42 Q37 39 41 43 Q44 50 43.5 58',
    'M32 42 L32 57',
    'M22 52 Q32 48 42 52',
  ],
  side: [
    'M4 56 Q5 52 12 50 L26 47 Q30 43 34 40 L43 39 L50 44 L57 44 Q60 48 60 56 L60 61 Q60 64 57 64 L8 64 Q4 64 4 60 Z',
    'M4 58 Q30 60 60 57',
    'M13 50 Q17 54 18 58',
    'M27 47 L36 40 L41 43 L32 50 Z',
    'M34 49 L43 41 L48 44 L40 52 Z',
    'M36 40 L41 40 L42 44 L37 45 Z',
    'M43 41 L48 42 L49 46 L44 47 Z',
    'M50 61 L50 64 L59 64 L59 61',
    'M26 47 Q34 52 50 44',
  ],
};

export const SHAPES = {
  tall_boot: TALL_BOOT,
  heel: HEEL,
  ballerina: BALLERINA,
  derby: DERBY,
  loafer: LOAFER,
  high_top: HIGH_TOP,
  heel_sandal: HEEL_SANDAL,
  mule: MULE,
  monk: MONK,
} satisfies Partial<Record<GarmentFamily, GarmentShape>>;

export const PARTS = {
  tall_boot: {
    whole: mark('side_l', TALL_BOOT.side[0]),
    shaft: mark('side_l', 'M26 18 Q35 15 45 18 L43 63 L24 69 Q26 49 26 18 Z'),
    upper: mark('side_l', 'M24 69 Q34 66 44 63 Q46 69 55 73 Q61 76 61 82 L3 82 Q3 76 10 74 Z'),
    toe: mark('side_l', 'M3 82 Q3 76 10 74 L20 71'),
    laces: mark('side_l', TALL_BOOT.side[2]),
    heel: mark('side_l', TALL_BOOT.side[5]),
    sole: mark('side_l', TALL_BOOT.side[4], 'M3 82 L3 86 L61 86 L61 82'),
    pull_tab: mark('back', TALL_BOOT.back[1]),
    zip: mark('side_l', TALL_BOOT.side[6]),
  },
  heel: {
    whole: mark('side_l', HEEL.side[0]),
    upper: mark('side_l', 'M3 56 L12 50 L29 47 Q35 47 40 52 L49 52 L54 45 Q56 42 59 43 L59 56'),
    vamp: mark('side_l', HEEL.side[2]),
    toe: mark('side_l', HEEL.side[3]),
    strap: mark('side_l', HEEL.side[4]),
    heel: mark('side_l', HEEL.side[5]),
    sole: mark('side_l', HEEL.side[1], 'M3 56 L12 59 L51 56'),
  },
  ballerina: {
    whole: mark('side_l', BALLERINA.side[0]),
    upper: mark('side_l', 'M4 57 Q5 52 12 50 Q22 46 32 48 L44 52 Q49 51 55 48 Q58 46 60 49 L60 60'),
    vamp: mark('side_l', 'M12 50 Q22 46 32 48 L44 52'),
    toe: mark('side_l', BALLERINA.side[4]),
    strap: mark('side_l', BALLERINA.side[2]),
    heel: mark('side_l', BALLERINA.side[5]),
    sole: mark('side_l', BALLERINA.side[1], 'M4 60 L4 64 L60 64 L60 60'),
  },
  derby: {
    whole: mark('side_l', DERBY.side[0]),
    upper: mark(
      'side_l',
      'M4 56 Q5 52 12 50 L26 47 L32 42 L35 35 Q39 33 44 36 L50 43 L57 43 Q60 47 60 56',
    ),
    vamp: mark('side_l', DERBY.side[4]),
    toe: mark('side_l', DERBY.side[3]),
    laces: mark('side_l', DERBY.side[5]),
    tongue: mark('side_l', DERBY.side[6]),
    quarter: mark('side_l', DERBY.side[7]),
    heel: mark('side_l', DERBY.side[8]),
    sole: mark('side_l', DERBY.side[1], DERBY.side[2], 'M4 61 L4 64 L60 64 L60 61'),
    label: mark('back', DERBY.back[3]),
  },
  loafer: {
    whole: mark('side_l', LOAFER.side[0]),
    upper: mark('side_l', 'M4 56 Q5 51 12 49 L27 47 Q34 43 42 42 L50 43 Q58 44 60 51 L60 59'),
    vamp: mark('side_l', LOAFER.side[6]),
    toe: mark('side_l', LOAFER.side[2]),
    strap: mark('side_l', LOAFER.side[3], LOAFER.side[4]),
    heel: mark('side_l', LOAFER.side[5]),
    sole: mark('side_l', LOAFER.side[1], 'M4 59 L4 64 L60 64 L60 58'),
    label: mark('back', LOAFER.back[3]),
  },
  high_top: {
    whole: mark('side_l', HIGH_TOP.side[0]),
    shaft: mark('side_l', 'M24 46 L28 30 Q34 26 42 29 L45 42 L43 44 Z'),
    upper: mark('side_l', 'M4 58 Q5 52 13 49 L24 46 L43 44 Q51 44 58 42 Q61 48 60 58'),
    toe: mark('side_l', HIGH_TOP.side[2]),
    throat: mark('front', HIGH_TOP.front[1]),
    laces: mark('side_l', HIGH_TOP.side[5]),
    tongue: mark('side_l', HIGH_TOP.side[4]),
    quarter: mark('side_l', HIGH_TOP.side[6], HIGH_TOP.side[8]),
    heel: mark('side_l', HIGH_TOP.side[7]),
    sole: mark('side_l', HIGH_TOP.side[1], 'M4 58 L4 64 L60 64 L60 58'),
    label: mark('back', HIGH_TOP.back[4]),
  },
  heel_sandal: {
    whole: mark(
      'side_l',
      HEEL_SANDAL.side[0],
      HEEL_SANDAL.side[2],
      HEEL_SANDAL.side[3],
      HEEL_SANDAL.side[5],
    ),
    strap: mark('side_l', HEEL_SANDAL.side[2], HEEL_SANDAL.side[3]),
    footbed: mark('side_l', HEEL_SANDAL.side[1], 'M4 74 L4 77 Q29 74 48 74 L48 77'),
    toe: mark('side_l', 'M4 74 Q5 71 11 69'),
    heel: mark('side_l', HEEL_SANDAL.side[5]),
    sole: mark('side_l', HEEL_SANDAL.side[6]),
    buckle: mark('side_l', HEEL_SANDAL.side[4]),
  },
  mule: {
    whole: mark('side_l', MULE.side[0]),
    upper: mark('side_l', 'M4 73 Q4 65 12 60 Q23 53 35 56 Q42 57 45 64 L45 70'),
    vamp: mark('side_l', MULE.side[3]),
    toe: mark('side_l', MULE.side[4]),
    footbed: mark('side_l', MULE.side[1]),
    heel: mark('side_l', MULE.side[5]),
    sole: mark('side_l', MULE.side[2], 'M4 76 L4 83 L60 83 L60 76'),
  },
  monk: {
    whole: mark('side_l', MONK.side[0]),
    upper: mark(
      'side_l',
      'M4 56 Q5 52 12 50 L26 47 Q30 43 34 40 L43 39 L50 44 L57 44 Q60 48 60 56',
    ),
    vamp: mark('side_l', MONK.side[8]),
    toe: mark('side_l', MONK.side[2]),
    buckle: mark('side_l', MONK.side[5], MONK.side[6]),
    strap: mark('side_l', MONK.side[3], MONK.side[4]),
    heel: mark('side_l', MONK.side[7]),
    sole: mark('side_l', MONK.side[1], 'M4 61 L4 64 L60 64 L60 61'),
  },
} satisfies Partial<Record<GarmentFamily, Partial<Record<PartKey, PartMark>>>>;
