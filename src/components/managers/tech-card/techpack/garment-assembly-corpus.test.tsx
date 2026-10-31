import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { env } from 'node:process';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { pairOverlap, pieceKeyOf, rasterize, resolveEdge } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { readName } from 'lib/assembly-skeleton/skeleton/model';
import type { Pt2 } from 'lib/assembly-skeleton/types';

import { boxOf } from '../components/step-seams/step-picture';
import { StepPictureSvg, type StepPicture } from '../components/step-seams/step-picture-view';
import { inputGroups } from '../components/step-seams/step-seams-model';
import { deriveAssembly, type AssemblyInput } from './derive-assembly';
import {
  closedLoopFinishedJoin,
  editorActionMarks,
  editorOperationPictures,
} from './pages/assembly';

const ROOT = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/techpack-pdf-v3/data';
const GOLDEN_ROOT = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/techpack-pdf-v3/golden';
const OUT = env.DUMP_DIR ?? 'tmp-dump/corpus';
const CORPUS_TEST_TIMEOUT = 600_000;
const CARDS = [1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 19].map((id) => ({
  id: `prod${id}`,
  path: `${ROOT}/prod/prod${id}-asm-input.json`,
}));
CARDS.push({ id: 'card81', path: `${ROOT}/card81/card81-asm-input.json` });
for (const id of [
  38, 51, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 77, 79, 83, 85,
])
  CARDS.push({ id: `beta${id}`, path: `${ROOT}/beta/beta${id}-asm-input.json` });
if (env.CORPUS_ONLY) {
  const selected = new Set(env.CORPUS_ONLY.split(',').map((id) => id.trim()));
  CARDS.splice(0, CARDS.length, ...CARDS.filter(({ id }) => selected.has(id)));
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.__map))
    return new Map(
      (record.__map as [unknown, unknown][]).map(([key, item]) => [revive(key), revive(item)]),
    );
  if (Array.isArray(record.__set)) return new Set((record.__set as unknown[]).map(revive));
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, revive(item)]));
}

const load = (path: string) => revive(JSON.parse(readFileSync(path, 'utf8'))) as AssemblyInput;

const corpusCache = new Map<
  string,
  {
    input: AssemblyInput;
    model: ReturnType<typeof deriveAssembly>;
    pictures: Map<number, StepPicture>;
  }
>();

const corpusAt = (path: string) => {
  const cached = corpusCache.get(path);
  if (cached) return cached;
  const input = load(path);
  const model = deriveAssembly(input);
  const pictures = editorOperationPictures(input.techCard, model) ?? new Map<number, StepPicture>();
  const result = { input, model, pictures };
  corpusCache.set(path, result);
  return result;
};

const visibleKeys = (picture: StepPicture) => {
  const stacked = new Set(picture.layout.stacked.flatMap((group) => group.slice(1)));
  const layeredInputs = new Set(picture.layout.layers.map(([input]) => input));
  const layeredPieces = new Set(picture.layout.pieceLayers.map(([piece]) => piece));
  return [...picture.layout.T.keys()].filter(
    (key) =>
      !stacked.has(key) &&
      !layeredInputs.has(picture.layout.input.get(key) ?? -1) &&
      !layeredPieces.has(key),
  );
};

const upstreamGeometryKeys = (
  operations: readonly {
    inputKeys?: string[];
    outputUnitKey?: string;
  }[],
  index: number,
  pieceKeys: ReadonlySet<string>,
) => {
  const producers = new Map<string, number>();
  operations.slice(0, index).forEach((operation, producerIndex) => {
    const output = operation.outputUnitKey?.trim();
    if (output) producers.set(output, producerIndex);
  });
  const pieces = new Set<string>();
  const visitedUnits = new Set<string>();
  const visit = (key: string) => {
    if (pieceKeys.has(key)) {
      pieces.add(key);
      return;
    }
    if (visitedUnits.has(key)) return;
    visitedUnits.add(key);
    const producerIndex = producers.get(key);
    if (producerIndex == null) return;
    for (const input of operations[producerIndex].inputKeys ?? []) visit(input);
  };
  for (const input of operations[index]?.inputKeys ?? []) visit(input);
  return pieces;
};

const renderedGeometryKeys = (markup: string) =>
  new Set([...markup.matchAll(/data-piece-(?:outline|layer)="([^"]+)"/g)].map((match) => match[1]));

const outlinedGeometryKeys = (markup: string) =>
  new Set([...markup.matchAll(/data-piece-outline="([^"]+)"/g)].map((match) => match[1]));

function largestIdenticalFamily(input: AssemblyInput, keys: ReadonlySet<string>): string[] {
  const candidates = [...keys].filter((key) => input.pieces.has(key));
  const parent = new Map(candidates.map((key) => [key, key]));
  const find = (key: string): string => {
    const current = parent.get(key) ?? key;
    if (current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };
  const join = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  };
  for (const key of candidates)
    for (const twin of input.pieces.get(key)?.geom.twinOf ?? [])
      if (twin.kind === 'identical' && keys.has(twin.key)) join(key, twin.key);
  const families = new Map<string, string[]>();
  for (const key of candidates) {
    const root = find(key);
    families.set(root, [...(families.get(root) ?? []), key]);
  }
  return [...families.values()].sort((left, right) => right.length - left.length)[0] ?? [];
}

/**
 * B3 may fully conceal only an explicit construction layer or an identical stacked ply. The
 * completeness assertion below separately requires every sewn sleeve hand to stay represented.
 */
const finishingHiddenKeys = (picture: StepPicture) => {
  const hidden = new Set(picture.layout.stacked.flatMap((stack) => stack.slice(1)));
  const layeredInputs = new Set(picture.layout.layers.map(([input]) => input));
  const explicitLayers = new Set([
    ...picture.layout.pieceLayers.map(([piece]) => piece),
    ...[...picture.layout.T].flatMap(([key]) =>
      layeredInputs.has(picture.layout.input.get(key) ?? -1) ? [key] : [],
    ),
  ]);
  for (const key of explicitLayers) hidden.add(key);
  return hidden;
};

const worldRing = (input: AssemblyInput, picture: StepPicture, key: string) => {
  const transform = picture.layout.T.get(key)!;
  return input.pieces.get(key)!.geom.rs.map((point) => apply(transform, point));
};

const bboxGap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0);

const signedArea = (ring: readonly Pt2[]) =>
  ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;

function convexHull(points: readonly Pt2[]): Pt2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (origin: Pt2, a: Pt2, b: Pt2) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const half = (source: readonly Pt2[]) => {
    const out: Pt2[] = [];
    for (const point of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0)
        out.pop();
      out.push(point);
    }
    return out;
  };
  if (sorted.length < 3) return sorted;
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

function compactness(rings: readonly (readonly Pt2[])[]) {
  const hullArea = Math.abs(signedArea(convexHull(rings.flat())));
  const pieceArea = rings.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
  return hullArea > 0 ? pieceArea / hullArea : 1;
}

const stripLike = (ring: readonly Pt2[]) => {
  const box = boxOf(ring);
  const width = Math.max(box.x1 - box.x0, 1);
  const height = Math.max(box.y1 - box.y0, 1);
  return Math.max(width, height) >= 4 * Math.min(width, height);
};

const pointsOfPath = (path: string) => {
  const points: Pt2[] = [];
  let current: Pt2 = [0, 0];
  for (const command of path.matchAll(/([MLHVZ])([^MLHVZ]*)/gi)) {
    const kind = command[1].toUpperCase();
    const values = [...command[2].matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map((match) =>
      Number(match[0]),
    );
    if (kind === 'M' || kind === 'L')
      for (let index = 0; index + 1 < values.length; index += 2) {
        current = [values[index], values[index + 1]];
        points.push(current);
      }
    if (kind === 'H')
      for (const value of values) {
        current = [value, current[1]];
        points.push(current);
      }
    if (kind === 'V')
      for (const value of values) {
        current = [current[0], value];
        points.push(current);
      }
  }
  return points;
};

const pathTags = (markup: string) =>
  [...markup.matchAll(/<path\b[^>]*>/g)].map((match) => match[0]);
const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]+)"`).exec(tag)?.[1];

function ringsTouch(
  a: readonly [number, number][],
  b: readonly [number, number][],
  aRaster = rasterize(a, 3),
  bRaster = rasterize(b, 3),
) {
  const distance = 3;
  if (bboxGap(boxOf(a), boxOf(b)) > distance) return false;
  if (pairOverlap(aRaster, bRaster) > 0) return true;
  const cell = distance;
  const grid = new Map<string, [number, number][]>();
  for (const point of b) {
    const key = `${Math.floor(point[0] / cell)}:${Math.floor(point[1] / cell)}`;
    grid.set(key, [...(grid.get(key) ?? []), point]);
  }
  if (
    a.some((point) => {
      const x = Math.floor(point[0] / cell);
      const y = Math.floor(point[1] / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (
            (grid.get(`${x + dx}:${y + dy}`) ?? []).some(
              (other) => Math.hypot(point[0] - other[0], point[1] - other[1]) <= distance,
            )
          )
            return true;
      return false;
    })
  )
    return true;
  const pointSegment = (
    point: readonly [number, number],
    start: readonly [number, number],
    end: readonly [number, number],
  ) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length2 = dx * dx + dy * dy;
    const share = length2
      ? Math.max(
          0,
          Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
        )
      : 0;
    return Math.hypot(point[0] - start[0] - share * dx, point[1] - start[1] - share * dy);
  };
  const nearSegments = (points: readonly [number, number][], ring: readonly [number, number][]) =>
    points.some((point) =>
      ring.some(
        (start, index) => pointSegment(point, start, ring[(index + 1) % ring.length]) <= distance,
      ),
    );
  return nearSegments(a, b) || nearSegments(b, a);
}

const pictureSvgCache = new WeakMap<StepPicture, string>();

function pictureSvg(picture: StepPicture, actionRow: Parameters<typeof editorActionMarks>[0]) {
  const cached = pictureSvgCache.get(picture);
  if (cached) return cached;
  const action = editorActionMarks(actionRow, picture.geoms);
  const markup = renderToStaticMarkup(
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
  pictureSvgCache.set(picture, markup);
  return markup;
}

const fillCache = new Map<string, string[]>();

function pictureFills(picture: StepPicture, actionRow: Parameters<typeof editorActionMarks>[0]) {
  const action = editorActionMarks(actionRow, picture.geoms);
  const signature = JSON.stringify({
    keys: [...picture.layout.T.keys()].sort(),
    stacked: picture.layout.stacked,
    layers: picture.layout.layers,
    pieceLayers: picture.layout.pieceLayers,
    ghosts: picture.layout.ghosts.length,
    marks: picture.marks.map((mark) => [mark.id, mark.tone]),
    lines: action.lines.map((line) => line.kind),
    glyphs: action.glyphs.map((glyph) => glyph.kind),
  });
  const cached = fillCache.get(signature);
  if (cached) return cached;
  const fills = [...pictureSvg(picture, actionRow).matchAll(/\sfill="([^"]+)"/g)].map(
    (match) => match[1],
  );
  fillCache.set(signature, fills);
  return fills;
}

describe.each(CARDS)('garment assembly corpus $id', ({ id, path }) => {
  it.skipIf(!existsSync(path))(
    'draws every resolvable operation',
    () => {
      const { input, model, pictures } = corpusAt(path);
      const operations = input.techCard.techCard?.operations ?? [];
      const pieceKeys = new Set(input.pieces.keys());
      for (const [index, operation] of operations.entries()) {
        const number = operation.operationNumber ?? 0;
        const resolvable =
          (model.targets.get(number) ?? []).some((item) => input.pieces.has(item.p)) ||
          inputGroups(operations, index, pieceKeys).some((group) => group.pieces.length > 0);
        if (resolvable) expect(pictures.has(number), `${id} ${number}`).toBe(true);
      }
      if (id === 'beta38')
        for (const operation of [30, 40, 50])
          expect(pictures.has(operation), `${id} ${operation}: semantic input`).toBe(true);
    },
    CORPUS_TEST_TIMEOUT,
  );

  it.skipIf(!existsSync(path))(
    'keeps pieces touching, separate, unfilled, and well framed',
    () => {
      const { input, model, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const keys = visibleKeys(picture);
        const rings = new Map(keys.map((key) => [key, worldRing(input, picture, key)]));
        const touchRasters = new Map(keys.map((key) => [key, rasterize(rings.get(key)!, 3)]));
        const overlapRasters = new Map(keys.map((key) => [key, rasterize(rings.get(key)!, 2)]));
        const touchCache = new Map<string, boolean>();
        const touches = (left: string, right: string) => {
          const pair = left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
          const cached = touchCache.get(pair);
          if (cached != null) return cached;
          const value = ringsTouch(
            rings.get(left)!,
            rings.get(right)!,
            touchRasters.get(left),
            touchRasters.get(right),
          );
          touchCache.set(pair, value);
          return value;
        };
        if (keys.length > 1) {
          for (const key of keys)
            expect(
              keys.some((other) => other !== key && touches(key, other)),
              `${id} ${operation}: loose ${input.pieces.get(key)?.name}`,
            ).toBe(true);
          const connected = new Set([keys[0]]);
          const queue = [keys[0]];
          while (queue.length) {
            const key = queue.shift()!;
            for (const other of keys)
              if (!connected.has(other) && touches(key, other)) {
                connected.add(other);
                queue.push(other);
              }
          }
          expect(connected.size, `${id} ${operation}: connected component`).toBe(keys.length);
        }
        for (let left = 0; left < keys.length; left++)
          for (let right = left + 1; right < keys.length; right++)
            expect(
              pairOverlap(overlapRasters.get(keys[left])!, overlapRasters.get(keys[right])!),
              `${id} ${operation}: overlap ${input.pieces.get(keys[left])?.name} / ${input.pieces.get(keys[right])?.name}`,
            ).toBeLessThanOrEqual(0.15);

        const row = model.rows.find((candidate) => candidate.n === operation);
        const fills = pictureFills(picture, row?.action);
        expect(
          fills.every((fill) => fill === 'none' || fill === 'var(--color-bgColor)'),
          `${id} ${operation}: ${fills.join(', ')}`,
        ).toBe(true);
        const svg = pictureSvg(picture, row?.action);
        expect(svg, `${id} ${operation}: dashed placeholder`).not.toContain('data-step-ghost');
        expect(svg, `${id} ${operation}: dashed rectangle`).not.toMatch(
          /<rect\b[^>]*stroke-dasharray=/,
        );
      }

      const final = [...pictures.entries()]
        .sort(([left], [right]) => right - left)
        .find(([, picture]) => visibleKeys(picture).length > 2);
      if (final) {
        const [operation, picture] = final;
        const points = visibleKeys(picture).flatMap((key) => worldRing(input, picture, key));
        const box = boxOf(points);
        const width = Math.max(box.x1 - box.x0, 1);
        const height = Math.max(box.y1 - box.y0, 1);
        const scale = Math.min(204 / width, 178 / height);
        const fill = (width * scale * height * scale) / (204 * 178);
        expect(fill + 0.01, `${id} ${operation} final fill`).toBeGreaterThanOrEqual(0.42);
      }
    },
    CORPUS_TEST_TIMEOUT,
  );

  it.skipIf(env.DUMP !== '1' || !existsSync(path))(
    'dumps every operation picture',
    () => {
      const { model, pictures } = corpusAt(path);
      const cells = model.rows.map((row) => {
        const picture = pictures.get(row.n);
        const label = `<b>${row.n}</b>`;
        return picture
          ? `<article data-op='${row.n}'>${label}${pictureSvg(picture, row.action)}</article>`
          : `<article data-op='${row.n}'>${label}<i>—</i></article>`;
      });
      const hex = String.fromCharCode(35);
      mkdirSync(OUT, { recursive: true });
      writeFileSync(
        `${OUT}/${id}.html`,
        `<!doctype html><meta charset="utf-8"><style>:root{--color-textColor:${hex}000;--color-labelColor:${hex}777;--color-bgColor:${hex}fff}body{display:grid;grid-template-columns:repeat(6,212px);gap:16px}b,i{font:12px sans-serif;display:block}</style>${cells.join('')}`,
      );
    },
    CORPUS_TEST_TIMEOUT,
  );
});

const corpusCard = (id: string) => {
  const card = CARDS.find((candidate) => candidate.id === id);
  if (!card || !existsSync(card.path)) return null;
  return corpusAt(card.path);
};

describe.each([
  ['beta64', 120],
  ['beta66', 140],
  ['prod12', 120],
  ['prod14', 140],
] as const)('identical panel rings %s', (id, bottomOperation) => {
  it.each([10, bottomOperation])(
    'draws every panel once at operation %s',
    (number) => {
      const corpus = corpusCard(id);
      if (!corpus) return;
      const { input, model, pictures } = corpus;
      const operations = input.techCard.techCard?.operations ?? [];
      const index = operations.findIndex((operation) => operation.operationNumber === number);
      expect(index, `${id} ${number}: operation`).toBeGreaterThanOrEqual(0);
      const expected = upstreamGeometryKeys(operations, index, new Set(input.pieces.keys()));
      const panels = largestIdenticalFamily(input, expected);
      expect(panels, `${id} ${number}: identical panels`).toHaveLength(8);

      const picture = pictures.get(number);
      expect(picture, `${id} ${number}: picture`).toBeDefined();
      const row = model.rows.find((candidate) => candidate.n === number);
      const outlines = outlinedGeometryKeys(pictureSvg(picture!, row?.action));
      expect(
        panels.filter((key) => !outlines.has(key)),
        `${id} ${number}: hidden panels`,
      ).toEqual([]);

      const hidden = new Set([
        ...picture!.layout.stacked.flatMap((stack) => stack.slice(1)),
        ...picture!.layout.pieceLayers.map(([piece]) => piece),
      ]);
      expect(
        panels.filter((key) => hidden.has(key)),
        `${id} ${number}: panels treated as plies`,
      ).toEqual([]);
      const panelRasters = new Map(
        panels.map((key) => [key, rasterize(worldRing(input, picture!, key), 2)]),
      );
      for (let left = 0; left < panels.length; left++)
        for (let right = left + 1; right < panels.length; right++)
          expect(
            pairOverlap(panelRasters.get(panels[left])!, panelRasters.get(panels[right])!),
            `${id} ${number}: panel overlap`,
          ).toBeLessThanOrEqual(0.15);

      const panelSet = new Set(panels);
      const panelSeams = (model.garment?.byOperation.get(number) ?? []).filter((seam) => {
        const a = (seam.aParts ?? [seam.a]).map(pieceKeyOf);
        const b = (seam.bParts ?? [seam.b]).map(pieceKeyOf);
        return a.some((key) => panelSet.has(key)) && b.some((key) => panelSet.has(key));
      });
      expect(panelSeams, `${id} ${number}: ring seams`).toHaveLength(panels.length);
      expect(
        panelSeams.some((seam) => /matching ply follows/.test(seam.evidence.rule ?? '')),
        `${id} ${number}: duplicate ply seam`,
      ).toBe(false);
      expect(new Set(row?.words.seams ?? []).size, `${id} ${number}: printed seams`).toBe(
        row?.words.seams.length ?? 0,
      );
    },
    CORPUS_TEST_TIMEOUT,
  );
});

it(
  'draws every operation with two direct geometry inputs',
  () => {
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const corpus = corpusAt(path);
      const operations = corpus.input.techCard.techCard?.operations ?? [];
      const pieceKeys = new Set(corpus.input.pieces.keys());
      for (const operation of operations) {
        const direct = (operation.inputKeys ?? []).filter((key) => pieceKeys.has(key));
        if (direct.length < 2) continue;
        const number = operation.operationNumber ?? 0;
        const picture = corpus.pictures.get(number);
        expect(picture, `${id} ${number}: ${direct.length} inputs`).toBeDefined();
        const row = corpus.model.rows.find((candidate) => candidate.n === number);
        expect(
          outlinedGeometryKeys(pictureSvg(picture!, row?.action)).size,
          `${id} ${number}: rendered geometry`,
        ).toBeGreaterThan(0);
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps exactly two identical collar pieces as plies',
  () => {
    for (const [id, operations] of [
      ['beta83', [50, 400]],
      ['beta85', [150, 200]],
    ] as const) {
      const corpus = corpusCard(id);
      if (!corpus) continue;
      for (const number of operations) {
        const picture = corpus.pictures.get(number);
        expect(picture, `${id} ${number}`).toBeDefined();
        const collarStacks = picture!.layout.stacked.filter(
          (stack) =>
            stack.length === 2 &&
            stack.every((key) =>
              ['collar', 'stand'].includes(
                readName(picture!.geoms.get(key)?.name ?? '').role ?? '',
              ),
            ),
        );
        expect(collarStacks.length, `${id} ${number}: collar plies`).toBeGreaterThanOrEqual(1);
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps a docked collar strip through later operations of its unit',
  () => {
    for (const id of ['beta77', 'beta85']) {
      const corpus = corpusCard(id);
      if (!corpus) continue;
      const attached = corpus.pictures.get(1050);
      expect(attached, `${id} 1050`).toBeDefined();
      const attachRow = corpus.model.rows.find((candidate) => candidate.n === 1050);
      const attachedOutlines = outlinedGeometryKeys(pictureSvg(attached!, attachRow?.action));
      const strips = [...attachedOutlines].filter((key) =>
        ['collar', 'stand', 'rib'].includes(
          readName(attached!.geoms.get(key)?.name ?? '').role ?? '',
        ),
      );
      expect(strips.length, `${id} 1050: docked collar`).toBeGreaterThanOrEqual(1);
      for (const number of [1060, 1070, 1080, 1090]) {
        const picture = corpus.pictures.get(number);
        expect(picture, `${id} ${number}`).toBeDefined();
        const row = corpus.model.rows.find((candidate) => candidate.n === number);
        const outlines = outlinedGeometryKeys(pictureSvg(picture!, row?.action));
        expect(
          strips.some((key) => outlines.has(key)),
          `${id} ${number}: collar persists`,
        ).toBe(true);
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

describe.each([
  ['beta64', 120, 150],
  ['beta66', 140, 170],
  ['prod12', 120, 150],
  ['prod14', 140, 170],
] as const)('finished ring join %s', (id, bottomOperation, joinOperation) => {
  it(
    'keeps both rings intact and docks the later strip',
    () => {
      const corpus = corpusCard(id);
      if (!corpus) return;
      const { input, pictures } = corpus;
      const sourceKeys = (number: number) => {
        const picture = pictures.get(number);
        expect(picture, `${id} ${number}`).toBeDefined();
        return largestIdenticalFamily(input, new Set(visibleKeys(picture!)));
      };
      const top = sourceKeys(10);
      const bottom = sourceKeys(bottomOperation);
      expect(top, `${id}: top ring`).toHaveLength(8);
      expect(bottom, `${id}: bottom ring`).toHaveLength(8);
      expect(
        closedLoopFinishedJoin(pictures.get(joinOperation)!, [
          pictures.get(10)!,
          pictures.get(bottomOperation)!,
        ]),
        `${id} ${joinOperation}: closed-loop join`,
      ).toBe(true);
      const centre = (picture: StepPicture, key: string): Pt2 => {
        const ring = worldRing(input, picture, key);
        return [
          ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
          ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
        ];
      };
      const distances = (picture: StepPicture, keys: readonly string[]) =>
        keys.flatMap((left, leftIndex) =>
          keys.slice(leftIndex + 1).map((right) => {
            const a = centre(picture, left);
            const b = centre(picture, right);
            return Math.hypot(a[0] - b[0], a[1] - b[1]);
          }),
        );
      const connected = (picture: StepPicture, keys: readonly string[]) => {
        const reached = new Set([keys[0]]);
        const queue = [keys[0]];
        while (queue.length) {
          const key = queue.shift()!;
          for (const candidate of keys)
            if (
              !reached.has(candidate) &&
              ringsTouch(worldRing(input, picture, key), worldRing(input, picture, candidate))
            ) {
              reached.add(candidate);
              queue.push(candidate);
            }
        }
        return reached.size === keys.length;
      };
      const topDistances = distances(pictures.get(10)!, top);
      const bottomDistances = distances(pictures.get(bottomOperation)!, bottom);
      for (const [number, picture] of [...pictures].filter(([number]) => number >= joinOperation)) {
        const shown = new Set(visibleKeys(picture));
        expect(
          top.every((key) => shown.has(key)),
          `${id} ${number}: top ring`,
        ).toBe(true);
        expect(
          bottom.every((key) => shown.has(key)),
          `${id} ${number}: bottom ring`,
        ).toBe(true);
        expect(connected(picture, top), `${id} ${number}: connected top ring`).toBe(true);
        expect(connected(picture, bottom), `${id} ${number}: connected bottom ring`).toBe(true);
        distances(picture, top).forEach((distance, index) =>
          expect(distance, `${id} ${number}: top ring shape ${index}`).toBeCloseTo(
            topDistances[index],
            3,
          ),
        );
        distances(picture, bottom).forEach((distance, index) =>
          expect(distance, `${id} ${number}: bottom ring shape ${index}`).toBeCloseTo(
            bottomDistances[index],
            3,
          ),
        );
      }

      for (const number of [240, 250, 260, 270, 280]) {
        const picture = pictures.get(number);
        expect(picture, `${id} ${number}`).toBeDefined();
        const shown = visibleKeys(picture!);
        const strips = shown.filter((key) => stripLike(worldRing(input, picture!, key)));
        const body = shown.filter((key) => !strips.includes(key));
        expect(body.length, `${id} ${number}: body`).toBeGreaterThanOrEqual(16);
        expect(strips.length, `${id} ${number}: strip`).toBeGreaterThanOrEqual(1);
        const reached = new Set(body);
        for (let changed = true; changed; ) {
          changed = false;
          for (const strip of strips) {
            if (reached.has(strip)) continue;
            if (
              [...reached].some((host) =>
                ringsTouch(worldRing(input, picture!, strip), worldRing(input, picture!, host)),
              )
            ) {
              reached.add(strip);
              changed = true;
            }
          }
        }
        expect(
          strips.every((strip) => reached.has(strip)),
          `${id} ${number}: docked strip`,
        ).toBe(true);
      }
    },
    CORPUS_TEST_TIMEOUT,
  );
});

it(
  'matches round-11 docking except on the four closed-loop bag cards',
  () => {
    const closedLoopCards = new Set(['beta64', 'beta66', 'prod12', 'prod14']);
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const round = closedLoopCards.has(id) ? 'corpus-r12' : 'corpus-r11b';
      const baseline = `${GOLDEN_ROOT}/${round}/html/${id}.html`;
      if (!existsSync(baseline)) continue;
      const { model, pictures } = corpusAt(path);
      const cells = model.rows.map((row) => {
        const picture = pictures.get(row.n);
        const label = `<b>${row.n}</b>`;
        return picture
          ? `<article data-op='${row.n}'>${label}${pictureSvg(picture, row.action)}</article>`
          : `<article data-op='${row.n}'>${label}<i>—</i></article>`;
      });
      const hex = String.fromCharCode(35);
      const actual = `<!doctype html><meta charset="utf-8"><style>:root{--color-textColor:${hex}000;--color-labelColor:${hex}777;--color-bgColor:${hex}fff}body{display:grid;grid-template-columns:repeat(6,212px);gap:16px}b,i{font:12px sans-serif;display:block}</style>${cells.join('')}`;
      expect(actual, `${id} uses ${round}`).toBe(readFileSync(baseline, 'utf8'));
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps sleeves in their armholes and trouser halves uncrossed',
  () => {
    for (const [id, numbers] of [
      ['beta61', [450, 460, 470, 480]],
      ['beta85', [1020, 1030, 1040, 1050, 1060, 1070, 1080, 1090]],
    ] as const) {
      const corpus = corpusCard(id);
      if (!corpus) continue;
      for (const number of numbers) {
        const picture = corpus.pictures.get(number);
        expect(picture, `${id} ${number}`).toBeDefined();
        const shown = visibleKeys(picture!);
        const sleeves = shown.filter(
          (key) => readName(picture!.geoms.get(key)?.name ?? '').role === 'sleeve',
        );
        const body = shown.filter((key) =>
          ['front', 'back', 'yoke', 'side'].includes(
            readName(picture!.geoms.get(key)?.name ?? '').role ?? '',
          ),
        );
        if (!sleeves.length || !body.length) continue;
        const sleeveGroups = new Map<string, string[]>();
        for (const key of sleeves) {
          const hand = readName(picture!.geoms.get(key)?.name ?? '').hand ?? key;
          sleeveGroups.set(hand, [...(sleeveGroups.get(hand) ?? []), key]);
        }
        for (const [hand, sleeve] of sleeveGroups)
          expect(
            sleeve.some((key) =>
              body.some((host) =>
                ringsTouch(
                  worldRing(corpus.input, picture!, key),
                  worldRing(corpus.input, picture!, host),
                ),
              ),
            ),
            `${id} ${number}: ${hand} sleeve docked`,
          ).toBe(true);
      }
    }

    const trousers = corpusCard('beta63');
    if (!trousers) return;
    let checkedTrouserPictures = 0;
    for (const number of [330, 340, 350, 360, 370, 380, 390, 400, 410, 420]) {
      const picture = trousers.pictures.get(number);
      expect(picture, `beta63 ${number}`).toBeDefined();
      const pieces = visibleKeys(picture!).filter((key) =>
        ['front', 'back', 'side'].includes(
          readName(picture!.geoms.get(key)?.name ?? '').role ?? '',
        ),
      );
      if (pieces.length < 2) continue;
      checkedTrouserPictures++;
      for (let left = 0; left < pieces.length; left++)
        for (let right = left + 1; right < pieces.length; right++)
          expect(
            pairOverlap(
              rasterize(worldRing(trousers.input, picture!, pieces[left]), 2),
              rasterize(worldRing(trousers.input, picture!, pieces[right]), 2),
            ),
            `beta63 ${number}: crossed halves`,
          ).toBeLessThanOrEqual(0.1);
    }
    expect(checkedTrouserPictures, 'beta63 trouser pictures').toBeGreaterThanOrEqual(9);
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps every multi-piece corpus picture compact',
  () => {
    const minimums: string[] = [];
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { input, pictures } = corpusAt(path);
      let minimum = 1;
      let minimumOperation = 0;
      for (const [operation, picture] of pictures) {
        const keys = visibleKeys(picture);
        if (keys.length < 2) continue;
        const rings = keys.map((key) => worldRing(input, picture, key));
        const value = compactness(rings);
        if (value < minimum) {
          minimum = value;
          minimumOperation = operation;
        }
        expect
          .soft(value + 1e-6, `${id} ${operation}: compactness ${value.toFixed(3)}`)
          .toBeGreaterThanOrEqual(keys.length >= 6 ? 0.45 : 0.35);
        if (!rings.every(stripLike)) {
          const box = boxOf(rings.flat());
          const width = Math.max(box.x1 - box.x0, 1);
          const height = Math.max(box.y1 - box.y0, 1);
          expect
            .soft(Math.max(width / height, height / width), `${id} ${operation}: aspect`)
            .toBeLessThanOrEqual(4);
        }
      }
      minimums.push(`${id} ${minimum.toFixed(3)}@${minimumOperation}`);
    }
    console.info(`[corpus compactness] ${minimums.join(' · ')}`);
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'draws every upstream geometry piece unless a B3 finishing layer conceals it',
  () => {
    const finalCounts: string[] = [];
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { model, pictures } = corpusAt(path);
      const operations = model.techCard?.techCard?.operations ?? [];
      const pieceKeys = new Set(model.pieces.keys());
      operations.forEach((operation, index) => {
        const number = operation.operationNumber ?? 0;
        const expected = upstreamGeometryKeys(operations, index, pieceKeys);
        if (!expected.size) return;
        const picture = pictures.get(number);
        expect.soft(picture, `${id} ${number}: picture`).toBeDefined();
        if (!picture) return;
        const present = new Set(picture.layout.T.keys());
        const missing = [...expected].filter((key) => !present.has(key));
        expect.soft(missing, `${id} ${number}: missing geometry`).toEqual([]);
        const row = model.rows.find((candidate) => candidate.n === number);
        const rendered = renderedGeometryKeys(pictureSvg(picture, row?.action));
        const finishingHidden = finishingHiddenKeys(picture);
        const undrawn = [...expected].filter(
          (key) => !rendered.has(key) && !finishingHidden.has(key),
        );
        expect.soft(undrawn, `${id} ${number}: undrawn geometry`).toEqual([]);
      });
      const final = [...operations.entries()]
        .reverse()
        .map(([index, operation]) => ({
          index,
          number: operation.operationNumber ?? 0,
          expected: upstreamGeometryKeys(operations, index, pieceKeys),
        }))
        .find(({ number, expected }) => expected.size > 0 && pictures.has(number));
      if (final) {
        const picture = pictures.get(final.number)!;
        const row = model.rows.find((candidate) => candidate.n === final.number);
        const rendered = renderedGeometryKeys(pictureSvg(picture, row?.action));
        const expectedSleeves = [...final.expected].filter(
          (key) => readName(picture.geoms.get(key)?.name ?? '').role === 'sleeve',
        );
        for (const hand of new Set(
          expectedSleeves.map((key) => readName(picture.geoms.get(key)?.name ?? '').hand),
        )) {
          const representative = expectedSleeves.some((key) => {
            const reading = readName(picture.geoms.get(key)?.name ?? '');
            return reading.hand === hand && rendered.has(key);
          });
          expect
            .soft(representative, `${id} ${final.number}: final ${hand ?? 'whole'} sleeve`)
            .toBe(true);
        }
        const drawn = [...final.expected].filter((key) => rendered.has(key)).length;
        finalCounts.push(`${id} ${final.expected.size}/${drawn}@${final.number}`);
      }
    }
    console.info(`[corpus completeness] ${finalCounts.join(' · ')}`);
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps every rendered path inside the picture box',
  () => {
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { model, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const row = model.rows.find((candidate) => candidate.n === operation);
        const markup = pictureSvg(picture, row?.action);
        for (const [index, match] of [...markup.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].entries()) {
          const points = pointsOfPath(match[1]);
          if (!points.length) continue;
          const box = boxOf(points);
          expect.soft(box.x0, `${id} ${operation}: path ${index} x0`).toBeGreaterThanOrEqual(-2);
          expect.soft(box.x1, `${id} ${operation}: path ${index} x1`).toBeLessThanOrEqual(214);
          expect.soft(box.y0, `${id} ${operation}: path ${index} y0`).toBeGreaterThanOrEqual(-2);
          expect.soft(box.y1, `${id} ${operation}: path ${index} y1`).toBeLessThanOrEqual(188);
        }
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps consecutive assembly layouts monotonic',
  () => {
    const inputSignature = (operation: { inputKeys?: string[] }) =>
      [...new Set((operation.inputKeys ?? []).filter(Boolean))].sort().join('\u0000');
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { input, model, pictures } = corpusAt(path);
      const operations = input.techCard.techCard?.operations ?? [];
      for (let index = 1; index < operations.length; index++) {
        const previousOperation = operations[index - 1];
        const operation = operations[index];
        const previousNumber = previousOperation.operationNumber ?? 0;
        const number = operation.operationNumber ?? 0;
        const previous = pictures.get(previousNumber);
        const current = pictures.get(number);
        const row = model.rows.find((candidate) => candidate.n === number);
        // A sewing card deliberately moves its inputs together; finishing operations must not.
        if (!previous || !current || row?.card) continue;
        const previousOutput = previousOperation.outputUnitKey?.trim();
        const sameAssembly =
          (!!previousOutput && (operation.inputKeys ?? []).includes(previousOutput)) ||
          (!!inputSignature(operation) &&
            inputSignature(operation) === inputSignature(previousOperation));
        if (!sameAssembly) continue;
        const previousKeys = visibleKeys(previous);
        const currentKeys = new Set(visibleKeys(current));
        const common = previousKeys.filter((key) => currentKeys.has(key));
        if (common.length < 2) continue;
        const centre = (picture: StepPicture, key: string): Pt2 => {
          const ring = worldRing(input, picture, key);
          return [
            ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
            ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
          ];
        };
        const previousBox = boxOf(common.flatMap((key) => worldRing(input, previous, key)));
        const currentBox = boxOf(common.flatMap((key) => worldRing(input, current, key)));
        const scale = (box: ReturnType<typeof boxOf>) =>
          Math.min(204 / Math.max(box.x1 - box.x0, 1), 178 / Math.max(box.y1 - box.y0, 1));
        const previousScale = scale(previousBox);
        const currentScale = scale(currentBox);
        const anchor = [...common].sort(
          (left, right) =>
            Math.abs(input.pieces.get(right)?.geom.areaMm2 ?? 0) -
            Math.abs(input.pieces.get(left)?.geom.areaMm2 ?? 0),
        )[0];
        const previousAnchor = centre(previous, anchor);
        const currentAnchor = centre(current, anchor);
        for (const key of common) {
          const before = centre(previous, key);
          const after = centre(current, key);
          const movement = Math.hypot(
            (before[0] - previousAnchor[0]) * previousScale -
              (after[0] - currentAnchor[0]) * currentScale,
            (before[1] - previousAnchor[1]) * previousScale -
              (after[1] - currentAnchor[1]) * currentScale,
          );
          expect
            .soft(
              movement,
              `${id} ${previousNumber}→${number}: moved ${input.pieces.get(key)?.name ?? key}`,
            )
            .toBeLessThanOrEqual(2);
        }
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps body pieces separate with inferred and stored seams',
  () => {
    const bodyRoles = new Set(['front', 'back', 'yoke', 'side', 'sleeve']);
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { input, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const keys = visibleKeys(picture).filter((key) =>
          bodyRoles.has(readName(input.pieces.get(key)?.geom.name ?? '').role ?? ''),
        );
        const rasters = new Map(
          keys.map((key) => [key, rasterize(worldRing(input, picture, key), 2)]),
        );
        for (let left = 0; left < keys.length; left++)
          for (let right = left + 1; right < keys.length; right++)
            expect
              .soft(
                pairOverlap(rasters.get(keys[left])!, rasters.get(keys[right])!),
                `${id} ${operation}: body overlap`,
              )
              .toBeLessThanOrEqual(0.15);
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps marks on pieces and pictures at readable scale',
  () => {
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { model, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const row = model.rows.find((candidate) => candidate.n === operation);
        const markup = pictureSvg(picture, row?.action);
        const tags = pathTags(markup);
        const outlines = tags
          .filter((tag) => attribute(tag, 'data-piece-outline'))
          .map((tag) => ({
            key: attribute(tag, 'data-piece-outline')!,
            points: pointsOfPath(attribute(tag, 'd') ?? ''),
          }))
          .filter(({ points }) => points.length > 1);
        if (!outlines.length) continue;
        const pieceBox = boxOf(outlines.flatMap(({ points }) => points));
        const width = pieceBox.x1 - pieceBox.x0;
        const height = pieceBox.y1 - pieceBox.y0;
        const allStrips = outlines.every(({ points }) => stripLike(points));
        const pictureAspect = Math.max(width / Math.max(height, 1), height / Math.max(width, 1));
        if (!allStrips && pictureAspect < 3) {
          expect.soft(width, `${id} ${operation}: picture width`).toBeGreaterThanOrEqual(53);
          expect.soft(height, `${id} ${operation}: picture height`).toBeGreaterThanOrEqual(46.5);
        }
        const marks = tags.filter(
          (tag) => attribute(tag, 'data-asm-mark') || attribute(tag, 'data-seam-mark'),
        );
        for (const [index, tag] of marks.entries()) {
          const points = pointsOfPath(attribute(tag, 'd') ?? '');
          if (!points.length) continue;
          const markBox = boxOf(points);
          expect
            .soft(markBox.x0, `${id} ${operation}: mark ${index} x0`)
            .toBeGreaterThanOrEqual(pieceBox.x0 - 4);
          expect
            .soft(markBox.x1, `${id} ${operation}: mark ${index} x1`)
            .toBeLessThanOrEqual(pieceBox.x1 + 4);
          expect
            .soft(markBox.y0, `${id} ${operation}: mark ${index} y0`)
            .toBeGreaterThanOrEqual(pieceBox.y0 - 4);
          expect
            .soft(markBox.y1, `${id} ${operation}: mark ${index} y1`)
            .toBeLessThanOrEqual(pieceBox.y1 + 4);
          expect
            .soft(
              points.every((point) =>
                outlines.some(({ points: ring }) => bboxGap(boxOf([point]), boxOf(ring)) <= 6),
              ),
              `${id} ${operation}: free mark ${index}`,
            )
            .toBe(true);
        }
        const largestArea = Math.max(
          ...outlines.map(({ key }) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0)),
          1,
        );
        const pointSegmentDistance = (point: Pt2, start: Pt2, end: Pt2) => {
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          const length2 = dx * dx + dy * dy;
          const share = length2
            ? Math.max(
                0,
                Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
              )
            : 0;
          return Math.hypot(point[0] - start[0] - share * dx, point[1] - start[1] - share * dy);
        };
        for (const { key, points } of outlines) {
          if (outlines.length < 2) continue;
          const raw = picture.geoms.get(key)?.rs ?? [];
          const role = readName(picture.geoms.get(key)?.name ?? '').role;
          const isTreatment = ['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband'].includes(
            role ?? '',
          );
          const isSmallStrip =
            stripLike(raw) && Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0) <= 0.55 * largestArea;
          if (!isTreatment && !isSmallStrip) continue;
          const targets = outlines.filter((outline) => outline.key !== key);
          const closePoints = points.filter((point) =>
            targets.some(({ points: target }) =>
              target.some(
                (start, index) =>
                  pointSegmentDistance(point, start, target[(index + 1) % target.length]) <= 6,
              ),
            ),
          );
          const contactBox = closePoints.length ? boxOf(closePoints) : null;
          const contactSpan = contactBox
            ? Math.max(contactBox.x1 - contactBox.x0, contactBox.y1 - contactBox.y0)
            : 0;
          expect
            .soft(contactSpan, `${id} ${operation}: free strip ${picture.geoms.get(key)?.name}`)
            .toBeGreaterThanOrEqual(4);
        }
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it(
  'keeps neckline and cuff pieces on their garment edges',
  () => {
    const axisFrame = (points: readonly Pt2[]) => {
      const origin: Pt2 = [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ];
      const covariance = points.reduce<[number, number, number]>(
        (sum, point) => {
          const x = point[0] - origin[0];
          const y = point[1] - origin[1];
          return [sum[0] + x * x, sum[1] + x * y, sum[2] + y * y];
        },
        [0, 0, 0],
      );
      const angle = 0.5 * Math.atan2(2 * covariance[1], covariance[0] - covariance[2]);
      const axis: Pt2 = [Math.cos(angle), Math.sin(angle)];
      const projections = points.map(
        (point) => (point[0] - origin[0]) * axis[0] + (point[1] - origin[1]) * axis[1],
      );
      const low = Math.min(...projections);
      const high = Math.max(...projections);
      return {
        axis,
        midpoint: [
          origin[0] + axis[0] * (low + high) * 0.5,
          origin[1] + axis[1] * (low + high) * 0.5,
        ] as Pt2,
        span: Math.max(high - low, 1),
      };
    };
    const pointSegment = (point: Pt2, start: Pt2, end: Pt2) => {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length2 = dx * dx + dy * dy;
      const share = length2
        ? Math.max(
            0,
            Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
          )
        : 0;
      return {
        distance: Math.hypot(point[0] - start[0] - share * dx, point[1] - start[1] - share * dy),
        target: [start[0] + share * dx, start[1] + share * dy] as Pt2,
      };
    };
    const nearest = (part: readonly Pt2[], target: readonly Pt2[]) => {
      let best = { distance: Infinity, target: target[0] };
      for (const point of part)
        target.forEach((start, index) => {
          const candidate = pointSegment(point, start, target[(index + 1) % target.length]);
          if (candidate.distance < best.distance) best = candidate;
        });
      return best;
    };
    for (const { id, path } of CARDS) {
      if (!existsSync(path)) continue;
      const { input, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const keys = visibleKeys(picture);
        for (const key of keys) {
          const role = readName(input.pieces.get(key)?.geom.name ?? '').role;
          if (!['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband'].includes(role ?? ''))
            continue;
          const candidates = keys.filter((candidate) => {
            const targetRole = readName(input.pieces.get(candidate)?.geom.name ?? '').role;
            return role === 'cuff'
              ? targetRole === 'sleeve'
              : ['front', 'back', 'yoke', 'side'].includes(targetRole ?? '');
          });
          if (!candidates.length) continue;
          const part = worldRing(input, picture, key);
          const matches = candidates.map((candidate) => {
            const ring = worldRing(input, picture, candidate);
            const contact = nearest(part, ring);
            return { key: candidate, ring, distance: contact.distance, contact: contact.target };
          });
          const match = matches.reduce((best, candidate) =>
            candidate.distance < best.distance ? candidate : best,
          );
          const targetBox = boxOf(match.ring);
          const span = Math.max(targetBox.x1 - targetBox.x0, targetBox.y1 - targetBox.y0, 1);
          expect
            .soft(match.distance, `${id} ${operation}: ${role} contact`)
            .toBeLessThanOrEqual(0.15 * span);
          const allowed =
            role === 'cuff'
              ? new Set(['sleeve'])
              : role === 'hemband'
                ? new Set(['front', 'back', 'side', 'sleeve'])
                : new Set(['front', 'back', 'yoke', 'side']);
          const seamTargets = picture.frameSeams.flatMap((seam) => {
            if (seam.kind === 'surface' || seam.kind === 'closure-not-seam') return [];
            const a = seam.aParts?.length ? seam.aParts : [seam.a];
            const b = seam.bParts?.length ? seam.bParts : [seam.b];
            const target = a.some((edge) => pieceKeyOf(edge) === key)
              ? b
              : b.some((edge) => pieceKeyOf(edge) === key)
                ? a
                : [];
            const edges = target.filter((edge) =>
              allowed.has(readName(input.pieces.get(pieceKeyOf(edge))?.geom.name ?? '').role ?? ''),
            );
            const points = edges.flatMap((edge) => {
              const targetKey = pieceKeyOf(edge);
              const transform = picture.layout.T.get(targetKey);
              const resolved = resolveEdge(edge, picture.geoms);
              return transform && resolved
                ? resolved.pts.map((point) => apply(transform, point))
                : [];
            });
            return points.length > 1
              ? [
                  {
                    points,
                    targetCount: new Set(edges.map((edge) => pieceKeyOf(edge))).size,
                  },
                ]
              : [];
          });
          const collarLike = ['collar', 'stand', 'rib'].includes(role ?? '');
          const anchor = [...candidates].sort(
            (left, right) =>
              Math.abs(input.pieces.get(right)?.geom.areaMm2 ?? 0) -
              Math.abs(input.pieces.get(left)?.geom.areaMm2 ?? 0),
          )[0];
          const cluster = new Set([anchor]);
          for (let changed = true; changed; ) {
            changed = false;
            for (const candidate of candidates) {
              if (cluster.has(candidate)) continue;
              const candidateBox = boxOf(worldRing(input, picture, candidate));
              const touches = [...cluster].some((member) => {
                const memberBox = boxOf(worldRing(input, picture, member));
                const horizontalOverlap =
                  Math.min(candidateBox.x1, memberBox.x1) - Math.max(candidateBox.x0, memberBox.x0);
                const minimumWidth = Math.min(
                  candidateBox.x1 - candidateBox.x0,
                  memberBox.x1 - memberBox.x0,
                );
                const verticalOverlap =
                  Math.min(candidateBox.y1, memberBox.y1) - Math.max(candidateBox.y0, memberBox.y0);
                const minimumHeight = Math.min(
                  candidateBox.y1 - candidateBox.y0,
                  memberBox.y1 - memberBox.y0,
                );
                const horizontalGap = Math.max(
                  candidateBox.x0 - memberBox.x1,
                  memberBox.x0 - candidateBox.x1,
                  0,
                );
                const verticalGap = Math.max(
                  candidateBox.y0 - memberBox.y1,
                  memberBox.y0 - candidateBox.y1,
                  0,
                );
                return (
                  (verticalGap <= 2 && horizontalOverlap >= 0.02 * Math.max(minimumWidth, 1)) ||
                  (horizontalGap <= 2 && verticalOverlap >= 0.02 * Math.max(minimumHeight, 1))
                );
              });
              if (touches) {
                cluster.add(candidate);
                changed = true;
              }
            }
          }
          const semanticCandidates = collarLike ? [...cluster] : candidates;
          const semanticRing = semanticCandidates.flatMap((candidate) =>
            worldRing(input, picture, candidate),
          );
          const semanticBox = boxOf(semanticRing);
          const boxCentre = (semanticBox.x0 + semanticBox.x1) / 2;
          const centreCrown = semanticRing.filter(
            (point) => Math.abs(point[0] - boxCentre) <= 0.2 * (semanticBox.x1 - semanticBox.x0),
          );
          const crownY = Math.max(
            ...(centreCrown.length ? centreCrown : semanticRing).map((point) => point[1]),
          );
          const crown = (centreCrown.length ? centreCrown : semanticRing).filter(
            (point) => point[1] >= crownY - 0.02 * Math.max(semanticBox.y1 - semanticBox.y0, 1),
          );
          const semanticCentre = crown.reduce((best, point) =>
            Math.abs(point[0] - boxCentre) < Math.abs(best[0] - boxCentre) ? point : best,
          )[0];
          const partBox = boxOf(part);
          const partCentre: Pt2 = [(partBox.x0 + partBox.x1) / 2, (partBox.y0 + partBox.y1) / 2];
          const seamTarget = seamTargets
            .filter(() => !collarLike)
            .sort((left, right) => {
              const leftTarget = axisFrame(left.points).midpoint;
              const rightTarget = axisFrame(right.points).midpoint;
              return (
                Math.hypot(partCentre[0] - leftTarget[0], partCentre[1] - leftTarget[1]) -
                Math.hypot(partCentre[0] - rightTarget[0], partCentre[1] - rightTarget[1])
              );
            })[0]?.points;
          const targetEdge =
            seamTarget ??
            (collarLike
              ? ([
                  [semanticCentre - 0.3 * (semanticBox.x1 - semanticBox.x0), crownY],
                  [semanticCentre + 0.3 * (semanticBox.x1 - semanticBox.x0), crownY],
                ] as Pt2[])
              : undefined);
          if (targetEdge?.length > 1) {
            const target = axisFrame(targetEdge);
            const partAxis = axisFrame(part).axis;
            const angle =
              (Math.acos(
                Math.min(1, Math.abs(partAxis[0] * target.axis[0] + partAxis[1] * target.axis[1])),
              ) *
                180) /
              Math.PI;
            const roleCount = [...picture.layout.T.keys()].filter(
              (candidate) => readName(input.pieces.get(candidate)?.geom.name ?? '').role === role,
            ).length;
            if (role !== 'waistband' || roleCount === 1)
              expect
                .soft(
                  Math.abs(
                    (partCentre[0] - target.midpoint[0]) * target.axis[0] +
                      (partCentre[1] - target.midpoint[1]) * target.axis[1],
                  ),
                  `${id} ${operation}: ${role} centred`,
                )
                .toBeLessThanOrEqual((collarLike ? 0.25 : 0.1) * target.span + 1e-6);
            expect.soft(angle, `${id} ${operation}: ${role} axis`).toBeLessThanOrEqual(20);
          }
          if (role !== 'cuff') {
            const height = Math.max(targetBox.y1 - targetBox.y0, 1);
            expect
              .soft(
                (match.contact[1] - targetBox.y0) / height,
                `${id} ${operation}: ${role} neckline`,
              )
              .toBeGreaterThanOrEqual(0.85);
          }
        }
      }
    }
  },
  CORPUS_TEST_TIMEOUT,
);

it('contains no product-specific piece-name regex', () => {
  const source = readFileSync(
    new URL('../components/garment-assembly.ts', import.meta.url),
    'utf8',
  );
  expect(source).not.toMatch(/\/[^/\n]*(?:PCK_|WST_|FLAP_|FRONT_|BACK_)[^/\n]*\/[gimy]*/);
});
