// The doll's test files (yarn doll:check, scripts/doll/gold.mjs): the SS26-005 probe copy, the CLO
// corpus and the prod cards' DXFs (tmp/plans/assembly-3d-doll/prod-data/dxf), with their category,
// card id (the technologist's order in cards.json) and gender.

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function dollFiles(plans) {
  const prod = resolve(plans, 'assembly-3d-doll/prod-data/dxf');
  const prodFile = (prefix) => {
    if (!existsSync(prod)) return null;
    const f = readdirSync(prod).find((x) => x.startsWith(prefix));
    return f ? resolve(prod, f) : null;
  };
  const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
  const beta = resolve(plans, 'assembly-3d-doll/beta-data');
  const SIDE_SEAMS = ['BP_2_R#0~FP_1_R#1', 'BP_1_L#2~FP_2_L#0'];
  const ALL = [
    {
      id: 'ss26',
      label: 'SS26-005 shirt',
      dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
      category: 'shirt',
      truth: 'shirt-M',
      card: '5',
      gender: 'FEMALE',
    },
    {
      id: 'ss26-neg',
      label: 'SS26-005 NEGATIVE CONTROL (side seams dropped)',
      dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
      category: 'shirt',
      truth: 'shirt-M',
      drop: SIDE_SEAMS,
      gender: 'FEMALE',
    },
    {
      id: 'allsizes',
      label: 'Allsizes (yoke shirt, CLO)',
      dxf: resolve(corpus, 'Allsizes_with_notches.dxf'),
      category: 'shirt',
      truth: 'allsizes-M',
      gender: 'MALE',
    },
    {
      id: 'summer',
      label: 'summer men (shirt)',
      dxf: resolve(corpus, 'summer men.dxf'),
      category: 'shirt',
      gender: 'MALE',
    },
    {
      id: 'summer-x2',
      label: 'summer men — ×2 TEST (SL_R removed, SL_L cut ×2 mirrored)',
      dxf: resolve(corpus, 'summer men.dxf'),
      category: 'shirt',
      gender: 'MALE',
      x2: { keep: 'SL_L', drop: 'SL_R' },
    },
    {
      id: 'card6',
      label: 'prod card 6 SS26-006 shirt with pockets (MAIN)',
      dxf: prodFile('card6-MAIN'),
      category: 'shirt',
      card: '6',
      gender: 'MALE',
    },
    {
      id: 'card6-shuf',
      label: 'prod card 6 NEGATIVE CONTROL (order inputs shuffled)',
      dxf: prodFile('card6-MAIN'),
      category: 'shirt',
      card: '6',
      shuffleOps: true,
      gender: 'MALE',
    },
    {
      // beta card 49 (FW26-001 CHECK SHIRT): a double yoke (BP + BP_2, two plies) over the back
      // BP_1 — the technologist's order and the rows stored on beta live in card49.json.
      id: 'card49',
      label: 'beta card 49 FW26-001 check shirt (double yoke)',
      dxf: resolve(beta, 'card49-MAIN.dxf'),
      category: 'shirt',
      betaCard: resolve(beta, 'card49.json'),
      gender: 'MALE',
    },
    {
      id: 'card49-rows',
      label: 'beta card 49 — with the rows stored on beta 10.10 18:02',
      dxf: resolve(beta, 'card49-MAIN.dxf'),
      category: 'shirt',
      betaCard: resolve(beta, 'card49.json'),
      betaRows: true,
      gender: 'MALE',
    },
    {
      id: 'card4',
      label: 'prod card 4 SS26-004 short-sleeve shirt',
      dxf: prodFile('card4-'),
      category: 'shirt',
      card: '4',
      gender: 'MALE',
    },
    {
      id: 'card4-graft',
      label: 'SYNTHETIC card 4 body + SS26-005 stand and fall (collar module on a clean body)',
      dxf: prodFile('card4-'),
      category: 'shirt',
      gender: 'MALE',
      graft: {
        dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
        keep: ['NCK', 'NCK_1', 'CLR', 'CLR_1', '2CLR', '2CLR_1'],
        drop: ['CLR_3', 'CLR_4'],
      },
    },
    {
      id: 'card4-graft6',
      label:
        'SYNTHETIC card 4 body + card 6 stand and two stacked collar units (K4 on a clean body)',
      dxf: prodFile('card4-'),
      category: 'shirt',
      gender: 'MALE',
      graft: {
        dxf: prodFile('card6-MAIN'),
        keep: ['nck', 'nck_1', 'clr_main', 'clr_main_1', 'CLR_SECOND', 'CLR_SECOND_1'],
        drop: ['CLR_3', 'CLR_4'],
      },
    },
    {
      id: 'card9',
      label: 'prod card 9 SS26-009 summer shirt',
      dxf: prodFile('card9-'),
      category: 'shirt',
      card: '9',
      gender: 'FEMALE',
      size: 'm',
    },
    {
      id: 'card16',
      label: 'prod card 16 FW26-001 shirt (MAIN)',
      dxf: prodFile('card16-MAIN'),
      category: 'shirt',
      card: '16',
      gender: 'FEMALE',
    },
    {
      id: 'card11',
      label: 'prod card 11 SS26-011 pants (MAIN)',
      dxf: prodFile('card11-MAIN'),
      category: 'trousers',
      card: '11',
      gender: 'MALE',
    },
    {
      id: 'card7',
      label: 'prod card 7 SS26-007 pants (MAIN)',
      dxf: prodFile('card7-MAIN'),
      category: 'trousers',
      card: '7',
      gender: 'FEMALE',
    },
    {
      id: 'card8',
      label: 'prod card 8 SS26-008 blazer shell (MAIN, lining off)',
      dxf: prodFile('card8-MAIN'),
      category: 'jacket-lined',
      card: '8',
      gender: 'MALE',
    },
  ];
  return ALL;
}
