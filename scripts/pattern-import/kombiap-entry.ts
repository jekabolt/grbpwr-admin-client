// PATTERN-IMPORT · KOMBI-AP diagnostic: the exact 28 weak set-asides over the Style A sheet.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { weakAsides } from 'components/managers/tech-card/components/pattern-import/auto-advance';
import type { BoxMm, ChainSet, PtMm, SetAside, Sheet, StageIO } from 'lib/pattern-import/types';
import type { FaceMap } from 'lib/pattern-import/pieces/faces';
import type { Session } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { renderPng, type Label, type Stroke } from './sizes-render';

const OUT = process.env.KOMBIAP_OUT!;
const COLOR: Record<string, string> = {
  'family-shell': '#d62728',
  'grade-strip': '#ff7f00',
  'variant-band': '#984ea3',
  'document-panel': '#e7298a',
};

type Captured = {
  sheet: Sheet;
  set: ChainSet;
  map: FaceMap;
  pieces: StageIO['pieces']['out'];
};

/** Raster face boundary as short vector segments, using the same labelled cells as SetAside.id. */
function boundary(map: FaceMap, aside: SetAside): PtMm[][] {
  const grids = map.subs?.length ? map.subs : [{ g: map.g, blobAt: map.blobAt }];
  const lines: PtMm[][] = [];
  for (const { g, blobAt } of grids) {
    const x0 = Math.max(0, g.ix(aside.box.minX) - 3);
    const x1 = Math.min(g.W - 1, g.ix(aside.box.maxX) + 3);
    const y0 = Math.max(0, g.iy(aside.box.maxY) - 3);
    const y1 = Math.min(g.H - 1, g.iy(aside.box.minY) + 3);
    const same = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < g.W && y < g.H && blobAt[y * g.W + x] === aside.id;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!same(x, y)) continue;
        if (!same(x, y - 1)) lines.push([g.corner(x, y), g.corner(x + 1, y)]);
        if (!same(x + 1, y)) lines.push([g.corner(x + 1, y), g.corner(x + 1, y + 1)]);
        if (!same(x, y + 1)) lines.push([g.corner(x + 1, y + 1), g.corner(x, y + 1)]);
        if (!same(x - 1, y)) lines.push([g.corner(x, y + 1), g.corner(x, y)]);
      }
  }
  return lines;
}

const grow = (b: BoxMm, mm: number): BoxMm => ({
  minX: b.minX - mm,
  minY: b.minY - mm,
  maxX: b.maxX + mm,
  maxY: b.maxY + mm,
});

function variantStrokes(pieces: StageIO['pieces']['out']): Stroke[] {
  return (pieces.variantMarks ?? []).flatMap((m) =>
    m.cutLines.map((l) => ({
      pts: l.poly,
      color: m.label === 'Style A' ? '#2ca02c' : '#1f5fbf',
      width: 1.8,
      dash: m.label === 'Style A' ? undefined : '7 4',
    })),
  );
}

export async function main(): Promise<boolean> {
  mkdirSync(OUT, { recursive: true });
  const c = CASES.find((x) => x.id === 'kombinezon-A');
  if (!c) throw new Error('kombinezon-A case is missing');
  let got: Captured | null = null;
  await runCase(c, {
    onAutoPieces: (session: Session, pieces) => {
      const s = session as unknown as {
        sheet: Sheet;
        wallSet: ChainSet | null;
        chains: ChainSet;
        faces: { map: FaceMap } | null;
      };
      if (!s.faces?.map) throw new Error('pieces face map is missing');
      got = { sheet: s.sheet, set: s.wallSet ?? s.chains, map: s.faces.map, pieces };
      throw new Error('__KOMBIAP_CAPTURED__');
    },
  });
  if (!got) throw new Error('kombinezon-A did not reach automatic pieces');
  const { sheet, set, map, pieces } = got as Captured;
  const weak = weakAsides(pieces.setAside, pieces.families, pieces.seeds);
  const hostArea = (a: SetAside) =>
    Math.max(
      0,
      ...pieces.families.flatMap((f) =>
        f.candidates
          .filter(
            (c) =>
              c.outcome === 'closed' &&
              c.bbox.minX <= a.box.maxX + 1 &&
              c.bbox.maxX >= a.box.minX - 1 &&
              c.bbox.minY <= a.box.maxY + 1 &&
              c.bbox.maxY >= a.box.minY - 1,
          )
          .map((c) => c.areaMm2),
      ),
    );
  // The four the current policy already proves: two other-pen marks and two joined strips <= 5%
  // of their host. The remaining set is exactly the stop's "28 ... on a guess".
  const unresolved = weak.filter(
    (a) =>
      a.reason !== 'other-pen' &&
      !(a.reason === 'joined' && hostArea(a) > 0 && a.areaMm2 <= 0.05 * hostArea(a)) &&
      !a.layerLoop &&
      !a.dart,
  );
  const seedLabels = new Map(pieces.seeds.map((s) => [s.id, s.text?.text ?? `seed ${s.id}`]));
  const evidence = new Map((pieces.asideEvidence ?? []).map((e) => [e.id, e]));
  const records = unresolved.map((a) => ({
    ...a,
    decision: evidence.get(a.id) ?? null,
    face: map.blobs.find((b) => b.id === a.id),
    children: map.blobs
      .filter((b) => b.inside === a.id)
      .map((b) => ({
        id: b.id,
        areaMm2: b.areaMm2,
        at: b.at,
        box: b.box,
        texts: b.texts,
        junk: b.junk,
      })),
    texts: sheet.texts
      .filter((t) => {
        const p = t.anchor;
        return p.x >= a.box.minX && p.x <= a.box.maxX && p.y >= a.box.minY && p.y <= a.box.maxY;
      })
      .map((t) => t.text),
    boundary: boundary(map, a),
  }));
  writeFileSync(
    resolve(OUT, 'kombinezon-A-asides.json'),
    JSON.stringify(
      {
        asides: records.map(({ boundary: line, ...a }) => ({
          ...a,
          boundarySegments: line.length,
        })),
        families: pieces.families.map((f) => ({
          seed: f.seed,
          label: seedLabels.get(f.seed),
          candidates: f.candidates.map((c) => ({
            rank: c.rank,
            outcome: c.outcome,
            areaMm2: c.areaMm2,
            bbox: c.bbox,
            outer: c.outer,
          })),
        })),
        variantMarks: pieces.variantMarks,
      },
      null,
      1,
    ),
  );
  if (process.env.KOMBIAP_JSON_ONLY) {
    console.log(`KOMBI-AP: captured ${unresolved.length} unresolved outlines → ${OUT}`);
    const counts = unresolved.reduce<Record<string, number>>((n, a) => {
      const kind = evidence.get(a.id)?.kind ?? 'unresolved';
      n[kind] = (n[kind] ?? 0) + 1;
      return n;
    }, {});
    console.log(`classifications: ${JSON.stringify(counts)}`);
    return unresolved.length !== 28 || Object.hasOwn(counts, 'unresolved');
  }
  const base: Stroke[] = set.chains.map((c) => ({ pts: c.pts, color: '#d8d8d8', width: 0.55 }));
  const variants = variantStrokes(pieces);
  const hot: Stroke[] = records.flatMap(({ boundary: lines, decision }) =>
    lines.map((pts) => ({ pts, color: COLOR[decision?.kind ?? ''] ?? '#d62728', width: 2.4 })),
  );
  const labels: Label[] = records.map(({ id, at, reason, areaMm2, decision }) => ({
    at,
    text: `${id} ${decision?.kind ?? reason} ${Math.round(areaMm2 / 100)}cm2`,
    color: '#111',
    size: 11,
  }));
  renderPng(
    resolve(OUT, 'kombinezon-A-asides-sheet.png'),
    sheet.bbox,
    [...base, ...variants, ...hot],
    labels,
    1.5,
    [
      { color: '#d62728', text: 'family shell: already-seeded graded piece' },
      { color: '#ff7f00', text: 'grade strip: N-1 ladder between N sizes' },
      { color: '#984ea3', text: 'variant band: between two models cut lines' },
      { color: '#e7298a', text: 'document panel / nested illustration' },
      { color: '#2ca02c', text: 'Style A cut marks' },
      { color: '#1f5fbf', text: 'Style B cut marks (dashed)' },
    ],
  );
  for (const a of records) {
    const kind = a.decision?.kind ?? a.reason;
    const box = grow(
      a.box,
      Math.max(25, 0.08 * Math.max(a.box.maxX - a.box.minX, a.box.maxY - a.box.minY)),
    );
    const one = a.boundary.map((pts) => ({
      pts,
      color: COLOR[kind] ?? '#d62728',
      width: 3,
    }));
    renderPng(
      resolve(OUT, `kombinezon-A-aside-${a.id}.png`),
      box,
      [...base, ...variants, ...one],
      [
        {
          at: a.at,
          text: `${a.id} ${kind} ${Math.round(a.areaMm2 / 100)}cm2`,
          color: '#111',
          size: 14,
        },
      ],
      3,
      [
        { color: COLOR[kind] ?? '#d62728', text: `outline ${a.id}: ${kind}` },
        { color: '#2ca02c', text: 'Style A cut marks' },
        { color: '#1f5fbf', text: 'Style B cut marks (dashed)' },
      ],
    );
  }
  console.log(`KOMBI-AP: rendered ${unresolved.length} unresolved outlines → ${OUT}`);
  const counts = unresolved.reduce<Record<string, number>>((n, a) => {
    const kind = evidence.get(a.id)?.kind ?? 'unresolved';
    n[kind] = (n[kind] ?? 0) + 1;
    return n;
  }, {});
  console.log(`classifications: ${JSON.stringify(counts)}`);
  const expected = { 'family-shell': 5, 'grade-strip': 14, 'variant-band': 3, 'document-panel': 6 };
  return (
    unresolved.length !== 28 ||
    Object.entries(expected).some(([kind, n]) => counts[kind] !== n) ||
    Object.keys(counts).some((kind) => !(kind in expected))
  );
}
