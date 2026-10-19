// Entry of the union probe (scripts/assembly-skeleton/union-probe.mjs): fixture → PieceGeom →
// unionLayout → unionPicture → the real UnitTile / UnitShape / UnitGlyph markup + print prims.
// Type-checked by the repo tsconfig (scripts/ is included), bundled by esbuild for node.
import { renderToStaticMarkup } from 'react-dom/server';

import { unitPrintSvg } from './union-print-svg';
import { UnitShape } from '../../src/components/managers/tech-card/components/nesting/unit-shape';
import {
  UnitGlyph,
  UnitTile,
} from '../../src/components/managers/tech-card/components/unit-silhouette';
import {
  unionCaption,
  unionPrim,
} from '../../src/components/managers/tech-card/assembly-print/paper';
import { unionLayout, unionPicture } from '../../src/lib/assembly-skeleton/union';
import type {
  ClothState,
  PieceGeom,
  Pt2,
  SeamCandidate,
  UnionLayout,
} from '../../src/lib/assembly-skeleton/types';

export type FixturePiece = {
  pieceKey: string;
  rs: Pt2[];
  notchIdx: number[];
  areaMm2: number;
  perimMm: number;
  hand: 'L' | 'R' | null;
  twinOf: { key: string; kind: 'mirror' | 'identical' }[];
  edges: { k: number; s: number; e: number; lenMm: number }[];
};
export type FixtureUnit = {
  id: string;
  name: string;
  source: string;
  pieces: FixturePiece[];
  seams: string[];
};

export function geomOf(p: FixturePiece, cloth: ClothState | null = 'main'): PieceGeom {
  return {
    pieceKey: p.pieceKey,
    name: p.pieceKey,
    hand: p.hand,
    cloth,
    rs: p.rs,
    corners: [],
    notchIdx: p.notchIdx,
    edges: p.edges.map((e) => ({
      id: `${p.pieceKey}#${e.k}`,
      pieceKey: p.pieceKey,
      k: e.k,
      s: e.s,
      e: e.e,
      pts: [],
      lenMm: e.lenMm,
      chordMm: 0,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    })),
    rect: false,
    areaMm2: p.areaMm2,
    perimMm: p.perimMm,
    twinOf: p.twinOf,
  };
}

const seam = (
  a: string,
  b: string,
  kind: SeamCandidate['kind'] = 'edge',
  twin: 'none' | 'mirror' | 'identical' = 'none',
): SeamCandidate => ({
  a,
  b,
  score: 1,
  evidence: {
    dLenMm: 0,
    relLen: 0,
    notchScore: null,
    curvature: 'flat',
    hand: 'neutral',
    twin,
    self: false,
  },
  kind,
});

export function seamsOf(u: FixtureUnit): SeamCandidate[] {
  const twins = new Map(u.pieces.map((p) => [p.pieceKey, p.twinOf]));
  return u.seams.map((s) => {
    const [a, b] = s.split('~');
    const ka = a.split('#')[0];
    const kb = b.split('#')[0];
    const t = twins.get(ka)?.find((x) => x.key === kb)?.kind ?? 'none';
    return seam(a, b, 'edge', t);
  });
}

const TILE_INNER = { w: 48, h: 38 };

export type UnitRun = {
  id: string;
  name: string;
  layout: UnionLayout;
  placedKeys: string[];
  pieceCount: number;
  wMm: number;
  hMm: number;
  tile: string;
  big: string;
  glyphs: string;
  golden: string;
  print: string;
  printInside: boolean;
  caption: string[];
  ms: number;
};

export function runUnit(u: FixtureUnit): UnitRun {
  const geoms = u.pieces.map((p) => geomOf(p));
  const t0 = performance.now();
  const layout = unionLayout(
    u.pieces.map((p) => p.pieceKey),
    seamsOf(u),
    geoms,
  );
  const ms = performance.now() - t0;
  const pic = unionPicture(layout, geoms);
  const prims = unionPrim(pic, 0, 0, 28, 16, 0.5);
  const printInside = prims.every(
    (p) =>
      p.k === 'poly' &&
      p.pts.every(([x, y]) => x >= -1e-6 && x <= 28 + 1e-6 && y >= -1e-6 && y <= 16 + 1e-6),
  );
  return {
    id: u.id,
    name: u.name,
    layout,
    placedKeys: layout.placements.map((p) => p.pieceKey),
    pieceCount: pic.pieceCount,
    wMm: pic.w,
    hMm: pic.h,
    tile: renderToStaticMarkup(<UnitTile picture={pic} name={u.name} />),
    big: renderToStaticMarkup(<UnitShape picture={pic} hatchW={260} hatchH={260} label={u.name} />),
    glyphs: renderToStaticMarkup(
      <>
        <UnitGlyph picture={pic} name={u.name} />
        <UnitGlyph picture={pic} name={u.name} boxClassName='mr-0 size-4' />
      </>,
    ),
    golden: renderToStaticMarkup(
      <UnitShape picture={pic} hatchW={TILE_INNER.w} hatchH={TILE_INNER.h} label={u.name} />,
    ),
    print: unitPrintSvg(prims, 28, 16),
    printInside,
    caption: unionCaption(pic),
    ms,
  };
}

// ── synthetic cases: the §G rules the five golden units do not exercise ─────────────────────

const rect = (key: string, w: number, h: number, cloth: ClothState = 'main'): PieceGeom => {
  const rs: Pt2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return {
    pieceKey: key,
    name: key,
    hand: null,
    cloth,
    rs,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges: [0, 1, 2, 3].map((k) => ({
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s: k,
      e: (k + 1) % 4,
      pts: [rs[k], rs[(k + 1) % 4]],
      lenMm: k % 2 === 0 ? w : h,
      chordMm: k % 2 === 0 ? w : h,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    })),
    rect: true,
    areaMm2: w * h,
    perimMm: 2 * (w + h),
    twinOf: [],
  };
};

export type Check = { ok: boolean; what: string; detail: string };

export function syntheticChecks(): Check[] {
  const out: Check[] = [];
  const ck = (ok: boolean, what: string, detail = '') => out.push({ ok, what, detail });

  // Plain side seam: B lands on A's right edge, outside A.
  {
    const g = [rect('A', 200, 300), rect('B', 150, 300)];
    const L = unionLayout(['A', 'B'], [seam('A#1', 'B#3')], g);
    ck(
      L.overflow.length === 0 && (L.overlap ?? 1) < 0.01,
      'side seam: both placed, no overlap',
      `overlap ${L.overlap}`,
    );
    ck(L.placements[0].pieceKey === 'A', 'root is the biggest piece', L.placements[0].pieceKey);
  }
  // Two pieces fighting for one edge: the second would sit on the first → overflow.
  {
    const g = [rect('A', 300, 300), rect('B', 150, 300), rect('C', 140, 300)];
    const L = unionLayout(['A', 'B', 'C'], [seam('A#1', 'B#3'), seam('A#1', 'C#3')], g);
    ck(
      L.overflow.includes('C'),
      'second piece on the same edge goes to overflow',
      L.overflow.join(),
    );
    ck((L.overlap ?? 1) <= 0.15, 'drawn overlap within overlapMax', `${L.overlap}`);
  }
  // Composite join: hung, pulled off the edge, «~» mark resolved.
  {
    const g = [rect('BODY', 400, 500), rect('SLV', 200, 450)];
    const L = unionLayout(['BODY', 'SLV'], [seam('BODY#1', 'SLV#3', 'composite')], g);
    const p = L.placements.find((x) => x.pieceKey === 'SLV');
    const pic = unionPicture(L, g);
    ck(L.hung.includes('SLV') && !!p?.approx, 'composite join is hung and approx', L.hung.join());
    ck(!!pic.shapes.find((s) => s.pieceKey === 'SLV')?.mark, 'hung piece carries a «~» mark');
    ck((L.overlap ?? 1) === 0, 'hung piece does not touch the body', `${L.overlap}`);
  }
  // Identical layers: one shape «×2».
  {
    const a = rect('CLR', 380, 90);
    const b = { ...rect('CLR_1', 380, 90), twinOf: [{ key: 'CLR', kind: 'identical' as const }] };
    a.twinOf = [{ key: 'CLR_1', kind: 'identical' }];
    const L = unionLayout(['CLR', 'CLR_1'], [seam('CLR#2', 'CLR_1#2')], [a, b]);
    const pic = unionPicture(L, [a, b]);
    ck(
      L.stacked.length === 1 && L.stacked[0].length === 2,
      'identical layers are stacked',
      JSON.stringify(L.stacked),
    );
    ck(
      pic.shapes.length === 1 && pic.shapes[0].count === 2 && pic.pieceCount === 2,
      'stacked layers draw as one shape ×2',
      `${pic.shapes.length} shapes`,
    );
  }
  // Surface join: on the host, drawn last; interfacing: underlay, not a shape.
  {
    const g = [
      rect('FRONT', 300, 600),
      rect('POCKET', 120, 140),
      rect('FUSE', 300, 80, 'interfacing'),
    ];
    const L = unionLayout(
      ['FRONT', 'POCKET', 'FUSE'],
      [seam('FRONT#0', 'POCKET#0', 'surface'), seam('FRONT#2', 'FUSE#0')],
      g,
    );
    ck(
      L.surface?.includes('POCKET') === true &&
        L.placements[L.placements.length - 1].pieceKey === 'POCKET',
      'surface piece is on top',
      L.placements.map((p) => p.pieceKey).join(),
    );
    const pb = L.placements.find((p) => p.pieceKey === 'POCKET')!;
    const cx = 60 * pb.T[0] + 70 * pb.T[2] + pb.T[4];
    const cy = 60 * pb.T[1] + 70 * pb.T[3] + pb.T[5];
    ck(
      cx > 0 && cx < 300 && cy > 0 && cy < 600,
      'surface piece lies inside its host',
      `${cx},${cy}`,
    );
    ck(
      L.underlay?.includes('FUSE') === true && !L.placements.some((p) => p.pieceKey === 'FUSE'),
      'interfacing is an underlay, not a shape',
    );
  }
  // Closure is never a join; unconnected L/R stand beside.
  {
    const g = [rect('FP_L', 250, 600), rect('FP_R', 250, 600)];
    const L = unionLayout(['FP_L', 'FP_R'], [seam('FP_L#1', 'FP_R#3', 'closure-not-seam')], g);
    const r = L.placements.find((p) => p.pieceKey === 'FP_R')!;
    ck(
      L.placements.length === 2 && r.T[4] > 250 && (L.overlap ?? 1) === 0,
      'closure does not join; the other half stands beside',
      `dx ${r.T[4]}`,
    );
  }
  return out;
}

/** The §G cases as pictures, for the contact sheet: hung «~», surface on top, lining, overflow «+n». */
export function syntheticSheet(): { name: string; tile: string; big: string }[] {
  const draw = (name: string, keys: string[], seams: SeamCandidate[], g: PieceGeom[]) => {
    const pic = unionPicture(unionLayout(keys, seams, g), g);
    return {
      name,
      tile: renderToStaticMarkup(<UnitTile picture={pic} name={name} />),
      big: renderToStaticMarkup(<UnitShape picture={pic} hatchW={260} hatchH={260} label={name} />),
    };
  };
  return [
    draw(
      'body + sleeve',
      ['BODY', 'SLV'],
      [seam('BODY#1', 'SLV#3', 'composite')],
      [rect('BODY', 400, 500), rect('SLV', 200, 450, 'contrast')],
    ),
    draw(
      'front + pocket',
      ['FRONT', 'POCKET', 'FUSE'],
      [seam('FRONT#0', 'POCKET#0', 'surface')],
      [
        rect('FRONT', 300, 600),
        rect('POCKET', 120, 140, 'pocketing'),
        rect('FUSE', 300, 80, 'interfacing'),
      ],
    ),
    draw(
      'shell + lining',
      ['SHELL', 'LIN', 'X'],
      [seam('SHELL#1', 'LIN#3'), seam('SHELL#1', 'X#3')],
      [rect('SHELL', 300, 500), rect('LIN', 280, 480, 'lining'), rect('X', 200, 300)],
    ),
  ];
}
