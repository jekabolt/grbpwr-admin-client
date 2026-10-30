import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from 'node:process';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { legPanels } from 'lib/assembly-skeleton/geometry/legs';
import { along } from 'lib/assembly-skeleton/map/frame';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { pairOverlap, rasterize, resolveEdge } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';

import { garmentAssemblyOfCard, seamRowsOfCard } from '../components/card-seam-graph';
import { boxOf, type Box } from '../components/step-seams/step-picture';
import { StepPictureSvg, type StepPicture } from '../components/step-seams/step-picture-view';
import { card81RealFixture, card81RealFixtureAvailable } from './assembly-card81-real.fixture';
import { card85RealFixture, card85RealFixtureAvailable } from './assembly-card85-real.fixture';
import { card83StoredSeamsFixture } from './assembly-inference.fixture';
import { deriveAssembly, type AssemblyInput } from './derive-assembly';
import {
  editorActionMarks,
  editorOperationPictures,
  editorPictureClusters,
} from './pages/assembly';

type EdgeRange = { edge: string; range: [number, number] };
type AtomicPair = { key: string; a: EdgeRange; b: EdgeRange };
type Metric = { recall: number; precision: number; strictRecall: number; strictPrecision: number };

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const pieceOf = (edge: string) => edge.slice(0, edge.lastIndexOf('#'));

function orderedPair(a: EdgeRange, b: EdgeRange): AtomicPair {
  return pieceOf(a.edge) < pieceOf(b.edge)
    ? { key: pairKey(pieceOf(a.edge), pieceOf(b.edge)), a, b }
    : { key: pairKey(pieceOf(a.edge), pieceOf(b.edge)), a: b, b: a };
}

function hiddenSeams(input: AssemblyInput): AssemblyInput {
  return {
    ...input,
    techCard: {
      ...input.techCard,
      seams: [],
      techCard: input.techCard.techCard
        ? {
            ...input.techCard.techCard,
            operations: (input.techCard.techCard.operations ?? []).map((operation) => ({
              ...operation,
              seamKeys: [],
            })),
          }
        : undefined,
    },
  };
}

function truthPairs(input: AssemblyInput): AtomicPair[] {
  const pairs: AtomicPair[] = [];
  for (const seam of seamRowsOfCard(input.techCard).values())
    for (const a of seam.sideA)
      for (const b of seam.sideB)
        if (a.piece !== b.piece)
          pairs.push(
            orderedPair({ edge: a.edgeHint, range: a.range }, { edge: b.edgeHint, range: b.range }),
          );
  return pairs;
}

function candidatePairs(input: AssemblyInput, candidates: readonly SeamCandidate[]): AtomicPair[] {
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const pairs: AtomicPair[] = [];
  for (const seam of candidates) {
    const side = (which: 'a' | 'b') => {
      const ids = which === 'a' ? seam.aParts ?? [seam.a] : seam.bParts ?? [seam.b];
      return ids.map((edge) => {
        const length = resolveEdge(edge, geoms)?.len ?? 1;
        const mm = ids.length === 1 ? seam.range?.[which] : undefined;
        return {
          edge,
          range: mm
            ? ([mm[0] / length, mm[1] / length] as [number, number])
            : ([0, 1] as [number, number]),
        };
      });
    };
    for (const a of side('a'))
      for (const b of side('b'))
        if (pieceOf(a.edge) !== pieceOf(b.edge)) pairs.push(orderedPair(a, b));
  }
  return pairs;
}

function legacyPairs(input: AssemblyInput): AtomicPair[] {
  const pairs: AtomicPair[] = [];
  const model = deriveAssembly(hiddenSeams(input), undefined, { globalAssembly: false });
  for (const card of model.cards.values())
    for (const seam of card.seams)
      for (const a of seam.a)
        for (const b of seam.b)
          if (a.piece !== b.piece)
            pairs.push(
              orderedPair(
                { edge: a.edgeId ?? `${a.piece}#?`, range: [0, a.share] },
                { edge: b.edgeId ?? `${b.piece}#?`, range: [0, b.share] },
              ),
            );
  return pairs;
}

const overlap = (a: [number, number], b: [number, number]) => {
  const shared = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  return shared / Math.max(Math.min(a[1] - a[0], b[1] - b[0]), 1e-6);
};

const sameEdge = (a: string, b: string) => {
  const aa = new Set(edgeIdsOf(a));
  return edgeIdsOf(b).some((edge) => aa.has(edge));
};

function metrics(expected: AtomicPair[], actual: AtomicPair[]): Metric {
  const truth = new Map<string, AtomicPair[]>();
  const predicted = new Map<string, AtomicPair[]>();
  for (const row of expected) truth.set(row.key, [...(truth.get(row.key) ?? []), row]);
  for (const row of actual) predicted.set(row.key, [...(predicted.get(row.key) ?? []), row]);
  const hit = [...predicted.keys()].filter((key) => truth.has(key)).length;
  const strict = [...predicted].filter(([key, rows]) =>
    rows.some((row) =>
      (truth.get(key) ?? []).some(
        (wanted) =>
          sameEdge(row.a.edge, wanted.a.edge) &&
          sameEdge(row.b.edge, wanted.b.edge) &&
          overlap(row.a.range, wanted.a.range) >= 0.5 &&
          overlap(row.b.range, wanted.b.range) >= 0.5,
      ),
    ),
  ).length;
  return {
    recall: hit / truth.size,
    precision: hit / predicted.size,
    strictRecall: strict / truth.size,
    strictPrecision: strict / predicted.size,
  };
}

const metricFixtures: [string, () => AssemblyInput][] = [['83', card83StoredSeamsFixture]];
if (card85RealFixtureAvailable()) metricFixtures.push(['85', card85RealFixture]);

describe('whole-garment assembly', () => {
  it.each(metricFixtures)(
    'beats per-operation inference on card %s with stored seams hidden',
    (card, fixture) => {
      const input = fixture();
      const hidden = hiddenSeams(input);
      const expected = truthPairs(input);
      const before = metrics(expected, legacyPairs(input));
      const garment = garmentAssemblyOfCard(hidden.techCard, hidden.pieces);
      const actual = candidatePairs(hidden, garment.graph.chosen);
      const after = metrics(expected, actual);

      console.info(`garment assembly ${card}`, { before, after });
      expect(after.recall).toBeGreaterThanOrEqual(0.8);
      expect(after.recall).toBeGreaterThan(before.recall);
      expect(after.precision).toBeGreaterThan(before.precision);
    },
  );
});

describe.skipIf(!card81RealFixtureAvailable())('pants card 81', () => {
  let inputCache: AssemblyInput | undefined;
  let modelCache: ReturnType<typeof deriveAssembly> | undefined;
  let picturesCache: ReturnType<typeof editorOperationPictures> | undefined;
  let garmentCache: ReturnType<typeof garmentAssemblyOfCard> | undefined;
  const input81 = () => (inputCache ??= card81RealFixture());
  const model81 = () => (modelCache ??= deriveAssembly(input81()));
  const pictures81 = () =>
    (picturesCache ??= editorOperationPictures(input81().techCard, model81()));
  const garment81 = () =>
    (garmentCache ??= garmentAssemblyOfCard(input81().techCard, input81().pieces));
  const nameOf = (input: AssemblyInput, edge: string) =>
    input.pieces.get(pieceOf(edge))?.name ?? pieceOf(edge);
  const isPocket = (name: string) => /PCK|POCKET|FLAP/i.test(name);
  const isSidePocket = (name: string) => /^PCK_[LR](?:_1)?$/i.test(name);
  const isLeg = (name: string) => /^(FRONT|Back)_[LR]$/i.test(name);
  const isWaistband = (name: string) => /^WST_[LR](?:_1)?$/i.test(name);
  const worldBox = (input: AssemblyInput, picture: StepPicture, keys: readonly string[]): Box =>
    boxOf(
      keys.flatMap((key) => {
        const transform = picture.layout.T.get(key);
        return transform
          ? input.pieces.get(key)!.geom.rs.map((point) => apply(transform, point))
          : [];
      }),
    );
  const intervalOverlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const drawnKeys = (picture: StepPicture) => {
    const hidden = new Set([
      ...picture.layout.stacked.flatMap((stack) => stack.slice(1)),
      ...picture.layout.pieceLayers.map(([piece]) => piece),
    ]);
    return [...picture.layout.T.keys()].filter((key) => !hidden.has(key));
  };
  const drawnShape = (input: AssemblyInput, picture: StepPicture, key: string) => {
    const transform = picture.layout.T.get(key)!;
    const ring = input.pieces.get(key)!.geom.rs.map((point) => apply(transform, point));
    const stride = Math.max(1, Math.floor(ring.length / 160));
    return {
      bbox: boxOf(ring),
      raster: rasterize(ring, 4),
      sample: ring.filter((_, index) => index % stride === 0),
    };
  };
  const touch = (a: ReturnType<typeof drawnShape>, b: ReturnType<typeof drawnShape>) => {
    const ab = a.bbox;
    const bb = b.bbox;
    const gap = Math.max(ab.x0 - bb.x1, bb.x0 - ab.x1, ab.y0 - bb.y1, bb.y0 - ab.y1, 0);
    if (gap > 8) return false;
    if (pairOverlap(a.raster, b.raster) > 0.001) return true;
    return a.sample.some((p) => b.sample.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 8));
  };

  it('puts all side-pocket openings at the waist end of the outseam', () => {
    const input = input81();
    const garment = garment81();
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const legs = legPanels([...geoms.values()]);
    const pictures = pictures81()!;
    const pairings = garment.pairings.filter((pairing) => {
      const names = [nameOf(input, pairing.seam.a), nameOf(input, pairing.seam.b)];
      return names.some(isSidePocket) && names.some(isLeg);
    });

    expect(pairings).toHaveLength(4);
    expect(pairings.map((pairing) => pairing.operationNumber).sort()).toEqual([290, 310, 420, 490]);
    for (const pairing of pairings) {
      const side = isLeg(nameOf(input, pairing.seam.a)) ? 'a' : 'b';
      const legKey = pieceOf(pairing.seam[side]);
      const leg = legs.get(legKey)!;
      const edge = resolveEdge(pairing.seam[side], geoms)!;
      const range = pairing.seam.range?.[side];
      expect(edge.id, nameOf(input, pairing.seam[side])).toBe(leg.outseam.id);
      expect(range).toBeDefined();

      const picture = pictures.get(pairing.operationNumber!)!;
      const contact = apply(
        picture.layout.T.get(legKey)!,
        along(edge.pts, (range![0] + range![1]) / 2).p,
      );
      const legBox = worldBox(input, picture, [legKey]);
      expect((legBox.y1 - contact[1]) / (legBox.y1 - legBox.y0)).toBeLessThanOrEqual(0.35);
    }
  }, 120_000);

  it('keeps every pocket away from every leg hem', () => {
    const input = input81();
    const garment = garment81();
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const legs = legPanels([...geoms.values()]);
    const hemEdges = new Set(
      [...legs.values()].flatMap((leg) => {
        const ys = leg.piece.rs.map((point) => point[1]);
        const bottom = Math.min(...ys);
        const height = Math.max(...ys) - bottom;
        return leg.piece.edges
          .filter((edge) => {
            const mid = edge.pts[Math.floor(edge.pts.length / 2)];
            return mid && mid[1] <= bottom + 0.15 * height;
          })
          .map((edge) => edge.id);
      }),
    );

    for (const pairing of garment.pairings) {
      const names = [nameOf(input, pairing.seam.a), nameOf(input, pairing.seam.b)];
      if (!names.some(isPocket)) continue;
      for (const edge of [...pairing.a.edges, ...pairing.b.edges])
        expect(hemEdges.has(edge)).toBe(false);
    }
  });

  it('keeps every back-pocket piece in the top quarter of its back leg', () => {
    const input = input81();
    const pictures = pictures81()!;
    for (const operation of [370, 440]) {
      const picture = pictures.get(operation)!;
      const keys = [...picture.layout.T.keys()];
      const legKey = keys.find((key) => /^Back_[LR]$/i.test(input.pieces.get(key)?.name ?? ''))!;
      const pockets = keys.filter((key) => /^PCK_BACK/i.test(input.pieces.get(key)?.name ?? ''));
      const leg = drawnShape(input, picture, legKey);
      const height = leg.bbox.y1 - leg.bbox.y0;
      expect(pockets).toHaveLength(2);
      for (const pocketKey of pockets) {
        const pocket = drawnShape(input, picture, pocketKey);
        expect(touch(leg, pocket), `${operation}: ${input.pieces.get(pocketKey)?.name}`).toBe(true);
        expect((leg.bbox.y1 - pocket.bbox.y0) / height).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('draws every leg waist-up with its crotch curve in the upper third', () => {
    const input = input81();
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const legs = legPanels([...geoms.values()]);
    const pictures = pictures81()!;
    const seen = new Set<string>();

    for (const [operation, picture] of pictures)
      for (const [key, leg] of legs) {
        const transform = picture.layout.T.get(key);
        if (!transform) continue;
        seen.add(key);
        const legBox = boxOf(leg.piece.rs.map((point) => apply(transform, point)));
        const riseBox = boxOf(leg.rise.pts.map((point) => apply(transform, point)));
        expect(
          (legBox.y1 - riseBox.y0) / (legBox.y1 - legBox.y0),
          `${operation}: ${leg.piece.name}`,
        ).toBeLessThanOrEqual(1 / 3);
      }

    expect([...seen].map((key) => input.pieces.get(key)?.name).sort()).toEqual(
      ['Back_L', 'Back_R', 'FRONT_L', 'FRONT_R'].sort(),
    );
  });

  it('draws no loose multi-piece operation', () => {
    const input = input81();
    const pictures = pictures81()!;
    expect(pictures.size).toBeGreaterThan(60);
    for (const [operation, picture] of pictures) {
      const keys = drawnKeys(picture);
      if (keys.length <= 1) continue;
      const shapes = new Map(keys.map((key) => [key, drawnShape(input, picture, key)]));
      for (const key of keys)
        expect(
          keys.some((other) => other !== key && touch(shapes.get(key)!, shapes.get(other)!)),
          `${operation}: ${input.pieces.get(key)?.name}`,
        ).toBe(true);
    }
  });

  it('makes operation 620 the two centre/crotch seams', () => {
    const input = input81();
    const garment = garment81();
    const seams = garment.byOperation.get(620) ?? [];
    const pairs = candidatePairs(input, seams);
    const named = pairs.map(({ a, b }) =>
      [nameOf(input, a.edge), nameOf(input, b.edge)].sort().join('|'),
    );
    expect(named).toContain('FRONT_L|FRONT_R');
    expect(named).toContain('Back_L|Back_R');
    expect(named.some((name) => isPocket(name))).toBe(false);

    const picture = pictures81()?.get(620);
    expect(picture).toBeDefined();
    const shown = new Set([...picture!.layout.T.keys()].map((key) => input.pieces.get(key)?.name));
    for (const name of ['FRONT_L', 'FRONT_R', 'Back_L', 'Back_R'])
      expect(shown.has(name), name).toBe(true);

    expect(editorPictureClusters(picture!)).toHaveLength(1);
    expect(picture!.layout.clusters.filter((cluster) => cluster.length > 0)).toHaveLength(1);
    const halves = picture!.groups.map((group) => worldBox(input, picture!, group.pieces));
    expect(halves).toHaveLength(2);
    const xOverlap = intervalOverlap(halves[0].x0, halves[0].x1, halves[1].x0, halves[1].x1);
    const yOverlap = intervalOverlap(halves[0].y0, halves[0].y1, halves[1].y0, halves[1].y1);
    const minWidth = Math.min(halves[0].x1 - halves[0].x0, halves[1].x1 - halves[1].x0);
    const minHeight = Math.min(halves[0].y1 - halves[0].y0, halves[1].y1 - halves[1].y0);
    expect(xOverlap / minWidth).toBeLessThan(0.1);
    expect(yOverlap / minHeight).toBeGreaterThan(0.7);
  });

  it('lays operation 650 waistband against the combined leg waist', () => {
    const input = input81();
    const picture = pictures81()?.get(650);
    expect(picture).toBeDefined();
    const bands = [...picture!.layout.T.keys()].filter((key) =>
      isWaistband(input.pieces.get(key)?.name ?? ''),
    );
    const legs = [...picture!.layout.T.keys()].filter((key) =>
      isLeg(input.pieces.get(key)?.name ?? ''),
    );
    const bandBox = worldBox(input, picture!, bands);
    const legBox = worldBox(input, picture!, legs);
    const legHeight = legBox.y1 - legBox.y0;
    expect(bands).toHaveLength(4);
    expect(bandBox.y1).toBeGreaterThan(legBox.y1);
    expect((legBox.y1 - bandBox.y0) / legHeight).toBeLessThanOrEqual(0.05);
    const visibleBands = bands.filter((band) => drawnKeys(picture!).includes(band));
    expect(visibleBands).toHaveLength(2);
    for (const band of visibleBands) {
      const bandShape = drawnShape(input, picture!, band);
      expect(
        legs.some((leg) => touch(bandShape, drawnShape(input, picture!, leg))),
        input.pieces.get(band)?.name,
      ).toBe(true);
    }
  }, 120_000);

  it('uses outlines and background only in operation SVGs', () => {
    const input = input81();
    const model = model81();
    const pictures = pictures81()!;
    for (const row of model.rows) {
      const picture = pictures.get(row.n);
      if (!picture) continue;
      const action = editorActionMarks(row.action, picture.geoms);
      const svg = renderToStaticMarkup(
        <StepPictureSvg
          w={212}
          h={186}
          pad={4}
          look='print'
          layout={picture.layout}
          geoms={picture.geoms}
          innerLines={picture.innerLines}
          actionLines={action.lines}
          actionGlyphs={action.glyphs}
        />,
      );
      const fills = [...svg.matchAll(/\sfill="([^"]+)"/g)].map((match) => match[1]);
      expect(
        fills.every((fill) => fill === 'none' || fill === 'var(--color-bgColor)'),
        `${row.n}: ${fills.join(', ')}`,
      ).toBe(true);
    }
  });

  it.skipIf(env.DUMP !== '1')('dumps every operation picture', () => {
    const input = input81();
    const model = model81();
    const pictures = pictures81() ?? new Map();
    const picturesHtml = model.rows
      .flatMap((row) => {
        const picture = pictures.get(row.n);
        if (!picture) return [];
        const action = editorActionMarks(row.action, picture.geoms);
        return [
          `<article data-op='${row.n}'><b>${row.n}</b>${renderToStaticMarkup(
            <StepPictureSvg
              w={212}
              h={186}
              pad={4}
              look='print'
              layout={picture.layout}
              geoms={picture.geoms}
              innerLines={picture.innerLines}
              actionLines={action.lines}
              actionGlyphs={action.glyphs}
            />,
          )}</article>`,
        ];
      })
      .join('');
    const path = resolve(env.DUMP_DIR ?? 'tmp-dump', '81-assemble.html');
    const hex = String.fromCharCode(35);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `<!doctype html><meta charset="utf-8"><style>:root{--color-textColor:${hex}000;--color-labelColor:${hex}777;--color-bgColor:${hex}fff}body{display:grid;grid-template-columns:repeat(4,212px);gap:24px}article{break-inside:avoid}b{font:12px sans-serif}</style>${picturesHtml}`,
    );
  });
});
