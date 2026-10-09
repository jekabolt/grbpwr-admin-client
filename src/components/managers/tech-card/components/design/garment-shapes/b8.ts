/**
 * Drawing batch B8 bags + jewellery — 95-GARMENT-TAXONOMY.md §4.2.
 * Families: backpack, handbag, shoulder_bag, crossbody, belt_bag, clutch, duffle_bag, pouch, earring, ring, bracelet, mitten.
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
import { mark, zone } from './kit';

const BACKPACK: GarmentShape = {
  body: 'M20 25 Q14 28 13 42 L11 80 Q11 86 17 86 L47 86 Q53 86 53 80 L51 42 Q50 28 44 25 Z',
  front: [
    'M24 27 L24 20 Q24 13 32 13 Q40 13 40 20 L40 27',
    'M27 26 L27 21 Q27 17 32 17 Q37 17 37 21 L37 26',
    'M17 39 Q32 29 47 39 L45 53 Q32 59 19 53 Z',
    'M20 56 Q32 60 44 56',
    'M19 64 L45 64 L44 80 L20 80 Z',
    'M19 64 Q32 70 45 64',
    'M29 50 L35 50 L35 56 L29 56 Z',
    'M18 39 L18 82 M46 39 L46 82',
  ],
  back: [
    'M24 27 L24 20 Q24 13 32 13 Q40 13 40 20 L40 27',
    'M27 26 L27 21 Q27 17 32 17 Q37 17 37 21 L37 26',
    'M22 30 Q13 48 18 78 Q20 83 25 80 L29 39 Q29 32 22 30 Z',
    'M42 30 Q51 48 46 78 Q44 83 39 80 L35 39 Q35 32 42 30 Z',
    'M29 34 Q32 31 35 34 L36 72 Q32 77 28 72 Z',
    'M18 72 Q32 78 46 72',
  ],
  side: [
    'M27 28 Q35 24 40 31 Q47 45 45 80 Q44 86 38 86 L26 86 Q20 86 20 80 L20 40 Q20 30 27 28 Z',
    'M23 81 Q32 84 42 81 L42 86 L23 86 Z',
    'M27 29 L27 21 Q27 15 32 15 Q37 15 37 21 L37 27',
    'M21 42 Q29 49 29 79',
  ],
};

const HANDBAG: GarmentShape = {
  body: 'M16 43 L48 43 L55 86 L9 86 Z',
  front: [
    'M20 43 L20 35 Q20 20 32 20 Q44 20 44 35 L44 43',
    'M24 43 L24 35 Q24 25 32 25 Q40 25 40 35 L40 43',
    'M16 43 Q32 51 48 43',
    'M29 47 L35 47 L35 54 L29 54 Z',
    'M18 43 L46 43 M42 40 L46 43 L42 46',
    'M17 58 L47 58 L50 82 L14 82 Z',
    'M10 59 Q5 69 10 79 M54 59 Q59 69 54 79',
    'M12 54 A2 2 0 1 0 16 54 A2 2 0 1 0 12 54 M48 54 A2 2 0 1 0 52 54 A2 2 0 1 0 48 54',
  ],
  back: [
    'M20 43 L20 35 Q20 20 32 20 Q44 20 44 35 L44 43',
    'M24 43 L24 35 Q24 25 32 25 Q40 25 40 35 L40 43',
    'M14 57 L25 57 Q32 62 39 57 L50 57',
    'M32 44 L32 84',
  ],
  side: [
    'M27 43 L37 43 L41 86 L23 86 Z',
    'M27 43 L32 52 L37 43 M32 52 L32 86',
    'M28 43 L28 34 Q28 22 32 22 Q36 22 36 34 L36 43',
    'M24 81 L40 81 L41 86 L23 86 Z',
  ],
};

const SHOULDER_BAG: GarmentShape = {
  body: 'M17 39 Q12 39 12 45 L10 80 Q10 86 17 86 L47 86 Q54 86 54 80 L52 45 Q52 39 47 39 Z',
  front: [
    'M15 43 Q7 22 19 9 Q25 3 32 3 Q39 3 45 9 Q57 22 49 43',
    'M19 42 Q12 23 22 13 Q27 8 32 8 Q37 8 42 13 Q52 23 45 42',
    'M26 40 L26 34 Q26 27 32 27 Q38 27 38 34 L38 40',
    'M12 47 Q32 58 52 47 L49 65 Q32 72 15 65 Z',
    'M29 61 L35 61 L35 68 L29 68 Z',
    'M17 41 L47 41 M42 38 L47 41 L42 44',
    'M18 69 L46 69 L44 80 L20 80 Z',
    'M16 48 L16 82 M48 48 L48 82',
    'M11 44 A2 2 0 1 0 15 44 A2 2 0 1 0 11 44 M49 44 A2 2 0 1 0 53 44 A2 2 0 1 0 49 44',
  ],
  back: [
    'M15 43 Q7 22 19 9 Q25 3 32 3 Q39 3 45 9 Q57 22 49 43',
    'M19 42 Q12 23 22 13 Q27 8 32 8 Q37 8 42 13 Q52 23 45 42',
    'M15 57 L26 57 Q32 62 38 57 L49 57',
    'M32 40 L32 84',
  ],
  side: [
    'M27 40 Q24 41 24 47 L23 80 Q23 86 29 86 L37 86 Q42 86 41 80 L40 47 Q40 41 37 40 Z',
    'M27 43 Q19 20 27 8 Q32 2 37 8 Q45 20 37 43',
    'M27 48 L32 55 L39 48 M32 55 L32 86',
    'M25 81 L40 81',
  ],
};

const CROSSBODY: GarmentShape = {
  body: 'M17 49 L47 49 Q50 49 50 53 L50 82 Q50 86 46 86 L18 86 Q14 86 14 82 L14 53 Q14 49 17 49 Z',
  front: [
    'M17 51 L43 7 M22 51 L48 11',
    'M26 49 L26 44 Q26 38 32 38 Q38 38 38 44 L38 49',
    'M14 51 L50 51 L45 68 L19 68 Z',
    'M29 64 L35 64 L35 70 L29 70 Z',
    'M18 52 L46 52 M41 49 L46 52 L41 55',
    'M20 73 L44 73 L44 82 L20 82 Z',
    'M18 52 L18 84 M46 52 L46 84',
    'M15 53 A2 2 0 1 0 19 53 A2 2 0 1 0 15 53 M45 10 A2 2 0 1 0 49 10 A2 2 0 1 0 45 10',
  ],
  back: ['M17 51 L43 7 M22 51 L48 11', 'M18 62 L27 62 Q32 66 37 62 L46 62', 'M32 52 L32 84'],
  side: [
    'M29 49 L35 49 Q37 49 37 52 L37 83 Q37 86 34 86 L30 86 Q27 86 27 83 L27 52 Q27 49 29 49 Z',
    'M29 50 L39 9 M32 50 L42 10',
    'M28 80 L36 80 L37 86 L27 86 Z',
    'M28 54 L32 58 L36 54',
  ],
};

const BELT_BAG: GarmentShape = {
  body: 'M13 58 Q32 48 51 58 L56 69 Q52 84 39 86 L25 86 Q12 84 8 69 Z',
  front: [
    'M2 62 L13 62 M51 62 L62 62',
    'M2 58 L10 58 L10 66 L2 66 Z M54 58 L62 58 L62 66 L54 66 Z',
    'M15 62 Q32 53 49 62 M43 57 L49 62 L43 66',
    'M18 69 Q32 62 46 69 L43 80 Q32 84 21 80 Z',
    'M47 61 A2 2 0 1 0 51 61 A2 2 0 1 0 47 61',
  ],
  back: [
    'M2 62 L13 62 M51 62 L62 62',
    'M2 58 L10 58 L10 66 L2 66 Z M54 58 L62 58 L62 66 L54 66 Z',
    'M14 64 Q32 56 50 64',
    'M24 58 L22 81 M40 58 L42 81',
  ],
  side: [
    'M27 55 Q34 51 39 58 L42 75 Q40 84 35 86 L29 86 Q24 83 22 75 L24 60 Q24 57 27 55 Z',
    'M25 81 Q32 84 39 81 L39 86 L25 86 Z',
    'M24 62 L16 62 M40 62 L48 62',
  ],
};

const CLUTCH: GarmentShape = {
  body: 'M10 44 L54 44 L54 86 L10 86 Z',
  front: [
    'M10 44 L32 66 L54 44',
    'M29 62 L35 62 L35 68 L29 68 Z',
    'M11 47 L53 47 M47 44 L51 47 L47 50',
    'M12 48 L12 82 L52 82 L52 48',
    'M30 65 A2 2 0 1 0 34 65 A2 2 0 1 0 30 65',
  ],
  back: ['M12 48 L52 48 L52 82 L12 82 Z', 'M14 59 L26 59 Q32 64 38 59 L50 59'],
  side: ['M29 44 L35 44 L35 86 L29 86 Z', 'M31 47 L31 83 M33 47 L33 83', 'M29 81 L35 81'],
};

const DUFFLE_BAG: GarmentShape = {
  body: 'M12 55 Q6 58 6 66 L6 78 Q6 86 14 86 L50 86 Q58 86 58 78 L58 66 Q58 58 52 55 Z',
  front: [
    'M12 63 Q32 17 52 63',
    'M16 63 Q32 27 48 63',
    'M17 65 L19 48 Q20 39 29 39 Q38 39 40 48 L43 65',
    'M21 65 L23 49 Q24 44 29 44 Q34 44 36 49 L39 65',
    'M13 57 Q32 52 51 57 M45 53 L51 57 L45 61',
    'M17 56 Q12 69 17 85 M47 56 Q52 69 47 85',
    'M22 68 L42 68 L42 80 L22 80 Z',
    'M12 62 A2 2 0 1 0 16 62 A2 2 0 1 0 12 62 M48 62 A2 2 0 1 0 52 62 A2 2 0 1 0 48 62',
  ],
  back: [
    'M12 63 Q32 17 52 63',
    'M16 63 Q32 27 48 63',
    'M17 65 L19 48 Q20 39 29 39 Q38 39 40 48 L43 65',
    'M21 65 L23 49 Q24 44 29 44 Q34 44 36 49 L39 65',
    'M17 56 Q12 69 17 85 M47 56 Q52 69 47 85',
    'M15 72 Q32 76 49 72',
  ],
  side: [
    'M32 53 Q46 53 48 64 L48 76 Q46 86 32 86 Q18 86 16 76 L16 64 Q18 53 32 53 Z',
    'M32 57 Q41 57 43 66 L43 76 Q41 82 32 82 Q23 82 21 76 L21 66 Q23 57 32 57 Z',
    'M19 81 Q32 86 45 81',
    'M24 55 Q25 39 32 39 Q39 39 40 55',
  ],
};

const POUCH: GarmentShape = {
  body: 'M18 50 L46 50 L50 86 L14 86 Z',
  front: [
    'M18 54 L46 54 M40 51 L45 54 L40 57',
    'M20 64 L44 64 L46 80 L18 80 Z',
    'M16 55 L17 83 L47 83 L48 55',
    'M43 50 L49 45 L52 48 L46 54',
  ],
  back: ['M17 56 L47 56 L48 82 L16 82 Z', 'M20 66 L44 66'],
  side: ['M29 50 L35 50 L37 86 L27 86 Z', 'M30.5 53 L31.5 83 M33.5 53 L32.5 83', 'M28 81 L36 81'],
};

const EARRING: GarmentShape = {
  body: 'M20 28 L20 39 C13 44 14 65 20 86 C26 65 27 44 20 39 Z M44 28 L44 39 C37 44 38 65 44 86 C50 65 51 44 44 39 Z',
  front: [
    'M17 22 A3 3 0 1 0 23 22 A3 3 0 1 0 17 22',
    'M41 22 A3 3 0 1 0 47 22 A3 3 0 1 0 41 22',
    'M16 30 L24 30 M40 30 L48 30',
    'M20 45 C17 50 17 63 20 73 C23 63 23 50 20 45 Z M44 45 C41 50 41 63 44 73 C47 63 47 50 44 45 Z',
  ],
  back: [
    'M16 22 L20 18 L24 22 L20 26 Z M40 22 L44 18 L48 22 L44 26 Z',
    'M17 31 L23 31 M41 31 L47 31',
    'M20 45 L20 79 M44 45 L44 79',
  ],
  side: [
    'M28 22 L28 39 Q24 49 26 66 Q27 77 28 86 Q31 74 30 60 Q29 47 28 39 Z',
    'M36 22 L36 39 Q32 49 34 66 Q35 77 36 86 Q39 74 38 60 Q37 47 36 39 Z',
    'M26 22 L30 22 M34 22 L38 22',
  ],
};

const RING: GarmentShape = {
  body: 'M13 60 A19 24 0 1 0 51 60 A19 24 0 1 0 13 60 M20 60 A12 16 0 1 0 44 60 A12 16 0 1 0 20 60',
  front: [
    'M32 18 L42 29 L32 39 L22 29 Z',
    'M32 18 L32 39 M22 29 L42 29',
    'M22 29 L17 43 M42 29 L47 43',
  ],
  back: ['M22 29 Q32 35 42 29', 'M28 72 Q32 75 36 72'],
  side: [
    'M18 60 A14 24 0 1 0 46 60 A14 24 0 1 0 18 60 M24 60 A8 16 0 1 0 40 60 A8 16 0 1 0 24 60',
    'M28 35 L29 28 L35 28 L36 35',
    'M27 28 L29 21 L37 21 L35 28 Z',
  ],
};

const BRACELET: GarmentShape = {
  body: 'M27 10 Q32 6 37 10 Q32 14 27 10 Z M38 12 Q44 10 46 16 Q47 22 42 23 Q37 20 38 12 Z M45 22 Q51 22 52 29 Q53 36 48 38 Q43 34 45 22 Z M49 37 Q55 40 54 48 Q53 56 48 55 Q45 49 49 37 Z M47 54 Q53 56 51 64 Q49 72 44 69 Q42 63 47 54 Z M42 68 Q47 71 43 78 Q39 85 35 81 Q34 75 42 68 Z M27 82 Q32 78 37 82 Q32 86 27 82 Z M22 68 Q17 71 21 78 Q25 85 29 81 Q30 75 22 68 Z M17 54 Q11 56 13 64 Q15 72 20 69 Q22 63 17 54 Z M15 37 Q9 40 10 48 Q11 56 16 55 Q19 49 15 37 Z M19 22 Q13 22 12 29 Q11 36 16 38 Q21 34 19 22 Z M26 12 Q20 10 18 16 Q17 22 22 23 Q27 20 26 12 Z',
  front: [
    'M36 11 L40 14 M45 21 L48 24 M51 35 L52 39 M51 53 L49 57 M45 68 L42 72 M28 82 L25 80 M22 69 L19 65 M15 55 L13 51 M13 37 L15 34 M19 23 L22 20 M26 13 L29 11',
    'M32 68 L32 73 M32 72 L37 78 L32 84 L27 78 Z',
    'M26 11 L26 17 L38 17 L38 11 Z M29 13 L35 13',
  ],
  back: [
    'M26 11 L26 17 L38 17 L38 11 Z M29 13 L35 13',
    'M36 11 L40 14 M45 21 L48 24 M51 35 L52 39 M51 53 L49 57 M45 68 L42 72 M28 82 L25 80 M22 69 L19 65 M15 55 L13 51 M13 37 L15 34 M19 23 L22 20 M26 13 L29 11',
    'M28 78 Q32 82 36 78',
  ],
  side: [
    'M28 10 C35 12 38 29 37 50 C36 72 34 86 32 86 C30 86 28 72 27 50 C26 29 27 12 28 10 Z',
    'M27 24 L37 24 M27 39 L37 39 M27 54 L36 54 M28 69 L35 69 M29 80 L34 80',
    'M29 72 L35 72 L34 82 L32 86 L30 82 Z',
    'M27 12 L37 12 L36 17 L28 17 Z',
  ],
};

const MITTEN: GarmentShape = {
  body: 'M21 76 L19 90 L45 90 L43 76 Z',
  front: [
    'M21 76 L20 63 L10 54 Q7 50 10 47 Q13 44 16 48 L21 53 L21 35 Q21 17 32 17 Q43 17 43 35 L43 76',
    'M21 55 Q28 62 29 75 M27 47 Q32 43 39 46',
  ],
  back: [
    'M43 76 L44 63 L54 54 Q57 50 54 47 Q51 44 48 48 L43 53 L43 35 Q43 17 32 17 Q21 17 21 35 L21 76',
    'M43 55 Q36 62 35 75 M37 47 Q32 43 25 46',
    'M32 20 L32 73',
  ],
  side: [
    'M26 76 L25 90 L39 90 L38 76 Z',
    'M26 76 L25 40 Q25 18 31 17 Q37 18 38 40 L38 76',
    'M38 62 Q43 58 44 51 Q45 46 42 45 Q39 45 38 50',
    'M25 45 Q32 48 38 44',
  ],
};

export const SHAPES: Partial<Record<GarmentFamily, GarmentShape>> = {
  backpack: BACKPACK,
  handbag: HANDBAG,
  shoulder_bag: SHOULDER_BAG,
  crossbody: CROSSBODY,
  belt_bag: BELT_BAG,
  clutch: CLUTCH,
  duffle_bag: DUFFLE_BAG,
  pouch: POUCH,
  earring: EARRING,
  ring: RING,
  bracelet: BRACELET,
  mitten: MITTEN,
};

export const PARTS: Partial<Record<GarmentFamily, Partial<Record<PartKey, PartMark>>>> = {
  backpack: {
    whole: mark('front', BACKPACK.body, ...BACKPACK.front),
    body: mark('front', BACKPACK.body),
    strap: mark('back', BACKPACK.back[2], BACKPACK.back[3]),
    handle: mark('front', BACKPACK.front[0], BACKPACK.front[1]),
    flap: mark('front', BACKPACK.front[2]),
    zip: mark('front', BACKPACK.front[3]),
    pocket: mark('front', BACKPACK.front[4], BACKPACK.front[5]),
    panel: mark('front', BACKPACK.front[7]),
    hardware: mark('front', BACKPACK.front[6]),
    base: mark('side_l', BACKPACK.side[1]),
    back: mark('back', BACKPACK.body, ...BACKPACK.back),
    lining: zone('front', 'M17 40 Q32 34 47 40 L48 81 L16 81 Z'),
  },
  handbag: {
    whole: mark('front', HANDBAG.body, ...HANDBAG.front),
    body: mark('front', HANDBAG.body),
    handle: mark('front', HANDBAG.front[0], HANDBAG.front[1]),
    strap: mark('front', HANDBAG.front[6]),
    flap: mark('front', HANDBAG.front[2]),
    closure: mark('front', HANDBAG.front[3]),
    zip: mark('front', HANDBAG.front[4]),
    pocket: mark('front', HANDBAG.front[5]),
    panel: mark('front', HANDBAG.front[5]),
    hardware: mark('front', HANDBAG.front[7]),
    base: mark('side_l', HANDBAG.side[3]),
    lining: zone('front', 'M18 47 L46 47 L50 82 L14 82 Z'),
    back: mark('back', HANDBAG.body, ...HANDBAG.back),
  },
  shoulder_bag: {
    whole: mark('front', SHOULDER_BAG.body, ...SHOULDER_BAG.front),
    body: mark('front', SHOULDER_BAG.body),
    handle: mark('front', SHOULDER_BAG.front[2]),
    strap: mark('front', SHOULDER_BAG.front[0], SHOULDER_BAG.front[1]),
    flap: mark('front', SHOULDER_BAG.front[3]),
    closure: mark('front', SHOULDER_BAG.front[4]),
    zip: mark('front', SHOULDER_BAG.front[5]),
    pocket: mark('front', SHOULDER_BAG.front[6]),
    panel: mark('front', SHOULDER_BAG.front[7]),
    hardware: mark('front', SHOULDER_BAG.front[8]),
    base: mark('side_l', SHOULDER_BAG.side[3]),
    lining: zone('front', 'M16 47 Q32 53 48 47 L49 81 Q32 85 15 81 Z'),
    back: mark('back', SHOULDER_BAG.body, ...SHOULDER_BAG.back),
  },
  crossbody: {
    whole: mark('front', CROSSBODY.body, ...CROSSBODY.front),
    body: mark('front', CROSSBODY.body),
    handle: mark('front', CROSSBODY.front[1]),
    strap: mark('front', CROSSBODY.front[0]),
    flap: mark('front', CROSSBODY.front[2]),
    closure: mark('front', CROSSBODY.front[3]),
    zip: mark('front', CROSSBODY.front[4]),
    pocket: mark('front', CROSSBODY.front[5]),
    panel: mark('front', CROSSBODY.front[6]),
    hardware: mark('front', CROSSBODY.front[7]),
    base: mark('side_l', CROSSBODY.side[2]),
    lining: zone('front', 'M18 53 L46 53 L46 82 L18 82 Z'),
    back: mark('back', CROSSBODY.body, ...CROSSBODY.back),
  },
  belt_bag: {
    whole: mark('front', BELT_BAG.body, ...BELT_BAG.front),
    body: mark('front', BELT_BAG.body),
    strap: mark('front', BELT_BAG.front[0]),
    zip: mark('front', BELT_BAG.front[2]),
    pocket: mark('front', BELT_BAG.front[3]),
    buckle: mark('front', BELT_BAG.front[1]),
    hardware: mark('front', BELT_BAG.front[4]),
    base: mark('side_l', BELT_BAG.side[1]),
    back: mark('back', BELT_BAG.body, ...BELT_BAG.back),
    lining: zone('front', 'M15 61 Q32 54 49 61 L51 69 Q47 80 38 82 L26 82 Q17 80 13 69 Z'),
  },
  clutch: {
    whole: mark('front', CLUTCH.body, ...CLUTCH.front),
    body: mark('front', CLUTCH.body),
    flap: mark('front', CLUTCH.front[0]),
    closure: mark('front', CLUTCH.front[1]),
    zip: mark('front', CLUTCH.front[2]),
    hardware: mark('front', CLUTCH.front[4]),
    edge: mark('front', CLUTCH.body, CLUTCH.front[3]),
    back: mark('back', CLUTCH.body, ...CLUTCH.back),
    lining: zone('front', 'M13 48 L51 48 L51 82 L13 82 Z'),
  },
  duffle_bag: {
    whole: mark('front', DUFFLE_BAG.body, ...DUFFLE_BAG.front),
    body: mark('front', DUFFLE_BAG.body),
    handle: mark('front', DUFFLE_BAG.front[2], DUFFLE_BAG.front[3]),
    strap: mark('front', DUFFLE_BAG.front[0], DUFFLE_BAG.front[1]),
    zip: mark('front', DUFFLE_BAG.front[4]),
    pocket: mark('front', DUFFLE_BAG.front[6]),
    panel: mark('front', DUFFLE_BAG.front[5]),
    hardware: mark('front', DUFFLE_BAG.front[7]),
    base: mark('side_l', DUFFLE_BAG.side[2]),
    back: mark('back', DUFFLE_BAG.body, ...DUFFLE_BAG.back),
    lining: zone('front', 'M13 51 Q32 47 51 51 L53 79 Q53 82 49 82 L15 82 Q11 82 11 79 Z'),
  },
  pouch: {
    whole: mark('front', POUCH.body, ...POUCH.front),
    body: mark('front', POUCH.body),
    zip: mark('front', POUCH.front[0]),
    pocket: mark('front', POUCH.front[1]),
    hardware: mark('front', POUCH.front[3]),
    edge: mark('front', POUCH.body, POUCH.front[2]),
    back: mark('back', POUCH.body, ...POUCH.back),
    lining: zone('front', 'M19 56 L45 56 L47 82 L17 82 Z'),
  },
  earring: {
    whole: mark('front', EARRING.body, ...EARRING.front),
    post: mark('front', EARRING.front[0], EARRING.front[1]),
    charm: mark('front', EARRING.body, EARRING.front[3]),
    clasp: mark('front', EARRING.front[2]),
  },
  ring: {
    whole: mark('front', RING.body, ...RING.front),
    band: mark('front', RING.body, RING.front[2]),
    charm: mark('front', RING.front[0], RING.front[1]),
  },
  bracelet: {
    whole: mark('front', BRACELET.body, ...BRACELET.front),
    chain: mark('front', BRACELET.body, BRACELET.front[0]),
    charm: mark('front', BRACELET.front[1]),
    clasp: mark('front', BRACELET.front[2]),
  },
  mitten: {
    whole: mark('front', MITTEN.body, ...MITTEN.front),
    palm: mark('front', MITTEN.front[0], MITTEN.front[1]),
    back: mark('back', MITTEN.body, ...MITTEN.back),
    thumb: mark('front', 'M20 63 L10 54 Q7 50 10 47 Q13 44 16 48 L21 53'),
    cuff: mark('front', MITTEN.body),
  },
};
