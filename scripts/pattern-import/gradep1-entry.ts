// PATTERN-IMPORT · GRADE P1 probe — one piece, one shape across sizes (owner 16.10, card 49).
//   units: crafted pieces through pieces/gfit/notch-grade + semantics/grade-shape — a notch drawn in
//          ≥ 2 sizes is placed in the sizes lacking it (graded, at the grade-consistent place), a
//          notch in ONE size of ≥ 3 is asked (all / none / only — each answer applied), a track whose
//          places do not grade is left alone, count differences are asked with every size's places
//          and "intended" is taken only by its exact key; mutations: a stale key, a moved notch.
//   cases: e2e cases through the real pipeline — per graded piece the written notch / drill /
//          internal counts per size, graded notches, the questions asked; GRADEP1_PNG=<dir> renders
//          one overlay per piece (every size's cut line, drawn notches red, graded notches magenta)
//          and a contact sheet per case (ImageMagick).
//   node scripts/pattern-import/gradep1.mjs [units] [card49|<case>…]   (default: units card49)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  GradeAsk,
  NotchFeature,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  StageIO,
} from 'lib/pattern-import/types';
import { gradeNotches, loneKey } from 'lib/pattern-import/pieces/gfit/notch-grade';
import { chordAcross, notchBumpSeries } from 'lib/pattern-import/pieces/gfit/notch-bumps';
import { analyseOutline, bumpSpans } from 'lib/pattern-import/pieces/gfit/outline';
import { closestOnPolyline } from 'lib/pattern-import/semantics/geom';
import { gradeShape } from 'lib/pattern-import/semantics/grade-shape';
import type { Session } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { MOOD_DIR, SAMPLE } from './mood-entry';
import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

// ── units ─────────────────────────────────────────────────────────────────────────────────────
let fails = 0;
const ok = (name: string, cond: boolean, info = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`);
};

/** A graded trouser-ish piece: 6 corners (one off-axis), size r grows 6 mm per rank each way. */
function ring(r: number): PtMm[] {
  const g = 6 * r;
  const pts: PtMm[] = [
    { x: 0 - g, y: 0 },
    { x: 300 + g, y: 0 },
    { x: 320 + g, y: 200 + g },
    { x: 260 + g, y: 520 + 2 * g },
    { x: 40 - g, y: 520 + 2 * g },
    { x: -30 - g, y: 260 + g },
  ];
  // densify (the real lines are polylines)
  const out: PtMm[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}
/** A point on the bottom edge (y = 0) at share u of it, for size r. */
const bottomAt = (r: number, u: number): PtMm => {
  const g = 6 * r;
  return { x: -g + (300 + 2 * g) * u, y: 0 };
};
/** On the long right edge (320,200)→(260,520) at share u. */
const rightAt = (r: number, u: number): PtMm => {
  const g = 6 * r;
  const a = { x: 320 + g, y: 200 + g };
  const b = { x: 260 + g, y: 520 + 2 * g };
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
};
const notch = (at: PtMm): NotchFeature => ({
  kind: 'notch',
  origin: 'detected',
  ranges: [],
  confidence: 1,
  at,
  seg: [at, { x: at.x, y: at.y + 5 }],
  depthMm: 5,
});
const sizeSpec = (
  r: number,
  notches: NotchFeature[],
  extra: Partial<PieceSizeSpec> = {},
): PieceSizeSpec => {
  const cut = ring(r);
  return {
    rank: r,
    sizeToken: ['XS', 'S', 'M', 'L', 'XL', '2XL'][r],
    sizeId: r + 1,
    cut,
    seam: null,
    grain: null,
    notches,
    drills: [],
    internal: [],
    fold: null,
    offset: null,
    walls: [],
    bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    areaMm2: 1,
    ...extra,
  };
};

function units() {
  const R = [0, 1, 2, 3, 4];
  // u1: a notch drawn in M, L, XL at the same share of the bottom edge → placed in XS, S
  {
    const sizes = R.map((r) => sizeSpec(r, r >= 2 ? [notch(bottomAt(r, 0.3))] : []));
    const g = gradeShape(7, sizes, 'cut');
    const xs = g.sizes[0].notches;
    const exp = bottomAt(0, 0.3);
    ok(
      'u1 notch in 3 of 5 sizes → placed in XS and S, graded',
      g.sizes.every((s) => s.notches.length === 1) &&
        !!xs[0]?.graded &&
        Math.hypot(xs[0].at.x - exp.x, xs[0].at.y - exp.y) < 1.5 &&
        !g.sizes[3].notches[0].graded,
      xs[0]
        ? `XS at ${xs[0].at.x.toFixed(1)},${xs[0].at.y.toFixed(1)} (expected ${exp.x.toFixed(1)})`
        : 'none',
    );
    ok(
      'u1 nothing asked after the transfer',
      g.asks.length === 0,
      JSON.stringify(g.asks.map((a) => a.kind)),
    );
    ok(
      'u1 tip points inward (y > 0 on the bottom edge)',
      !!xs[0] && xs[0].seg[1].y > xs[0].seg[0].y + 3,
    );
  }
  // u2: graded position (the notch slides 8 mm per size along the edge) → interpolated / extrapolated
  {
    const pos = (r: number) => ({ x: bottomAt(r, 0).x + 60 + 8 * r, y: 0 });
    const sizes = R.map((r) => sizeSpec(r, r === 1 || r === 3 || r === 4 ? [notch(pos(r))] : []));
    const g = gradeShape(7, sizes, 'cut');
    const got = [0, 2].map((k) => g.sizes[k].notches[0]?.at);
    const err = [0, 2].map((k, i) =>
      got[i] ? Math.hypot(got[i]!.x - pos(k).x, got[i]!.y - pos(k).y) : Infinity,
    );
    ok(
      'u2 graded slide → XS (extrapolated) and M (interpolated) on the line',
      err.every((e) => e < 1.5),
      err.map((e) => e.toFixed(2)).join(', '),
    );
  }
  // u3: a notch in ONE size of 5 → asked; no transfer; each answer applied
  {
    const sizes = R.map((r) => sizeSpec(r, r === 2 ? [notch(rightAt(r, 0.5))] : []));
    const g = gradeShape(7, sizes, 'cut');
    const lone = g.asks.find((a) => a.kind === 'notch-lone');
    ok(
      'u3 lone notch asked, nothing placed',
      !!lone && g.sizes.every((s, k) => s.notches.length === (k === 2 ? 1 : 0)),
    );
    ok(
      'u3 the count question is asked too',
      g.asks.some((a) => a.kind === 'counts' && a.feature === 'notches'),
    );
    if (lone) {
      const all = gradeShape(7, sizes, 'cut', { [lone.key]: 'all' });
      ok(
        'u3 answer all → every size has it',
        all.sizes.every((s) => s.notches.length === 1) &&
          all.sizes[0].notches[0].graded?.answered === true,
      );
      const none = gradeShape(7, sizes, 'cut', { [lone.key]: 'none' });
      ok(
        'u3 answer none → no size has it',
        none.sizes.every((s) => s.notches.length === 0),
      );
      const only = gradeShape(7, sizes, 'cut', { [lone.key]: 'only' });
      ok(
        'u3 answer only → as drawn, recorded as answered',
        only.sizes[2].notches.length === 1 &&
          only.sizes[0].notches.length === 0 &&
          only.asks.some((a) => a.kind === 'notch-lone' && a.answer === 'only'),
      );
      // mutation: a stale key (another place) does nothing
      const stale = gradeShape(7, sizes, 'cut', { [loneKey(7, 'M', 3, 0.25)]: 'all' });
      ok('u3 mutation: a stale key does nothing', stale.sizes[0].notches.length === 0);
      // mutation: the notch moved (another question) — the old answer does nothing
      const moved = R.map((r) => sizeSpec(r, r === 2 ? [notch(rightAt(r, 0.8))] : []));
      const mv = gradeShape(7, moved, 'cut', { [lone.key]: 'all' });
      ok(
        'u3 mutation: the notch moved → the old answer does nothing',
        mv.sizes[0].notches.length === 0,
      );
    }
  }
  // u4: a track whose places do not grade (zig-zag) → nothing transferred, counts asked
  {
    const zig = [0, 0.2, 0.42, 0.18, 0.4];
    const sizes = R.map((r) => sizeSpec(r, r === 0 ? [] : [notch(bottomAt(r, zig[r]))]));
    const g = gradeShape(7, sizes, 'cut');
    ok(
      'u4 places that do not grade → not transferred',
      g.sizes[0].notches.length === 0,
      g.notes.join(' | '),
    );
    ok(
      'u4 asked as a count difference',
      g.asks.some((a) => a.kind === 'counts' && a.feature === 'notches'),
    );
  }
  // u5: two notches near each other on one edge (a double notch) in 3 sizes, missing in 2 → both
  {
    const sizes = R.map((r) =>
      sizeSpec(r, r >= 2 ? [notch(rightAt(r, 0.5)), notch(rightAt(r, 0.53))] : []),
    );
    const g = gradeShape(7, sizes, 'cut');
    ok(
      'u5 double notch → both placed in XS, S',
      g.sizes.every((s) => s.notches.length === 2),
      g.sizes.map((s) => s.notches.length).join(','),
    );
  }
  // u6: drill / internal counts differ → explicit question, "intended" only by its key
  {
    const drill = (at: PtMm) => ({
      kind: 'drill' as const,
      origin: 'detected' as const,
      ranges: [],
      confidence: 1,
      at,
    });
    const sizes = R.map((r) =>
      sizeSpec(r, [], {
        drills: Array.from({ length: r < 3 ? 5 : 7 }, (_, i) => drill({ x: 50 + 10 * i, y: 100 })),
      }),
    );
    const g = gradeShape(7, sizes, 'cut');
    const a = g.asks.find(
      (x): x is Extract<GradeAsk, { kind: 'counts' }> =>
        x.kind === 'counts' && x.feature === 'drills',
    );
    ok(
      'u6 drills 5 vs 7 asked with places',
      !!a &&
        a.perSize.every((p) => p.at.length === p.n) &&
        /in sizes XS, S, M 5 drill holes, in sizes L, XL 7 — intended\?/.test(a.question),
      a?.question,
    );
    ok('u6 not intended without an answer', g.intended.length === 0);
    if (a) {
      const y = gradeShape(7, sizes, 'cut', { [a.key]: 'intended' });
      ok(
        'u6 answer intended → recorded',
        y.intended.includes('drills') &&
          y.asks.some((x) => x.kind === 'counts' && x.answer === 'intended'),
      );
      const sizes2 = sizes.map((s, k) => (k === 4 ? { ...s, drills: s.drills.slice(0, 6) } : s));
      const z = gradeShape(7, sizes2, 'cut', { [a.key]: 'intended' });
      ok('u6 mutation: the counts changed → the answer no longer applies', z.intended.length === 0);
    }
  }
  // u7: equal counts → nothing done, nothing asked
  {
    const sizes = R.map((r) => sizeSpec(r, [notch(bottomAt(r, 0.5))]));
    const g = gradeShape(7, sizes, 'cut');
    ok(
      'u7 one notch in every size → untouched, no question',
      g.asks.length === 0 && g.sizes.every((s) => !s.notches[0].graded),
    );
  }
  // u8: no common topology (one size is a different piece) → nothing moves
  {
    const sizes = R.map((r) => sizeSpec(r, r >= 2 ? [notch(bottomAt(r, 0.3))] : []));
    const sq: PtMm[] = [];
    for (let i = 0; i < 40; i++) sq.push({ x: 100 + i * 5, y: 0 });
    for (let i = 0; i < 40; i++) sq.push({ x: 300, y: i * 5 });
    for (let i = 0; i < 40; i++) sq.push({ x: 300 - i * 5, y: 200 });
    for (let i = 0; i < 40; i++) sq.push({ x: 100, y: 200 - i * 5 });
    sizes[0] = { ...sizes[0], cut: sq };
    const g = gradeShape(7, sizes, 'cut');
    // the gate's turn structure reads the square and the piece alike (4 strong corners each); the
    // sheet-frame evidence keeps the notch off the size that is another shape
    ok(
      'u8 one size is another shape → nothing placed on it (sheet-frame evidence), S still gets it',
      g.sizes[0].notches.length === 0 && g.sizes[1].notches.length === 1,
      g.sizes.map((x) => x.notches.length).join(','),
    );
  }
  // u9: extrapolation that leaves the edge (the notch would pass the grade point) → not placed
  {
    const pos = (r: number) => ({ x: bottomAt(r, 0).x + 4 + 30 * (r - 2), y: 0 });
    const sizes = R.map((r) => sizeSpec(r, r >= 2 ? [notch(pos(r))] : []));
    const g = gradeShape(7, sizes, 'cut');
    ok(
      'u9 extrapolated past the edge end → not placed',
      g.sizes[0].notches.length === 0 && g.sizes[1].notches.length === 0,
      g.sizes.map((s) => s.notches.length).join(','),
    );
  }
  // u10: the raw gradeNotches result on u1 — one consistent track, ranks 2–4
  {
    const g = gradeNotches(
      R.map((r) => ({
        rank: r,
        token: `${r}`,
        ring: ring(r),
        notches: r >= 2 ? [{ at: bottomAt(r, 0.3), depthMm: 5 }] : [],
      })),
      1,
    );
    ok(
      'u10 one consistent track of 3 sizes',
      g.ok && g.tracks.length === 1 && g.tracks[0].consistent && g.add.length === 2,
      JSON.stringify(g.tracks),
    );
  }
  // u11: a semicircle notch drawn AS the outline (bottom edge, R 4 mm, inward) in 3 sizes at a
  // graded place → each size's line crosses by the chord, a notch at the chord; a bump in ONE size
  // only stays as drawn
  {
    const withDip = (r: number, u: number): PtMm[] => {
      const base = ring(r);
      const c = bottomAt(r, u);
      const out: PtMm[] = [];
      for (const q of base) {
        if (q.y === 0 && Math.abs(q.x - c.x) < 4) continue;
        out.push(q);
        if (q.y === 0 && q.x < c.x - 4 && q.x + 5 >= c.x - 4) {
          for (let a = 0; a <= 16; a++) {
            const th = Math.PI - (Math.PI * a) / 16;
            out.push({ x: c.x + 4 * Math.cos(th), y: 4 * Math.sin(th) });
          }
        }
      }
      return out;
    };
    const lines = R.map((r) => ({
      rank: r,
      token: `${r}`,
      outer: withDip(r, 0.4),
    }));
    const ser = notchBumpSeries(lines);
    ok(
      'u11 dip in every size → a notch series in all 5',
      R.every((k) => ser.get(k)?.length === 1),
      JSON.stringify([...ser].map(([k, v]) => [k, v.length])),
    );
    const some = R.map((r) => ({
      rank: r,
      token: `${r}`,
      outer: r >= 2 ? withDip(r, 0.4) : ring(r),
    }));
    ok(
      'u11 dip in 3 of 5 sizes → not crossed (not proven in every size)',
      notchBumpSeries(some).size === 0,
    );
    const b = ser.get(2)?.[0];
    if (b) {
      const ch = chordAcross(lines[2].outer, [b]);
      const maxDev = Math.max(
        ...ch.filter((q) => Math.abs(q.x - b.at.x) < 4 && q.y < 50).map((q) => Math.abs(q.y)),
      );
      ok('u11 the chord runs along the edge (no dip left)', maxDev < 0.3, maxDev.toFixed(2));
      ok('u11 notch inward (+y)', b.inward.y > 0.9);
    }
    const lone = R.map((r) => ({
      rank: r,
      token: `${r}`,
      outer: r === 3 ? withDip(r, 0.4) : ring(r),
    }));
    ok('u11 a dip in ONE size → not a notch (stays as drawn)', notchBumpSeries(lone).size === 0);
  }
  // u12 (Codex r1): "in every size" reaches every size, however far from the drawn one
  {
    const sizes = R.map((r) => sizeSpec(r, r === 0 ? [notch(rightAt(r, 0.5))] : []));
    const lone = gradeShape(7, sizes, 'cut').asks.find((a) => a.kind === 'notch-lone');
    const all = lone ? gradeShape(7, sizes, 'cut', { [lone.key]: 'all' }) : null;
    ok(
      'u12 answer all from XS → XL (4 ranks away) has it too',
      !!all && all.sizes.every((x) => x.notches.length === 1),
    );
  }
  // u13 (Codex r1): equal counts at places that do not grade (S:A, M:A, L:B) → nothing placed
  {
    const sizes = R.map((r) => sizeSpec(r, [notch(bottomAt(r, r < 3 ? 0.2 : 0.7))]));
    const g = gradeShape(7, sizes, 'cut');
    ok(
      'u13 equal counts, places apart → nothing placed, said in the notes',
      g.sizes.every((x) => x.notches.length === 1) && g.notes.some((n) => /do not grade/.test(n)),
      g.notes.join(' | '),
    );
  }
  // u14 (Codex r1): a changed outline (same counts) asks again — the old answer does nothing
  {
    const drill = (at: PtMm) => ({
      kind: 'drill' as const,
      origin: 'detected' as const,
      ranges: [],
      confidence: 1,
      at,
    });
    const mk = (area: number) =>
      R.map((r) =>
        sizeSpec(r, [], {
          areaMm2: area + r,
          cut: ring(r).map((q) => ({ x: q.x + area / 100, y: q.y })),
          drills: Array.from({ length: r < 3 ? 5 : 7 }, (_, i) =>
            drill({ x: 50 + 10 * i, y: 100 }),
          ),
        }),
      );
    const a = gradeShape(7, mk(1000), 'cut').asks.find((x) => x.kind === 'counts');
    const z = a ? gradeShape(7, mk(5000), 'cut', { [a.key]: 'intended' }) : null;
    ok(
      'u14 answer bound to the outline: another outline → not intended',
      !!z && z.intended.length === 0,
    );
  }
  return fails;
}

// ── cases ─────────────────────────────────────────────────────────────────────────────────────
type Row = {
  identity: string;
  sizes: string[];
  /** notch-like in/out excursions left in each size's cut line (gfit excursionsOf) */
  bumps: number[];
  notches: number[];
  graded: number[];
  drills: number[];
  internal: number[];
  passing: boolean;
  /** the block-severity checks that hold it */
  held: string[];
};

function overlay(dir: string, p: PieceSpec, tag: string): string {
  const strokes: Stroke[] = [];
  const labels: Label[] = [];
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const z of p.sizes)
    for (const q of z.cut) {
      box.minX = Math.min(box.minX, q.x);
      box.minY = Math.min(box.minY, q.y);
      box.maxX = Math.max(box.maxX, q.x);
      box.maxY = Math.max(box.maxY, q.y);
    }
  const pad = 12;
  box.minX -= pad;
  box.minY -= pad;
  box.maxX += pad;
  box.maxY += pad + 20;
  p.sizes.forEach((z, i) => {
    const col = PALETTE[(i + 1) % PALETTE.length];
    strokes.push({ pts: z.cut, closed: true, color: col, width: 1.2 });
    for (const f of z.internal)
      strokes.push({ pts: f.pts, closed: f.closed, color: col, width: 0.6, dash: '4 3' });
  });
  // notches on top: drawn red, graded magenta (thick, with a ring)
  for (const z of p.sizes)
    for (const n of z.notches) {
      const g = !!n.graded;
      const d = Math.max(n.depthMm, 6);
      const ux =
        (n.seg[1].x - n.seg[0].x) /
        (Math.hypot(n.seg[1].x - n.seg[0].x, n.seg[1].y - n.seg[0].y) || 1);
      const uy =
        (n.seg[1].y - n.seg[0].y) /
        (Math.hypot(n.seg[1].x - n.seg[0].x, n.seg[1].y - n.seg[0].y) || 1);
      strokes.push({
        pts: [n.at, { x: n.at.x + ux * d, y: n.at.y + uy * d }],
        color: g ? '#d0d' : '#d00',
        width: g ? 3 : 2,
      });
      if (g)
        labels.push({ at: { x: n.at.x + 2, y: n.at.y + 2 }, text: '◦', color: '#d0d', size: 14 });
    }
  for (const z of p.sizes)
    for (const d of z.drills) labels.push({ at: d.at, text: '+', color: '#000', size: 12 });
  const counts = p.sizes
    .map(
      (z) =>
        `${z.sizeToken}:${z.notches.length}${z.notches.some((n) => n.graded) ? `(${z.notches.filter((n) => n.graded).length}g)` : ''}/${z.drills.length}/${z.internal.length}`,
    )
    .join(' ');
  labels.push({
    at: { x: box.minX + 2, y: box.maxY - 6 },
    text: `${tag} ${p.identity}`,
    color: '#000',
    size: 16,
  });
  labels.push({
    at: { x: box.minX + 2, y: box.maxY - 16 },
    text: `n/d/i ${counts}`,
    color: '#333',
    size: 11,
  });
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const f = resolve(dir, `${p.identity}.png`);
  renderPng(
    f,
    box,
    strokes,
    labels,
    700 / span,
    p.sizes.map((z, i) => ({ color: PALETTE[(i + 1) % PALETTE.length], text: z.sizeToken })),
  );
  return f;
}

function analyse(s: Session, out: StageIO['write']['out'], id: string, png: string | null) {
  const S = s as unknown as { semantics: { pieces: PieceSpec[]; gradeAsks?: GradeAsk[] } | null };
  const specs = S.semantics?.pieces ?? [];
  const bad = new Set<string>();
  const heldBy = new Map<string, Set<string>>();
  const written = new Set<string>();
  const graded = new Map<string, number>();
  for (const sc of out.scopes) {
    const g = out.gate[sc.target.scopeKey];
    for (const b of sc.manifest.blocks) {
      written.add(b.identity);
      if (b.notchesGraded) graded.set(b.block, b.notchesGraded);
    }
    for (const k of g?.checks ?? []) {
      if (k.ok || k.severity !== 'block') continue;
      const all = !k.blocks.length || k.blocks.includes('*');
      for (const b of sc.manifest.blocks)
        if (all || k.blocks.some((x) => b.block === x || b.block.startsWith(`${x}_`))) {
          bad.add(b.identity);
          heldBy.set(
            b.identity,
            (heldBy.get(b.identity) ?? new Set()).add(`${k.id}${all ? '*' : ''}`),
          );
          if (process.env.GRADEP1_NOTES && new RegExp(process.env.GRADEP1_NOTES).test(b.identity))
            console.log(`  NOTE ${b.block} ${k.id}: ${String(k.note).slice(0, 400)}`);
        }
    }
  }
  const rows: Row[] = [];
  const pngs: string[] = [];
  const dir = png ? resolve(png, id.replace(/[^\w.-]+/g, '_')) : null;
  if (dir) mkdirSync(dir, { recursive: true });
  for (const p of specs) {
    if (p.ungraded || p.sizes.length < 2) continue;
    rows.push({
      identity: p.identity,
      sizes: p.sizes.map((z) => z.sizeToken),
      bumps: p.sizes.map((z) => analyseOutline(z.cut)?.excursions.length ?? -1),
      notches: p.sizes.map((z) => z.notches.length),
      graded: p.sizes.map((z) => z.notches.filter((n) => n.graded).length),
      drills: p.sizes.map((z) => z.drills.length),
      internal: p.sizes.map((z) => z.internal.length),
      passing: written.has(p.identity) && !bad.has(p.identity),
      held: [...(heldBy.get(p.identity) ?? [])],
    });
    if (dir) pngs.push(overlay(dir, p, id));
    if (process.env.GRADEP1_DUMP && new RegExp(process.env.GRADEP1_DUMP).test(p.identity))
      for (const z of p.sizes) {
        const ln = z.seam ?? z.cut;
        const o = analyseOutline(ln);
        const ex =
          o?.excursions.map(
            (e) =>
              `exc ${e.p.x.toFixed(1)},${e.p.y.toFixed(1)} d${e.depth.toFixed(1)} m${e.mouth.toFixed(1)}`,
          ) ?? [];
        const bs = o
          ? bumpSpans(o.raw).map(([a, b]) => {
              const r = o.raw;
              const n = r.length;
              const P = r[a % n];
              const Q = r[b % n];
              return `bump ${r[((a + b) >> 1) % n].x.toFixed(1)},${r[((a + b) >> 1) % n].y.toFixed(1)} m${Math.hypot(P.x - Q.x, P.y - Q.y).toFixed(1)} path${((b - a) * 0.5).toFixed(1)}`;
            })
          : [];
        console.log(
          `  DUMP ${p.identity} ${z.sizeToken} line ${z.seam ? 'seam' : 'cut'}: ${[...ex, ...bs].join(' | ') || '-'}`,
        );
      }
    if (process.env.GRADEP1_DUMP && new RegExp(process.env.GRADEP1_DUMP).test(p.identity))
      for (const z of p.sizes)
        for (const n of z.notches) {
          const dc = closestOnPolyline(n.at, z.cut, true).d;
          const ds = z.seam ? closestOnPolyline(n.at, z.seam, true).d : -1;
          console.log(
            `  DUMP ${p.identity} ${z.sizeToken} at ${n.at.x.toFixed(1)},${n.at.y.toFixed(1)} tip ${n.seg[1].x.toFixed(1)},${n.seg[1].y.toFixed(1)} depth ${n.depthMm.toFixed(1)} cut ${dc.toFixed(1)} seam ${ds.toFixed(1)}${n.graded ? ` GRADED from ${n.graded.from.join(',')}` : ''}`,
          );
        }
  }
  if (dir && pngs.length) {
    try {
      const tiles = pngs.map((f) => {
        const t = f.replace(/\.png$/, '.tile.png');
        execFileSync('magick', [
          f,
          '-resize',
          '520x520',
          '-background',
          'white',
          '-gravity',
          'center',
          '-extent',
          '540x540',
          t,
        ]);
        return t;
      });
      const rowsOf: string[] = [];
      for (let i = 0; i < tiles.length; i += 4) {
        const r = resolve(dir, `row${i / 4}.png`);
        execFileSync('magick', [...tiles.slice(i, i + 4), '+append', r]);
        rowsOf.push(r);
      }
      execFileSync('magick', [
        ...rowsOf,
        '-background',
        'white',
        '-gravity',
        'west',
        '-append',
        resolve(dir, 'contact.png'),
      ]);
    } catch (e) {
      console.error(`contact sheet: ${String(e).slice(0, 200)}`);
    }
  }
  return { rows, asks: S.semantics?.gradeAsks ?? [], gradedBlocks: Object.fromEntries(graded) };
}

async function oneCase(id: string, png: string | null) {
  let c = CASES.find((x) => x.id === id);
  if (id === 'card49') {
    const a = CASES.find((x) => x.id === 'kombinezon-A');
    if (a)
      c = {
        ...a,
        id,
        card: ['XS', 'S', 'M', 'L', 'XL'],
        mapTo: ['', 'XS', 'S', 'M', 'L', 'XL'],
      } as typeof a;
  }
  if (!c && id.startsWith('mood:')) {
    const sm = SAMPLE.find((x) => `mood:${x.id}` === id);
    if (sm)
      c = {
        id,
        group: 'pdf',
        files: [resolve(MOOD_DIR, sm.path)],
        card: sm.key,
      } as unknown as typeof c;
  }
  if (!c) return { id, error: 'no case' };
  let res: ReturnType<typeof analyse> | null = null;
  let err: string | undefined;
  const rec = await runCase(c, {
    onWrite: (s, out) => {
      try {
        res = analyse(s, out, id, png);
      } catch (e) {
        err = String((e as Error)?.stack ?? e).slice(0, 400);
      }
    },
  });
  return {
    id,
    verdict: rec.verdict,
    reason: String(rec.reason ?? '').slice(0, 200),
    ...(res ?? {}),
    ...(err ? { error: err } : {}),
  };
}

export async function main(args: string[]): Promise<number> {
  const ids = args.length ? args : ['units', 'card49'];
  const png = process.env.GRADEP1_PNG ?? null;
  for (const id of ids) {
    if (id === 'units') {
      units();
      console.log(`units: ${fails} failed`);
      continue;
    }
    const r = await oneCase(id, png);
    console.log(`@@CASE ${JSON.stringify(r)}`);
    const rr = r as { rows?: Row[]; asks?: GradeAsk[]; verdict?: string };
    console.log(`${id}: ${rr.verdict}`);
    for (const x of rr.rows ?? [])
      console.log(
        `  ${x.identity.padEnd(8)}${x.bumps.some(Boolean) ? ` BUMPS ${x.bumps.join(' ')} ·` : ''} notches ${x.notches.join(' ')}${x.graded.some(Boolean) ? ` (graded ${x.graded.join(' ')})` : ''} · drills ${x.drills.join(' ')} · internal ${x.internal.join(' ')}${x.passing ? '' : ` · HELD ${x.held.join(',')}`}`,
      );
    for (const a of rr.asks ?? [])
      console.log(
        `  ASK ${a.kind} ${a.identity}: ${a.question}${a.answer ? ` [${a.answer}]` : ''}`,
      );
  }
  if (process.env.GRADEP1_JSON) writeFileSync(process.env.GRADEP1_JSON, JSON.stringify({ fails }));
  return fails ? 1 : 0;
}
