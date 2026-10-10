// GOLD seam specs (L4) — TEST DATA. The true seam list of each doll test file in the graph's edge
// ids of today's segmentation (size M), with how each row was derived. `node scripts/doll/gold.mjs
// build` turns them into StoredSeam rows (scripts/doll/gold/<file>.seams.json); `... sheet` draws
// them on the flat pieces (p4-gold/<file>-flat-edges.png) — every row is checked there by eye.

export type GoldSeam = {
  /** Edge ids ('FP_L#2', a chain 'BP#3+4'); an array = a composite side in walk order. */
  a: string | string[];
  b: string | string[];
  /** Default: edge (composite when a side has 2+ parts). */
  kind?: 'edge' | 'partial' | 'closure';
  /** Default confirmed. A rejected row = the engine's wrong pairing, turned down by the reviewer. */
  status?: 'confirmed' | 'rejected';
  /** Partial: sewn sub-range of each run, mm from its start (walk order). */
  rangeMm?: { a: [number, number]; b: [number, number] };
  /** How the row was derived (the technologist's order + the geometry), in words. */
  why: string;
  unsure?: boolean;
};

export type GoldFile = {
  gender?: 'MALE' | 'FEMALE';
  summary: string;
  seams: GoldSeam[];
};

// Conventions read off the files themselves (not assumed): pieces are drawn FACE UP — a back's
// drawing-left is the wearer's left, a front whose centre-front edge is on its left is the wearer's
// left front. Checked on SS26-005, the one asymmetric body: the notches of BP#16 (drawing-left
// princess line) match BP_L#0 (named left) walked against each other — [179, 325, 431] mm.
// The engine pairs every symmetric shoulder CROSSED (BP#3 ↔ FRONT_L#1); the gold rows uncross them.

const ORDER = (s: string) => `technologist's order «${s}»`;

export const GOLD: Record<string, GoldFile> = {
  ss26: {
    gender: 'FEMALE',
    summary:
      'SS26-005 «load balance» (card 5): princess-line shirt — centre back BP + side backs + side fronts + fronts with plackets, two-piece sleeves, stand NCK + fall CLR + second collar 2CLR (each two plies). The back neck carries two stepped tucks each side (BP#5–7, BP#9–11).',
    seams: [
      {
        a: 'BP#16',
        b: 'BP_L#0',
        why: `${ORDER('Right back panel + BP + left back panel → Back panel')} · princess 568 onto 528 (eased by the back pleat), notches [179,325,431] match walked against each other`,
      },
      {
        a: 'BP#0',
        b: 'BP_R#0',
        why: `${ORDER('Back panel')} · princess 568 onto 528, notches match (mirror of BP#16 ↔ BP_L#0)`,
      },
      {
        a: 'BP_L#1',
        b: 'BP_1_L#0',
        kind: 'partial',
        rangeMm: { a: [99, 515], b: [0, 416] },
        why: `${ORDER('BP_L + BP_1_L → left back panel')} · 515 vs 416: sewn from the level hem up (the top 99 mm of BP_L#1 is armhole)`,
      },
      {
        a: 'BP_R#2',
        b: 'BP_1_R#2',
        kind: 'partial',
        rangeMm: { a: [0, 466], b: [0, 466] },
        why: `${ORDER('BP_R + BP_1_R + BP_2_R → Right back panel')} · 515 vs 466, sewn from the hem up (the top 49 mm is armhole)`,
      },
      { a: 'BP_1_R#0', b: 'BP_2_R#2', why: `${ORDER('Right back panel')} · 394 = 394` },
      {
        a: 'BP_1_L#2',
        b: 'FP_2_L#0',
        why: `${ORDER('left panel with placket + right panel with placket + Back panel → Base')} · left side seam 386 = 386, one notch each at 145 / 241 (= 386 − 145)`,
      },
      {
        a: 'BP_2_R#0',
        b: 'FP_1_R#1',
        why: `${ORDER('Base')} · right side seam 386 = 386, notch 241 ↔ 145`,
      },
      {
        a: 'FP_1_L#0',
        b: 'FP_2_L#2',
        why: `${ORDER('FP_L + FP_1_L + FP_2_L → Left front panel')} · 401 = 401`,
      },
      {
        a: 'FP_L#0',
        b: 'FP_1_L#2',
        kind: 'partial',
        rangeMm: { a: [0, 455], b: [0, 455] },
        why: `${ORDER('Left front panel')} · 482 vs 455, from the hem up (the top 27 mm is armhole)`,
      },
      {
        a: 'FP_1_R#3',
        b: 'FP_R#1',
        kind: 'partial',
        rangeMm: { a: [0, 422], b: [54, 476] },
        why: `${ORDER('FP_R + FP_1_R → right front panel')} · 422 vs 476, from the hem up (the top 54 mm of FP_R#1 is armhole)`,
      },
      {
        a: 'FP_L#1',
        b: 'FRONT_L#5',
        why: `${ORDER('FRONT_L + Left front panel → Left panel')} · princess 518 = 518, notches [124,198] ↔ [319,394]`,
      },
      {
        a: 'FP_R#0',
        b: 'FRONT_R#4',
        why: `${ORDER('FRONT_R + right front panel → right panel')} · 518 = 518, notches match`,
      },
      {
        a: 'BP#13',
        b: 'FRONT_L#1',
        why: `${ORDER('Base')} · left shoulder 126 = 126 — the back's drawing-left shoulder onto the LEFT front (face-up; the engine crosses it)`,
      },
      {
        a: 'BP#3',
        b: 'FRONT_R#2',
        why: `${ORDER('Base')} · right shoulder 126 = 126 (face-up; the engine crosses it)`,
      },
      {
        a: 'FRONT_L#3',
        b: 'PLCK_L#3',
        why: `${ORDER('PLCK_L + Left panel → left panel with placket')} · CF 593 = 593, the placket's inner edge`,
      },
      {
        a: 'FRONT_R#0',
        b: 'PLCK_R#2',
        why: `${ORDER('PLCK_R + right panel → right panel with placket')} · CF 593 = 593`,
      },
      {
        a: 'PLCK_L#1',
        b: 'PLCK_R#0',
        kind: 'closure',
        why: "the front opening: the two plackets' free edges, buttoned (drill columns on both plackets) — a closure, not a seam",
      },
      {
        a: 'SLV_L#0',
        b: 'SLV_M_L#4',
        why: `${ORDER('SLV_M_L + SLV_L → left sleeve')} · 553 = 553`,
      },
      { a: 'SLV_L#2', b: 'SLV_M_L#2', why: `${ORDER('left sleeve')} · 510 = 510` },
      {
        a: 'SLV_M_R#5',
        b: 'SLV_R#4',
        why: `${ORDER('SLV_M_R + SLV_R → right sleeve')} · 553 = 553`,
      },
      { a: 'SLV_M_R#1', b: 'SLV_R#2', why: `${ORDER('right sleeve')} · 510 = 510` },
      {
        a: ['SLV_M_L#3', 'SLV_L#1'],
        b: [
          'BP#14+15',
          'FRONT_L#0',
          'FP_L#0@455-482',
          'FP_1_L#1',
          'FP_2_L#1',
          'BP_1_L#1',
          'BP_L#1@0-99',
        ],
        why: `${ORDER('right sleeve + left sleeve + base with collar → Shirt')} · cap 331 + 160 = 491 onto the left armhole walked round its panels 121 + 116 + 27 + 54 + 27 + 62 + 99 = 506 (the free tops of the two partial seams — sewn from the level hem up — are armhole too); the left sleeve to the LEFT armhole by name and by the chain of left panels. PHASE (no notches on caps or armholes): the 510 seam is the sleeve's BACK seam — it carries the cuff vent (SLV_L#4 ↔ SLV_M_L#0) and its top is the high end of the under-sleeve cap — so its top goes to the back armhole at the yoke / back-panel point (BP#15 | BP_L#1), the top sleeve walks over the shoulder to the front, and the 553 (front) seam lands low at the front underarm (≈ FP_2_L); the doll's own lowest-point alignment lands both seams within ≈ 25 mm of this`,
      },
      {
        a: ['SLV_R#3', 'SLV_M_R#0'],
        b: [
          'BP_R#2@466-515',
          'BP_1_R#1',
          'BP_2_R#1',
          'FP_1_R#0',
          'FP_R#1@0-54',
          'FRONT_R#3',
          'BP#1+2',
        ],
        why: `${ORDER('Shirt')} · cap 160 + 331 = 491 onto the right armhole 49 + 80 + 31 + 54 + 54 + 116 + 121 = 505; phase as on the left: the back (510, vented) seam's top at the back armhole's yoke / back-panel point (BP#1 | BP_R#2) — the right cap edge runs from that seam's top over the under sleeve first, so the armhole walks the underarm first too, then the front and the shoulder`,
      },
      {
        a: 'NCK#3',
        b: ['FRONT_R#1', 'BP#4+5+6', 'BP#7+8+9', 'BP#10+11+12', 'FRONT_L#2'],
        why: `${ORDER('Collar with neck details + Base → base with collar')} · stand neck edge 412 (CF notches 13 / 400, SNP 114 / 298) onto the neckline CF-right → back neck → CF-left 89 + 302 + 89 = 480; the back neck 302 has two stepped tucks (BP#5–7, BP#9–11, 60 mm each) that fold away: 182 ≈ the stand's 184 between its SNP notches`,
      },
      {
        a: 'NCK#1',
        b: 'CLR#2',
        kind: 'partial',
        rangeMm: { a: [13, 362], b: [0, 350] },
        why: `${ORDER('NCK + NCK_1 + Collar → Collar with neck details')} · the fall's neck edge 350 into the stand top 375 between its end notches 13 / 362 (= 349)`,
      },
      {
        a: 'CLR#2',
        b: '2CLR#2',
        why: `${ORDER('Collar base + Second collar → Collar')} · the second collar stacked on the collar's neck edge 350 = 350 (truth: CLR ↔ 2CLR neck edges)`,
      },
      { a: 'BP_1_L#3', b: 'BP_L#2', status: 'rejected', why: 'two hems (80 = 80) — hems are free' },
    ],
  },
  card4: {
    gender: 'MALE',
    summary:
      'SS26-004 short-sleeve shirt (card 4): yoke BP (+ ply BP_2), back BP_1 with a CB box pleat, fronts FP_L / FP_R with grown-on button stands (drills 13 mm in), one-piece collar CLR_3 (+ ply CLR_4), short sleeves.',
    seams: [
      {
        a: 'BP#5',
        b: 'BP_1#2',
        why: `${ORDER('BP + BP_1 → Upper back detail')} · yoke 475 onto the back top 525 — the CB box pleat between the notches 237 / 288 (51 mm) takes the difference`,
      },
      {
        a: 'BP#3',
        b: 'FP_L#1',
        why: `${ORDER('FP_R + FP_L + Upper back detail → Back with side panels')} · left shoulder 170 = 170 (face-up yoke; the engine crosses it)`,
      },
      {
        a: 'BP#1',
        b: 'FP_R#2',
        why: `${ORDER('Back with side panels')} · right shoulder 170 = 170`,
      },
      { a: 'BP_1#4', b: 'FP_L#5', why: `${ORDER('Back with side panels')} · left side 470 = 470` },
      { a: 'BP_1#0', b: 'FP_R#4', why: `${ORDER('Back with side panels')} · right side 470 = 470` },
      {
        a: 'FP_L#3',
        b: 'FP_R#0',
        kind: 'closure',
        why: 'the front opening 653 = 653, six drills 13 mm in on both fronts — a closure',
      },
      {
        a: 'SL_L#0',
        b: ['FP_L#0', 'BP#4', 'BP_1#3'],
        why: `${ORDER('SL_R + SL_L + Back with side panels → Base with sleeves')} · cap 524 onto the left armhole front 258 + yoke 101 + back 166 = 525`,
      },
      {
        a: 'SL_R#1',
        b: ['BP_1#1', 'BP#0', 'FP_R#3'],
        why: `${ORDER('Base with sleeves')} · cap 524 onto the right armhole 166 + 101 + 258 = 525`,
      },
      { a: 'SL_L#1', b: 'SL_L#3', why: `${ORDER('Base with sleeves')} · left underarm 200 = 200` },
      { a: 'SL_R#0', b: 'SL_R#2', why: `${ORDER('Base with sleeves')} · right underarm 200 = 200` },
      {
        a: 'CLR_3#2',
        b: ['FP_R#1', 'BP#2', 'FP_L#2'],
        why: `${ORDER('Base with sleeves + Collar → base with collar')} · collar neck edge 483 (CF notches 36 / 447, SNP 140 / 343, CB 241) onto the neckline 128 + 207 + 128 = 463 (CF notches on the fronts 24 mm from the edge)`,
      },
    ],
  },
  card6: {
    gender: 'MALE',
    summary:
      'SS26-006 «starvation» (card 6): yoke BP_U (+ ply), back BP_MAIN, fronts in two parts (P_*_U upper, P_*_MAIN lower), separate plackets PLCK_L (folded, 103) / PLCK_R (50), stand nck (+ ply), fall clr_main (+ ply) with a second band CLR_SECOND (+ ply) stacked on it, sleeves with flaps.',
    seams: [
      {
        a: 'BP_U#5',
        b: 'BP_MAIN#1',
        why: `${ORDER('BP_MAIN + BP_U + BP_U_1 → back')} · yoke 475 = back top 475`,
      },
      {
        a: 'BP_U#3',
        b: 'P_L_U#0',
        why: `${ORDER('right piece with placket + left piece with placket + back → base')} · left shoulder 164 = 164 (the engine sewed the back ARMHOLE BP_MAIN#0 here)`,
      },
      { a: 'BP_U#1', b: 'P_R_U#2', why: `${ORDER('base')} · right shoulder 164 = 164` },
      {
        a: 'P_L_U#3',
        b: 'P_L_MAIN#1',
        why: `${ORDER('left upper piece + left front bottom piece → left panel with pocket')} · 189 = 189, notches [23,167]`,
      },
      { a: 'P_R_U#4', b: 'P_R_MAIN#1', why: `${ORDER('right panel with pocket')} · 189 = 189` },
      { a: 'BP_MAIN#3', b: 'P_L_MAIN#4', why: `${ORDER('base')} · left side 485 = 485` },
      { a: 'BP_MAIN#5', b: 'P_R_MAIN#3', why: `${ORDER('base')} · right side 485 = 485` },
      {
        a: 'PLCK_L#0',
        b: ['P_L_U#2', 'P_L_MAIN#2'],
        why: `${ORDER('PLCK_L + left panel with pocket → left piece with placket')} · placket 668 onto the left front's CF 124 + 544 = 668 (one placket ↔ two pieces)`,
      },
      {
        a: 'PLCK_R#1',
        b: ['P_R_MAIN#0', 'P_R_U#0'],
        why: `${ORDER('PLCK_R + right panel with pocket → right piece with placket')} · placket 668 onto 544 + 124`,
      },
      {
        a: 'PLCK_L#2',
        b: 'PLCK_R#3',
        kind: 'closure',
        why: "the front opening: the plackets' free edges, buttonholes on PLCK_L (38 mm from its sewn edge), buttons on PLCK_R (13 mm) — a closure",
      },
      {
        a: 'SLV_L#1',
        b: ['P_L_MAIN#0', 'P_L_U#4', 'BP_U#4', 'BP_MAIN#2'],
        why: `${ORDER('right sleeve + left sleeve + base → base with sleeves')} · cap 524 onto the left armhole 116 + 142 + 101 + 166 = 525 (four pieces)`,
      },
      {
        a: 'SLV_R#0',
        b: ['BP_MAIN#0', 'BP_U#0', 'P_R_U#3', 'P_R_MAIN#2'],
        why: `${ORDER('base with sleeves')} · cap 524 onto the right armhole 166 + 101 + 142 + 116 = 525`,
      },
      { a: 'SLV_L#0', b: 'SLV_L#2', why: `${ORDER('left sleeve')} · underarm 577 ≈ 576` },
      { a: 'SLV_R#1', b: 'SLV_R#3', why: `${ORDER('right sleeve')} · underarm 577 ≈ 576` },
      {
        a: 'nck#3',
        b: ['P_R_U#1', 'BP_U#2', 'P_L_U#1'],
        why: `${ORDER('Collar base + base with sleeves → shirt man')} · stand 475 (CF notches 25 / 450, SNP 130 / 345, CB 238) onto the neckline 105 + 215 + 105 = 425 = the stand between its CF notches; back-neck notches 45 / 169 ↔ stand 176 / 300`,
      },
      {
        a: 'nck#1',
        b: 'clr_main#2',
        kind: 'partial',
        rangeMm: { a: [13, 426], b: [0, 413] },
        why: `${ORDER('nck + nck_1 + collars → Collar base')} · the collar's neck edge 413 into the stand top 438 between its end notches 13 / 426`,
      },
      {
        a: 'clr_main#2',
        b: 'CLR_SECOND#1',
        why: `${ORDER('collar + second collar → collars')} · the second collar band stacked on the collar's neck edge 413 = 413 (which long edge of the band: the engine's reading)`,
        unsure: true,
      },
      {
        a: 'FLP_L_MAIN#8',
        b: 'FLP_R_MAIN#9',
        status: 'rejected',
        why: "the left sleeve flap's bottom onto the right one's — two flaps on two sleeves, not a seam",
      },
      {
        a: 'BP_U_1#5',
        b: 'BP_MAIN#4',
        status: 'rejected',
        why: "the yoke ply's bottom onto the back HEM — the yoke sits on the back top (BP_U#5 ↔ BP_MAIN#1)",
      },
    ],
  },
  card16: {
    gender: 'FEMALE',
    summary:
      'FW26-001 «semaphore» (card 16): one-piece back BP with a CB box pleat at the neck, fronts FL / FR with neck tucks, separate placket PLCK on FL, FR with buttonholes 53 mm in, collar-with-stand CLR (+ ply), sleeves with two-ply cuffs.',
    seams: [
      {
        a: 'BP#4',
        b: 'FL#2',
        why: `${ORDER('FR + left panel with placket + BP → back panel with front')} · left shoulder 164 = 164 (face-up; the engine crosses it)`,
      },
      { a: 'BP#2', b: 'FR#2', why: `${ORDER('back panel with front')} · right shoulder 164 = 164` },
      {
        a: 'BP#6',
        b: 'FL#0',
        why: `${ORDER('back panel with front')} · left side 413 = 413, notches 162 ↔ 251 (= 413 − 162)`,
      },
      {
        a: 'BP#0',
        b: 'FR#4',
        why: `${ORDER('back panel with front')} · right side 413 = 413, notch 251 ↔ 163`,
      },
      {
        a: 'FL#4',
        b: 'PLCK#0',
        why: `${ORDER('PLCK + FL → left panel with placket')} · CF 596 = 596`,
      },
      {
        a: 'FR#0',
        b: 'PLCK#2',
        kind: 'closure',
        why: "the front opening: FR's edge (buttonholes 53 mm in) over the placket (buttons 17 mm in) — a closure, right over left",
      },
      {
        a: 'SLV_L#0',
        b: ['FL#1', 'BP#5'],
        why: `${ORDER('back panel with front + right sleeve + left sleeve → Base')} · cap 469 onto the left armhole 214 + 253 = 467`,
      },
      {
        a: 'SLV_R#1',
        b: ['BP#1', 'FR#3'],
        why: `${ORDER('Base')} · cap 469 onto the right armhole 253 + 214 = 467`,
      },
      { a: 'SLV_L#1', b: 'SLV_L#3', why: `${ORDER('left sleeve')} · underarm 419 = 419` },
      { a: 'SLV_R#0', b: 'SLV_R#2', why: `${ORDER('right sleeve')} · underarm 419 = 419` },
      {
        a: 'SLV_L#2',
        b: 'SLV_M_L#3',
        why: `${ORDER('SLV_L + left sleeve cuff → left sleeve')} · sleeve hem 325 (two pleats between notch pairs 184/201, 236/254) onto the cuff 272 — eased 16 %`,
        unsure: true,
      },
      {
        a: 'SLV_R#3',
        b: 'SLV_M_R#2',
        why: `${ORDER('SLV_R + right sleeve cuff → right sleeve')} · 325 onto the cuff 273, eased`,
        unsure: true,
      },
      {
        a: 'CLR#6',
        b: ['FR#1', 'BP#3', 'FL#3'],
        why: `${ORDER('Collar + Base → shirt regular')} · collar neck edge 439 (CF notches 35 / 404, SNP 119 / 320) onto the neck 154 + 271 + 154 = 579: three folds between notch pairs — FR 35/70, BP 101/171 (CB pleat), FL 84/119 — take 35 + 70 + 35 = 140 → 439 exactly`,
      },
      {
        a: 'BP#1',
        b: 'BP#5',
        status: 'rejected',
        why: "the engine sews the back's two armholes to each other — they take the sleeves",
      },
      {
        a: 'FL#5',
        b: 'FR#5',
        status: 'rejected',
        why: 'the engine sews the two front hems to each other — hems are free',
      },
      {
        a: 'SLV_L#2',
        b: 'SLV_R#3',
        status: 'rejected',
        why: 'the two sleeve hems to each other — each takes its cuff',
      },
      {
        a: 'SLV_M_L#0',
        b: 'SLV_M_L_1#0',
        why: `${ORDER('SLV_M_L + SLV_M_L_1 → left sleeve cuff')} · the cuff's two plies sewn at the end 140 = 140 (enclosed seam)`,
      },
      {
        a: 'SLV_M_L#2',
        b: 'SLV_M_L_1#2',
        why: `${ORDER('left sleeve cuff')} · the other end 140 = 140`,
      },
      {
        a: 'SLV_M_R#1',
        b: 'SLV_M_R_1#2',
        why: `${ORDER('SLV_M_R + SLV_M_R_1 → right sleeve cuff')} · end 140 = 140`,
      },
      { a: 'SLV_M_R#3', b: 'SLV_M_R_1#0', why: `${ORDER('right sleeve cuff')} · end 140 = 140` },
      {
        a: 'SLV_M_L#0',
        b: 'SLV_M_R#1',
        status: 'rejected',
        why: "the left cuff's end onto the right cuff's — two cuffs",
      },
      {
        a: 'SLV_M_L#2',
        b: 'SLV_M_R#3',
        status: 'rejected',
        why: "the left cuff's end onto the right cuff's — two cuffs",
      },
      {
        a: 'SLV_M_L_1#2',
        b: 'SLV_M_R_1#0',
        status: 'rejected',
        why: 'cuff plies of two different cuffs',
      },
      {
        a: 'SLV_M_L_1#3',
        b: 'SLV_M_R_1#3',
        status: 'rejected',
        why: 'cuff plies of two different cuffs',
      },
      {
        a: 'SLV_M_L_1#0',
        b: 'SLV_M_R_1#2',
        status: 'rejected',
        why: 'cuff plies of two different cuffs',
      },
    ],
  },
  card11: {
    gender: 'MALE',
    summary:
      'SS26-011 pants (card 11): fronts with a marked fly, backs with a two-piece back yoke each side (Back_Top_*), waistband in two halves WST_L / WST_R (the right one gathered onto elastic), pocket flaps and belt loops (not sewn edge to edge).',
    seams: [
      {
        a: 'FRONT_L#2',
        b: 'Back_L#0',
        why: `${ORDER('front + Back → Base')} · left inseam 771 = 771, notches [44,226] ↔ [545,727]`,
      },
      { a: 'FRONT_R#0', b: 'Back_R#2', why: `${ORDER('Base')} · right inseam 771 = 771` },
      {
        a: 'Back_Top_R_R#0',
        b: 'Back_Top_L_R#2',
        why: `${ORDER('Back_Top_L_R + Back_Top_R_R → BACK TOP LEFT')} · 81 = 81`,
      },
      {
        a: 'Back_Top_RL#3',
        b: 'Back_Top_RR#1',
        why: `${ORDER('Back_Top_RL + Back_Top_RR → BACK TOP RIGHT')} · 81 = 81`,
      },
      {
        a: 'Back_L#2',
        b: ['Back_Top_R_R#3', 'Back_Top_L_R#3'],
        why: `${ORDER('BACK TOP LEFT WITH POCKET DETAIL + Left back with pocket detail → Left back with pocket')} · back top 231 onto the yoke bottoms 115 + 115 (one edge ↔ two pieces)`,
      },
      {
        a: 'Back_R#0',
        b: ['Back_Top_RL#2', 'Back_Top_RR#2'],
        why: `${ORDER('Right back with pocket')} · 231 onto 115 + 115`,
      },
      {
        a: 'FRONT_L#4',
        b: ['Back_Top_R_R#2', 'Back_L#3'],
        why: `${ORDER('Base')} · left outseam 1083 onto yoke 81 + back 1002 = 1083 (the front notch at 1003 marks the yoke line)`,
      },
      {
        a: 'FRONT_R#3',
        b: ['Back_R#4', 'Back_Top_RR#3'],
        why: `${ORDER('Base')} · right outseam 1083 onto 1002 + 81`,
      },
      {
        a: 'FRONT_L#1',
        b: 'FRONT_R#1',
        why: `${ORDER('Right front + left front → front')} · front rise 302 = 302 (the fly — a vee mark 203 mm — drawn sewn shut)`,
        unsure: true,
      },
      {
        a: ['Back_L#1', 'Back_Top_L_R#0'],
        b: ['Back_Top_RL#1', 'Back_R#1'],
        why: `${ORDER('Back with right … + Back with left … → Back')} · back rise 347 + 82 = 429 each side (CB through the yoke)`,
      },
      {
        a: 'WST_L#2',
        b: ['Back_Top_L_R#1', 'Back_Top_R_R#1', 'FRONT_L#0'],
        why: `${ORDER('WST_L + WST_R + Base → base with waist details')} · left waistband half 443 onto the left waist CB → side → CF 90 + 107 + 245 = 442 (which long edge: the one = the waist; both are 443–446)`,
        unsure: true,
      },
      {
        a: 'WST_R#3',
        b: ['FRONT_R#2', 'Back_Top_RR#0', 'Back_Top_RL#0'],
        why: `${ORDER('base with waist details')} · right half 523 onto CF → side → CB 245 + 107 + 90 = 442, gathered 18 % (${'«rubber»'} = elastic)`,
        unsure: true,
      },
      {
        a: 'WST_L#3',
        b: 'WST_R#2',
        why: `${ORDER('base with waist details')} · the halves meet at the CB: ends 42 = 42 (by the walk of the waist, the 42 mm ends sit at the CB)`,
        unsure: true,
      },
      {
        a: 'WST_L#1',
        b: 'WST_R#0',
        kind: 'closure',
        why: 'the halves meet at the CF over the fly: ends 40 = 40, a drill 20 mm in on each — a closure',
        unsure: true,
      },
      {
        a: 'BLT#3',
        b: 'FLAP_L#0',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
      {
        a: 'BLT_1#3',
        b: 'FLAP_L#2',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
      {
        a: 'BLT#3',
        b: 'FLAP_L#2',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
      {
        a: 'BLT#3',
        b: 'FLAP_R#2',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
      {
        a: 'BLT_1#3',
        b: 'FLAP_R#2',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
      {
        a: 'BLT_1#3',
        b: 'FLAP_L#0',
        status: 'rejected',
        why: 'a belt-loop / elastic strip onto a pocket flap — different units',
      },
    ],
  },
  card7: {
    gender: 'FEMALE',
    summary:
      'SS26-007 «fan out» (card 7): front with waist pleats and a fly (FL, FL_1, FL_2), back with a small waist dart, curved one-piece waistband WS, back patch pockets.',
    seams: [
      {
        a: 'FP_L#3',
        b: 'BP_L#7',
        why: `${ORDER('back + front → pants base')} · left inseam 862 onto 891 (back eased 3 %) — the engine sewed the two FRONT inseams together`,
      },
      { a: 'FP_R#4', b: 'BP_R#6', why: `${ORDER('pants base')} · right inseam 862 onto 891` },
      {
        a: 'FP_L#0',
        b: 'BP_L#5',
        why: `${ORDER('pants base')} · left outseam 1066 onto 1099 — the engine sewed the two front outseams together`,
      },
      { a: 'FP_R#2', b: 'BP_R#0', why: `${ORDER('pants base')} · right outseam 1066 onto 1099` },
      {
        a: 'FP_L#2',
        b: 'FP_R#0',
        why: `${ORDER('right front panel with flap piece + left front panel with flap piece → front')} · front rise 208 = 208 (the fly — vee 142 mm — drawn sewn shut)`,
        unsure: true,
      },
      {
        a: 'BP_L#0',
        b: 'BP_R#5',
        why: `${ORDER('left back + right back → back')} · back rise 303 = 303`,
      },
      {
        a: 'WS#3',
        b: ['FP_R#1', 'BP_R#1+2+3', 'BP_R#4', 'BP_L#1', 'BP_L#2+3+4', 'FP_L#1'],
        why: `${ORDER('waistband + pants base → Pants')} · band 877 onto the top CF → CF 286 + 139 + 122 + 122 + 139 + 286 = 1094 — the front waist pleats (notches 25 mm apart) do not account for all 217 mm: eased 20 %`,
        unsure: true,
      },
      {
        a: 'WS#0',
        b: 'WS#2',
        kind: 'closure',
        why: "the band's ends 35 = 35 at the CF, drills near one end — a closure",
        unsure: true,
      },
      {
        a: 'BP_L#1',
        b: 'BP_L#4',
        status: 'rejected',
        why: 'the two halves of the left back waist either side of the dart — not a seam',
      },
      {
        a: 'BP_R#1',
        b: 'BP_R#4',
        status: 'rejected',
        why: 'the two halves of the right back waist — not a seam',
      },
      {
        a: 'PCK_L_#_2#0',
        b: 'PCK_R_#_1#0',
        status: 'rejected',
        why: 'the left pocket piece onto the right one — two pockets',
      },
      {
        a: 'PCK_L_#_2#2',
        b: 'PCK_R_#_1#1',
        status: 'rejected',
        why: 'the left pocket piece onto the right one — two pockets',
      },
      {
        a: 'PCK_R_#_1#2',
        b: 'FL_2#0',
        status: 'rejected',
        why: 'a back pocket piece onto the fly shield',
      },
    ],
  },
};
