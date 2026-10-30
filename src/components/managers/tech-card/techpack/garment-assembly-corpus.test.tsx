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
import { editorActionMarks, editorOperationPictures } from './pages/assembly';

const ROOT = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/techpack-pdf-v3/data';
const OUT = env.DUMP_DIR ?? 'tmp-dump/corpus';
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

function ringsTouch(a: readonly [number, number][], b: readonly [number, number][]) {
  const distance = 2;
  if (bboxGap(boxOf(a), boxOf(b)) > distance) return false;
  if (pairOverlap(rasterize(a, distance), rasterize(b, distance)) > 0) return true;
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
    120_000,
  );

  it.skipIf(!existsSync(path))(
    'keeps pieces touching, separate, unfilled, and well framed',
    () => {
      const { input, model, pictures } = corpusAt(path);
      for (const [operation, picture] of pictures) {
        const keys = visibleKeys(picture);
        const rings = new Map(keys.map((key) => [key, worldRing(input, picture, key)]));
        if (keys.length > 1)
          for (const key of keys)
            expect(
              keys.some((other) => other !== key && ringsTouch(rings.get(key)!, rings.get(other)!)),
              `${id} ${operation}: loose ${input.pieces.get(key)?.name}`,
            ).toBe(true);
        for (let left = 0; left < keys.length; left++)
          for (let right = left + 1; right < keys.length; right++)
            expect(
              pairOverlap(
                rasterize(rings.get(keys[left])!, 2),
                rasterize(rings.get(keys[right])!, 2),
              ),
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
        expect(fill + 0.01, `${id} ${operation} final fill`).toBeGreaterThanOrEqual(0.6);
      }
    },
    120_000,
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
    120_000,
  );
});

it('keeps every multi-piece corpus picture compact', () => {
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
        .toBeGreaterThanOrEqual(0.35);
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
}, 120_000);

it('keeps every rendered path inside the picture box', () => {
  const pointsOfPath = (path: string) => {
    const points: Pt2[] = [];
    let current: Pt2 = [0, 0];
    for (const command of path.matchAll(/([MLHVZ])([^MLHVZ]*)/gi)) {
      const kind = command[1].toUpperCase();
      const values = [...command[2].matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map(
        (match) => Number(match[0]),
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
}, 120_000);

it('keeps neckline and cuff pieces on their garment edges', () => {
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
        if (!['collar', 'stand', 'rib', 'cuff', 'hemband'].includes(role ?? '')) continue;
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
              const verticalGap = Math.max(
                candidateBox.y0 - memberBox.y1,
                memberBox.y0 - candidateBox.y1,
                0,
              );
              return verticalGap <= 2 && horizontalOverlap >= 0.02 * Math.max(minimumWidth, 1);
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
        const seamTarget = seamTargets
          .filter(() => !collarLike)
          .sort(
            (left, right) => axisFrame(right.points).span - axisFrame(left.points).span,
          )[0]?.points;
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
          const partBox = boxOf(part);
          const partCentre: Pt2 = [(partBox.x0 + partBox.x1) / 2, (partBox.y0 + partBox.y1) / 2];
          const partAxis = axisFrame(part).axis;
          const angle =
            (Math.acos(
              Math.min(1, Math.abs(partAxis[0] * target.axis[0] + partAxis[1] * target.axis[1])),
            ) *
              180) /
            Math.PI;
          expect
            .soft(
              Math.abs(
                (partCentre[0] - target.midpoint[0]) * target.axis[0] +
                  (partCentre[1] - target.midpoint[1]) * target.axis[1],
              ),
              `${id} ${operation}: ${role} centred`,
            )
            .toBeLessThanOrEqual(0.1 * target.span + 1e-6);
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
}, 120_000);

it('contains no product-specific piece-name regex', () => {
  const source = readFileSync(
    new URL('../components/garment-assembly.ts', import.meta.url),
    'utf8',
  );
  expect(source).not.toMatch(/\/[^/\n]*(?:PCK_|WST_|FLAP_|FRONT_|BACK_)[^/\n]*\/[gimy]*/);
});
