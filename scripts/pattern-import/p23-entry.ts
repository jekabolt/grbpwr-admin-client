// PATTERN-IMPORT · P2 + P3 probe (auto/LEAKS-ANALYSIS rows P2, P3).
//   synth  P2: rolesByLayer on a hand-built one-size set (CUT outline, INNER pleat across it, the
//          sew line, a CLO grain arrow, a stray outside, a STRIP border) + its negative controls;
//          P3: seedFaces on three nested size rasters (the click inside the largest only) + its
//          negative controls (two equal decoys, a click outside everything) and mutations.
//   case <id>  the e2e operator pass of one case: the P2 / P3 numbers the checks read.
import type { Chain, ChainSet, LineClass, PtMm, Seed, Style } from 'lib/pattern-import/types';
import { rolesByLayer } from 'lib/pattern-import/chains/layer-role';
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

function synthLayers() {
  // layers: CUT, INNER, STRIP (as RC28) — or AAMA numbers 1 / 8
  const mk = (cut: string, inner: string, strip: string) => {
    const styles = new Map([
      [0, style(0, cut)],
      [1, style(1, inner)],
      [2, style(2, strip)],
    ]);
    const chains = [
      chainOf(0, rect(100, 100, 400, 700), true, 0), // the piece (cut line)
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
      chainOf(3, rect(110, 110, 390, 690), true, 1), // the sew line 10 mm inside
      chainOf(
        4,
        [
          { x: 300, y: 300 },
          { x: 300, y: 480 },
          { x: 306, y: 456 },
        ],
        false,
        1,
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
    ];
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
          chains: [1, 4, 7],
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
  };
  for (const [cut, inner] of [
    ['CUT', 'INNER'],
    ['1', '8'],
  ]) {
    const { set, styles } = mk(cut, inner, 'STRIP');
    const out = rolesByLayer(set, styles);
    const r = (id: number) => roleOf(out, id);
    ck(
      r(0) === 'common' && r(1) === 'common',
      `P2 synth ${cut}/${inner}: the cut-layer outlines are the outline row`,
      `${r(0)} ${r(1)}`,
    );
    ck(
      r(2) === 'internal',
      `P2 synth ${cut}/${inner}: the pleat across the piece is internal`,
      `${r(2)}`,
    );
    ck(r(3) === 'seam', `P2 synth ${cut}/${inner}: the sew line 10 mm inside is 'seam'`, `${r(3)}`);
    ck(r(4) === 'grain', `P2 synth ${cut}/${inner}: the CLO grain arrow is 'grain'`, `${r(4)}`);
    ck(
      r(5) === 'ignore',
      `P2 synth ${cut}/${inner}: an internal line outside every piece is set aside`,
      `${r(5)}`,
    );
    ck(
      r(7) === 'ignore',
      `P2 synth ${cut}/${inner}: a copy of the cut line is set aside`,
      `${r(7)}`,
    );
    ck(
      r(6) === 'ignore',
      `P2 synth ${cut}/${inner}: the STRIP border (no known meaning) keeps its row`,
      `${r(6)}`,
    );
    const common = out.classes.filter((c) => c.role === 'common');
    ck(
      common.length === 1 && common[0].evidence.some((e) => e.kind === 'layer'),
      `P2 synth ${cut}/${inner}: one outline row, layer evidence`,
    );
    // mutation: the pass off → the face pass's roles stay (the cut line a stray)
    const m = rolesByLayer(set, styles, { off: new Set(['all']) });
    ck(
      roleOf(m, 0) === 'ignore',
      `P2 synth ${cut}/${inner} mutation off: the cut line stays a stray`,
    );
    const ms = rolesByLayer(set, styles, { off: new Set(['split']) });
    ck(
      roleOf(ms, 3) === 'internal' && roleOf(ms, 5) === 'internal',
      `P2 synth ${cut}/${inner} mutation split off: sew line + outside line fall back to internal`,
    );
  }
  // negative controls: unknown layer names, a size row, most of the lines on unknown layers
  {
    const { set, styles } = mk('Ebene 1', 'Ebene 2', 'Ebene 3');
    ck(rolesByLayer(set, styles) === set, 'P2 negative: layers of no known meaning → unchanged');
  }
  {
    const { set, styles } = mk('CUT', 'INNER', 'STRIP');
    const sized: ChainSet = {
      ...set,
      classes: [{ ...set.classes[0], role: 'size', sizeLabel: '44' }, ...set.classes.slice(1)],
    };
    ck(rolesByLayer(sized, styles) === sized, 'P2 negative: a size row → unchanged');
  }
  {
    const { set, styles } = mk('CUT', 'Ebene 2', 'Ebene 3');
    ck(
      rolesByLayer(set, styles) === set,
      'P2 negative: < 60 % of the line work on known layers → unchanged',
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
  const files = scales.map((s) => [sleeve(300, s), ellipse(750, 400, 150 * s, 250 * s)]);
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
  // negative: two equally good matches (two narrow sleeves 44 mm apart in the smallest file)
  const narrow = scales.map((s, r) =>
    r === 0 ? [sleeve(278, s, 18), sleeve(322, s, 18)] : [sleeve(300, s, 18)],
  );
  const a = run(narrow);
  ck(
    !a.at.has('7:0') &&
      a.diag.some((d) => d.rank === 0 && d.verdict === 'not-unique') &&
      a.at.has('7:1'),
    "P3 negative: two equally good matches → no move (today's behaviour); the unique one moves",
    JSON.stringify(a.diag),
  );
  ck(
    run(narrow, { off: new Set(['unique']) }).at.has('7:0'),
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
      ? [sleeve(300, s)]
      : [ellipse(300, 480, Math.sqrt(area(s) / Math.PI), Math.sqrt(area(s) / Math.PI))],
  );
  const o = run(other);
  ck(
    o.at.size === 0,
    'P3 negative: another shape at the place is no match',
    JSON.stringify(o.diag),
  );
  ck(
    run(other, { off: new Set(['shape']) }).at.size > 0,
    'P3 mutation shape off: the disc is taken for the sleeve',
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
