import type { ReactNode } from 'react';

import {
  GARMENT_FAMILIES,
  GARMENT_SHAPES,
  GarmentPictogram,
  type GarmentFamily,
} from './garment-pictograms';

/** Every part name the quiz model may return (20-DESIGN O6). */
export type PartKey =
  | 'whole'
  | 'neckline'
  | 'shoulder'
  | 'chest'
  | 'sleeve'
  | 'cuff'
  | 'pocket'
  | 'hem'
  | 'back'
  | 'side_seam'
  | 'label'
  | 'collar'
  | 'placket'
  | 'closure'
  | 'yoke'
  | 'hood'
  | 'drawcord'
  | 'zip'
  | 'lapel'
  | 'lining'
  | 'belt'
  | 'strap'
  | 'bodice'
  | 'waist'
  | 'panel'
  | 'slit'
  | 'leg'
  | 'knee'
  | 'waistband'
  | 'fly'
  | 'rise'
  | 'back_pocket'
  | 'seat'
  | 'hip'
  | 'thigh'
  | 'inseam'
  | 'pleat'
  | 'front'
  | 'leg_opening'
  | 'gusset'
  | 'cup'
  | 'underband'
  | 'crown'
  | 'brim'
  | 'band'
  | 'vent'
  | 'palm'
  | 'fingers'
  | 'thumb'
  | 'foot'
  | 'heel'
  | 'toe'
  | 'edge'
  | 'end'
  | 'fringe'
  | 'tip'
  | 'knot'
  | 'blade'
  | 'keeper'
  | 'frame'
  | 'lens'
  | 'bridge'
  | 'temple'
  | 'hinge'
  | 'card_slot'
  | 'coin_pocket'
  | 'ring'
  | 'charm'
  | 'clasp'
  | 'chain'
  | 'pendant'
  | 'upper'
  | 'throat'
  | 'laces'
  | 'tongue'
  | 'quarter'
  | 'sole'
  | 'shaft'
  | 'pull_tab'
  | 'footbed'
  | 'buckle'
  | 'body'
  | 'handle'
  | 'flap'
  | 'hardware'
  | 'base'
  | 'lid'
  | 'front_panel'
  | 'side';

export const PART_LABEL: Record<PartKey, string> = {
  whole: 'whole',
  neckline: 'neckline',
  shoulder: 'shoulder',
  chest: 'chest',
  sleeve: 'sleeve',
  cuff: 'cuff',
  pocket: 'pocket',
  hem: 'hem',
  back: 'back',
  side_seam: 'side seam',
  label: 'label',
  collar: 'collar',
  placket: 'placket',
  closure: 'closure',
  yoke: 'yoke',
  hood: 'hood',
  drawcord: 'drawcord',
  zip: 'zip',
  lapel: 'lapel',
  lining: 'lining',
  belt: 'belt',
  strap: 'strap',
  bodice: 'bodice',
  waist: 'waist',
  panel: 'panel',
  slit: 'slit',
  leg: 'leg',
  knee: 'knee',
  waistband: 'waistband',
  fly: 'fly',
  rise: 'rise',
  back_pocket: 'back pocket',
  seat: 'seat',
  hip: 'hip',
  thigh: 'thigh',
  inseam: 'inseam',
  pleat: 'pleat',
  front: 'front',
  leg_opening: 'leg opening',
  gusset: 'gusset',
  cup: 'cup',
  underband: 'underband',
  crown: 'crown',
  brim: 'brim',
  band: 'band',
  vent: 'vent',
  palm: 'palm',
  fingers: 'fingers',
  thumb: 'thumb',
  foot: 'foot',
  heel: 'heel',
  toe: 'toe',
  edge: 'edge',
  end: 'end',
  fringe: 'fringe',
  tip: 'tip',
  knot: 'knot',
  blade: 'blade',
  keeper: 'keeper',
  frame: 'frame',
  lens: 'lens',
  bridge: 'bridge',
  temple: 'temple',
  hinge: 'hinge',
  card_slot: 'card slot',
  coin_pocket: 'coin pocket',
  ring: 'ring',
  charm: 'charm',
  clasp: 'clasp',
  chain: 'chain',
  pendant: 'pendant',
  upper: 'upper',
  throat: 'throat',
  laces: 'laces',
  tongue: 'tongue',
  quarter: 'quarter',
  sole: 'sole',
  shaft: 'shaft',
  pull_tab: 'pull tab',
  footbed: 'footbed',
  buckle: 'buckle',
  body: 'body',
  handle: 'handle',
  flap: 'flap',
  hardware: 'hardware',
  base: 'base',
  lid: 'lid',
  front_panel: 'front panel',
  side: 'side',
};

type PartMark = {
  view: 'front' | 'back' | 'side_l';
  d: string[];
  zone?: boolean;
};

const mark = (view: PartMark['view'], ...d: string[]): PartMark => ({ view, d });
const zone = (view: PartMark['view'], ...d: string[]): PartMark => ({ view, d, zone: true });
const wholeFront = (family: GarmentFamily): PartMark => mark('front', GARMENT_SHAPES[family].body);
const wholeSide = (family: GarmentFamily, ...indexes: number[]): PartMark =>
  mark('side_l', ...indexes.map((index) => GARMENT_SHAPES[family].side[index]));

/**
 * Canonical family/part allow-list and highlight geometry (20-DESIGN O6).
 * Coordinates share the 64×96 garment frame, so a mark always lands on its base drawing.
 */
export const GARMENT_PARTS: Record<GarmentFamily, Partial<Record<PartKey, PartMark>>> = {
  tee: {
    whole: wholeFront('tee'),
    neckline: mark('front', GARMENT_SHAPES.tee.front[0]),
    shoulder: mark('front', 'M15 18 L26 14', 'M38 14 L49 18'),
    chest: mark('front', 'M19 35 Q32 31 45 35'),
    sleeve: mark('front', 'M15 18 L5 33 L13 38 L18 32', 'M49 18 L59 33 L51 38 L46 32'),
    cuff: mark('front', 'M5 33 L13 38', 'M59 33 L51 38'),
    pocket: mark('front', 'M21 48 L29 48 L29 59 L21 59 Z'),
    hem: mark('front', 'M18 86 L46 86'),
    back: mark('back', GARMENT_SHAPES.tee.body),
    side_seam: mark('side_l', 'M21 46 L21 86', 'M44 30 L44 86'),
    label: mark('back', 'M28 16 L36 16 L36 21 L28 21 Z'),
  },
  shirt: {
    whole: wholeFront('shirt'),
    collar: mark('front', GARMENT_SHAPES.shirt.front[0], GARMENT_SHAPES.shirt.front[1]),
    placket: mark('front', GARMENT_SHAPES.shirt.front[2]),
    closure: mark(
      'front',
      GARMENT_SHAPES.shirt.front[2],
      'M30.8 34 A1.2 1.2 0 1 0 33.2 34 A1.2 1.2 0 1 0 30.8 34',
      'M30.8 46 A1.2 1.2 0 1 0 33.2 46 A1.2 1.2 0 1 0 30.8 46',
    ),
    chest: mark('front', 'M19 32 Q32 28 45 32'),
    pocket: mark('front', GARMENT_SHAPES.shirt.front[4]),
    sleeve: mark('front', 'M14 18 L5 72 L12 75 L18 36', 'M50 18 L59 72 L52 75 L46 36'),
    cuff: mark('front', GARMENT_SHAPES.shirt.front[5], GARMENT_SHAPES.shirt.front[6]),
    yoke: mark('back', GARMENT_SHAPES.shirt.back[1]),
    back: mark('back', GARMENT_SHAPES.shirt.body),
    hem: mark('front', GARMENT_SHAPES.shirt.front[7]),
    side_seam: mark('side_l', 'M23 35 L23 84', 'M44 31 L44 86'),
  },
  knit: {
    whole: wholeFront('knit'),
    neckline: mark('front', GARMENT_SHAPES.knit.front[0], GARMENT_SHAPES.knit.front[1]),
    shoulder: mark('front', 'M14 18 L25 14', 'M39 14 L50 18'),
    chest: mark('front', 'M19 37 Q32 33 45 37'),
    placket: mark('front', 'M32 20 L32 48', 'M29 25 L35 25', 'M29 33 L35 33'),
    pocket: mark('front', GARMENT_SHAPES.knit.front[5]),
    sleeve: mark('front', 'M14 18 L5 73 L12 76 L18 37', 'M50 18 L59 73 L52 76 L46 37'),
    cuff: mark('front', GARMENT_SHAPES.knit.front[3], GARMENT_SHAPES.knit.front[4]),
    hem: mark('front', GARMENT_SHAPES.knit.front[2]),
    back: mark('back', GARMENT_SHAPES.knit.body),
  },
  hoodie: {
    whole: wholeFront('hoodie'),
    hood: mark('side_l', GARMENT_SHAPES.hoodie.side[2], GARMENT_SHAPES.hoodie.side[3]),
    neckline: mark('front', 'M24 22 Q32 25 40 22'),
    drawcord: mark('front', GARMENT_SHAPES.hoodie.front[2], GARMENT_SHAPES.hoodie.front[3]),
    zip: mark('front', 'M32 23 L32 81'),
    pocket: mark('front', GARMENT_SHAPES.hoodie.front[4]),
    shoulder: mark('front', 'M15 23 L25 20', 'M39 20 L49 23'),
    sleeve: mark('front', 'M15 23 L5 76 L12 78 L18 40', 'M49 23 L59 76 L52 78 L46 40'),
    cuff: mark('front', GARMENT_SHAPES.hoodie.front[6], GARMENT_SHAPES.hoodie.front[7]),
    hem: mark('front', GARMENT_SHAPES.hoodie.front[5]),
    back: mark('back', GARMENT_SHAPES.hoodie.body),
  },
  jacket: {
    whole: wholeFront('jacket'),
    collar: mark('front', 'M26 13 L32 30 L38 13'),
    lapel: mark('front', GARMENT_SHAPES.jacket.front[1], GARMENT_SHAPES.jacket.front[2]),
    closure: mark('front', GARMENT_SHAPES.jacket.front[3]),
    chest: mark('front', 'M19 38 Q32 34 45 38'),
    pocket: mark('front', GARMENT_SHAPES.jacket.front[4], GARMENT_SHAPES.jacket.front[5]),
    shoulder: mark('front', 'M14 17 L26 13', 'M38 13 L50 17'),
    sleeve: mark('front', 'M14 17 L5 76 L12 78 L18 36', 'M50 17 L59 76 L52 78 L46 36'),
    cuff: mark('front', GARMENT_SHAPES.jacket.front[6], GARMENT_SHAPES.jacket.front[7]),
    hem: mark('front', 'M18 86 L46 86'),
    yoke: mark('back', GARMENT_SHAPES.jacket.back[1]),
    back: mark('back', GARMENT_SHAPES.jacket.body),
    side_seam: mark('side_l', 'M23 44 L23 86', 'M44 30 L44 86'),
    lining: zone('front', 'M27 27 L32 32 L37 27 L44 36 L44 82 L20 82 L20 36 Z'),
  },
  coat: {
    whole: wholeFront('coat'),
    collar: mark('front', 'M26 10 L32 31 L38 10'),
    lapel: mark('front', GARMENT_SHAPES.coat.front[1], GARMENT_SHAPES.coat.front[2]),
    closure: mark(
      'front',
      GARMENT_SHAPES.coat.front[3],
      GARMENT_SHAPES.coat.front[4],
      GARMENT_SHAPES.coat.front[5],
    ),
    chest: mark('front', 'M19 35 Q32 31 45 35'),
    pocket: mark('front', GARMENT_SHAPES.coat.front[7], GARMENT_SHAPES.coat.front[8]),
    belt: mark('front', GARMENT_SHAPES.coat.front[6], 'M28 52 L36 52 L36 58 L28 58 Z'),
    shoulder: mark('front', 'M14 15 L26 10', 'M38 10 L50 15'),
    sleeve: mark('front', 'M14 15 L5 72 L12 75 L18 34', 'M50 15 L59 72 L52 75 L46 34'),
    cuff: mark('front', GARMENT_SHAPES.coat.front[9], GARMENT_SHAPES.coat.front[10]),
    hem: mark('front', 'M15 91 L49 91'),
    yoke: mark('back', GARMENT_SHAPES.coat.back[1]),
    back: mark('back', GARMENT_SHAPES.coat.body),
    slit: mark('back', GARMENT_SHAPES.coat.back[4], GARMENT_SHAPES.coat.back[5]),
    lining: zone('front', 'M27 27 L32 32 L37 27 L44 36 L47 87 L17 87 L20 36 Z'),
  },
  vest: {
    whole: wholeFront('vest'),
    neckline: mark('front', GARMENT_SHAPES.vest.front[0]),
    closure: mark('front', GARMENT_SHAPES.vest.front[1]),
    pocket: mark('front', GARMENT_SHAPES.vest.front[2], GARMENT_SHAPES.vest.front[3]),
    hem: mark('front', GARMENT_SHAPES.vest.front[4]),
    back: mark('back', GARMENT_SHAPES.vest.body),
    lining: zone('front', 'M25 18 L32 32 L39 18 L43 36 L43 80 L21 80 L21 36 Z'),
  },
  dress: {
    whole: wholeFront('dress'),
    neckline: mark('front', GARMENT_SHAPES.dress.front[0]),
    strap: mark('front', 'M20 10 L25 8', 'M39 8 L44 10'),
    bodice: mark('front', 'M20 10 Q23 22 19 29 L21 42 L43 42 L45 29 Q41 22 44 10'),
    waist: mark('front', GARMENT_SHAPES.dress.front[1]),
    sleeve: mark('front', 'M20 10 Q23 22 19 29', 'M44 10 Q41 22 45 29'),
    cuff: mark('front', 'M19 29 L21 32', 'M45 29 L43 32'),
    pocket: mark('front', 'M17 56 L26 56 L25 68 L14 68 Z'),
    panel: mark('front', 'M32 42 L32 90', 'M21 42 L18 90', 'M43 42 L46 90'),
    slit: mark('front', 'M32 72 L32 90'),
    hem: mark('front', 'M8 90 L56 90'),
    back: mark('back', GARMENT_SHAPES.dress.body),
    closure: mark('back', GARMENT_SHAPES.dress.back[2]),
  },
  jumpsuit: {
    whole: wholeFront('jumpsuit'),
    neckline: mark('front', GARMENT_SHAPES.jumpsuit.front[0]),
    collar: mark('front', GARMENT_SHAPES.jumpsuit.front[1], GARMENT_SHAPES.jumpsuit.front[2]),
    closure: mark('front', GARMENT_SHAPES.jumpsuit.front[3]),
    bodice: mark('front', 'M18 27 L18 43 L46 43 L46 27', 'M20 24 Q32 20 44 24'),
    waist: mark('front', GARMENT_SHAPES.jumpsuit.front[4]),
    pocket: mark('front', GARMENT_SHAPES.jumpsuit.front[5], GARMENT_SHAPES.jumpsuit.front[6]),
    sleeve: mark('front', 'M15 11 L6 43 L13 46 L18 27', 'M49 11 L58 43 L51 46 L46 27'),
    cuff: mark('front', GARMENT_SHAPES.jumpsuit.front[7], GARMENT_SHAPES.jumpsuit.front[8]),
    leg: mark('front', 'M18 43 L12 90 L28 90 L32 55', 'M32 55 L36 90 L52 90 L46 43'),
    knee: mark('front', 'M14 70 L29 70', 'M35 70 L50 70'),
    hem: mark('front', 'M12 90 L28 90', 'M36 90 L52 90'),
    back: mark('back', GARMENT_SHAPES.jumpsuit.body),
  },
  trousers: {
    whole: wholeFront('trousers'),
    waistband: mark('front', GARMENT_SHAPES.trousers.front[0], 'M18 8 L46 8'),
    fly: mark('front', GARMENT_SHAPES.trousers.front[1], GARMENT_SHAPES.trousers.front[2]),
    rise: mark('side_l', 'M22 14 L21 30 Q29 36 32 44'),
    pocket: mark('front', GARMENT_SHAPES.trousers.front[3], GARMENT_SHAPES.trousers.front[4]),
    back_pocket: mark('back', GARMENT_SHAPES.trousers.back[3], GARMENT_SHAPES.trousers.back[4]),
    seat: mark('back', 'M18 16 Q32 35 46 16', GARMENT_SHAPES.trousers.back[1]),
    hip: mark('front', 'M17 18 Q32 29 47 18'),
    thigh: mark('front', 'M15 34 L29 34 L28 56 L14 56 Z', 'M35 34 L49 34 L50 56 L36 56 Z'),
    knee: mark('front', 'M14 58 L29 58', 'M35 58 L50 58'),
    leg: mark('front', 'M18 14 L12 90 L28.5 90 L32 38', 'M32 38 L35.5 90 L52 90 L46 14'),
    inseam: mark('front', 'M32 38 L28.5 90', 'M32 38 L35.5 90'),
    side_seam: mark('side_l', GARMENT_SHAPES.trousers.side[2]),
    hem: mark('front', 'M12 90 L28.5 90', 'M35.5 90 L52 90'),
    yoke: mark('back', GARMENT_SHAPES.trousers.back[2]),
  },
  shorts: {
    whole: wholeFront('shorts'),
    waistband: mark('front', GARMENT_SHAPES.shorts.front[0], 'M16 24 L48 24'),
    fly: mark('front', GARMENT_SHAPES.shorts.front[1], GARMENT_SHAPES.shorts.front[2]),
    rise: mark('side_l', 'M22 30 L21 42 Q29 48 32 54'),
    pocket: mark('front', GARMENT_SHAPES.shorts.front[3], GARMENT_SHAPES.shorts.front[4]),
    back_pocket: mark('back', GARMENT_SHAPES.shorts.back[3], GARMENT_SHAPES.shorts.back[4]),
    seat: mark('back', 'M16 32 Q32 52 48 32', GARMENT_SHAPES.shorts.back[1]),
    leg: mark('front', 'M16 30 L10 66 L28.5 68 L32 48', 'M32 48 L35.5 68 L54 66 L48 30'),
    inseam: mark('front', 'M32 48 L28.5 68', 'M32 48 L35.5 68'),
    side_seam: mark('side_l', GARMENT_SHAPES.shorts.side[2]),
    hem: mark('front', 'M10 66 L28.5 68', 'M35.5 68 L54 66'),
  },
  skirt: {
    whole: wholeFront('skirt'),
    waistband: mark('front', GARMENT_SHAPES.skirt.front[0], 'M21 16 L43 16'),
    closure: mark('back', GARMENT_SHAPES.skirt.back[1]),
    hip: mark('front', 'M19 32 Q32 38 45 32'),
    pocket: mark('front', 'M20 28 L29 33', 'M44 28 L35 33'),
    panel: mark('front', GARMENT_SHAPES.skirt.front[1], GARMENT_SHAPES.skirt.front[2]),
    pleat: mark('front', 'M27 24 L31 82', 'M37 24 L33 82'),
    slit: mark('front', 'M32 61 L32 82'),
    hem: mark('front', 'M9 82 L55 82'),
    yoke: mark('back', 'M21 22 Q32 34 43 22'),
  },
  briefs: {
    whole: wholeFront('briefs'),
    waistband: mark('front', GARMENT_SHAPES.briefs.front[0], 'M11 32 L53 32'),
    front: mark('front', GARMENT_SHAPES.briefs.front[1], 'M20 42 Q32 54 44 42'),
    seat: mark('back', 'M14 39 Q32 67 50 39', GARMENT_SHAPES.briefs.back[1]),
    leg_opening: mark('front', 'M11 38 Q15 55 27 64', 'M53 38 Q49 55 37 64'),
    gusset: mark('front', 'M27 58 Q32 53 37 58 L35 64 L29 64 Z'),
    label: mark('back', 'M28 34 L36 34 L36 40 L28 40 Z'),
  },
  bra: {
    whole: wholeFront('bra'),
    cup: mark('front', GARMENT_SHAPES.bra.front[2], GARMENT_SHAPES.bra.front[3]),
    underband: mark('front', GARMENT_SHAPES.bra.front[4]),
    strap: mark('front', GARMENT_SHAPES.bra.front[0], GARMENT_SHAPES.bra.front[1]),
    closure: mark('back', GARMENT_SHAPES.bra.back[4]),
    neckline: mark('front', 'M20 31 Q26 20 32 39 Q38 20 44 31'),
  },
  cap: {
    whole: wholeSide('cap', 0, 2),
    crown: mark('side_l', GARMENT_SHAPES.cap.side[0]),
    brim: mark('side_l', GARMENT_SHAPES.cap.side[2]),
    panel: mark(
      'front',
      GARMENT_SHAPES.cap.front[3],
      GARMENT_SHAPES.cap.front[4],
      GARMENT_SHAPES.cap.front[5],
    ),
    vent: mark('front', GARMENT_SHAPES.cap.front[2]),
    closure: mark('back', GARMENT_SHAPES.cap.back[0], GARMENT_SHAPES.cap.back[1]),
    label: mark('front', 'M28 46 L36 46 L36 54 L28 54 Z'),
  },
  hat: {
    whole: wholeSide('hat', 0, 2),
    crown: mark('side_l', GARMENT_SHAPES.hat.side[0]),
    brim: mark('side_l', GARMENT_SHAPES.hat.side[2]),
    band: mark('side_l', GARMENT_SHAPES.hat.side[3]),
    label: mark('front', GARMENT_SHAPES.hat.front[4]),
  },
  glove: {
    whole: wholeFront('glove'),
    palm: mark('front', 'M21 76 Q19 56 21 44 L44 44 L43 76 Z'),
    back: mark('back', ...GARMENT_SHAPES.glove.back),
    fingers: mark(
      'front',
      GARMENT_SHAPES.glove.front[0],
      GARMENT_SHAPES.glove.front[1],
      GARMENT_SHAPES.glove.front[2],
      GARMENT_SHAPES.glove.front[3],
    ),
    thumb: mark('front', 'M20.5 68 L10 53.5 Q7.5 49 10.5 46.5 Q13 45 15.5 48 L20.5 55'),
    cuff: mark('front', GARMENT_SHAPES.glove.body),
  },
  sock: {
    whole: wholeSide('sock', 0),
    cuff: mark(
      'side_l',
      GARMENT_SHAPES.sock.side[1],
      GARMENT_SHAPES.sock.side[2],
      GARMENT_SHAPES.sock.side[3],
      GARMENT_SHAPES.sock.side[4],
    ),
    leg: mark('side_l', 'M24 16 L24 62', 'M40 16 L40 64'),
    heel: mark('side_l', GARMENT_SHAPES.sock.side[5]),
    foot: mark('side_l', 'M11 70.5 Q4 71 4 78.5 Q4 86 11 86 L37 86'),
    toe: mark('side_l', GARMENT_SHAPES.sock.side[6]),
  },
  belt: {
    whole: wholeFront('belt'),
    strap: zone('front', GARMENT_SHAPES.belt.body),
    buckle: mark(
      'front',
      GARMENT_SHAPES.belt.front[0],
      GARMENT_SHAPES.belt.front[1],
      GARMENT_SHAPES.belt.front[2],
    ),
    keeper: mark('front', GARMENT_SHAPES.belt.front[3]),
    tip: mark('front', 'M27 78 L27 84 L32 90 L37 84 L37 78'),
  },
  scarf: {
    whole: wholeFront('scarf'),
    edge: mark('front', 'M22 10 L22 84', 'M42 10 L42 84'),
    end: mark(
      'front',
      GARMENT_SHAPES.scarf.front[10],
      GARMENT_SHAPES.scarf.front[11],
      GARMENT_SHAPES.scarf.front[12],
      GARMENT_SHAPES.scarf.front[13],
    ),
    fringe: mark('front', ...GARMENT_SHAPES.scarf.front.slice(0, 10)),
    label: mark('front', 'M27 62 L37 62 L37 70 L27 70 Z'),
  },
  tie: {
    whole: wholeFront('tie'),
    knot: mark('front', GARMENT_SHAPES.tie.front[0]),
    blade: mark('front', GARMENT_SHAPES.tie.body),
    tip: mark('front', 'M23 80 L32 90 L41 80'),
    keeper: mark('back', GARMENT_SHAPES.tie.back[2]),
  },
  glasses: {
    whole: wholeFront('glasses'),
    frame: mark('front', GARMENT_SHAPES.glasses.body),
    lens: zone('front', GARMENT_SHAPES.glasses.body),
    bridge: mark('front', GARMENT_SHAPES.glasses.front[0]),
    temple: mark('side_l', GARMENT_SHAPES.glasses.side[1]),
    hinge: mark('side_l', 'M7 40 L10 40 L10 45 L7 45 Z'),
  },
  wallet: {
    whole: wholeFront('wallet'),
    closure: mark(
      'front',
      'M49 43 L58 43 L58 55 L49 55 Z',
      'M52 49 A1 1 0 1 0 54 49 A1 1 0 1 0 52 49',
    ),
    card_slot: mark('front', 'M12 39 L34 39 L34 48 L12 48', 'M14 43 L32 43'),
    coin_pocket: mark('front', GARMENT_SHAPES.wallet.front[1]),
    zip: mark('front', 'M10 57 L54 57', 'M45 54 L49 57 L45 60'),
    edge: mark('front', GARMENT_SHAPES.wallet.body),
    lining: zone('front', GARMENT_SHAPES.wallet.front[0]),
    back: mark('back', GARMENT_SHAPES.wallet.body),
  },
  keyring: {
    whole: wholeFront('keyring'),
    ring: mark('front', GARMENT_SHAPES.keyring.front[0]),
    charm: mark('front', GARMENT_SHAPES.keyring.body, GARMENT_SHAPES.keyring.front[3]),
    clasp: mark('front', GARMENT_SHAPES.keyring.front[1], GARMENT_SHAPES.keyring.front[2]),
  },
  necklace: {
    whole: wholeFront('necklace'),
    chain: mark('front', GARMENT_SHAPES.necklace.body),
    pendant: mark(
      'front',
      GARMENT_SHAPES.necklace.front[0],
      GARMENT_SHAPES.necklace.front[1],
      GARMENT_SHAPES.necklace.front[2],
    ),
    clasp: mark('back', GARMENT_SHAPES.necklace.back[1]),
  },
  shoe: {
    whole: wholeSide('shoe', 0),
    upper: mark(
      'side_l',
      'M4 58 C3 52 8 48.5 14 48 L25 44.5 L33 39.5 Q33 34.5 36.5 34 Q39.5 34.5 39.5 38 Q46 42.5 52.5 39 Q56 36 59 36.5 C61 43 61.5 52 60.5 58',
    ),
    toe: mark('side_l', GARMENT_SHAPES.shoe.side[2]),
    throat: mark(
      'front',
      'M25.5 40.5 L27.5 39 L27.5 36 Q27.5 34 29.5 34 L34.5 34 Q36.5 34 36.5 36 L36.5 39 L38.5 40.5',
    ),
    laces: mark(
      'side_l',
      GARMENT_SHAPES.shoe.side[3],
      GARMENT_SHAPES.shoe.side[4],
      GARMENT_SHAPES.shoe.side[5],
    ),
    tongue: mark('side_l', 'M31 42 L33 34.5 Q36 31 39 35 L39.5 38'),
    quarter: mark('side_l', 'M39.5 38 Q46 42.5 52.5 39 Q56 36 59 36.5 L60.5 58 L52 58'),
    heel: mark('side_l', GARMENT_SHAPES.shoe.side[6]),
    sole: mark(
      'side_l',
      GARMENT_SHAPES.shoe.side[1],
      'M4 58 L4 60 Q4.5 64 9 64 L57.5 64 Q60.5 64 60.5 61 L60.5 58',
    ),
    label: mark('back', 'M28 44 L36 44 L36 50 L28 50 Z'),
  },
  boot: {
    whole: wholeSide('boot', 0),
    shaft: mark('side_l', 'M25 12 L45 12 L45 62 L24 68 Z'),
    upper: mark('side_l', 'M24 68 Q34 66 45 62 Q49 69 56 72 Q61 75 61 82 L3 82 Q3 75 10 73 Z'),
    toe: mark('side_l', 'M3 82 Q3 75 10 73 L19 70'),
    laces: mark(
      'side_l',
      GARMENT_SHAPES.boot.side[2],
      GARMENT_SHAPES.boot.side[3],
      GARMENT_SHAPES.boot.side[4],
      GARMENT_SHAPES.boot.side[5],
    ),
    heel: mark('side_l', GARMENT_SHAPES.boot.side[8]),
    sole: mark('side_l', GARMENT_SHAPES.boot.side[7], 'M3 82 L3 86 L61 86 L61 82'),
    pull_tab: mark('back', GARMENT_SHAPES.boot.back[1]),
    zip: mark('side_l', GARMENT_SHAPES.boot.side[10]),
  },
  sandal: {
    whole: wholeSide('sandal', 0),
    strap: mark('side_l', GARMENT_SHAPES.sandal.side[2], GARMENT_SHAPES.sandal.side[3]),
    footbed: mark('side_l', 'M5 70 Q25 66 49 61 L59 68 L59 76 L5 76 Z'),
    toe: mark('side_l', 'M5 70 Q8 65 16 64'),
    heel: mark('side_l', GARMENT_SHAPES.sandal.side[5]),
    sole: mark(
      'side_l',
      GARMENT_SHAPES.sandal.side[1],
      'M5 76 L5 78 Q5 83 10 83 L54 83 Q59 83 59 78 L59 76',
    ),
    buckle: mark('side_l', GARMENT_SHAPES.sandal.side[4]),
  },
  bag: {
    whole: wholeFront('bag'),
    body: mark('front', GARMENT_SHAPES.bag.body),
    handle: mark('front', GARMENT_SHAPES.bag.front[0], GARMENT_SHAPES.bag.front[1]),
    strap: mark('front', 'M14 28 Q8 42 12 80', 'M50 28 Q56 42 52 80'),
    flap: mark('front', GARMENT_SHAPES.bag.front[5]),
    closure: mark('front', 'M29 61 L35 61 L35 67 L29 67 Z'),
    zip: mark('front', 'M14 43 L50 43', 'M44 40 L48 43 L44 46'),
    pocket: mark('front', GARMENT_SHAPES.bag.front[4]),
    panel: mark('front', 'M13 48 L51 48', 'M18 48 L18 86', 'M46 48 L46 86'),
    hardware: mark(
      'front',
      GARMENT_SHAPES.bag.front[2],
      GARMENT_SHAPES.bag.front[3],
      'M12 48 A2 2 0 1 0 16 48 A2 2 0 1 0 12 48',
      'M48 48 A2 2 0 1 0 52 48 A2 2 0 1 0 48 48',
    ),
    base: mark('side_l', 'M23.5 86 L40.5 86', 'M25 80 L39 80'),
    lining: zone('front', 'M16 43 L48 43 L49.5 82 L14.5 82 Z'),
    back: mark('back', GARMENT_SHAPES.bag.body),
  },
  object: {
    whole: wholeFront('object'),
    body: mark('front', GARMENT_SHAPES.object.body),
    lid: mark('front', GARMENT_SHAPES.object.front[0]),
    front_panel: mark('front', GARMENT_SHAPES.object.front[1]),
    side: mark('side_l', GARMENT_SHAPES.object.side[1], GARMENT_SHAPES.object.side[2]),
    base: mark('side_l', 'M22 82 Q22 86 25 86 L39 86 Q42 86 42 82'),
    label: mark('front', GARMENT_SHAPES.object.front[1], GARMENT_SHAPES.object.front[2]),
  },
};

const FAMILY_SET: ReadonlySet<string> = new Set(GARMENT_FAMILIES);

function isGarmentFamily(value: string): value is GarmentFamily {
  return FAMILY_SET.has(value);
}

function bbox(ds: string[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const d of ds) {
    const tokens = d.match(/[MLQCAZmlqcaz]|-?\d*\.?\d+/g) ?? [];
    let cmd = 'M';
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/[A-Za-z]/.test(t)) {
        cmd = t.toUpperCase();
        i++;
        continue;
      }
      const nums: number[] = [];
      while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) nums.push(Number(tokens[i++]));
      if (cmd === 'A') {
        for (let k = 0; k + 6 < nums.length; k += 7) add(nums[k + 5], nums[k + 6]);
      } else {
        for (let k = 0; k + 1 < nums.length; k += 2) add(nums[k], nums[k + 1]);
      }
    }
  }
  return { x0, y0, x1, y1 };
}

const MAX_ZOOM = 2.5;
const MIN_ZOOM = 1.35;
const PAD_RATIO = 0.22;
const PAD_MIN = 5;
const FULL_FRAME = '0 0 64 96';

/**
 * Close-up onto a part: the mark's bbox padded, kept at 64:96 and inside the frame. A part too
 * big to gain MIN_ZOOM (sleeve, back, leg, body) keeps the full frame. Pool paths are absolute.
 */
export function partViewBox(d: string[]): { viewBox: string; zoom: number } {
  const b = bbox(d);
  if (!Number.isFinite(b.x0)) return { viewBox: FULL_FRAME, zoom: 1 };
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const pad = Math.max(PAD_MIN, PAD_RATIO * Math.max(bw, bh));
  let w = bw + pad * 2;
  const h0 = bh + pad * 2;
  if (w / h0 <= 64 / 96) w = (h0 * 64) / 96;
  w = Math.max(w, 64 / MAX_ZOOM);
  const h = (w * 96) / 64;
  const zoom = 64 / w;
  if (zoom < MIN_ZOOM) return { viewBox: FULL_FRAME, zoom: 1 };
  const x = Math.max(0, Math.min(64 - w, (b.x0 + b.x1) / 2 - w / 2));
  const y = Math.max(0, Math.min(96 - h, (b.y0 + b.y1) / 2 - h / 2));
  const r = (n: number) => Math.round(n * 100) / 100;
  return { viewBox: `${r(x)} ${r(y)} ${r(w)} ${r(h)}`, zoom };
}

/**
 * The slot shows the PART, not the garment: a close-up crop with the part filled. `whole` is the
 * plain garment (nothing for a `use` question); an unknown part is treated as `whole`.
 */
export function PartPictogram({
  family,
  part,
  category,
  className,
}: {
  family: string;
  part: string;
  category?: string;
  className?: string;
}): JSX.Element | null {
  if (!family || !isGarmentFamily(family)) return null;

  const known = part !== 'whole' ? GARMENT_PARTS[family][part as PartKey] : undefined;
  const label = known ? PART_LABEL[part as PartKey] : 'whole';
  const wrap = (zoom: number, children: ReactNode) => (
    <span
      role='img'
      aria-label={`${label} on ${family}`}
      data-zoom={zoom.toFixed(1)}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        aspectRatio: '64 / 96',
        ...(className ? {} : { width: 64, height: 96 }),
      }}
    >
      {children}
    </span>
  );

  if (!known) {
    if (category === 'use') return null;
    const whole = GARMENT_PARTS[family].whole;
    return wrap(
      1,
      <GarmentPictogram
        family={family}
        view={whole?.view ?? 'front'}
        style={{ display: 'block', width: '100%', height: '100%', opacity: 1 }}
      />,
    );
  }

  const { viewBox, zoom } = partViewBox(known.d);
  return wrap(
    zoom,
    <>
      <GarmentPictogram
        family={family}
        view={known.view}
        viewBox={viewBox}
        style={{ display: 'block', width: '100%', height: '100%', opacity: 0.35 }}
      />
      <svg
        aria-hidden
        viewBox={viewBox}
        fill='currentColor'
        fillOpacity={known.zone ? 0.12 : 0.14}
        stroke='currentColor'
        strokeWidth={2}
        strokeLinejoin='round'
        strokeLinecap='round'
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {known.d.map((d, index) => (
          <path key={`${index}:${d}`} d={d} vectorEffect='non-scaling-stroke' />
        ))}
      </svg>
    </>,
  );
}
