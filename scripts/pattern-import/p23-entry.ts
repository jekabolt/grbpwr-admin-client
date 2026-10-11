// PATTERN-IMPORT · P2 + P3 probe (auto/LEAKS-ANALYSIS rows P2, P3).
//   synth  P2: rolesByLayer on a hand-built one-size set (CUT outline, INNER pleat across it, the
//          sew line, a CLO grain arrow, a stray outside, a STRIP border) + its negative controls;
//          P3: seedFaces on three nested size rasters (the click inside the largest only) + its
//          negative controls (two equal decoys, a click outside everything) and mutations.
//   case <id>  the e2e operator pass of one case: the P2 / P3 numbers the checks read.
import type {
  Chain,
  ChainSet,
  LineClass,
  PtMm,
  Seed,
  SetAside,
  Style,
} from 'lib/pattern-import/types';
import { layerLoopAsides, rolesByLayer } from 'lib/pattern-import/chains/layer-role';
import { drawPolyline, exterior, Grid } from 'lib/pattern-import/pieces/raster';
import { seedFaces, type FaceCtx } from 'lib/pattern-import/pieces/seed-face';
import { pointInPoly } from 'lib/pattern-import/pieces/geom';

import { CASES, runCase } from './e2e-entry';

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const ck = (ok: boolean, name: string, detail?: string) => checks.push({ name, ok, detail });

const lenOf = (p: PtMm[], closed: boolean) => {
  const q = closed ? [...p, p[0]] : p;
  let L = 0;
  for (let i = 1; i < q.length; i++) L += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
  return L;
};
const chainOf = (id: number, pts: PtMm[], closed: boolean, style: number): Chain => ({
  id,
  pts,
  closed,
  ranges: [{ path: id, from: 0, to: pts.length - 1 }],
  motif: null,
  style,
  lengthMm: lenOf(pts, closed),
});
const style = (id: number, layer: string | null): Style => ({
  id,
  strokeRgb: [0, 0, 0],
  widthMm: 0,
  dash: null,
  layer,
  fill: false,
  clip: null,
});
const rect = (x0: number, y0: number, x1: number, y1: number): PtMm[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const roleOf = (set: ChainSet, id: number) =>
  set.classes.find((c: LineClass) => c.chains.includes(id))?.role ?? null;

type LayerOpts = Parameters<typeof rolesByLayer>[2];

/** The RC28 situation on a hand-built set: layers cut / inner / strip (+ an optional grain layer). */
function mkSet(
  cut: string,
  inner: string,
  strip: string,
  o: { seam2?: boolean; grainLayer?: string; cutGap?: number } = {},
) {
  const styles = new Map([
    [0, style(0, cut)],
    [1, style(1, inner)],
    [2, style(2, strip)],
    [3, style(3, o.grainLayer ?? inner)],
  ]);
  // piece 0's cut line, closed or open by `cutGap` mm at its top-left corner
  const p0 = o.cutGap
    ? [{ x: 100 + o.cutGap, y: 700 }, ...rect(100, 100, 400, 700).slice(0, 3), { x: 100, y: 700 }]
    : rect(100, 100, 400, 700);
  const chains = [
    chainOf(0, p0, !o.cutGap, 0), // the piece (cut line)
    chainOf(1, rect(500, 100, 700, 300), true, 0), // a second piece
    chainOf(
      2,
      [
        { x: 200, y: 100 },
        { x: 200, y: 700 },
      ],
      false,
      1,
    ), // a pleat, edge to edge
    chainOf(3, rect(110, 110, 390, 690), true, 1), // piece 0's sew line 10 mm inside
    chainOf(
      4,
      [
        { x: 150, y: 200 },
        { x: 150, y: 380 },
        { x: 156, y: 356 },
      ],
      false,
      3,
    ), // CLO arrow
    chainOf(
      5,
      [
        { x: 800, y: 800 },
        { x: 900, y: 900 },
      ],
      false,
      1,
    ), // inner, outside every piece
    chainOf(6, rect(90, 90, 720, 720), true, 2), // the marker strip border
    chainOf(7, rect(500, 100, 700, 300), true, 1), // a copy of the cut line on INNER
    chainOf(8, rect(250, 400, 350, 500), true, 1), // a pocket placement loop inside piece 0
  ];
  if (o.seam2) chains.push(chainOf(9, rect(510, 110, 690, 290), true, 1)); // piece 1's sew line
  // what the face pass made of it (RC28-test-3): the pleat + sew line the outline, CUT a stray
  const set: ChainSet = {
    chains,
    classes: [
      {
        id: 0,
        role: 'common',
        sizeLabel: null,
        chains: [2, 3],
        totalLengthMm: 0,
        evidence: [],
        confidence: 0.5,
      },
      {
        id: 1,
        role: 'internal',
        sizeLabel: null,
        chains: [1, 4, 7, 8, ...(o.seam2 ? [9] : [])],
        totalLengthMm: 0,
        evidence: [],
        confidence: 0.7,
      },
      {
        id: 2,
        role: 'ignore',
        sizeLabel: null,
        chains: [0, 5, 6],
        totalLengthMm: 0,
        evidence: [],
        confidence: 0.4,
      },
    ],
    bundles: [],
    orphans: [],
    ambiguities: [],
    warnings: [],
  };
  return { set, styles };
}

function synthLayers() {
  const run = (set: ChainSet, styles: Map<number, Style>, o?: LayerOpts) =>
    rolesByLayer(set, styles, o);
  // the trusted names, the AAMA numbers with the reader's dialect proof, and the AAMA signature
  const variants: { name: string; cut: string; inner: string; o?: LayerOpts; grain?: string }[] = [
    { name: 'CUT/INNER', cut: 'CUT', inner: 'INNER' },
    { name: '1/8 + AAMA dialect', cut: '1', inner: '8', o: { aama: true } },
    { name: '1/8/7 signature', cut: '1', inner: '8', grain: '7' },
  ];
  for (const v of variants) {
    const { set, styles } = mkSet(v.cut, v.inner, 'STRIP', { seam2: true, grainLayer: v.grain });
    const out = run(set, styles, v.o);
    const r = (id: number) => roleOf(out, id);
    const t = `P2 synth ${v.name}`;
    ck(
      r(0) === 'common' && r(1) === 'common',
      `${t}: the cut-layer outlines are the outline row`,
      `${r(0)} ${r(1)}`,
    );
    ck(r(2) === 'internal', `${t}: the pleat across the piece is internal`, `${r(2)}`);
    ck(
      r(3) === 'seam' && r(9) === 'seam',
      `${t}: the sew line on every piece at one offset is 'seam'`,
      `${r(3)} ${r(9)}`,
    );
    ck(r(4) === 'grain', `${t}: the CLO grain arrow is 'grain'`, `${r(4)}`);
    ck(
      r(5) === 'ignore',
      `${t}: an internal line outside every (closed) piece is set aside`,
      `${r(5)}`,
    );
    ck(r(7) === 'ignore', `${t}: a copy of the cut line is set aside`, `${r(7)}`);
    ck(r(8) === 'internal', `${t}: a pocket loop inside a piece is internal`, `${r(8)}`);
    ck(r(6) === 'ignore', `${t}: the STRIP border (no known meaning) keeps its row`, `${r(6)}`);
    const common = out.classes.filter((c) => c.role === 'common');
    ck(
      common.length === 1 && common[0].evidence.some((e) => e.kind === 'layer'),
      `${t}: one outline row, layer evidence`,
    );
    ck(
      roleOf(run(set, styles, { ...v.o, off: new Set(['all']) }), 0) === 'ignore',
      `${t} mutation off: the cut line stays a stray`,
    );
  }
  // fix 1: bare numbers without proof, and layer 1 inside larger outlines on another number
  {
    const { set, styles } = mkSet('1', '2', '3', { seam2: true });
    ck(
      run(set, styles) === set,
      'P2 negative: layers 1/2 without the AAMA proof (a two-size drawing) → unchanged',
    );
    ck(
      roleOf(run(set, styles, { off: new Set(['provenance', 'enclose']) }), 0) === 'common',
      'P2 mutation provenance off: layer 1 is taken for the cut line',
    );
    const { set: s8, styles: st8 } = mkSet('1', '8', 'STRIP', { seam2: true });
    ck(
      run(s8, st8) === s8,
      'P2 negative: 1/8 without a grain/notch layer or the dialect → unchanged',
    );
  }
  {
    // a Gerber/Lectra file: the seam on 1, the cut on 8 (larger outlines round every layer-1 one)
    const styles = new Map([
      [0, style(0, '1')],
      [1, style(1, '8')],
      [2, style(2, '7')],
    ]);
    const chains = [
      chainOf(0, rect(110, 110, 390, 690), true, 0),
      chainOf(1, rect(510, 110, 690, 290), true, 0),
      chainOf(2, rect(100, 100, 400, 700), true, 1),
      chainOf(3, rect(500, 100, 700, 300), true, 1),
      chainOf(
        4,
        [
          { x: 300, y: 200 },
          { x: 300, y: 600 },
        ],
        false,
        2,
      ),
    ];
    const set: ChainSet = {
      chains,
      classes: [
        {
          id: 0,
          role: 'internal',
          sizeLabel: null,
          chains: [0, 1, 2, 3, 4],
          totalLengthMm: 0,
          evidence: [],
          confidence: 0.5,
        },
      ],
      bundles: [],
      orphans: [],
      ambiguities: [],
      warnings: [],
    };
    ck(
      run(set, styles, { aama: true }) === set,
      'P2 negative: the seam on 1 inside larger outlines on 8 → layer 1 is no cut line, unchanged',
    );
    ck(
      roleOf(run(set, styles, { aama: true, off: new Set(['enclose']) }), 0) === 'common',
      'P2 mutation enclose off: the seam on 1 becomes the outline (the rule holds it)',
    );
  }
  // fix 2: a nearly closed cut outline keeps its pocket; an open one sets nothing aside as outside
  {
    const { set, styles } = mkSet('CUT', 'INNER', 'STRIP', { seam2: true, cutGap: 3 });
    const out = run(set, styles);
    ck(
      roleOf(out, 0) === 'common' && roleOf(out, 8) === 'internal' && roleOf(out, 5) === 'ignore',
      'P2 fix 2: a cut outline 3 mm short of closing is a piece; its pocket stays internal',
      `${roleOf(out, 8)} ${roleOf(out, 5)}`,
    );
    const { set: so, styles: sto } = mkSet('CUT', 'INNER', 'STRIP', { seam2: true, cutGap: 40 });
    const oo = run(so, sto);
    ck(
      roleOf(oo, 5) === 'internal' && roleOf(oo, 8) === 'internal',
      'P2 fix 2: with a cut outline open 40 mm nothing is set aside as "outside"',
      `${roleOf(oo, 5)} ${roleOf(oo, 8)}`,
    );
    ck(
      roleOf(run(so, sto, { off: new Set(['validated']) }), 8) === 'ignore',
      "P2 mutation validated off: the open piece's pocket loop goes to ignore (the guard holds it)",
    );
  }
  // fix 3: one sew-line loop on one piece of two is no file-wide sew line
  {
    const { set, styles } = mkSet('CUT', 'INNER', 'STRIP');
    const out = run(set, styles);
    ck(
      roleOf(out, 3) === 'internal',
      'P2 fix 3: a lone loop at an offset (1 piece of 2) stays internal',
      `${roleOf(out, 3)}`,
    );
    ck(
      roleOf(run(set, styles, { off: new Set(['seam-file']) }), 3) === 'seam',
      'P2 mutation seam-file off: the lone loop becomes the sew line',
    );
  }
  {
    // the sew line drawn twice on a piece (RC28 doubles its INNER lines) is still one loop
    const { set, styles } = mkSet('CUT', 'INNER', 'STRIP', { seam2: true });
    const twice: ChainSet = {
      ...set,
      chains: [...set.chains, chainOf(10, rect(110, 110, 390, 690), true, 1)],
      classes: set.classes.map((c) => (c.id === 1 ? { ...c, chains: [...c.chains, 10] } : c)),
    };
    const out = run(twice, styles);
    ck(
      roleOf(out, 3) === 'seam' && roleOf(out, 10) === 'seam',
      'P2 fix 3: a sew line drawn twice on a piece counts as its one loop',
      `${roleOf(out, 3)} ${roleOf(out, 10)}`,
    );
  }
  // negative controls kept: unknown names, a size row, little line work on known layers
  {
    const { set, styles } = mkSet('Ebene 1', 'Ebene 2', 'Ebene 3');
    ck(run(set, styles) === set, 'P2 negative: layers of no known meaning → unchanged');
  }
  {
    const { set, styles } = mkSet('CUT', 'INNER', 'STRIP');
    const sized: ChainSet = {
      ...set,
      classes: [{ ...set.classes[0], role: 'size', sizeLabel: '44' }, ...set.classes.slice(1)],
    };
    ck(run(sized, styles) === sized, 'P2 negative: a size row → unchanged');
  }
  {
    const { set, styles } = mkSet('CUT', 'Ebene 2', 'Ebene 3');
    ck(
      run(set, styles) === set,
      'P2 negative: < 60 % of the line work on known layers → unchanged',
    );
  }
  // autopilot: a set-aside loop on the internal layer inside a validated cut piece is evidence
  {
    const { set, styles } = mkSet('CUT', 'INNER', 'STRIP', { seam2: true });
    const out = run(set, styles);
    const aside = (id: number, box: [number, number, number, number]): SetAside => ({
      id,
      at: { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 },
      box: { minX: box[0], minY: box[1], maxX: box[2], maxY: box[3] },
      areaMm2: (box[2] - box[0]) * (box[3] - box[1]),
      reason: 'inner-line',
    });
    const asides = [aside(1, [251, 401, 349, 499]), aside(2, [501, 101, 699, 299])];
    const got = layerLoopAsides(out, asides);
    ck(
      !!got[0].layerLoop,
      'P2 autopilot: the pocket loop on INNER inside a cut piece carries the evidence',
      JSON.stringify(got[0]),
    );
    ck(!got[1].layerLoop, 'P2 autopilot: an outline on the cut layer never does');
    const half = layerLoopAsides(out, [
      { ...aside(3, [201, 101, 399, 699]), at: { x: 300, y: 250 } },
    ]);
    ck(
      /part of a cut piece/.test(half[0].layerLoop ?? ''),
      'P2 autopilot: the half of a piece split off by the pleat carries the evidence',
      JSON.stringify(half[0]),
    );
    {
      // a lining drawn on a layer of no known meaning inside the piece stays a question
      const lined: ChainSet = {
        ...set,
        chains: [...set.chains, chainOf(set.chains.length, rect(120, 520, 190, 680), true, 4)],
        classes: set.classes.map((c) =>
          c.id === 1 ? { ...c, chains: [...c.chains, set.chains.length] } : c,
        ),
      };
      const st2 = new Map(styles);
      st2.set(4, style(4, 'LINING'));
      const lo = run(lined, st2);
      const la = [aside(5, [121, 521, 189, 679])];
      ck(
        !layerLoopAsides(lo, la)[0].layerLoop,
        'P2 fix B: an outline bounded by a line on an unknown layer (a lining) stays a question',
        JSON.stringify(layerLoopAsides(lo, la)[0]),
      );
      ck(
        !!layerLoopAsides(lo, la, { off: new Set(['bounds']) })[0].layerLoop,
        'P2 mutation bounds off: the lining is dismissed as part of the piece',
      );
    }
    ck(
      !layerLoopAsides(out, [aside(4, [801, 801, 899, 899])])[0].layerLoop,
      'P2 autopilot negative: an outline outside every cut piece → no evidence',
    );
    ck(
      !layerLoopAsides(out, asides, { off: true })[0].layerLoop,
      'P2 autopilot mutation off: no evidence',
    );
    ck(
      !layerLoopAsides(set, asides)[0].layerLoop,
      'P2 autopilot negative: a set the layers did not prove → no evidence',
    );
    const { set: so, styles: sto } = mkSet('CUT', 'INNER', 'STRIP', { seam2: true, cutGap: 40 });
    ck(
      !layerLoopAsides(run(so, sto), asides)[0].layerLoop,
      'P2 autopilot negative: an open cut outline → no evidence',
    );
  }
}

/** A closed ellipse polygon. */
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 96): PtMm[] =>
  Array.from({ length: n }, (_, i) => ({
    x: cx + rx * Math.cos((2 * Math.PI * i) / n),
    y: cy + ry * Math.sin((2 * Math.PI * i) / n),
  }));
/** A sleeve-like piece of size scale s: a cap on a tapering body, its hem fixed at y = 300. */
const sleeve = (cx: number, s: number, hw = 100): PtMm[] => {
  const top = 300 + 400 * s;
  const cap = Array.from({ length: 40 }, (_, i) => {
    const a = Math.PI * (i / 39);
    return { x: cx + hw * s * Math.cos(a), y: top - 30 * s + 30 * s * Math.sin(a) };
  });
  return [...cap, { x: cx - 0.7 * hw * s, y: 300 }, { x: cx + 0.7 * hw * s, y: 300 }];
};

function synthFaces() {
  const box = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
  const cell = 1;
  const ctxOf = (polys: PtMm[][]): FaceCtx => {
    const g = new Grid(box, cell);
    const wall = new Uint8Array(g.W * g.H);
    for (const p of polys) drawPolyline(g, wall, p, true);
    return { g, wall, ext: exterior(g, wall) };
  };
  const pixel = (c: FaceCtx, p: PtMm) => c.g.iy(p.y) * c.g.W + c.g.ix(p.x);
  const same = (p: PtMm) => p;
  const scales = [0.9, 0.95, 1];
  // three size files on one frame (wm): the sleeve grows from its hem; a front panel beside it
  // an internal mark off the sleeve's axis (a notch line): left / right pieces differ by it
  const mark = (cx: number, s: number, side = -1): PtMm[] => [
    { x: cx + side * 40 * s, y: 400 },
    { x: cx + side * 40 * s, y: 440 },
  ];
  const sl = (cx: number, s: number, side = -1) => [sleeve(cx, s), mark(cx, s, side)];
  const files = scales.map((s) => [...sl(300, s), ellipse(750, 400, 150 * s, 250 * s)]);
  // the click sits 4 mm under the largest cap: inside the largest size only
  const click: Seed = { id: 7, at: { x: 300, y: 696 }, origin: 'click', variant: null };
  const run = (polys: PtMm[][][], o?: Parameters<typeof seedFaces>[5]) =>
    seedFaces(3, [click], (r) => ctxOf(polys[r]), pixel, same, o);
  const res = run(files);
  const in0 = res.at.get('7:0');
  const in1 = res.at.get('7:1');
  ck(
    !!in0 && pointInPoly(in0, sleeve(300, 0.9)) && !!in1 && pointInPoly(in1, sleeve(300, 0.95)),
    'P3 synth: the click outside the smaller sizes is seeded inside their sleeve',
    JSON.stringify(res.diag),
  );
  ck(!res.at.has('7:2'), 'P3 synth: the size the click is inside keeps the click');
  ck(run(files, { off: new Set(['all']) }).at.size === 0, 'P3 synth mutation off: no seed moves');
  // negative: a click in no piece of any size file → nothing to carry
  const nowhere: Seed = { id: 8, at: { x: 520, y: 760 }, origin: 'click', variant: null };
  const t = seedFaces(3, [nowhere], (r) => ctxOf(files[r]), pixel, same);
  ck(t.at.size === 0, 'P3 negative: a click in no piece of any size file moves nowhere');
  // negative: two equally good matches (two strips 13 mm either side of the reference strip)
  // a strip narrower at its top (no top–bottom twin), its mark off the left–right axis
  const strip1 = (cy: number, w: number): PtMm[] => [
    { x: 300 - w / 2, y: cy - 10 },
    { x: 300 + w / 2, y: cy - 10 },
    { x: 300 + w / 2 - 60, y: cy + 10 },
    { x: 300 - w / 2 + 60, y: cy + 10 },
  ];
  const strip = (cy: number, w: number): PtMm[][] => [
    strip1(cy, w),
    [
      { x: 300 - 0.3 * w, y: cy - 4 },
      { x: 300 - 0.3 * w, y: cy + 4 },
    ],
  ];
  const twins = [strip(593, 590), [...strip(593, 590), ...strip(619, 590)], strip(606, 600)];
  const tclick: Seed = { id: 7, at: { x: 300, y: 606 }, origin: 'click', variant: null };
  const trun = (o?: Parameters<typeof seedFaces>[5]) =>
    seedFaces(3, [tclick], (r) => ctxOf(twins[r]), pixel, same, o);
  const a = trun();
  ck(
    a.at.size === 0 && a.diag.some((d) => d.rank === 1 && d.verdict === 'not-unique'),
    "P3 negative: two equally good matches → no move (today's behaviour)",
    JSON.stringify(a.diag),
  );
  ck(
    trun({ off: new Set(['unique']) }).at.has('7:1'),
    'P3 mutation unique off: the ambiguous match moves the seed',
  );
  // negative: another shape of the same area at the place (a disc where the sleeve was)
  const area = (s: number) => {
    const p = sleeve(300, s);
    let A = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      A += (p[j].x + p[i].x) * (p[j].y - p[i].y);
    return Math.abs(A / 2);
  };
  const other = scales.map((s, r) =>
    r === 2
      ? sl(300, s)
      : [ellipse(300, 480, Math.sqrt(area(s) / Math.PI), Math.sqrt(area(s) / Math.PI))],
  );
  const o = run(other);
  ck(
    o.at.size === 0,
    'P3 negative: another shape at the place is no match',
    JSON.stringify(o.diag),
  );
  ck(
    run(other, { off: new Set(['shape', 'hand']) }).at.size > 0,
    'P3 mutation shape off (Hu + overlap): the disc is taken for the sleeve',
  );
  // chirality: the smaller sizes hold only the MIRRORED piece at the place (Hu 1–3 cannot tell)
  const asym = (cx: number, s: number, flip: boolean): PtMm[] => {
    const f = (dx: number) => cx + (flip ? -dx : dx) * s;
    return [
      { x: f(-100), y: 300 },
      { x: f(100), y: 300 },
      { x: f(100), y: 300 + 400 * s },
      { x: f(-70), y: 300 + 400 * s },
    ];
  };
  const hand = scales.map((s, r) => [asym(300, s, r !== 2)]);
  const hclick: Seed = { id: 7, at: { x: 380, y: 696 }, origin: 'click', variant: null };
  const hrun = (o?: Parameters<typeof seedFaces>[5]) =>
    seedFaces(3, [hclick], (r) => ctxOf(hand[r]), pixel, same, o);
  const h = hrun();
  ck(h.at.size === 0, 'P3 fix 4: a mirrored twin is no match (handedness)', JSON.stringify(h.diag));
  ck(
    hrun({ off: new Set(['hand']) }).at.size > 0,
    'P3 mutation hand off: the mirrored twin is taken',
  );
  // absolute bound: the only candidate passes every gate but scores > 0.3 for one size step
  const far = scales.map((s, r) => (r === 2 ? sl(300, 1) : sl(336, 0.923)));
  const fr = run(far);
  ck(
    !fr.at.has('7:1') && fr.diag.some((d) => d.rank === 1 && d.verdict === 'weak'),
    'P3 fix 4: a lone candidate beyond the absolute score bound → no move',
    JSON.stringify(fr.diag),
  );
  ck(
    run(far, { off: new Set(['bound']) }).at.has('7:1'),
    'P3 mutation bound off: the weak match moves the seed',
  );
  // a symmetric silhouette told only by its marks: the smaller sizes hold the right-hand piece
  const mirrorMarks = scales.map((s, r) => sl(300, s, r === 2 ? -1 : 1));
  const mm = run(mirrorMarks);
  ck(
    mm.at.size === 0,
    'P3 fix 5: a symmetric outline whose marks sit mirrored is no match',
    JSON.stringify(mm.diag),
  );
  ck(
    run(mirrorMarks, { off: new Set(['marks']) }).at.size > 0,
    'P3 mutation marks off: the mirrored-marks twin is taken',
  );
  const bare = scales.map((s) => [sleeve(300, s)]);
  ck(
    run(bare).at.size === 0,
    "P3 fix 5: a symmetric outline with no marks to tell → no move (today's behaviour)",
  );
  // reciprocal: the smaller size's strip matches back to ANOTHER strip of the reference size
  const rec = [strip(593, 590), strip(593, 590), [...strip(606, 600), ...strip(580, 590)]];
  const sclick: Seed = { id: 7, at: { x: 300, y: 612 }, origin: 'click', variant: null };
  const rrun = (o?: Parameters<typeof seedFaces>[5]) =>
    seedFaces(3, [sclick], (r) => ctxOf(rec[r]), pixel, same, o);
  const rr = rrun();
  ck(
    !rr.at.has('7:1') && rr.diag.some((d) => d.rank === 1 && d.verdict === 'not-reciprocal'),
    'P3 fix 4: a match whose best match back is another region → no move',
    JSON.stringify(rr.diag),
  );
  ck(
    rrun({ off: new Set(['reciprocal']) }).at.has('7:1'),
    'P3 mutation reciprocal off: the one-way match moves the seed',
  );
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'synth') {
    synthLayers();
    synthFaces();
    console.log(`@@RESULT ${JSON.stringify({ id: 'synthetic', checks })}`);
    return 0;
  }
  if (args[0] === 'case') {
    const c = CASES.find((x) => x.id === args[1]);
    if (!c) throw new Error(`no case ${args[1]}`);
    const rec = (await runCase(c)) as unknown as Record<string, unknown>;
    const pick = (k: string) => rec[k];
    console.log(
      `@@RESULT ${JSON.stringify({
        id: c.id,
        verdict: pick('verdict'),
        legend: pick('legend'),
        auto: pick('auto'),
        withClicks: pick('withClicks'),
        write: (pick('write') as { blocks: number; blocksPassing: number }[] | undefined)?.map(
          (w) => ({ blocks: w.blocks, passing: w.blocksPassing }),
        ),
        truth: pick('truthCheck'),
        wrongPassing: pick('wrongPassing') ?? 0,
        clicks: pick('clicks'),
      })}`,
    );
    return 0;
  }
  return 2;
}
