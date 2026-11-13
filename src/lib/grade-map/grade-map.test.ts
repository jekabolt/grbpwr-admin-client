import { describe, expect, it } from 'vitest';
import type { PtMm } from 'lib/pattern-import/types';
import { bindPiece, carryArc, liveOf, meshSourceOf, nodesOf, bindNodes } from './bind';
import { buildFileMap, buildPieceMap } from './build';
import { triangulate } from './cdt';
import { dist, pathOf, pointAt, project, signedArea } from './geom';
import { buildMesh, forward, inverse, samplesInside } from './mesh';
import { decodeGradeMap, encodeGradeMap } from './serialize';
import type { GmLine, GmPieceInput, GmSizeGeometry } from './types';

// A synthetic front panel: five corners, a curved armhole between C and D, two notches on the cut,
// an open dart-like internal line, a grain line and a drill.
const P = (x: number, y: number): PtMm => ({ x, y });

function armhole(): PtMm[] {
  const out: PtMm[] = [];
  const c = P(330, 250);
  const k = P(300, 330);
  const d = P(150, 330);
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    out.push(
      P(
        (1 - t) ** 2 * c.x + 2 * (1 - t) * t * k.x + t * t * d.x,
        (1 - t) ** 2 * c.y + 2 * (1 - t) * t * k.y + t * t * d.y,
      ),
    );
  }
  return out;
}

const CUT: PtMm[] = [
  P(0, 0),
  P(150, 0),
  P(300, 0),
  P(330, 250),
  ...armhole(),
  P(150, 330),
  P(0, 280),
  P(0, 140),
];

function circle(c: PtMm, r: number, n = 12): PtMm[] {
  return Array.from({ length: n }, (_, i) =>
    P(c.x + r * Math.cos((2 * Math.PI * i) / n), c.y + r * Math.sin((2 * Math.PI * i) / n)),
  );
}

const LINES: GmLine[] = [
  { layer: '4', closed: false, points: [P(150, 0), P(150, 5)] },
  { layer: '4', closed: false, points: [P(0, 140), P(5, 140)] },
  { layer: '8', closed: false, points: [P(100, 100), P(130, 200), P(160, 100)] },
  { layer: '7', closed: false, points: [P(220, 50), P(220, 250)] },
  { layer: '13', closed: true, points: circle(P(100, 260), 3) },
];

type Affine = (p: PtMm) => PtMm;
const grades: Record<number, Affine> = {
  2: (p) => P(1.06 * p.x + 5, 1.04 * p.y - 3),
  3: (p) => P(0.95 * p.x, 0.97 * p.y + 2),
};

function sizeGeo(id: number, f: Affine = (p) => p, rotate = 0): GmSizeGeometry {
  const cut = CUT.map(f);
  return {
    sizeId: id,
    cut: [...cut.slice(rotate), ...cut.slice(0, rotate)],
    lines: LINES.map((l) => ({ ...l, points: l.points.map(f) })),
  };
}

function pieceOf(rotate = 0, baseRotate = 0): GmPieceInput {
  return {
    key: 'front',
    baseSizeId: 1,
    sizes: [
      sizeGeo(1, undefined, baseRotate),
      sizeGeo(2, grades[2], rotate),
      sizeGeo(3, grades[3], rotate),
    ],
  };
}

const ORDER = [1, 2, 3];

function bound(input: GmPieceInput) {
  const { piece } = buildPieceMap(input, ORDER);
  const lives = new Map(input.sizes.map((g) => [g.sizeId, liveOf(g)]));
  const base = lives.get(1)!;
  const binding = bindPiece(piece, base, lives);
  return { piece, lives, base, binding };
}

describe('grade map builder', () => {
  it('carries every track of a shift / scale graded piece, exactly', () => {
    const { piece } = buildPieceMap(pieceOf(), ORDER);
    const kinds = piece.tracks.map((t) => t.kind).sort();
    expect(kinds).toEqual(['cut', 'drill', 'internal', 'internal', 'notch', 'notch']);
    for (const t of piece.tracks) {
      expect(t.trust).toBe('derived');
      expect(t.sizes.every((s) => s.delta)).toBe(true);
      expect(t.residualMm).toBeLessThanOrEqual(0.05);
    }
  });

  it('transfers base cut points by node fractions within 0.05 mm (+ 0.01 mm rounding)', () => {
    const { piece, lives, base, binding } = bound(pieceOf());
    const ci = piece.tracks.findIndex((t) => t.kind === 'cut');
    const bb = binding.tracks[ci].base;
    expect(bb.ok && 'line' in bb).toBe(true);
    if (!bb.ok || !('line' in bb)) return;
    for (const z of [2, 3]) {
      const sb = binding.tracks[ci].sizes.get(z)!;
      expect(sb.ok && 'line' in sb).toBe(true);
      if (!sb.ok || !('line' in sb)) return;
      let worst = 0;
      for (const v of base.cut!.pts) {
        const s = project(bb.line.path, v).s;
        const q = pointAt(sb.line.path, carryArc(bb.line, sb.line, s));
        worst = Math.max(worst, dist(q, grades[z](v)));
      }
      expect(worst).toBeLessThanOrEqual(0.061);
      expect(lives.get(z)).toBeDefined();
    }
  });

  it('refuses a round piece and an undetermined (symmetric) corner match instead of guessing', () => {
    const round = (id: number, r: number): GmSizeGeometry => ({
      sizeId: id,
      cut: circle(P(0, 0), r, 64),
      lines: [],
    });
    const r = buildPieceMap(
      { key: 'round', baseSizeId: 1, sizes: [round(1, 50), round(2, 53)] },
      [1, 2],
    );
    expect(r.piece.tracks[0].trust).toBe('refused');
    expect(r.piece.tracks[0].reason).toMatch(/^round/);
    // a square against the same square turned 45°: two corner shifts fit equally well
    const sq: PtMm[] = [P(50, -50), P(50, 50), P(-50, 50), P(-50, -50)];
    const diamond: PtMm[] = [P(70.7, 0), P(0, 70.7), P(-70.7, 0), P(0, -70.7)];
    const s = buildPieceMap(
      {
        key: 'sym',
        baseSizeId: 1,
        sizes: [
          { sizeId: 1, cut: sq, lines: [] },
          { sizeId: 2, cut: diamond, lines: [] },
        ],
      },
      [1, 2],
    );
    expect(s.piece.tracks[0].trust).toBe('refused');
    expect(s.piece.tracks[0].reason).toMatch(/^symmetric/);
  });

  it('refuses one notch track in one size alone; an extra notch is left unclaimed, not refused', () => {
    const input = pieceOf();
    // size 3: the hem notch is gone and an extra notch sits on the side seam
    const z3 = input.sizes[2];
    z3.lines = [
      ...z3.lines.slice(1),
      { layer: '4', closed: false, points: [grades[3](P(0, 60)), grades[3](P(5, 60))] },
    ];
    const { piece, unclaimed } = buildPieceMap(input, ORDER);
    const notches = piece.tracks.filter((t) => t.kind === 'notch');
    const refused = notches.flatMap((t) => t.sizes.filter((s) => s.refused).map((s) => s.sizeId));
    expect(refused).toEqual([3]);
    expect(notches.every((t) => t.trust === 'derived')).toBe(true);
    const cut = piece.tracks.find((t) => t.kind === 'cut')!;
    expect(cut.sizes.every((s) => s.delta)).toBe(true);
    expect(unclaimed[3]).toBe(1);
    expect(unclaimed[2]).toBe(0);
  });

  it('gives the same map when the size rings start at another vertex', () => {
    const a = encodeGradeMap(buildFileMap([pieceOf(0)], ORDER, 1).file).json;
    const b = encodeGradeMap(buildFileMap([pieceOf(7)], ORDER, 1).file).json;
    expect(b).toBe(a);
  });

  it('gives the same cut nodes, cyclically, when the base ring starts at another vertex', () => {
    const cutOf = (r: number) =>
      buildPieceMap(pieceOf(0, r), ORDER).piece.tracks.find((t) => t.kind === 'cut')!;
    const a = cutOf(0);
    const b = cutOf(11);
    expect(b.base.length).toBe(a.base.length);
    const key = (t: typeof a) =>
      t.base
        .map(([x, y], j) => `${x},${y}:${t.sizes.map((s) => s.delta![j].join(',')).join('|')}`)
        .sort();
    expect(key(b)).toEqual(key(a));
  });
});

describe('grade map binding', () => {
  it('binds by position to live geometry with another start vertex and resampled lines', () => {
    const { piece } = buildPieceMap(pieceOf(), ORDER);
    const resample = (g: GmSizeGeometry, rotate: number): GmSizeGeometry => ({
      ...g,
      cut: [...g.cut.slice(rotate), ...g.cut.slice(0, rotate)],
      lines: g.lines.map((l) => {
        if (l.layer === '4' || l.closed) return l;
        const path = pathOf(l.points, false)!;
        return {
          ...l,
          points: Array.from({ length: 4000 }, (_, i) => pointAt(path, (path.total * i) / 3999)),
        };
      }),
    });
    const lives = new Map(
      pieceOf().sizes.map((g, k) => [g.sizeId, liveOf(resample(g, 3 + k * 5))]),
    );
    const binding = bindPiece(piece, lives.get(1)!, lives);
    for (const t of binding.tracks) {
      expect(t.base.ok).toBe(true);
      for (const b of t.sizes.values()) expect(b.ok).toBe(true);
    }
  });

  it('does not bind nodes that sit off the line', () => {
    const { piece } = buildPieceMap(pieceOf(), ORDER);
    const t = piece.tracks.find((x) => x.kind === 'internal')!;
    const live = liveOf(sizeGeo(1));
    const off = nodesOf(t, null)!.map((p) => P(p.x + 0.3, p.y));
    expect(bindNodes(t, off, live).ok).toBe(false);
    expect(bindNodes(t, nodesOf(t, null)!, live).ok).toBe(true);
  });
});

describe('grade map mesh', () => {
  it('triangulates a concave ring with interior points and constraints', () => {
    const ring = [P(0, 0), P(100, 0), P(100, 100), P(50, 40), P(0, 100)];
    const t = triangulate(ring, [P(30, 20), P(70, 20)], [[5, 6]]);
    expect(t.failed).toBeNull();
    expect(t.skippedPoints).toBe(0);
    expect(t.skippedSegments).toBe(0);
    let area = 0;
    for (const [a, b, c] of t.tris) {
      const A = signedArea([t.pts[a], t.pts[b], t.pts[c]]);
      expect(A).toBeGreaterThan(0);
      area += A;
    }
    expect(area).toBeCloseTo(signedArea(ring), 6);
    const has = t.tris.some((tr) => tr.includes(5) && tr.includes(6));
    expect(has).toBe(true);
  });

  it('maps inside points like the affine grade, and back within 0.5 mm after 0.1 mm rounding', () => {
    const { piece, base, binding } = bound(pieceOf());
    const ms = meshSourceOf(piece, binding, base);
    expect(ms.src).not.toBeNull();
    expect(ms.notInMesh).toEqual([]);
    const mesh = buildMesh(ms.src!);
    expect(mesh.failed).toBeNull();
    expect(mesh.excluded).toEqual([]);
    const pts = samplesInside(mesh, base.cut!.pts, 200);
    expect(pts.length).toBe(200);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    for (const z of [2, 3]) {
      expect(mesh.sizes.get(z)?.ok).toBe(true);
      let fwd = 0;
      let back = 0;
      for (const p of pts) {
        const q = forward(mesh, z, p)!;
        fwd = Math.max(fwd, dist(q, grades[z](p)));
        const r = inverse(mesh, z, P(r1(q.x), r1(q.y)))!;
        back = Math.max(back, dist(r, p));
      }
      expect(fwd).toBeLessThanOrEqual(0.1);
      expect(back).toBeLessThanOrEqual(0.5);
    }
  });

  it('drops a mark whose triangles flip, and refuses a size pair whose cut folds', () => {
    const ring: PtMm[] = [];
    for (let i = 0; i < 20; i++) ring.push(P(i * 5, 0));
    for (let i = 0; i < 20; i++) ring.push(P(100, i * 5));
    for (let i = 0; i < 20; i++) ring.push(P(100 - i * 5, 100));
    for (let i = 0; i < 20; i++) ring.push(P(0, 100 - i * 5));
    const id = (p: PtMm) => p;
    const src = (ringImg3: (p: PtMm, i: number) => PtMm, drill3: PtMm) => ({
      ring: {
        track: 0,
        kind: 'cut' as const,
        closed: true,
        base: ring,
        images: new Map([
          [2, ring.map(id)],
          [3, ring.map(ringImg3)],
        ]),
      },
      parts: [
        {
          track: 1,
          kind: 'drill' as const,
          closed: false,
          base: [P(50, 50)],
          images: new Map([
            [2, [P(50, 50)]],
            [3, [drill3]],
          ]),
        },
      ],
      notchNodes: [],
      baseCut: ring,
      sizes: [2, 3],
    });
    const m1 = buildMesh(src(id, P(150, 50)));
    expect(m1.excluded).toEqual([1]);
    expect(m1.sizes.get(2)?.ok).toBe(true);
    expect(m1.sizes.get(3)?.ok).toBe(true);
    const m2 = buildMesh(src((p, i) => (i === 30 ? P(-20, 50) : p), P(50, 50)));
    expect(m2.sizes.get(2)?.ok).toBe(true);
    const s3 = m2.sizes.get(3)!;
    expect(s3.ok).toBe(false);
    if (!s3.ok) expect(s3.reason).toMatch(/^flip-/);
  });
});

describe('grade map bytes', () => {
  it('is deterministic and survives decode → encode byte for byte', () => {
    const a = encodeGradeMap(buildFileMap([pieceOf()], ORDER, 1).file);
    const b = encodeGradeMap(buildFileMap([pieceOf()], ORDER, 1).file);
    expect(b.base64).toBe(a.base64);
    const again = encodeGradeMap(decodeGradeMap(a.base64));
    expect(again.base64).toBe(a.base64);
    expect(a.inFileBytes).toBeGreaterThan(a.base64.length);
  });
});
