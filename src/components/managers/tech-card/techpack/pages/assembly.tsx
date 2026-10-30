// 06 ASSEMBLY — every operation of the card is one row, strictly in operation-number order, each
// with its own picture: a join (sew / overlock) draws its pieces laid along the stored seam edges
// (TechCard.seams on today's DXF), every other op draws the key of its technique next to the
// outline of what it acts on. Rows are measured in the DOM once the print font is in and paginated
// so an operation row never splits.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DataTable, HeaderNote, SectionHeader } from 'ui';

import type { common_TechCard, common_TechCardOperationMedia } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { AnnotationCanvas } from 'components/managers/tech-card/components/annotation-canvas';
import {
  seamGraphOfCard,
  seamRowsOfCard,
} from 'components/managers/tech-card/components/card-seam-graph';
import {
  StepPictureSvg,
  STEP_TILE_RASTER_MM,
  stepPictureOfOp,
  type PictureActionGlyph,
  type PictureActionLine,
  type SceneOp,
  type StepPicture,
} from 'components/managers/tech-card/components/step-seams/step-picture-view';
import { inputGroups } from 'components/managers/tech-card/components/step-seams/step-seams-model';
import {
  boxOf,
  confidentSeam,
  invert,
  stepLayout,
  type StepLayout,
} from 'components/managers/tech-card/components/step-seams/step-picture';
import type { Affine, Pt2 } from 'lib/assembly-skeleton/types';
import { pairOverlap, pieceKeyOf, rasterize, resolveEdge } from 'lib/assembly-skeleton/union';
import { apply, compose, rigid, translate } from 'lib/assembly-skeleton/union/affine';
import { nameTokens, readName } from 'lib/assembly-skeleton/skeleton/model';
import { ROLE_BOOK } from 'lib/assembly-skeleton/skeleton/template';
import { viewerOrigin } from 'utils/viewer-origin';
import {
  annotationFromWire,
  wireInt,
  type AnnotationForm,
} from 'components/managers/tech-card/components/schema';

import { KEYS_CSS, KeyArt, Line, Svg, TURN_KEY } from '../assembly-keys';
import { asmProtoFlags } from '../asm-proto-flags';
import {
  joinSvg,
  shownMetrics,
  silhouetteSvg,
  type AsmAction,
  type AsmRow,
  type AssemblyModel,
  type SeamMetric,
  type Seg,
  type SvgMarkup,
} from '../derive-assembly';
import { gapHref, gapSection, gapSubjects, gapWhere } from '../gap-findings';
import { gapKey, type Gap } from '../gaps';
import { BODY_PX, chunksOf, TechpackSheet } from '../sheet';
import { own, useT, type PdfT } from '../i18n';
const ASM_CSS = String.raw`
.asm-cols { display: grid; min-height: 0; flex: 1 1 0; column-gap: 24px; }
.asm-cols[data-orient=land] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.asm-cols[data-orient=port] { grid-template-columns: minmax(0, 1fr); }
.asm-col { min-width: 0; min-height: 0; overflow: visible; }
.asm-col > div:has(> table.asm-table) { overflow: visible; }
.asm-table { width: 100%; table-layout: fixed; }
.asm-table td { min-width: 0; padding-top: 4px !important; padding-bottom: 4px !important; font-size: 12px !important; line-height: 1.25; white-space: normal; overflow-wrap: anywhere; }
.asm-table th { font-size: 10px !important; }
.asm-mc { color: var(--color-textColor); }
.asm-table td.asm-n { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
.asm-seams { display: flex; min-width: 0; flex-direction: column; gap: 1px; margin-top: 2px; }
.asm-picture-box { position: relative; display: flex; width: 100%; max-width: 100%; flex: none; align-items: center; justify-content: center; }
.asm-picture-box > svg { max-width: 100%; max-height: 100%; }
.asm-picture-key { position: absolute; left: 4px; top: 4px; z-index: 1; background: var(--color-bgColor); }
.asm-pic svg, .asm-table td svg { display: block; flex: none; }
.asm-verb { font-weight: 700; }
.asm-what b { font-weight: 700; }
.asm-params, .asm-machine-params { margin-top: 2px; color: var(--color-labelColor); font-size: 10px; line-height: 1.25; }
.asm-marker { display: inline-block; margin-left: 5px; border: 1px solid var(--color-textColor); padding: 0 3px; color: var(--color-textColor); font-size: 9px; line-height: 1.35; text-transform: lowercase; vertical-align: 1px; }
.asm-turn { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; }
.asm-measure { position: fixed; left: -30000px; top: 0; visibility: hidden; pointer-events: none; }
.asm-measure .asm-col { overflow: visible; }
.asm-photos { display: grid; min-height: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 24px; }
.asm-photos[data-count='1'] { grid-template-columns: minmax(0, 1fr); }
.asm-photo { display: flex; min-width: 0; margin: 0; flex-direction: column; align-self: start; }
.asm-photo-frame { min-height: 0; overflow: hidden; }
.asm-photo-frame > *, .asm-photo-canvas, .asm-photo-canvas [data-annot-frame] { max-width: 100%; }
.asm-photo-caption { flex: none; padding-bottom: 6px; color: var(--color-textColor); font-size: 11px; }
.asm-gaps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; row-gap: 16px; }
.asm-gap-group { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; break-inside: avoid; }
.asm-gap-title { grid-column: 1 / -1; margin-bottom: 4px; color: var(--color-labelColor); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
.asm-gap-line { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--color-hairline); color: var(--color-error); font-size: 11px; line-height: 1.25; text-decoration: none; }
.asm-gap-text { min-width: 0; text-decoration: underline; text-underline-offset: 2px; }
.asm-gap-to { flex: none; color: var(--color-labelColor); font-size: 10px; }
`;

const DIM = {
  land: { n: 40, tool: 96, joinW: 212, joinH: 186, keyW: 40, keyH: 34 },
  port: { n: 48, tool: 130, joinW: 330, joinH: 150, keyW: 40, keyH: 34 },
} as const;

const ROWS_PER_SHEET = 6;
/** DataTable cell padding, both sides (px-1.5 ×2). */
const CELL_PAD_X = 12;

/** Edge letters in the table thumbnails: half the letter box, px. */
const THUMB_BADGE_PX = 5.5;

type Row = AsmRow & {
  pic?: SvgMarkup;
  editorPic?: StepPicture;
  sil?: SvgMarkup | null;
  photoCount: number;
};

type Photo = {
  op: number;
  index: number;
  url: string;
  caption: string;
  annotations: AnnotationForm[];
};

const picturePieceSignature = (keys: Iterable<string>) => [...new Set(keys)].sort().join('\u0000');

const pictureClusterArea = (picture: StepPicture, keys: readonly string[]) =>
  keys.reduce((sum, key) => sum + Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0), 0);

const isLiningPiece = (picture: StepPicture, key: string) => {
  const tokens = nameTokens(picture.geoms.get(key)?.name ?? '');
  return tokens.some((token) => ROLE_BOOK.liningTokens?.includes(token));
};

/** Strict seam components used to discard genuinely unpaired trouser leftovers. */
function connectedPictureClusters(picture: StepPicture): string[][] {
  const keys = [...picture.layout.T.keys()];
  const adjacent = new Map(keys.map((key) => [key, new Set<string>()]));
  const link = (a: string, b: string) => {
    if (a === b || !adjacent.has(a) || !adjacent.has(b)) return;
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  };
  const extent = (key: string) => {
    const transform = picture.layout.T.get(key);
    const geom = picture.geoms.get(key);
    return transform && geom ? boxOf(geom.rs.map((point) => apply(transform, point))) : null;
  };
  const touches = (a: string, b: string) => {
    const transformA = picture.layout.T.get(a);
    const transformB = picture.layout.T.get(b);
    const geomA = picture.geoms.get(a);
    const geomB = picture.geoms.get(b);
    const A = extent(a);
    const B = extent(b);
    if (
      !transformA ||
      !transformB ||
      !geomA ||
      !geomB ||
      !A ||
      !B ||
      Math.max(A.x0 - B.x1, B.x0 - A.x1, A.y0 - B.y1, B.y0 - A.y1, 0) > 2
    )
      return false;
    const left = geomA.rs.map((point) => apply(transformA, point));
    const right = geomB.rs.map((point) => apply(transformB, point));
    return left.some((point) =>
      right.some((other) => Math.hypot(point[0] - other[0], point[1] - other[1]) <= 2),
    );
  };

  for (const seam of picture.frameSeams) {
    if (seam.kind === 'closure-not-seam') continue;
    const sides =
      seam.kind === 'surface' && seam.surface
        ? [[seam.surface.host], [seam.surface.part]]
        : [(seam.aParts ?? [seam.a]).map(pieceKeyOf), (seam.bParts ?? [seam.b]).map(pieceKeyOf)];
    for (const a of sides[0]) for (const b of sides[1]) if (touches(a, b)) link(a, b);
  }

  for (const stack of picture.layout.stacked) for (const key of stack.slice(1)) link(stack[0], key);
  for (const [piece, partner] of picture.layout.pieceLayers) link(piece, partner);
  for (let left = 0; left < keys.length; left++)
    for (let right = left + 1; right < keys.length; right++)
      if (
        touches(keys[left], keys[right]) &&
        [keys[left], keys[right]].some(
          (key) => readName(picture.geoms.get(key)?.name ?? '').role === 'waistband',
        )
      )
        link(keys[left], keys[right]);

  const clusters: string[][] = [];
  const seen = new Set<string>();
  for (const start of keys) {
    if (seen.has(start)) continue;
    const cluster: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.shift()!;
      cluster.push(key);
      for (const next of adjacent.get(key) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    clusters.push(cluster);
  }
  const anchorArea = (cluster: readonly string[]) =>
    Math.max(...cluster.map((key) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0)), 0);
  const anchorShape = (cluster: readonly string[]) =>
    Math.max(
      ...cluster.map((key) => {
        const geom = picture.geoms.get(key);
        if (!geom) return 0;
        const box = boxOf(geom.rs);
        const width = Math.max(box.x1 - box.x0, 1);
        const height = Math.max(box.y1 - box.y0, 1);
        const shell = isLiningPiece(picture, key) ? 0.2 : 1;
        return shell * Math.abs(geom.areaMm2) * (Math.min(width, height) / Math.max(width, height));
      }),
      0,
    );
  return clusters.sort(
    (a, b) =>
      anchorShape(b) - anchorShape(a) ||
      anchorArea(b) - anchorArea(a) ||
      pictureClusterArea(picture, b) - pictureClusterArea(picture, a),
  );
}

/** Sewn bodies in a laid picture, preserving its main body and recovering smaller loose bodies. */
export function editorPictureClusters(picture: StepPicture): string[][] {
  const keys = [...picture.layout.T.keys()];
  const apart = new Set(picture.layout.apart);
  const main = keys.filter((key) => !apart.has(key));
  const loose = keys.filter((key) => apart.has(key));
  const adjacent = new Map(loose.map((key) => [key, new Set<string>()]));
  const link = (a: string, b: string) => {
    if (a === b || !adjacent.has(a) || !adjacent.has(b)) return;
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  };
  for (const seam of picture.frameSeams) {
    if (!confidentSeam(seam)) continue;
    const sides =
      seam.kind === 'surface' && seam.surface
        ? [[seam.surface.host], [seam.surface.part]]
        : [(seam.aParts ?? [seam.a]).map(pieceKeyOf), (seam.bParts ?? [seam.b]).map(pieceKeyOf)];
    for (const a of sides[0]) for (const b of sides[1]) link(a, b);
  }
  const clusters: string[][] = main.length ? [main] : [];
  const seen = new Set<string>();
  for (const start of loose) {
    if (seen.has(start)) continue;
    const cluster: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.shift()!;
      cluster.push(key);
      for (const next of adjacent.get(key) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    clusters.push(cluster);
  }
  return clusters.sort((a, b) => pictureClusterArea(picture, b) - pictureClusterArea(picture, a));
}

function pictureWithClusters(picture: StepPicture, clusters: readonly (readonly string[])[]) {
  const keep = new Set(clusters.flatMap((cluster) => [...cluster]));
  const T = new Map([...picture.layout.T].filter(([key]) => keep.has(key)));
  const points = [...T].flatMap(([key, affine]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(affine, point)),
  );
  if (!points.length) return picture;
  return {
    ...picture,
    layoutLeaves: picture.layoutLeaves
      .map((leaf) => leaf.filter((key) => keep.has(key)))
      .filter((leaf) => leaf.length > 0),
    layout: {
      ...picture.layout,
      T,
      input: new Map([...picture.layout.input].filter(([key]) => keep.has(key))),
      ghosts: picture.layout.ghosts.filter((ghost) => keep.has(ghost.key)),
      stacked: picture.layout.stacked
        .map((stack) => stack.filter((key) => keep.has(key)))
        .filter((stack) => stack.length > 1),
      pieceLayers: picture.layout.pieceLayers.filter(
        ([piece, partner]) => keep.has(piece) && keep.has(partner),
      ),
      onRuns: picture.layout.onRuns.filter((key) => keep.has(key)),
      apart: picture.layout.apart.filter((key) => keep.has(key)),
      bbox: boxOf(points),
    },
  };
}

function focusNonJoinPicture(
  picture: StepPicture,
  action: AsmAction | undefined,
  strict = false,
  preserveStored = false,
): StepPicture {
  const clusters = strict ? connectedPictureClusters(picture) : editorPictureClusters(picture);
  if (!clusters.length) return picture;
  if (clusters.length === 1) return pictureWithClusters(picture, clusters);
  const marks = editorActionMarks(action, picture.geoms);
  const markedPieces = new Set(
    [...marks.lines, ...marks.glyphs]
      .map((mark) => mark.piece)
      .filter((key) => picture.layout.T.has(key)),
  );
  const selected = markedPieces.size
    ? clusters.filter((cluster) => cluster.some((key) => markedPieces.has(key)))
    : strict
      ? clusters.filter((cluster, index) => {
          if (index === 0) return true;
          if (
            pictureClusterArea(picture, cluster) <
            0.45 * pictureClusterArea(picture, clusters[0])
          )
            return false;
          const hands = (keys: readonly string[]) =>
            new Set(
              keys.flatMap((key) => {
                const geom = picture.geoms.get(key);
                const hand = geom?.hand ?? readName(geom?.name ?? '').hand;
                return hand ? [hand] : [];
              }),
            );
          const mainHands = hands(clusters[0]);
          const candidateHands = hands(cluster);
          const mainIsLining = clusters[0].every((key) => isLiningPiece(picture, key));
          const candidateIsLining = cluster.every((key) => isLiningPiece(picture, key));
          return (
            mainIsLining === candidateIsLining &&
            ((mainHands.has('L') && candidateHands.has('R')) ||
              (mainHands.has('R') && candidateHands.has('L')))
          );
        })
      : clusters.slice(0, 1);
  const focused = pictureWithClusters(picture, selected.length ? selected : clusters.slice(0, 1));
  if (
    !strict &&
    markedPieces.size > 0 &&
    focused.layout.T.size > 1 &&
    focused.layout.T.size * 2 < picture.layout.T.size
  )
    return compactFinalPicture(focused, true);
  return strict && !preserveStored ? dockLoosePicture(focused) : focused;
}

const visiblePictureKeys = (picture: StepPicture) => {
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

/** Structural pieces include ones a stored scene mistakenly classified as construction layers. */
const structuralPictureKeys = (picture: StepPicture) => {
  const stacked = new Set(picture.layout.stacked.flatMap((group) => group.slice(1)));
  const layeredInputs = new Set(picture.layout.layers.map(([input]) => input));
  return [...picture.layout.T.keys()].filter(
    (key) =>
      !stacked.has(key) &&
      !layeredInputs.has(picture.layout.input.get(key) ?? -1) &&
      !isLiningPiece(picture, key),
  );
};

/** Preserve an established unit while docking newly added body panels around its outside. */
function separateAddedBodyPieces(picture: StepPicture, preserved: ReadonlySet<string>) {
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const keys = visiblePictureKeys(picture);
  const T = new Map(picture.layout.T);
  const ring = (key: string, transform = T.get(key)!) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
  const overlap = (key: string, transform: Affine, others: readonly string[]) =>
    Math.max(
      ...others.map((other) =>
        pairOverlap(rasterize(ring(key, transform), 2), rasterize(ring(other), 2)),
      ),
      0,
    );
  const attached = (key: string, transform: Affine, others: readonly string[]) => {
    const sample = (points: readonly Pt2[]) => {
      const stride = Math.max(1, Math.floor(points.length / 64));
      return points.filter((_, index) => index % stride === 0);
    };
    const part = sample(ring(key, transform));
    return others.some((other) => {
      const target = sample(ring(other));
      const a = boxOf(part);
      const b = boxOf(target);
      if (Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0) > 2) return false;
      return part.some((point) =>
        target.some(
          (otherPoint) => Math.hypot(point[0] - otherPoint[0], point[1] - otherPoint[1]) <= 2,
        ),
      );
    });
  };
  const placed = keys.filter((key) => preserved.has(key));
  for (const key of keys.filter((candidate) => !preserved.has(candidate))) {
    if (!placed.length) {
      placed.push(key);
      continue;
    }
    const currentPoints = [...placed.flatMap((candidate) => ring(candidate)), ...ring(key)];
    if (
      overlap(key, T.get(key)!, placed) <= 0.15 &&
      attached(key, T.get(key)!, placed) &&
      frameFill(currentPoints) >= 0.59
    ) {
      placed.push(key);
      continue;
    }
    const clusterBox = boxOf(placed.flatMap((candidate) => ring(candidate)));
    const partBox = boxOf(ring(key));
    const directions: Pt2[] =
      reading(key).role === 'sleeve'
        ? [
            [-1, 0],
            [1, 0],
          ]
        : [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
    const candidates = directions.map(([directionX, directionY]) => {
      const dx = directionX
        ? directionX < 0
          ? clusterBox.x0 - partBox.x1
          : clusterBox.x1 - partBox.x0
        : (clusterBox.x0 + clusterBox.x1 - partBox.x0 - partBox.x1) / 2;
      const dy = directionY
        ? directionY < 0
          ? clusterBox.y0 - partBox.y1
          : clusterBox.y1 - partBox.y0
        : (clusterBox.y0 + clusterBox.y1 - partBox.y0 - partBox.y1) / 2;
      let transform = compose(translate(dx, dy), T.get(key)!);
      const sample = (points: readonly Pt2[]) => {
        const stride = Math.max(1, Math.floor(points.length / 96));
        return points.filter((_, index) => index % stride === 0);
      };
      const part = sample(ring(key, transform));
      const target = placed.flatMap((candidate) => sample(ring(candidate)));
      let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
      for (const partPoint of part)
        for (const targetPoint of target) {
          const distance = Math.hypot(partPoint[0] - targetPoint[0], partPoint[1] - targetPoint[1]);
          if (!nearest || distance < nearest.distance)
            nearest = { distance, part: partPoint, target: targetPoint };
        }
      if (nearest)
        transform = compose(
          translate(nearest.target[0] - nearest.part[0], nearest.target[1] - nearest.part[1]),
          transform,
        );
      const extent = Math.max(partBox.x1 - partBox.x0, partBox.y1 - partBox.y0, 1);
      for (let moved = 0; moved <= extent && overlap(key, transform, placed) > 0.145; moved += 1)
        transform = compose(translate(directionX, directionY), transform);
      const points = [...placed.flatMap((candidate) => ring(candidate)), ...ring(key, transform)];
      const box = boxOf(points);
      return {
        transform,
        score:
          overlap(key, transform, placed) * 1e9 -
          frameFill(points) * 1e6 +
          (box.x1 - box.x0) * (box.y1 - box.y0),
      };
    });
    T.set(key, candidates.sort((left, right) => left.score - right.score)[0].transform);
    placed.push(key);
  }
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, bbox: boxOf(points) } };
}

function dockLoosePicture(picture: StepPicture, mode: 'move' | 'layer' = 'move'): StepPicture {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 2) return picture;
  const rings = new Map(
    keys.map((key) => [
      key,
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
    ]),
  );
  const touches = (left: readonly Pt2[], right: readonly Pt2[]) => {
    const a = boxOf(left);
    const b = boxOf(right);
    if (Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0) > 2) return false;
    if (pairOverlap(rasterize(left, 2), rasterize(right, 2)) > 0) return true;
    const grid = new Map<string, Pt2[]>();
    for (const point of right) {
      const cell = `${Math.floor(point[0] / 2)}:${Math.floor(point[1] / 2)}`;
      grid.set(cell, [...(grid.get(cell) ?? []), point]);
    }
    return left.some(([x, y]) => {
      const gx = Math.floor(x / 2);
      const gy = Math.floor(y / 2);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (
            (grid.get(`${gx + dx}:${gy + dy}`) ?? []).some(
              (point) => Math.hypot(x - point[0], y - point[1]) <= 2,
            )
          )
            return true;
      return false;
    });
  };
  const parent = new Map(keys.map((key) => [key, key]));
  const find = (key: string): string => {
    const up = parent.get(key)!;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  for (let left = 0; left < keys.length; left++)
    for (let right = left + 1; right < keys.length; right++)
      if (touches(rings.get(keys[left])!, rings.get(keys[right])!)) join(keys[left], keys[right]);
  const grouped = new Map<string, string[]>();
  for (const key of keys) grouped.set(find(key), [...(grouped.get(find(key)) ?? []), key]);
  const groups = [...grouped.values()].sort((a, b) => {
    const groupArea = (group: readonly string[]) => {
      const box = boxOf(group.flatMap((key) => rings.get(key)!));
      return (box.x1 - box.x0) * (box.y1 - box.y0);
    };
    return groupArea(b) - groupArea(a);
  });
  if (groups.length < 2) return picture;
  if (mode === 'layer') {
    const partner = groups[0][0];
    const existing = new Set(picture.layout.pieceLayers.map(([piece]) => piece));
    const pieceLayers: [string, string][] = [
      ...picture.layout.pieceLayers,
      ...groups
        .slice(1)
        .flat()
        .filter((piece) => !existing.has(piece))
        .map((piece) => [piece, partner] as [string, string]),
    ];
    return { ...picture, layout: { ...picture.layout, pieceLayers } };
  }
  const extrema = (points: readonly Pt2[]) => ({
    left: points.reduce((best, point) => (point[0] < best[0] ? point : best)),
    right: points.reduce((best, point) => (point[0] > best[0] ? point : best)),
    low: points.reduce((best, point) => (point[1] < best[1] ? point : best)),
    high: points.reduce((best, point) => (point[1] > best[1] ? point : best)),
  });
  const moves = new Map<string, Pt2>();
  let placedRings = groups[0].map((key) => rings.get(key)!);
  let placed = placedRings.flat();
  for (const group of groups.slice(1)) {
    const groupRings = group.map((key) => rings.get(key)!);
    const points = groupRings.flat();
    const host = extrema(placed);
    const part = extrema(points);
    const hostBox = boxOf(placed);
    const partBox = boxOf(points);
    const candidates: Pt2[] = [
      [host.right[0] - part.left[0], host.right[1] - part.left[1]],
      [host.left[0] - part.right[0], host.left[1] - part.right[1]],
      [host.high[0] - part.low[0], host.high[1] - part.low[1]],
      [host.low[0] - part.high[0], host.low[1] - part.high[1]],
      [hostBox.x1 - partBox.x0, (hostBox.y0 + hostBox.y1 - partBox.y0 - partBox.y1) / 2],
      [hostBox.x0 - partBox.x1, (hostBox.y0 + hostBox.y1 - partBox.y0 - partBox.y1) / 2],
      [(hostBox.x0 + hostBox.x1 - partBox.x0 - partBox.x1) / 2, hostBox.y1 - partBox.y0],
      [(hostBox.x0 + hostBox.x1 - partBox.x0 - partBox.x1) / 2, hostBox.y0 - partBox.y1],
    ];
    const collar = group.some(
      (key) => readName(picture.geoms.get(key)?.name ?? '').role === 'collar',
    );
    const centre = (hostBox.x0 + hostBox.x1) / 2;
    const neck = placed
      .filter(([x]) => Math.abs(x - centre) <= 0.25 * (hostBox.x1 - hostBox.x0))
      .reduce((best, point) => (point[1] > best[1] ? point : best), host.high);
    const collarLow = points
      .filter(
        ([x]) => Math.abs(x - (partBox.x0 + partBox.x1) / 2) <= 0.35 * (partBox.x1 - partBox.x0),
      )
      .reduce((best, point) => (point[1] < best[1] ? point : best), part.low);
    const touchingCandidates = candidates.filter((delta) =>
      groupRings.some((ring) =>
        placedRings.some((placedRing) =>
          touches(
            ring.map(([x, y]) => [x + delta[0], y + delta[1]] as Pt2),
            placedRing,
          ),
        ),
      ),
    );
    const move = collar
      ? ([neck[0] - collarLow[0], neck[1] - collarLow[1]] as Pt2)
      : touchingCandidates.reduce((best, candidate) => {
          const score = (delta: Pt2) =>
            frameFill([...placed, ...points.map(([x, y]) => [x + delta[0], y + delta[1]] as Pt2)]);
          return score(candidate) > score(best) ? candidate : best;
        });
    for (const key of group) moves.set(key, move);
    placedRings = [
      ...placedRings,
      ...groupRings.map((ring) => ring.map(([x, y]) => [x + move[0], y + move[1]] as Pt2)),
    ];
    placed = placedRings.flat();
  }
  const T = new Map(
    [...picture.layout.T].map(([key, transform]) => {
      const [dx, dy] = moves.get(key) ?? [0, 0];
      return [
        key,
        [
          transform[0],
          transform[1],
          transform[2],
          transform[3],
          transform[4] + dx,
          transform[5] + dy,
        ] as Affine,
      ] as const;
    }),
  );
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, bbox: boxOf(points) } };
}

const frameFill = (points: readonly Pt2[]) => {
  const box = boxOf(points);
  const width = Math.max(box.x1 - box.x0, 1);
  const height = Math.max(box.y1 - box.y0, 1);
  const scale = Math.min(204 / width, 178 / height);
  return (width * scale * height * scale) / (204 * 178);
};

const ringArea = (ring: readonly Pt2[]) =>
  Math.abs(
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );

function convexHull(points: readonly Pt2[]): Pt2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
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
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

const hullCompactness = (rings: readonly (readonly Pt2[])[]) => {
  const hull = convexHull(rings.flat());
  const hullArea = ringArea(hull);
  return hullArea > 0 ? rings.reduce((sum, ring) => sum + ringArea(ring), 0) / hullArea : 1;
};

const ringAspect = (ring: readonly Pt2[]) => {
  const box = boxOf(ring);
  const width = Math.max(box.x1 - box.x0, 1);
  const height = Math.max(box.y1 - box.y0, 1);
  return Math.max(width / height, height / width);
};

const ringsAspect = (rings: readonly (readonly Pt2[])[]) => ringAspect(rings.flat());

/** Reduce a finished sleeved garment to one outer front view, keeping construction layers behind. */
function sleevedFinalPicture(picture: StepPicture): StepPicture | null {
  const visible = structuralPictureKeys(picture);
  const role = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const sleeves = visible.filter((key) => role(key).role === 'sleeve');
  const collars = visible.filter((key) => ['collar', 'stand'].includes(role(key).role ?? ''));
  const bodies = visible.filter(
    (key) =>
      !sleeves.includes(key) &&
      !collars.includes(key) &&
      !['pocket', 'facing', 'placket', 'fly', 'cuff', 'waistband'].includes(role(key).role ?? ''),
  );
  if (sleeves.length < 2 || bodies.length < 2) return null;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const pickPair = (keys: readonly string[]) => {
    const byHand = (hand: 'L' | 'R') =>
      keys.filter((key) => role(key).hand === hand).sort((a, b) => area(b) - area(a))[0];
    const pair = [byHand('L'), byHand('R')].filter((key): key is string => !!key);
    for (const key of [...keys].sort((a, b) => area(b) - area(a))) {
      if (pair.length >= 2) break;
      if (!pair.includes(key)) pair.push(key);
    }
    return pair.slice(0, 2);
  };
  const bodyPair = pickPair(bodies);
  const sleevePair = pickPair(sleeves);
  if (bodyPair.length < 2 || sleevePair.length < 2) return null;
  const bodyLeaders = bodyPair;

  const T = new Map(picture.layout.T);
  const ring = (key: string) => picture.geoms.get(key)?.rs ?? [];
  const place = (key: string, dx: number, dy: number) => T.set(key, [1, 0, 0, 1, dx, dy] as Affine);
  let x = 0;
  for (const key of bodyLeaders) {
    const box = boxOf(ring(key));
    place(key, x - box.x0, -box.y0);
    x += box.x1 - box.x0;
  }
  if (bodyLeaders.length > 1) {
    const leftBody = ring(bodyLeaders[0]).map((point) => apply(T.get(bodyLeaders[0])!, point));
    const rightBody = ring(bodyLeaders[1]).map((point) => apply(T.get(bodyLeaders[1])!, point));
    let bodyContact: { distance: number; left: Pt2; right: Pt2 } | null = null;
    for (const left of leftBody)
      for (const right of rightBody) {
        const distance = Math.hypot(left[0] - right[0], left[1] - right[1]);
        if (!bodyContact || distance < bodyContact.distance)
          bodyContact = { distance, left, right };
      }
    if (bodyContact)
      T.set(
        bodyLeaders[1],
        compose(
          translate(
            bodyContact.left[0] - bodyContact.right[0],
            bodyContact.left[1] - bodyContact.right[1],
          ),
          T.get(bodyLeaders[1])!,
        ),
      );
    const width = Math.max(boxOf(ring(bodyLeaders[1])).x1 - boxOf(ring(bodyLeaders[1])).x0, 1);
    for (let moved = 1; moved <= 0.2 * width; moved += 1) {
      const candidate = compose(translate(-1, 0), T.get(bodyLeaders[1])!);
      const leftRing = ring(bodyLeaders[0]).map((point) => apply(T.get(bodyLeaders[0])!, point));
      const rightRing = ring(bodyLeaders[1]).map((point) => apply(candidate, point));
      if (pairOverlap(rasterize(leftRing, 2), rasterize(rightRing, 2)) > 0.145) break;
      T.set(bodyLeaders[1], candidate);
    }
  }
  const bodyPoints = bodyLeaders.flatMap((key) =>
    ring(key).map((point) => apply(T.get(key)!, point)),
  );
  let bodyBox = boxOf(bodyPoints);
  const [leftSleeve, rightSleeve] = sleevePair;
  const leftBox = boxOf(ring(leftSleeve));
  const rightBox = boxOf(ring(rightSleeve));
  const sameSleeveHand =
    !!role(leftSleeve).hand && role(leftSleeve).hand === role(rightSleeve).hand;
  if (sameSleeveHand)
    T.set(leftSleeve, [-1, 0, 0, 1, bodyBox.x0 + leftBox.x0, bodyBox.y1 - leftBox.y1] as Affine);
  else place(leftSleeve, bodyBox.x0 - leftBox.x1, bodyBox.y1 - leftBox.y1);
  place(rightSleeve, bodyBox.x1 - rightBox.x0, bodyBox.y1 - rightBox.y1);
  const snap = (key: string, hosts: readonly string[]) => {
    const part = ring(key).map((point) => apply(T.get(key)!, point));
    const target = hosts.flatMap((host) => ring(host).map((point) => apply(T.get(host)!, point)));
    let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
    for (const partPoint of part)
      for (const targetPoint of target) {
        const distance = Math.hypot(partPoint[0] - targetPoint[0], partPoint[1] - targetPoint[1]);
        if (!nearest || distance < nearest.distance)
          nearest = { distance, part: partPoint, target: targetPoint };
      }
    if (!nearest) return;
    const transform = T.get(key)!;
    T.set(key, [
      transform[0],
      transform[1],
      transform[2],
      transform[3],
      transform[4] + nearest.target[0] - nearest.part[0],
      transform[5] + nearest.target[1] - nearest.part[1],
    ] as Affine);
  };
  snap(leftSleeve, [bodyLeaders[0]]);
  snap(rightSleeve, [bodyLeaders[bodyLeaders.length - 1]]);
  const insetSleeve = (key: string, host: string, direction: number) => {
    const width = Math.max(boxOf(ring(key)).x1 - boxOf(ring(key)).x0, 1);
    for (let moved = 1; moved <= 0.25 * width; moved += 1) {
      const candidate = compose(translate(direction, 0), T.get(key)!);
      const sleeveRing = ring(key).map((point) => apply(candidate, point));
      const hostRing = ring(host).map((point) => apply(T.get(host)!, point));
      if (pairOverlap(rasterize(sleeveRing, 2), rasterize(hostRing, 2)) > 0.145) break;
      T.set(key, candidate);
    }
  };
  insetSleeve(leftSleeve, bodyLeaders[0], 1);
  insetSleeve(rightSleeve, bodyLeaders[bodyLeaders.length - 1], -1);
  T.set(leftSleeve, compose(translate(0, -2), T.get(leftSleeve)!));
  T.set(rightSleeve, compose(translate(0, -2), T.get(rightSleeve)!));

  const shown = new Set([...bodyLeaders, ...sleevePair]);
  const pieceLayers = picture.layout.pieceLayers.filter(([piece]) => !shown.has(piece));
  const layerOn = (key: string, leaders: readonly string[]) => {
    const hand = role(key).hand;
    const leader = leaders.find((candidate) => hand && role(candidate).hand === hand) ?? leaders[0];
    if (!pieceLayers.some(([piece]) => piece === key)) pieceLayers.push([key, leader]);
  };
  for (const key of bodies) if (!bodyLeaders.includes(key)) layerOn(key, bodyLeaders);
  for (const key of sleeves) if (!sleevePair.includes(key)) layerOn(key, sleevePair);

  const collar = [...collars].sort((a, b) => area(b) - area(a))[0];
  if (collar) {
    for (let index = pieceLayers.length - 1; index >= 0; index--)
      if (pieceLayers[index][0] === collar) pieceLayers.splice(index, 1);
    bodyBox = boxOf([
      ...bodyPoints,
      ...sleevePair.flatMap((key) => ring(key).map((point) => apply(T.get(key)!, point))),
    ]);
    const collarBox = boxOf(ring(collar));
    place(
      collar,
      (bodyBox.x0 + bodyBox.x1 - collarBox.x0 - collarBox.x1) / 2,
      bodyBox.y1 - collarBox.y0,
    );
    snap(collar, bodyLeaders);
    for (const key of collars) if (key !== collar) layerOn(key, [collar]);
  }
  const leaders = new Set([...bodyLeaders, ...sleevePair, ...(collar ? [collar] : [])]);
  for (const key of visible)
    if (!leaders.has(key) && !pieceLayers.some(([piece]) => piece === key))
      layerOn(key, bodyLeaders);
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return {
    ...picture,
    layout: { ...picture.layout, T, pieceLayers, bbox: boxOf(points) },
  };
}

/** Lay an anonymous shirt net as body panels with sleeves at its upper side seams. */
function anonymousShirtPicture(picture: StepPicture): StepPicture | null {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  if (visible.some((key) => reading(key).role === 'sleeve')) return null;
  const knownBodies = visible.filter((key) =>
    ['front', 'back', 'yoke', 'side'].includes(reading(key).role ?? ''),
  );
  const anonymous = visible.filter((key) => !reading(key).role);
  if (!knownBodies.length || anonymous.length < 2) return null;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const anchor = [...knownBodies].sort((left, right) => area(right) - area(left))[0];
  const rawAspect = (key: string) => {
    const box = boxOf(picture.geoms.get(key)?.rs ?? []);
    const width = Math.max(box.x1 - box.x0, 1);
    const height = Math.max(box.y1 - box.y0, 1);
    return Math.max(width / height, height / width);
  };
  const panels = anonymous
    .filter((key) => rawAspect(key) < 1.5)
    .sort((left, right) => area(right) - area(left))
    .slice(0, 2);
  const sleeves = anonymous
    .filter((key) => !panels.includes(key) && rawAspect(key) <= 4.5)
    .sort((left, right) => area(right) - area(left))
    .slice(0, 2);
  if (!sleeves.length) return null;

  const T = new Map(picture.layout.T);
  const rotateQuarter = (key: string) => {
    const points = (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
    const box = boxOf(points);
    const at: Pt2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const quarter: Affine = [0, 1, -1, 0, 0, 0];
    T.set(
      key,
      compose(
        translate(at[0], at[1]),
        compose(quarter, compose(translate(-at[0], -at[1]), T.get(key)!)),
      ),
    );
  };
  const anchorBox = boxOf(
    (picture.geoms.get(anchor)?.rs ?? []).map((point) => apply(T.get(anchor)!, point)),
  );
  if (anchorBox.x1 - anchorBox.x0 > 1.3 * (anchorBox.y1 - anchorBox.y0)) rotateQuarter(anchor);
  for (const key of sleeves) {
    const box = boxOf((picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)));
    if (box.y1 - box.y0 > 1.3 * (box.x1 - box.x0)) rotateQuarter(key);
  }
  const ring = (key: string, transform = T.get(key)!) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
  const shift = (key: string, dx: number, dy: number) =>
    T.set(key, compose(translate(dx, dy), T.get(key)!));
  const snap = (key: string, hosts: readonly string[]) => {
    const part = ring(key);
    const target = hosts.flatMap((host) => ring(host));
    let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
    for (const partPoint of part)
      for (const targetPoint of target) {
        const distance = Math.hypot(partPoint[0] - targetPoint[0], partPoint[1] - targetPoint[1]);
        if (!nearest || distance < nearest.distance)
          nearest = { distance, part: partPoint, target: targetPoint };
      }
    if (nearest)
      shift(key, nearest.target[0] - nearest.part[0], nearest.target[1] - nearest.part[1]);
  };
  const putBeside = (key: string, target: ReturnType<typeof boxOf>, side: 'L' | 'R') => {
    const box = boxOf(ring(key));
    shift(
      key,
      side === 'L' ? target.x0 - box.x1 : target.x1 - box.x0,
      (target.y0 + target.y1 - box.y0 - box.y1) / 2,
    );
  };
  let bodyBox = boxOf(ring(anchor));
  const orderedPanels = [...panels].sort(
    (left, right) =>
      (boxOf(ring(left)).x0 + boxOf(ring(left)).x1) / 2 -
      (boxOf(ring(right)).x0 + boxOf(ring(right)).x1) / 2,
  );
  orderedPanels.forEach((key, index) => {
    putBeside(key, bodyBox, index === 0 ? 'L' : 'R');
    snap(key, [anchor, ...orderedPanels.slice(0, index)]);
    bodyBox = boxOf([
      ...ring(anchor),
      ...orderedPanels.slice(0, index + 1).flatMap((candidate) => ring(candidate)),
    ]);
  });
  const bodyLeaders = [anchor];
  bodyBox = boxOf(bodyLeaders.flatMap((key) => ring(key)));
  const orderedSleeves = [...sleeves].sort(
    (left, right) =>
      (boxOf(ring(left)).x0 + boxOf(ring(left)).x1) / 2 -
      (boxOf(ring(right)).x0 + boxOf(ring(right)).x1) / 2,
  );
  orderedSleeves.forEach((key, index) => {
    const side = index === 0 ? 'L' : 'R';
    const box = boxOf(ring(key));
    shift(
      key,
      side === 'L' ? bodyBox.x0 - box.x1 : bodyBox.x1 - box.x0,
      bodyBox.y1 - 0.1 * (bodyBox.y1 - bodyBox.y0) - box.y1,
    );
    snap(key, bodyLeaders);
  });

  const pieceLayers = [...picture.layout.pieceLayers];
  const hostBox = boxOf(ring(anchor));
  orderedPanels.forEach((key, index) => {
    const box = boxOf(ring(key));
    shift(
      key,
      index === 0 ? hostBox.x0 - box.x0 : hostBox.x1 - box.x1,
      (hostBox.y0 + hostBox.y1 - box.y0 - box.y1) / 2,
    );
    if (!pieceLayers.some(([piece]) => piece === key)) pieceLayers.push([key, anchor]);
  });
  const leaders = new Set([...bodyLeaders, ...panels, ...sleeves]);
  for (const key of visible) {
    if (leaders.has(key)) continue;
    const host = anchor;
    const hostBox = boxOf(ring(host));
    const box = boxOf(ring(key));
    shift(
      key,
      (hostBox.x0 + hostBox.x1 - box.x0 - box.x1) / 2,
      (hostBox.y0 + hostBox.y1 - box.y0 - box.y1) / 2,
    );
    if (!pieceLayers.some(([piece]) => piece === key)) pieceLayers.push([key, host]);
  }
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, pieceLayers, bbox: boxOf(points) } };
}

/** Stored seams still need a front-view silhouette when sleeve units land on opposite corners. */
function sleevedPictureNeedsRepair(picture: StepPicture): boolean {
  const rawVisible = visiblePictureKeys(picture);
  const visible = structuralPictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const rawSleeves = rawVisible.filter((key) => reading(key).role === 'sleeve');
  const rawBodies = rawVisible.filter((key) =>
    ['front', 'back', 'yoke', 'side'].includes(reading(key).role ?? ''),
  );
  if (rawSleeves.length < 2 && rawBodies.length < 2) return false;
  const sleeves = visible.filter((key) => reading(key).role === 'sleeve');
  const bodies = visible.filter((key) => {
    const role = reading(key).role;
    return (
      role !== 'sleeve' &&
      !['collar', 'stand', 'pocket', 'facing', 'placket', 'fly', 'cuff', 'waistband'].includes(
        role ?? '',
      )
    );
  });
  if (sleeves.length < 2 || bodies.length < 2) return false;
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point));
  const bodyBox = boxOf(bodies.flatMap((key) => ring(key)));
  const bodyCentreY = (bodyBox.y0 + bodyBox.y1) / 2;
  const bodyHeight = Math.max(bodyBox.y1 - bodyBox.y0, 1);
  const offsets = sleeves.map((key) => {
    const box = boxOf(ring(key));
    return (box.y0 + box.y1) / 2 - bodyCentreY;
  });
  const sameHand =
    !!reading(sleeves[0]).hand && reading(sleeves[0]).hand === reading(sleeves[1]).hand;
  const hiddenStructural = visible.some((key) => !visiblePictureKeys(picture).includes(key));
  const fragmentedConstruction = visible.length > 6;
  const overlap = [...bodies, ...sleeves].some((key, index, keys) =>
    keys.slice(index + 1).some((other) => {
      const left = rasterize(ring(key), 2);
      const right = rasterize(ring(other), 2);
      return pairOverlap(left, right) > 0.15;
    }),
  );
  const detachedSleeve = sleeves.some((key) => {
    const sample = (points: readonly Pt2[]) => {
      const stride = Math.max(1, Math.floor(points.length / 64));
      return points.filter((_, index) => index % stride === 0);
    };
    const sleeve = sample(ring(key));
    return bodies.every((body) => {
      const target = sample(ring(body));
      return sleeve.every((point) =>
        target.every((other) => Math.hypot(point[0] - other[0], point[1] - other[1]) > 2),
      );
    });
  });
  return (
    sameHand ||
    hiddenStructural ||
    fragmentedConstruction ||
    overlap ||
    detachedSleeve ||
    (offsets.some((offset) => offset > 0.55 * bodyHeight) &&
      offsets.some((offset) => offset < -0.55 * bodyHeight))
  );
}

/** Move only the dangling sleeve units; stored body seam placements remain byte-for-byte intact. */
function repairStoredSleevesPicture(picture: StepPicture): StepPicture {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const sleeves = visible.filter((key) => reading(key).role === 'sleeve');
  const bodies = visible.filter((key) =>
    ['front', 'back', 'yoke', 'side'].includes(reading(key).role ?? ''),
  );
  const T = new Map(picture.layout.T);
  const host = bodies.find((key) => reading(key).role === 'front') ?? bodies[0];
  const ring = (key: string, transform = T.get(key)!) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
  const shift = (key: string, dx: number, dy: number) =>
    T.set(key, compose(translate(dx, dy), T.get(key)!));
  const snap = (key: string) => {
    const part = ring(key);
    const target = host ? ring(host) : [];
    let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
    for (const partPoint of part)
      for (const targetPoint of target) {
        const distance = Math.hypot(partPoint[0] - targetPoint[0], partPoint[1] - targetPoint[1]);
        if (!nearest || distance < nearest.distance)
          nearest = { distance, part: partPoint, target: targetPoint };
      }
    if (nearest)
      shift(key, nearest.target[0] - nearest.part[0], nearest.target[1] - nearest.part[1]);
  };
  const bodyBox = boxOf(host ? ring(host) : bodies.flatMap((key) => ring(key)));
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const groups = new Map<string, string[]>();
  for (const key of sleeves) {
    const hand = reading(key).hand ?? key;
    groups.set(hand, [...(groups.get(hand) ?? []), key]);
  }
  const pieceLayers = [...picture.layout.pieceLayers];
  for (const [hand, group] of groups) {
    const leader = [...group].sort((left, right) => area(right) - area(left))[0];
    const box = boxOf(ring(leader));
    const left =
      hand === 'L' || (hand !== 'R' && (box.x0 + box.x1) / 2 < (bodyBox.x0 + bodyBox.x1) / 2);
    shift(leader, left ? bodyBox.x0 - box.x1 : bodyBox.x1 - box.x0, bodyBox.y1 - box.y1);
    snap(leader);
    if (host) {
      const direction = left ? 1 : -1;
      const width = Math.max(box.x1 - box.x0, 1);
      for (let inset = 0; inset < 0.2 * width; inset += 1) {
        const candidate = compose(translate(direction, 0), T.get(leader)!);
        if (pairOverlap(rasterize(ring(leader, candidate), 2), rasterize(ring(host), 2)) > 0.14)
          break;
        T.set(leader, candidate);
      }
    }
    for (const key of group) {
      if (key === leader) continue;
      if (!pieceLayers.some(([piece]) => piece === key)) pieceLayers.push([key, leader]);
      T.set(key, T.get(leader)!);
    }
  }
  const leaders = new Set([
    ...(host ? [host] : bodies),
    ...[...groups.values()].map(
      (group) => [...group].sort((left, right) => area(right) - area(left))[0],
    ),
    ...visible.filter((key) => ['collar', 'stand', 'rib'].includes(reading(key).role ?? '')),
  ]);
  for (const key of visible)
    if (host && !leaders.has(key) && !pieceLayers.some(([piece]) => piece === key))
      pieceLayers.push([key, host]);
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, pieceLayers, bbox: boxOf(points) } };
}

/** A stored closeout keeps every affine, but no longer redraws loose sleeve/detail units. */
function layerStoredCloseoutPicture(picture: StepPicture): StepPicture | null {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const collars = visible.filter((key) =>
    ['collar', 'stand', 'rib'].includes(reading(key).role ?? ''),
  );
  const sleeves = visible.filter((key) => reading(key).role === 'sleeve');
  const bodies = visible.filter((key) =>
    ['front', 'back', 'yoke', 'side'].includes(reading(key).role ?? ''),
  );
  if (!collars.length || sleeves.length < 2 || bodies.length < 2) return null;
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point));
  const bodyBox = boxOf(bodies.flatMap((key) => ring(key)));
  const centreY = (bodyBox.y0 + bodyBox.y1) / 2;
  const height = Math.max(bodyBox.y1 - bodyBox.y0, 1);
  const offsets = sleeves.map((key) => {
    const box = boxOf(ring(key));
    return (box.y0 + box.y1) / 2 - centreY;
  });
  if (!offsets.every((offset) => offset > 0.55 * height || offset < -0.55 * height)) return null;
  const host = bodies.find((key) => reading(key).role === 'front') ?? bodies[0];
  const pieceLayers = [...picture.layout.pieceLayers];
  const details = visible.filter((key) =>
    ['sleeve', 'cuff', 'placket', 'pocket', 'facing', 'fly'].includes(reading(key).role ?? ''),
  );
  for (const key of details)
    if (!pieceLayers.some(([piece]) => piece === key)) pieceLayers.push([key, host]);
  return { ...picture, layout: { ...picture.layout, pieceLayers } };
}

/** Reduce trouser construction layers to the upright front/back topology used on the worktable. */
function trouserFrontPicture(picture: StepPicture): StepPicture | null {
  const visible = visiblePictureKeys(picture);
  if (visible.length < 2) return null;
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const panels = visible.filter((key) => {
    if (!['front', 'back'].includes(reading(key).role ?? '')) return false;
    const box = boxOf(picture.geoms.get(key)?.rs ?? []);
    return box.y1 - box.y0 >= 1.35 * Math.max(box.x1 - box.x0, 1);
  });
  if (panels.length < 2) return null;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const leaders: string[] = [];
  for (const hand of ['L', 'R'] as const)
    for (const role of ['back', 'front']) {
      const key = panels
        .filter((candidate) => reading(candidate).hand === hand && reading(candidate).role === role)
        .sort((a, b) => area(b) - area(a))[0];
      if (key) leaders.push(key);
    }
  if (leaders.length < 2)
    for (const key of [...panels].sort((a, b) => area(b) - area(a))) {
      if (leaders.length >= Math.min(4, panels.length)) break;
      if (!leaders.includes(key)) leaders.push(key);
    }
  if (leaders.length < 2) return null;

  const T = new Map(picture.layout.T);
  let x = 0;
  let high = -Infinity;
  leaders.forEach((key, index) => {
    const box = boxOf(picture.geoms.get(key)?.rs ?? []);
    T.set(key, translate(x - box.x0, -box.y0));
    if (index > 0) {
      const hostKey = leaders[index - 1];
      const mirroredPair =
        reading(hostKey).role === reading(key).role &&
        !!reading(hostKey).hand &&
        !!reading(key).hand &&
        reading(hostKey).hand !== reading(key).hand;
      if (mirroredPair) {
        const placed = boxOf(
          (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
        );
        x = placed.x1;
        high = Math.max(high, placed.y1);
        return;
      }
      const host = (picture.geoms.get(hostKey)?.rs ?? []).map((point) =>
        apply(T.get(hostKey)!, point),
      );
      const part = (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
      const hostBox = boxOf(host);
      const partBox = boxOf(part);
      const hostEdge = host.filter(
        (point) => point[0] >= hostBox.x1 - 0.1 * Math.max(hostBox.x1 - hostBox.x0, 1),
      );
      const partEdge = part.filter(
        (point) => point[0] <= partBox.x0 + 0.1 * Math.max(partBox.x1 - partBox.x0, 1),
      );
      let nearest: { distance: number; host: Pt2; part: Pt2 } | null = null;
      for (const hostPoint of hostEdge.length ? hostEdge : host)
        for (const partPoint of partEdge.length ? partEdge : part) {
          const distance = Math.hypot(hostPoint[0] - partPoint[0], hostPoint[1] - partPoint[1]);
          if (!nearest || distance < nearest.distance)
            nearest = { distance, host: hostPoint, part: partPoint };
        }
      if (nearest)
        T.set(
          key,
          compose(
            translate(nearest.host[0] - nearest.part[0], nearest.host[1] - nearest.part[1]),
            T.get(key)!,
          ),
        );
    }
    const placed = boxOf(
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
    );
    x = placed.x1;
    high = Math.max(high, placed.y1);
  });
  const pieceLayers = [...picture.layout.pieceLayers];
  const hidden = new Set(pieceLayers.map(([piece]) => piece));
  const hideOn = (key: string, candidates: readonly string[]) => {
    if (hidden.has(key)) return;
    const hand = reading(key).hand;
    const partner =
      candidates.find((candidate) => hand && reading(candidate).hand === hand) ?? candidates[0];
    pieceLayers.push([key, partner]);
    hidden.add(key);
  };
  for (const key of panels) if (!leaders.includes(key)) hideOn(key, leaders);

  const waistbands = visible.filter((key) => reading(key).role === 'waistband');
  const shownWaistbands: string[] = [];
  for (const hand of ['L', 'R'] as const) {
    const leader = waistbands
      .filter((key) => reading(key).hand === hand)
      .sort((left, right) => area(right) - area(left))[0];
    if (leader) shownWaistbands.push(leader);
  }
  if (!shownWaistbands.length && waistbands.length)
    shownWaistbands.push([...waistbands].sort((left, right) => area(right) - area(left))[0]);
  for (const key of waistbands)
    if (!shownWaistbands.includes(key))
      hideOn(key, shownWaistbands.length ? shownWaistbands : leaders);
  let bandX = 0;
  shownWaistbands.forEach((key, index) => {
    const box = boxOf(picture.geoms.get(key)?.rs ?? []);
    T.set(key, translate(bandX - box.x0, high - box.y0));
    const hosts = [...leaders, ...shownWaistbands.slice(0, index)].flatMap((host) =>
      (picture.geoms.get(host)?.rs ?? []).map((point) => apply(T.get(host)!, point)),
    );
    const part = (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
    let nearest: { distance: number; host: Pt2; part: Pt2 } | null = null;
    for (const hostPoint of hosts)
      for (const partPoint of part) {
        const distance = Math.hypot(hostPoint[0] - partPoint[0], hostPoint[1] - partPoint[1]);
        if (!nearest || distance < nearest.distance)
          nearest = { distance, host: hostPoint, part: partPoint };
      }
    if (nearest)
      T.set(
        key,
        compose(
          translate(nearest.host[0] - nearest.part[0], nearest.host[1] - nearest.part[1]),
          T.get(key)!,
        ),
      );
    bandX = boxOf((picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point))).x1;
  });
  for (const key of visible)
    if (!leaders.includes(key) && !waistbands.includes(key)) hideOn(key, leaders);

  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, pieceLayers, bbox: boxOf(points) } };
}

/** Nest the cut layers of a collar unit along one neckline-width run. */
function collarUnitPicture(picture: StepPicture): StepPicture | null {
  const keys = visiblePictureKeys(picture);
  if (
    keys.length < 2 ||
    !keys.every((key) =>
      ['collar', 'stand', 'rib', 'cuff', 'waistband', 'hemband'].includes(
        readName(picture.geoms.get(key)?.name ?? '').role ?? '',
      ),
    )
  )
    return null;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const ordered = [...keys].sort((a, b) => area(b) - area(a));
  const T = new Map(picture.layout.T);
  const roles = new Set(
    ordered.map((key) => readName(picture.geoms.get(key)?.name ?? '').role ?? ''),
  );
  if (roles.size === 1) {
    const leader = ordered[0];
    for (const key of ordered.slice(1)) T.set(key, T.get(leader)!);
    return {
      ...picture,
      layout: {
        ...picture.layout,
        T,
        stacked: [...picture.layout.stacked, ordered],
        bbox: boxOf(picture.geoms.get(leader)?.rs ?? []),
      },
    };
  }
  let previous: ReturnType<typeof boxOf> | null = null;
  for (const key of ordered) {
    const ring = picture.geoms.get(key)?.rs ?? [];
    const current = boxOf(ring);
    if (!previous) T.set(key, translate(-current.x0, -current.y0));
    else {
      const overlap = 0.13 * Math.min(previous.y1 - previous.y0, current.y1 - current.y0);
      T.set(
        key,
        translate(
          (previous.x0 + previous.x1 - current.x0 - current.x1) / 2,
          previous.y1 - current.y0 - overlap,
        ),
      );
    }
    previous = boxOf(ring.map((point) => apply(T.get(key)!, point)));
  }
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...picture, layout: { ...picture.layout, T, bbox: boxOf(points) } };
}

/** Lay repeated side panels on the edges of their compact polygon base. */
function radialBasePicture(picture: StepPicture): StepPicture | null {
  const visible = visiblePictureKeys(picture);
  if (visible.length < 6) return null;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const panels = visible.reduce<string[]>((best, seed) => {
    const seedArea = area(seed);
    const cohort = visible.filter(
      (key) => Math.abs(area(key) - seedArea) <= 0.04 * Math.max(seedArea, 1),
    );
    return cohort.length > best.length ? cohort : best;
  }, []);
  if (panels.length < 6) return null;
  const panelArea = area(panels[0]);
  const base = [...picture.geoms]
    .filter(([key, geom]) => {
      if (panels.includes(key) || geom.edges.length < 6 || geom.edges.length > 12) return false;
      const box = boxOf(geom.rs);
      const width = Math.max(box.x1 - box.x0, 1);
      const height = Math.max(box.y1 - box.y0, 1);
      const ratio = width / height;
      const candidateArea = Math.abs(geom.areaMm2);
      return (
        ratio >= 0.72 &&
        ratio <= 1.38 &&
        candidateArea >= 0.2 * panelArea &&
        candidateArea <= 0.75 * panelArea
      );
    })
    .sort(([, left], [, right]) => right.edges.length - left.edges.length)[0];
  if (!base) return null;
  const [baseKey, baseGeom] = base;
  const baseEdges = [...baseGeom.edges]
    .filter((edge) => edge.pts.length >= 2)
    .sort((left, right) => right.lenMm - left.lenMm)
    .slice(0, Math.min(8, panels.length));
  if (baseEdges.length < 6) return null;

  const T = new Map<string, Affine>([[baseKey, [1, 0, 0, 1, 0, 0]]]);
  const baseCentre: Pt2 = [
    baseGeom.rs.reduce((sum, point) => sum + point[0], 0) / baseGeom.rs.length,
    baseGeom.rs.reduce((sum, point) => sum + point[1], 0) / baseGeom.rs.length,
  ];
  const baseRaster = rasterize(baseGeom.rs, 2);
  baseEdges.forEach((baseEdge, index) => {
    const key = panels[index];
    const geom = picture.geoms.get(key)!;
    const panelEdge = [...geom.edges]
      .filter((edge) => edge.pts.length >= 2)
      .sort(
        (left, right) =>
          Math.abs(left.lenMm - baseEdge.lenMm) - Math.abs(right.lenMm - baseEdge.lenMm),
      )[0];
    if (!panelEdge) return;
    const baseStart = baseEdge.pts[0];
    const baseEnd = baseEdge.pts[baseEdge.pts.length - 1];
    const partStart = panelEdge.pts[0];
    const partEnd = panelEdge.pts[panelEdge.pts.length - 1];
    const candidates = [
      rigid(baseStart, baseEnd, partStart, partEnd, false),
      rigid(baseStart, baseEnd, partStart, partEnd, true),
      rigid(baseEnd, baseStart, partStart, partEnd, false),
      rigid(baseEnd, baseStart, partStart, partEnd, true),
    ];
    const score = (candidate: Affine) => {
      const ring = geom.rs.map((point) => apply(candidate, point));
      const centre: Pt2 = [
        ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
        ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
      ];
      const distance = Math.hypot(centre[0] - baseCentre[0], centre[1] - baseCentre[1]);
      return distance - 1000 * pairOverlap(rasterize(ring, 2), baseRaster);
    };
    T.set(
      key,
      candidates.reduce((best, candidate) => (score(candidate) > score(best) ? candidate : best)),
    );
  });
  if (T.size < 7) return null;
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return {
    ...picture,
    layout: {
      ...picture.layout,
      T,
      input: new Map([...T.keys()].map((key, index) => [key, index])),
      ghosts: [],
      stacked: [],
      layers: [],
      pieceLayers: [],
      apart: [],
      bbox: boxOf(points),
    },
  };
}

/** Collapse construction plies that describe one panel rather than three separate products. */
function panelUnitPicture(picture: StepPicture): StepPicture | null {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 2) return null;
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const repeated = keys
    .flatMap((left, index) =>
      keys.slice(index + 1).map((right) => {
        const leftReading = reading(left);
        const rightReading = reading(right);
        const leftBox = boxOf(picture.geoms.get(left)?.rs ?? []);
        const rightBox = boxOf(picture.geoms.get(right)?.rs ?? []);
        const leftDims = [leftBox.x1 - leftBox.x0, leftBox.y1 - leftBox.y0].sort((a, b) => a - b);
        const rightDims = [rightBox.x1 - rightBox.x0, rightBox.y1 - rightBox.y0].sort(
          (a, b) => a - b,
        );
        const shapeRatio = Math.max(
          leftDims[0] / Math.max(rightDims[0], 1),
          rightDims[0] / Math.max(leftDims[0], 1),
          leftDims[1] / Math.max(rightDims[1], 1),
          rightDims[1] / Math.max(leftDims[1], 1),
        );
        return {
          left,
          right,
          alike:
            !!leftReading.role &&
            leftReading.role === rightReading.role &&
            leftReading.hand === rightReading.hand &&
            Math.min(area(left), area(right)) / Math.max(area(left), area(right), 1) >= 0.9 &&
            shapeRatio <= 1.12,
        };
      }),
    )
    .find((pair) => pair.alike);
  if (repeated) {
    const neighbours = keys.filter((key) => key !== repeated.left && key !== repeated.right);
    const distanceToUnit = (key: string) => {
      if (!neighbours.length) return Infinity;
      const transform = picture.layout.T.get(key)!;
      const sample = (points: readonly Pt2[]) => {
        const stride = Math.max(1, Math.floor(points.length / 96));
        return points.filter((_, index) => index % stride === 0);
      };
      const own = sample(
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
      );
      let best = Infinity;
      for (const other of neighbours) {
        const otherTransform = picture.layout.T.get(other)!;
        const target = sample(
          (picture.geoms.get(other)?.rs ?? []).map((point) => apply(otherTransform, point)),
        );
        for (const point of own)
          for (const otherPoint of target)
            best = Math.min(best, Math.hypot(point[0] - otherPoint[0], point[1] - otherPoint[1]));
      }
      return best;
    };
    const leftDistance = distanceToUnit(repeated.left);
    const rightDistance = distanceToUnit(repeated.right);
    const leader =
      leftDistance !== rightDistance
        ? leftDistance < rightDistance
          ? repeated.left
          : repeated.right
        : area(repeated.left) >= area(repeated.right)
          ? repeated.left
          : repeated.right;
    const follower = leader === repeated.left ? repeated.right : repeated.left;
    const T = new Map(picture.layout.T);
    T.set(follower, T.get(leader)!);
    return {
      ...picture,
      layout: {
        ...picture.layout,
        T,
        stacked: [...picture.layout.stacked, [leader, follower]],
      },
    };
  }
  if (keys.length < 3) return null;
  const roles = new Set(keys.map((key) => reading(key).role));
  const hands = new Set(keys.map((key) => reading(key).hand).filter(Boolean));
  const samePanelRole =
    roles.size === 1 &&
    ['front', 'back', 'side', 'sleeve'].includes([...roles][0] ?? '') &&
    hands.size <= 1;
  const rectangularUnit =
    keys.length <= 5 &&
    [...roles].every((role) => role == null || role === 'waistband') &&
    keys.every((key) => {
      const geom = picture.geoms.get(key)!;
      const box = boxOf(geom.rs);
      const boxArea = Math.max((box.x1 - box.x0) * (box.y1 - box.y0), 1);
      return area(key) / boxArea >= 0.8;
    });
  if (!samePanelRole && !rectangularUnit) return null;
  const ordered = [...keys].sort((left, right) => area(right) - area(left));
  return {
    ...picture,
    layout: {
      ...picture.layout,
      stacked: [...picture.layout.stacked, ordered],
      bbox: boxOf(picture.geoms.get(ordered[0])?.rs ?? []),
    },
  };
}

/** Re-attach named edge treatments by their sewing edge, centred along the receiving edge. */
function restoreEdgeTreatments(
  picture: StepPicture,
  preservedTreatments: ReadonlySet<string> = new Set(),
): StepPicture {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const T = new Map(picture.layout.T);
  const ring = (key: string, transform = T.get(key)!) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
  const move = (key: string, dx: number, dy: number) =>
    T.set(key, compose(translate(dx, dy), T.get(key)!));
  const centre = (points: readonly Pt2[]): Pt2 => [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
  const axisFrame = (points: readonly Pt2[]) => {
    const origin = centre(points);
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
      angle,
      axis,
      midpoint: [
        origin[0] + axis[0] * (low + high) * 0.5,
        origin[1] + axis[1] * (low + high) * 0.5,
      ] as Pt2,
      span: Math.max(high - low, 1),
    };
  };
  const treatmentRoles = new Set(['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband']);
  const treatments = visible.filter((key) => treatmentRoles.has(reading(key).role ?? ''));
  const body = visible.filter((key) => !treatments.includes(key));
  const bodyPoints = body.flatMap((key) => ring(key));
  const bodyCentre = bodyPoints.length ? centre(bodyPoints) : ([0, 0] as Pt2);
  const targetRoles = (role: string | null) =>
    role === 'cuff'
      ? new Set(['sleeve'])
      : role === 'hemband'
        ? new Set(['front', 'back', 'side', 'sleeve'])
        : new Set(['front', 'back', 'yoke', 'side']);
  const seamSides = (key: string) =>
    picture.frameSeams.flatMap((seam) => {
      if (seam.kind === 'surface' || seam.kind === 'closure-not-seam') return [];
      const a = seam.aParts?.length ? seam.aParts : [seam.a];
      const b = seam.bParts?.length ? seam.bParts : [seam.b];
      if (a.some((id) => pieceKeyOf(id) === key)) return [{ own: a, target: b }];
      if (b.some((id) => pieceKeyOf(id) === key)) return [{ own: b, target: a }];
      return [];
    });
  const edgePoints = (ids: readonly string[], onlyKey?: string) =>
    ids.flatMap((id) => {
      const key = pieceKeyOf(id);
      if ((onlyKey && key !== onlyKey) || !T.has(key)) return [];
      const edge = resolveEdge(id, picture.geoms);
      return edge?.pts.map((point) => apply(T.get(key)!, point)) ?? [];
    });
  const align = (key: string) => {
    if (preservedTreatments.has(key)) return true;
    const allowed = targetRoles(reading(key).role);
    const role = reading(key).role;
    const hand = reading(key).hand;
    const receives = (candidate: string) => {
      const target = reading(candidate);
      return allowed.has(target.role ?? '') && (!hand || !target.hand || target.hand === hand);
    };
    const collarLike = ['collar', 'stand', 'rib'].includes(role ?? '');
    const matches = (collarLike ? [] : seamSides(key))
      .map((sides) => ({
        own: edgePoints(sides.own, key),
        target: edgePoints(sides.target.filter((id) => receives(pieceKeyOf(id)))),
      }))
      .filter((match) => match.own.length > 1 && match.target.length > 1)
      .sort((left, right) => axisFrame(right.target).span - axisFrame(left.target).span);
    let sourcePoints: Pt2[];
    let targetPoints: Pt2[];
    let crownTarget = false;
    let connectedTarget = true;
    if (matches.length) {
      sourcePoints = matches[0].own;
      targetPoints = matches[0].target;
    } else {
      const candidates = body.filter(receives);
      if (!candidates.length) return false;
      const area = (candidate: string) => Math.abs(picture.geoms.get(candidate)?.areaMm2 ?? 0);
      const anchor = [...candidates].sort((left, right) => area(right) - area(left))[0];
      const cluster = new Set([anchor]);
      const touchesCluster = (candidate: string) => {
        const candidateBox = boxOf(ring(candidate));
        return [...cluster].some((member) => {
          const memberBox = boxOf(ring(member));
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
      };
      for (let changed = true; changed; ) {
        changed = false;
        for (const candidate of candidates)
          if (!cluster.has(candidate) && touchesCluster(candidate)) {
            cluster.add(candidate);
            changed = true;
          }
      }
      connectedTarget = cluster.size === candidates.length;
      const targetRing = [...cluster].flatMap((candidate) => ring(candidate));
      const targetBox = boxOf(targetRing);
      const sewingEdges = seamSides(key)
        .filter((sides) => sides.target.some((id) => receives(pieceKeyOf(id))))
        .map((sides) => edgePoints(sides.own, key))
        .filter((points) => points.length > 1)
        .sort((left, right) => axisFrame(right).span - axisFrame(left).span);
      sourcePoints = sewingEdges[0] ?? ring(key);
      if (['collar', 'stand', 'rib'].includes(role ?? '')) {
        crownTarget = true;
        const sourceSpan = axisFrame(sourcePoints).span;
        const targetSpan = Math.min(sourceSpan, 0.6 * (targetBox.x1 - targetBox.x0));
        const boxCentre = (targetBox.x0 + targetBox.x1) / 2;
        const centreCrown = targetRing.filter(
          (point) => Math.abs(point[0] - boxCentre) <= 0.2 * (targetBox.x1 - targetBox.x0),
        );
        const y = Math.max(
          ...(centreCrown.length ? centreCrown : targetRing).map((point) => point[1]),
        );
        const crown = (centreCrown.length ? centreCrown : targetRing).filter(
          (point) => point[1] >= y - 0.02 * Math.max(targetBox.y1 - targetBox.y0, 1),
        );
        const x = crown.reduce((best, point) =>
          Math.abs(point[0] - boxCentre) < Math.abs(best[0] - boxCentre) ? point : best,
        )[0];
        targetPoints = [
          [x - targetSpan / 2, y],
          [x + targetSpan / 2, y],
        ];
      } else {
        const height = Math.max(targetBox.y1 - targetBox.y0, 1);
        targetPoints = targetRing.filter((point) => point[1] >= targetBox.y1 - 0.08 * height);
      }
      if (targetPoints.length < 2) return false;
    }
    const source = axisFrame(sourcePoints);
    const target = axisFrame(targetPoints);
    const receivers = body.filter(receives);
    const receiver = receivers.reduce((best, candidate) => {
      const nearest = (piece: string) =>
        Math.min(
          ...ring(piece).map((point) =>
            Math.hypot(point[0] - target.midpoint[0], point[1] - target.midpoint[1]),
          ),
        );
      return nearest(candidate) < nearest(best) ? candidate : best;
    }, receivers[0]);
    const receiverCentre = receiver ? centre(ring(receiver)) : bodyCentre;
    const candidate = (turn: number) => {
      const targetAngle = role === 'waistband' ? 0 : target.angle;
      const angle = targetAngle - source.angle + turn;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const rotation: Affine = [cosine, sine, -sine, cosine, 0, 0];
      return compose(
        translate(target.midpoint[0], target.midpoint[1]),
        compose(
          rotation,
          compose(translate(-source.midpoint[0], -source.midpoint[1]), T.get(key)!),
        ),
      );
    };
    const score = (transform: Affine) => {
      const treatment = ring(key, transform);
      const treatmentRaster = rasterize(treatment, 2);
      const overlap = Math.max(
        ...body.map((candidate) => pairOverlap(treatmentRaster, rasterize(ring(candidate), 2))),
        0,
      );
      const at = centre(treatment);
      return overlap - 0.000001 * Math.hypot(at[0] - bodyCentre[0], at[1] - bodyCentre[1]);
    };
    const forward = candidate(0);
    const reverse = candidate(Math.PI);
    T.set(key, score(forward) <= score(reverse) ? forward : reverse);
    const treatmentBox = boxOf(ring(key));
    const treatmentCentre: Pt2 = [
      (treatmentBox.x0 + treatmentBox.x1) / 2,
      (treatmentBox.y0 + treatmentBox.y1) / 2,
    ];
    const dx = treatmentCentre[0] - target.midpoint[0];
    const dy = treatmentCentre[1] - target.midpoint[1];
    const distance = Math.hypot(dx, dy);
    const allowance = 0.095 * target.span;
    if (distance > allowance)
      move(
        key,
        (-dx * (distance - allowance)) / distance,
        (-dy * (distance - allowance)) / distance,
      );
    const clearSleeves = () => {
      if (!collarLike) return;
      const sleeveGroups = new Map<string, string[]>();
      for (const sleeve of body.filter((candidate) => reading(candidate).role === 'sleeve')) {
        const group = reading(sleeve).hand ?? sleeve;
        sleeveGroups.set(group, [...(sleeveGroups.get(group) ?? []), sleeve]);
      }
      const collarCentreX = () => {
        const box = boxOf(ring(key));
        return (box.x0 + box.x1) / 2;
      };
      for (const group of sleeveGroups.values()) {
        const sleeveBox = boxOf(group.flatMap((sleeve) => ring(sleeve)));
        const direction = (sleeveBox.x0 + sleeveBox.x1) / 2 < collarCentreX() ? -2 : 2;
        const maximum = 0.35 * Math.max(sleeveBox.x1 - sleeveBox.x0, 1);
        for (let shifted = 0; shifted <= maximum; shifted += 2) {
          const collarRaster = rasterize(ring(key), 2);
          const overlap = Math.max(
            ...group.map((sleeve) => pairOverlap(collarRaster, rasterize(ring(sleeve), 2))),
            0,
          );
          if (overlap <= 0.15) break;
          for (const sleeve of group) move(sleeve, direction, 0);
        }
      }
    };
    clearSleeves();
    const outwardX = target.midpoint[0] - receiverCentre[0];
    const outwardY = target.midpoint[1] - receiverCentre[1];
    const outwardLength = Math.hypot(outwardX, outwardY) || 1;
    const ux = crownTarget ? 0 : outwardX / outwardLength;
    const uy = crownTarget ? 1 : outwardY / outwardLength;
    const maxOverlap = () => {
      const treatmentRaster = rasterize(ring(key), 2);
      const obstacles = crownTarget
        ? body.filter((candidate) => reading(candidate).role !== 'sleeve')
        : body;
      return Math.max(
        ...obstacles.map((candidate) =>
          pairOverlap(treatmentRaster, rasterize(ring(candidate), 2)),
        ),
        0,
      );
    };
    const clearance = Math.max(
      boxOf(ring(key)).x1 - boxOf(ring(key)).x0,
      boxOf(ring(key)).y1 - boxOf(ring(key)).y0,
    );
    const allowedOverlap = collarLike ? 0.05 : 0.15;
    for (let offset = 0; maxOverlap() > allowedOverlap && offset < clearance; offset += 1) {
      move(key, ux, uy);
    }
    clearSleeves();
    const finalBox = boxOf(ring(key));
    const finalCentre: Pt2 = [(finalBox.x0 + finalBox.x1) / 2, (finalBox.y0 + finalBox.y1) / 2];
    const along =
      (finalCentre[0] - target.midpoint[0]) * target.axis[0] +
      (finalCentre[1] - target.midpoint[1]) * target.axis[1];
    if (Math.abs(along) > allowance) {
      const correction = along - Math.sign(along) * allowance;
      move(key, -correction * target.axis[0], -correction * target.axis[1]);
    }
    if (collarLike && connectedTarget) {
      let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
      const sample = (points: readonly Pt2[]) => {
        const stride = Math.max(1, Math.floor(points.length / 96));
        return points.filter((_, index) => index % stride === 0);
      };
      for (const point of sample(ring(key)))
        for (const receiverKey of receivers)
          for (const targetPoint of sample(ring(receiverKey))) {
            const distance = Math.hypot(point[0] - targetPoint[0], point[1] - targetPoint[1]);
            if (!nearest || distance < nearest.distance)
              nearest = { distance, part: point, target: targetPoint };
          }
      if (nearest && nearest.distance > 1) {
        const share = (nearest.distance - 1) / nearest.distance;
        move(
          key,
          (nearest.target[0] - nearest.part[0]) * share,
          (nearest.target[1] - nearest.part[1]) * share,
        );
      }
    }
    if (role === 'waistband' && receivers.length) {
      const receiverTop = Math.max(...receivers.map((candidate) => boxOf(ring(candidate)).y1));
      const treatmentBottom = boxOf(ring(key)).y0;
      if (treatmentBottom < receiverTop + 0.01) move(key, 0, receiverTop + 0.01 - treatmentBottom);
      const placedBottom = boxOf(ring(key)).y0;
      const bandPoints = ring(key).filter((point) => point[1] <= placedBottom + 0.5);
      const crownPoints = receivers
        .flatMap((candidate) => ring(candidate))
        .filter((point) => point[1] >= receiverTop - 0.5);
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
      const receiverRings = receivers.map((candidate) => ring(candidate));
      let contactDistance = Infinity;
      for (const point of ring(key))
        for (const receiverRing of receiverRings)
          for (let index = 0; index < receiverRing.length; index++)
            contactDistance = Math.min(
              contactDistance,
              pointSegmentDistance(
                point,
                receiverRing[index],
                receiverRing[(index + 1) % receiverRing.length],
              ),
            );
      let closest: { band: Pt2; crown: Pt2; distance: number } | null = null;
      for (const band of bandPoints)
        for (const crown of crownPoints) {
          const distance = Math.abs(band[0] - crown[0]);
          if (!closest || distance < closest.distance) closest = { band, crown, distance };
        }
      if (contactDistance > 2 && closest) move(key, closest.crown[0] - closest.band[0], 0);
    }
    return true;
  };

  const collarRoles = new Set(['collar', 'stand', 'rib']);
  const collars = treatments.filter((key) => collarRoles.has(reading(key).role ?? ''));
  const collarLeader = [...collars].sort(
    (left, right) =>
      Math.abs(picture.geoms.get(right)?.areaMm2 ?? 0) -
      Math.abs(picture.geoms.get(left)?.areaMm2 ?? 0),
  )[0];
  if (collarLeader) align(collarLeader);
  for (const key of treatments) if (!collars.includes(key)) align(key);
  const placedTreatments: string[] = [];
  for (const key of treatments) {
    if (preservedTreatments.has(key)) {
      placedTreatments.push(key);
      continue;
    }
    const overlapping = placedTreatments.filter(
      (other) => pairOverlap(rasterize(ring(key), 2), rasterize(ring(other), 2)) > 0.15,
    );
    if (overlapping.length) {
      const obstaclePoints = overlapping.flatMap((other) => ring(other));
      const obstacleBox = boxOf(obstaclePoints);
      const partBox = boxOf(ring(key));
      const candidates: Pt2[] = [
        [obstacleBox.x0 - partBox.x1, 0],
        [obstacleBox.x1 - partBox.x0, 0],
        [0, obstacleBox.y0 - partBox.y1],
        [0, obstacleBox.y1 - partBox.y0],
      ];
      const best = candidates
        .map(([dx, dy]) => {
          const moved = ring(key, compose(translate(dx, dy), T.get(key)!));
          const overlap = Math.max(
            ...overlapping.map((other) =>
              pairOverlap(rasterize(moved, 2), rasterize(ring(other), 2)),
            ),
            0,
          );
          const bodyOverlap = Math.max(
            ...body.map((candidate) =>
              pairOverlap(rasterize(moved, 2), rasterize(ring(candidate), 2)),
            ),
            0,
          );
          const frame = boxOf([...bodyPoints, ...obstaclePoints, ...moved]);
          return {
            dx,
            dy,
            score:
              Math.max(overlap, bodyOverlap) * 1e9 + (frame.x1 - frame.x0) * (frame.y1 - frame.y0),
          };
        })
        .sort((left, right) => left.score - right.score)[0];
      move(key, best.dx, best.dy);
    }
    placedTreatments.push(key);
  }

  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const collarStack = collarLeader
    ? [collarLeader, ...collars.filter((key) => key !== collarLeader)]
    : [];
  return {
    ...picture,
    layout: {
      ...picture.layout,
      T,
      stacked:
        collarStack.length > 1 ? [...picture.layout.stacked, collarStack] : picture.layout.stacked,
      bbox: boxOf(points),
    },
  };
}

/** Compact an unstored final result without scaling or rotating any cut piece. */
function compactFinalPicture(
  picture: StepPicture,
  force = false,
  allowSleeved = true,
): StepPicture {
  const keys = visiblePictureKeys(picture);
  if (keys.length < (force ? 2 : 3)) return picture;
  const readings = keys.map((key) => readName(picture.geoms.get(key)?.name ?? ''));
  if (
    !force &&
    readings.some((reading) => reading.role === 'waistband') &&
    readings.some(
      (reading) => ['front', 'back'].includes(reading.role ?? '') && reading.hand === 'L',
    ) &&
    readings.some(
      (reading) => ['front', 'back'].includes(reading.role ?? '') && reading.hand === 'R',
    )
  )
    return picture;
  const sleeved = allowSleeved ? sleevedFinalPicture(picture) : null;
  if (sleeved) return sleeved;
  if (force) {
    const trousers = trouserFrontPicture(picture);
    if (trousers) return trousers;
  }
  const rings = new Map(
    keys.map((key) => [
      key,
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
    ]),
  );
  const current = frameFill([...rings.values()].flat());
  if (!force && current >= 0.6) return picture;
  const collarUnit = collarUnitPicture(picture);
  if (collarUnit) return collarUnit;
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const extrema = (points: readonly Pt2[]) => ({
    left: points.reduce((best, point) => (point[0] < best[0] ? point : best)),
    right: points.reduce((best, point) => (point[0] > best[0] ? point : best)),
    low: points.reduce((best, point) => (point[1] < best[1] ? point : best)),
    high: points.reduce((best, point) => (point[1] > best[1] ? point : best)),
  });
  let best: { quality: number; moves: Map<string, Pt2> } | null = null;
  const largest = Math.max(...keys.map(area), 1);
  const anchors = keys.filter((key) => area(key) >= 0.55 * largest);
  for (const anchor of anchors) {
    const rest = keys.filter((key) => key !== anchor).sort((a, b) => area(b) - area(a));
    const moves = new Map<string, Pt2>([[anchor, [0, 0]]]);
    const placedRings: Pt2[][] = [[...rings.get(anchor)!]];
    for (const key of rest) {
      const placed = placedRings.flat();
      const host = extrema(placed);
      const part = extrema(rings.get(key)!);
      const hostBox = boxOf(placed);
      const partBox = boxOf(rings.get(key)!);
      const contact = Math.max(
        1.9,
        0.12 * Math.min(partBox.x1 - partBox.x0, partBox.y1 - partBox.y0),
      );
      const candidates: Pt2[] = [
        [host.right[0] - part.left[0] + contact, host.right[1] - part.left[1]],
        [host.left[0] - part.right[0] - contact, host.left[1] - part.right[1]],
        [host.high[0] - part.low[0], host.high[1] - part.low[1] + contact],
        [host.low[0] - part.high[0], host.low[1] - part.high[1] - contact],
        [
          hostBox.x1 - partBox.x0 - contact,
          (hostBox.y0 + hostBox.y1 - partBox.y0 - partBox.y1) / 2,
        ],
        [
          hostBox.x0 - partBox.x1 + contact,
          (hostBox.y0 + hostBox.y1 - partBox.y0 - partBox.y1) / 2,
        ],
        [
          (hostBox.x0 + hostBox.x1 - partBox.x0 - partBox.x1) / 2,
          hostBox.y1 - partBox.y0 - contact,
        ],
        [
          (hostBox.x0 + hostBox.x1 - partBox.x0 - partBox.x1) / 2,
          hostBox.y0 - partBox.y1 + contact,
        ],
      ];
      const move = candidates.reduce((winner, candidate) => {
        const score = (delta: Pt2) => {
          const moved = rings.get(key)!.map(([x, y]) => [x + delta[0], y + delta[1]] as Pt2);
          const overlap = placedRings.reduce(
            (worst, ring) => Math.max(worst, pairOverlap(rasterize(moved, 2), rasterize(ring, 2))),
            0,
          );
          const compactness = hullCompactness([...placedRings, moved]);
          const aspect = ringsAspect([...placedRings, moved]);
          return (
            compactness -
            Math.abs(Math.log(aspect / (204 / 178))) * 0.12 -
            Math.max(0, aspect - 4) * 0.25 -
            Math.max(0, overlap - 0.15) * 10
          );
        };
        return score(candidate) > score(winner) ? candidate : winner;
      });
      moves.set(key, move);
      placedRings.push(rings.get(key)!.map(([x, y]) => [x + move[0], y + move[1]] as Pt2));
    }
    const compactness = hullCompactness(placedRings);
    const aspect = ringsAspect(placedRings);
    const quality =
      compactness -
      Math.abs(Math.log(aspect / (204 / 178))) * 0.12 -
      Math.max(0, aspect - 4) * 0.25;
    if (!best || quality > best.quality) best = { quality, moves };
  }
  if (!best) return picture;

  const moveOf = new Map(best.moves);
  for (const stack of picture.layout.stacked)
    for (const follower of stack.slice(1))
      if (moveOf.has(stack[0])) moveOf.set(follower, moveOf.get(stack[0])!);
  for (const [piece, partner] of picture.layout.pieceLayers)
    if (moveOf.has(partner)) moveOf.set(piece, moveOf.get(partner)!);
  for (const [layerInput, partnerInput] of picture.layout.layers) {
    const partner = [...picture.layout.input].find(
      ([key, input]) => input === partnerInput && moveOf.has(key),
    );
    if (!partner) continue;
    for (const [key, input] of picture.layout.input)
      if (input === layerInput) moveOf.set(key, moveOf.get(partner[0])!);
  }
  let T = new Map(
    [...picture.layout.T].map(([key, transform]) => {
      const [dx, dy] = moveOf.get(key) ?? [0, 0];
      return [
        key,
        [
          transform[0],
          transform[1],
          transform[2],
          transform[3],
          transform[4] + dx,
          transform[5] + dy,
        ] as Affine,
      ] as const;
    }),
  );
  let points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const visiblePoints = keys.flatMap((key) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
  );
  const rotatedVisible = visiblePoints.map(([x, y]) => [-y, x] as Pt2);
  if (frameFill(visiblePoints) < 0.6 && frameFill(rotatedVisible) > frameFill(visiblePoints)) {
    T = new Map([...T].map(([key, [a, b, c, d, e, f]]) => [key, [-b, a, -d, c, -f, e] as Affine]));
    points = points.map(([x, y]) => [-y, x] as Pt2);
  }
  return dockLoosePicture({
    ...picture,
    layout: { ...picture.layout, T, bbox: boxOf(points) },
  });
}

/** Reuse the last compact stored-seam silhouette when a trouser closeout expands every layer. */
function storedGarmentFinalPicture(
  final: StepPicture,
  earlier: readonly StepPicture[],
): StepPicture | null {
  const finalKeys = new Set(final.layout.T.keys());
  const finalRoles = visiblePictureKeys(final).map((key) =>
    readName(final.geoms.get(key)?.name ?? ''),
  );
  if (
    !finalRoles.some((reading) => reading.role === 'waistband') ||
    !finalRoles.some((reading) => reading.role === 'front') ||
    !finalRoles.some((reading) => reading.role === 'back')
  )
    return null;

  const source = [...earlier].reverse().find((picture) => {
    const keys = visiblePictureKeys(picture);
    if (keys.length !== 2 || keys.some((key) => !finalKeys.has(key))) return false;
    const roles = keys.map((key) => readName(picture.geoms.get(key)?.name ?? '').role);
    return roles.includes('front') && roles.includes('back');
  });
  if (!source) return null;

  const keys = visiblePictureKeys(source);
  const focused = pictureWithClusters(final, [keys]);
  const T = new Map(
    [...focused.layout.T].map(([key, transform]) => [key, source.layout.T.get(key) ?? transform]),
  );
  const points = [...T].flatMap(([key, transform]) =>
    (focused.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...focused, layout: { ...focused.layout, T, bbox: boxOf(points) } };
}

/** Collapse a repeated-panel net to the latest closed body for the finishing operation. */
function closedPanelFinalPicture(
  final: StepPicture,
  earlier: readonly StepPicture[],
): StepPicture | null {
  const keys = visiblePictureKeys(final);
  if (keys.length < 6) return null;
  const panels = keys.filter((key) => {
    const reading = readName(final.geoms.get(key)?.name ?? '');
    if (reading.role) return false;
    const geom = final.geoms.get(key);
    if (!geom) return false;
    const box = boxOf(geom.rs);
    const width = Math.max(box.x1 - box.x0, 1);
    const height = Math.max(box.y1 - box.y0, 1);
    return Math.max(width, height) / Math.min(width, height) < 5;
  });
  if (panels.length < 6) return null;
  const areas = panels.map((key) => Math.abs(final.geoms.get(key)?.areaMm2 ?? 0));
  if (Math.max(...areas) > 1.1 * Math.max(Math.min(...areas), 1)) return null;

  const source = [...earlier].reverse().find((picture) => {
    const sourceKeys = visiblePictureKeys(picture);
    if (sourceKeys.length !== 1) return false;
    const points = sourceKeys.flatMap((key) =>
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
    );
    return points.length > 2 && frameFill(points) >= 0.6;
  });
  return source ? { ...source, op: final.op, marks: final.marks } : null;
}

const sceneOperations = (techCard: common_TechCard): SceneOp[] =>
  (techCard.techCard?.operations ?? []).map((operation) => ({
    operationNumber: operation.operationNumber,
    operationType: operation.operationType,
    work: operation.work,
    inputKeys: operation.inputKeys ?? [],
    outputUnitKey: operation.outputUnitKey,
    outputUnitName: operation.outputUnitName,
    seamKeys: operation.seamKeys ?? [],
    fullnessRatio: operation.stitching?.fullnessRatio?.value,
  }));

function semanticPieceKeys(
  texts: readonly (string | undefined)[],
  geoms: ReadonlyMap<string, { name: string; areaMm2: number }>,
): string[] {
  for (const text of texts) {
    const wanted = readName(text ?? '');
    if (!wanted.role) continue;
    const matches = [...geoms]
      .filter(([, geom]) => {
        const actual = readName(geom.name);
        return (
          actual.role === wanted.role &&
          (!wanted.hand || !actual.hand || actual.hand === wanted.hand)
        );
      })
      .sort(([, left], [, right]) => Math.abs(right.areaMm2) - Math.abs(left.areaMm2));
    if (matches.length) return matches.slice(0, wanted.hand ? 1 : 2).map(([key]) => key);
  }
  return [];
}

/** Editor scenes for print: joins show their tile; later work shows that join's assembled result. */
export function editorOperationPictures(
  techCard: common_TechCard,
  model: AssemblyModel,
): Map<number, StepPicture> | null {
  try {
    const resolvedCard = model.techCard ?? techCard;
    const hasStoredSeams = !!resolvedCard.seams?.length;
    // A stored seam graph is the editor's source of truth. Keep its established tile/finishing
    // behaviour; the inferred cumulative layout is for DXFs that do not have that graph yet.
    const useInferredLayout = !!model.garment && !hasStoredSeams;
    const graph =
      useInferredLayout && model.garment
        ? model.garment.graph
        : seamGraphOfCard(resolvedCard, model.pieces);
    const geoms = new Map([...model.pieces].map(([key, piece]) => [key, piece.geom]));
    const innerLines = new Map(
      [...model.pieces].map(([key, piece]) => [
        key,
        piece.inner.map((line) => line.map(([x, y]) => [x, -y] as Pt2)),
      ]),
    );
    const pieceKeys = new Set([
      ...geoms.keys(),
      ...(resolvedCard.techCard?.pieces ?? []).flatMap((piece) =>
        piece.lineKey ? [piece.lineKey] : [],
      ),
    ]);
    const byKey = seamRowsOfCard(resolvedCard);
    const names = new Map(
      (resolvedCard.techCard?.pieces ?? []).flatMap((piece) =>
        piece.lineKey ? [[piece.lineKey, piece.name?.trim() || piece.lineKey] as const] : [],
      ),
    );
    const operations = sceneOperations(resolvedCard);
    const joins = new Set(model.rows.filter((row) => row.card).map((row) => row.n));
    const rowByNumber = new Map(model.rows.map((row) => [row.n, row]));
    const pictures = new Map<number, StepPicture>();
    const assembledByUnit = new Map<string, StepLayout>();
    const assembledByPieces = new Map<string, StepPicture>();
    const seamsAt = (number: number) =>
      useInferredLayout && model.garment
        ? model.garment.pairings
            .filter(
              (pairing) => pairing.operationNumber == null || pairing.operationNumber <= number,
            )
            .map((pairing) => pairing.seam)
        : graph.chosen;
    const sceneAt = (operation: SceneOp, index: number) =>
      stepPictureOfOp(operation, graph, geoms, {
        operations,
        index,
        pieceKeys,
        innerLines,
        byKey,
        nameOf: (key) => names.get(key) ?? key,
        explode: useInferredLayout ? 0 : undefined,
      });
    const assembledLayout = (picture: StepPicture, number: number) =>
      stepLayout(
        picture.leaves,
        useInferredLayout ? seamsAt(number) : picture.frameSeams,
        geoms,
        useInferredLayout
          ? {
              explode: 0,
              rasterMm: STEP_TILE_RASTER_MM,
              inputLayouts: picture.groups.map((group) => assembledByUnit.get(group.key)),
              stackIdentical: true,
              joinedOverlap: 0.15,
              honorRanges: true,
              garmentLayout: true,
            }
          : {
              explode: 0,
              rasterMm: STEP_TILE_RASTER_MM,
              joinedOverlap: 0,
              honorRanges: false,
            },
      );

    operations.forEach((operation, index) => {
      const number = operation.operationNumber ?? 0;
      const row = rowByNumber.get(number);
      if (!row) return;
      try {
        if (joins.has(number)) {
          const picture = sceneAt(operation, index);
          const frameSeams = useInferredLayout ? seamsAt(number) : picture.frameSeams;
          const layout = assembledLayout(picture, number);
          if (layout.T.size) {
            const assembled = { ...picture, frameSeams, layoutLeaves: picture.leaves, layout };
            const result = useInferredLayout
              ? focusNonJoinPicture(assembled, undefined, true)
              : assembled;
            pictures.set(number, useInferredLayout ? result : dockLoosePicture(assembled));
            const output = operation.outputUnitKey?.trim();
            if (output) assembledByUnit.set(output, result.layout);
            else if (picture.groups.length === 1)
              assembledByUnit.set(picture.groups[0].key, result.layout);
            if (!useInferredLayout)
              assembledByPieces.set(
                picturePieceSignature(picture.leaves.flatMap((leaf) => leaf)),
                dockLoosePicture({ ...assembled, marks: [] }, 'layer'),
              );
            return;
          }
        }

        const exactTargetKeys = [
          ...new Set([
            ...(model.targets.get(number) ?? []).map((item) => item.p),
            ...inputGroups(operations, index, pieceKeys).flatMap((group) => group.pieces),
            ...(operation.inputKeys ?? []).flatMap((key) => [
              ...(assembledByUnit.get(key)?.T.keys() ?? []),
            ]),
          ]),
        ].filter((key) => geoms.has(key));
        const nextOutputTexts = operations
          .slice(index + 1, index + 3)
          .flatMap((next) => [next.outputUnitKey, next.outputUnitName]);
        const targetKeys = exactTargetKeys.length
          ? exactTargetKeys
          : semanticPieceKeys(
              [
                operation.outputUnitKey,
                operation.outputUnitName,
                ...(operation.inputKeys ?? []).map((key) => names.get(key) ?? key),
                ...nextOutputTexts,
              ],
              geoms,
            );
        if (!targetKeys.length) return;
        if (!useInferredLayout) {
          const assembled = assembledByPieces.get(picturePieceSignature(targetKeys));
          if (assembled) {
            const focused = focusNonJoinPicture(
              { ...assembled, op: operation, marks: [] },
              row.action,
            );
            pictures.set(number, dockLoosePicture(focused, 'layer'));
            return;
          }
        }
        const picture = sceneAt(operation, index);
        const target = new Set(targetKeys);
        const leaves = useInferredLayout
          ? picture.leaves.length
            ? picture.leaves
            : [[...target].filter((key) => geoms.has(key))]
          : picture.leaves
              .map((leaf) => leaf.filter((key) => target.has(key)))
              .filter((leaf) => leaf.length > 0);
        const layoutLeaves = leaves.length ? leaves : [[...target]];
        const inputLayouts = picture.groups.length
          ? picture.groups.map((group) => assembledByUnit.get(group.key))
          : [undefined];
        const layout = stepLayout(
          layoutLeaves,
          useInferredLayout ? seamsAt(number) : picture.innerSeams,
          geoms,
          {
            explode: 0,
            rasterMm: STEP_TILE_RASTER_MM,
            inputLayouts,
            stackIdentical: true,
            joinedOverlap: 0.15,
            honorRanges: true,
            garmentLayout: true,
          },
        );
        if (layout.T.size) {
          const result = {
            ...picture,
            frameSeams: useInferredLayout ? seamsAt(number) : picture.frameSeams,
            marks: [],
            layoutLeaves,
            layout,
          };
          const shown = useInferredLayout
            ? result
            : dockLoosePicture(focusNonJoinPicture(result, row.action), 'layer');
          pictures.set(number, shown);
          const output = operation.outputUnitKey?.trim();
          if (output) assembledByUnit.set(output, shown.layout);
        }
      } catch {
        // One malformed operation falls back to its legacy picture without taking the card down.
      }
    });
    const final = [...pictures.entries()]
      .sort(([left], [right]) => right - left)
      .find(([, picture]) => visiblePictureKeys(picture).length > 2);
    if (final) {
      const earlier = [...pictures]
        .filter(([number]) => number < final[0])
        .sort(([left], [right]) => left - right)
        .map(([, picture]) => picture);
      const closed = useInferredLayout ? closedPanelFinalPicture(final[1], earlier) : null;
      const finished = useInferredLayout
        ? closed ?? compactFinalPicture(final[1])
        : storedGarmentFinalPicture(final[1], earlier);
      if (finished) pictures.set(final[0], finished);
      if (closed) {
        const priorFinal = [...pictures.entries()]
          .filter(([number]) => number < final[0])
          .sort(([left], [right]) => right - left)
          .find(([, picture]) => visiblePictureKeys(picture).length > 2);
        if (priorFinal) pictures.set(priorFinal[0], compactFinalPicture(priorFinal[1]));
      }
    }
    const completeAssemblies = new Set<number>();
    for (const [number, picture] of pictures) {
      const rawKeys = visiblePictureKeys(picture);
      const rawRings = rawKeys.map((key) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
      );
      const rawNeedsCompact = rawRings.length > 1 && hullCompactness(rawRings) < 0.355;
      const rawNeedsAspect =
        rawRings.length > 1 &&
        !rawRings.every((ring) => ringAspect(ring) >= 4) &&
        ringsAspect(rawRings) > 4;
      const hasEdgeTreatments = visiblePictureKeys(picture).some((key) =>
        ['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband'].includes(
          readName(picture.geoms.get(key)?.name ?? '').role ?? '',
        ),
      );
      const needsStructuralRepair = useInferredLayout || rawNeedsCompact || rawNeedsAspect;
      const allowTopologyRepair = useInferredLayout || joins.has(number);
      const anonymous =
        allowTopologyRepair && needsStructuralRepair ? anonymousShirtPicture(picture) : null;
      const shouldRepairSleeves = allowTopologyRepair && sleevedPictureNeedsRepair(picture);
      const storedSleeves = shouldRepairSleeves
        ? sleevedFinalPicture(picture) ?? repairStoredSleevesPicture(picture)
        : null;
      const storedCloseout = storedSleeves ? null : layerStoredCloseoutPicture(picture);
      const radial =
        allowTopologyRepair && needsStructuralRepair ? radialBasePicture(picture) : null;
      const panelTopology = allowTopologyRepair ? trouserFrontPicture(picture) : null;
      const panelRings = panelTopology
        ? visiblePictureKeys(panelTopology).map((key) =>
            (panelTopology.geoms.get(key)?.rs ?? []).map((point) =>
              apply(panelTopology.layout.T.get(key)!, point),
            ),
          )
        : [];
      const rawCompactness = hullCompactness(rawRings);
      const panelGain = panelRings.length
        ? hullCompactness(panelRings) - rawCompactness
        : -Infinity;
      const readings = rawKeys.map((key) => readName(picture.geoms.get(key)?.name ?? ''));
      const hasFrontPair = ['L', 'R'].every((hand) =>
        readings.some((reading) => reading.role === 'front' && reading.hand === hand),
      );
      const hasBack = readings.some((reading) => reading.role === 'back');
      const isBottom = ['trousers', 'bottom', 'jumpsuit'].includes(model.garment?.category ?? '');
      const rotatedLegPanels = rawKeys.filter((key, index) => {
        const reading = readings[index];
        if (!['front', 'back'].includes(reading.role ?? '')) return false;
        const geomBox = boxOf(picture.geoms.get(key)?.rs ?? []);
        const worldBox = boxOf(rawRings[index]);
        return (
          geomBox.y1 - geomBox.y0 > geomBox.x1 - geomBox.x0 &&
          worldBox.x1 - worldBox.x0 > worldBox.y1 - worldBox.y0
        );
      });
      const trouser =
        panelTopology &&
        ((isBottom &&
          ((rawCompactness < 0.6 && (rawNeedsCompact || panelGain > 0.025)) ||
            rotatedLegPanels.length >= 2)) ||
          (!isBottom && hasFrontPair && hasBack && panelGain > 0.08))
          ? panelTopology
          : null;
      const sleeved =
        allowTopologyRepair && needsStructuralRepair && (useInferredLayout || shouldRepairSleeves)
          ? sleevedFinalPicture(picture)
          : null;
      const panelUnit =
        allowTopologyRepair && needsStructuralRepair ? panelUnitPicture(picture) : null;
      let revised =
        anonymous ??
        storedSleeves ??
        storedCloseout ??
        sleeved ??
        radial ??
        trouser ??
        panelUnit ??
        picture;
      if (storedSleeves || sleeved) completeAssemblies.add(number);
      const rings = visiblePictureKeys(revised).map((key) =>
        (revised.geoms.get(key)?.rs ?? []).map((point) => apply(revised.layout.T.get(key)!, point)),
      );
      if (rings.length < 2) {
        const shown = new Set(visiblePictureKeys(revised));
        pictures.set(number, {
          ...revised,
          layout: {
            ...revised.layout,
            apart: completeAssemblies.has(number)
              ? []
              : revised.layout.apart.filter((key) => shown.has(key)),
          },
        });
        continue;
      }
      const needsCompact = hullCompactness(rings) < 0.355;
      const needsAspect = !rings.every((ring) => ringAspect(ring) >= 4) && ringsAspect(rings) > 4;
      const bodyRings = visiblePictureKeys(revised)
        .filter((key) =>
          ['front', 'back', 'yoke', 'side', 'sleeve'].includes(
            readName(revised.geoms.get(key)?.name ?? '').role ?? '',
          ),
        )
        .map((key) =>
          (revised.geoms.get(key)?.rs ?? []).map((point) =>
            apply(revised.layout.T.get(key)!, point),
          ),
        );
      const bodyNeedsAspect =
        bodyRings.length > 1 &&
        !bodyRings.every((ring) => ringAspect(ring) >= 4) &&
        ringsAspect(bodyRings) > 4;
      const needsFinalFrame =
        number === final?.[0] && rings.length > 2 && frameFill(rings.flat()) < 0.59;
      if (
        !anonymous &&
        ((allowTopologyRepair && (needsCompact || needsFinalFrame)) ||
          needsAspect ||
          bodyNeedsAspect)
      )
        revised = compactFinalPicture(revised, true, useInferredLayout || shouldRepairSleeves);
      const restored =
        needsStructuralRepair || hasEdgeTreatments || revised !== picture
          ? restoreEdgeTreatments(revised)
          : revised;
      const docked = hasEdgeTreatments ? dockLoosePicture(restored) : restored;
      const finalPicture = hasEdgeTreatments ? restoreEdgeTreatments(docked) : docked;
      const shown = new Set(visiblePictureKeys(finalPicture));
      pictures.set(number, {
        ...finalPicture,
        layout: {
          ...finalPicture.layout,
          apart: completeAssemblies.has(number)
            ? []
            : finalPicture.layout.apart.filter((key) => shown.has(key)),
        },
      });
    }
    for (const operation of operations) {
      const number = operation.operationNumber ?? 0;
      const row = rowByNumber.get(number);
      if (!row?.action || !['button', 'buttonhole'].includes(row.action.tech)) continue;
      const current = pictures.get(number);
      if (!current || visiblePictureKeys(current).length > 2) continue;
      const action = editorActionMarks(row.action, geoms);
      const marked = new Set([...action.lines, ...action.glyphs].map((mark) => mark.piece));
      const assembled = [...pictures.entries()]
        .filter(([candidate]) => candidate < number)
        .sort(([left], [right]) => right - left)
        .map(([, picture]) => picture)
        .find(
          (picture) =>
            visiblePictureKeys(picture).length > 2 &&
            [...marked].every((key) => picture.layout.T.has(key)) &&
            picture.layout.pieceLayers.some(([piece]) => marked.has(piece)),
        );
      if (marked.size && assembled)
        pictures.set(number, { ...assembled, op: operation, marks: [] });
    }
    for (let index = 1; index < operations.length; index++) {
      const previousOperation = operations[index - 1];
      const operation = operations[index];
      const previousNumber = previousOperation.operationNumber ?? 0;
      const number = operation.operationNumber ?? 0;
      const previous = pictures.get(previousNumber);
      const current = pictures.get(number);
      const inputSignature = (op: SceneOp) =>
        [...new Set((op.inputKeys ?? []).filter(Boolean))].sort().join('\u0000');
      const output = previousOperation.outputUnitKey?.trim();
      const sameAssembly =
        (!!output && (operation.inputKeys ?? []).includes(output)) ||
        (!!inputSignature(operation) &&
          inputSignature(operation) === inputSignature(previousOperation));
      if (!previous || !current || !sameAssembly || rowByNumber.get(number)?.card?.turn) continue;
      const keepsWholeUnit =
        /^(?:attach_label|bind_tape_edge|hem_turned|press_flat|press_final|press_open|topstitch|buttonhole|button_attach)$/i.test(
          operation.work ?? '',
        );
      const bottomFinishing =
        ['trousers', 'bottom', 'jumpsuit'].includes(model.garment?.category ?? '') &&
        /^(?:hem_turned|press_flat|press_final|press_open)$/i.test(operation.work ?? '');
      if (
        !joins.has(number) &&
        keepsWholeUnit &&
        (completeAssemblies.has(previousNumber) ||
          /press_final/i.test(operation.work ?? '') ||
          bottomFinishing)
      ) {
        const currentKeys = visiblePictureKeys(current);
        const fullestPrevious = bottomFinishing
          ? [...pictures.entries()]
              .filter(
                ([candidate, picture]) =>
                  candidate < number && currentKeys.every((key) => picture.layout.T.has(key)),
              )
              .sort(
                ([leftNumber, left], [rightNumber, right]) =>
                  visiblePictureKeys(right).length - visiblePictureKeys(left).length ||
                  rightNumber - leftNumber,
              )[0]?.[1]
          : null;
        pictures.set(number, {
          ...(fullestPrevious ?? previous),
          op: operation,
          marks: current.marks,
        });
        completeAssemblies.add(number);
        continue;
      }
      if (joins.has(number)) continue;
      const previousKeys = visiblePictureKeys(previous);
      const previousTreatments = new Set(
        previousKeys.filter((key) =>
          ['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband'].includes(
            readName(current.geoms.get(key)?.name ?? '').role ?? '',
          ),
        ),
      );
      const prepared = {
        ...current,
        layout: {
          ...current.layout,
          pieceLayers: current.layout.pieceLayers.filter(
            ([piece]) => !previousTreatments.has(piece),
          ),
        },
      };
      const currentKeys = new Set(visiblePictureKeys(prepared));
      const common = previousKeys.filter((key) => currentKeys.has(key));
      if (common.length < 2) continue;
      const anchor = [...common].sort(
        (left, right) =>
          Math.abs(prepared.geoms.get(right)?.areaMm2 ?? 0) -
          Math.abs(prepared.geoms.get(left)?.areaMm2 ?? 0),
      )[0];
      const previousAnchor = previous.layout.T.get(anchor);
      const currentAnchor = prepared.layout.T.get(anchor);
      if (!previousAnchor || !currentAnchor) continue;
      const correction = compose(previousAnchor, invert(currentAnchor));
      const T = new Map(
        [...prepared.layout.T].map(([key, transform]) => [key, compose(correction, transform)]),
      );
      for (const [key, original] of prepared.layout.T) {
        if (common.includes(key)) continue;
        const role = readName(prepared.geoms.get(key)?.name ?? '').role;
        if (!['front', 'back', 'yoke', 'side', 'sleeve'].includes(role ?? '')) continue;
        const corrected = T.get(key)!;
        T.set(key, [
          original[0],
          original[1],
          original[2],
          original[3],
          corrected[4],
          corrected[5],
        ]);
      }
      for (const key of common) {
        const transform = previous.layout.T.get(key);
        if (transform) T.set(key, transform);
      }
      const preserved = new Set(common);
      const points = [...T].flatMap(([key, transform]) =>
        (prepared.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
      );
      const stabilized = separateAddedBodyPieces(
        {
          ...prepared,
          layout: {
            ...prepared.layout,
            T,
            bbox: boxOf(points),
          },
        },
        preserved,
      );
      pictures.set(number, restoreEdgeTreatments(stabilized, preserved));
    }
    return pictures;
  } catch {
    // A malformed pattern still prints through the legacy drawings.
    return null;
  }
}

const decimal = (value: { value?: string } | undefined, fallback: number) => {
  const parsed = Number(value?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Legacy action grammar, expressed in piece coordinates for the editor picture renderer. */
export function editorActionMarks(
  action: AsmAction | undefined,
  geoms: ReadonlyMap<string, { rs: Pt2[] }>,
): { lines: PictureActionLine[]; glyphs: PictureActionGlyph[] } {
  if (!action) return { lines: [], glyphs: [] };
  const lines: PictureActionLine[] = [];
  const closestOutlinePoint = (piece: string, point: Pt2): Pt2 => {
    const ring = geoms.get(piece)?.rs ?? [];
    if (ring.length < 2) return point;
    let closest = ring[0];
    let best = Infinity;
    for (let index = 0; index < ring.length; index++) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length2 = dx * dx + dy * dy;
      const t = length2
        ? Math.max(
            0,
            Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
          )
        : 0;
      const candidate: Pt2 = [start[0] + t * dx, start[1] + t * dy];
      const distance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
      if (distance < best) {
        best = distance;
        closest = candidate;
      }
    }
    return closest;
  };
  const offsetTowardCentre = (piece: string, points: readonly Pt2[], distance: number) => {
    const geom = geoms.get(piece);
    if (!geom) return [...points];
    const b = boxOf(geom.rs);
    const centre: Pt2 = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    return points.map((point): Pt2 => {
      const dx = centre[0] - point[0];
      const dy = centre[1] - point[1];
      const length = Math.hypot(dx, dy) || 1;
      return [point[0] + (dx / length) * distance, point[1] + (dy / length) * distance];
    });
  };
  action.edgeParts.forEach((part, index) => {
    const points = part.pts.map(([x, y]) => closestOutlinePoint(part.piece, [x, -y]));
    if (!points.length) return;
    if (action.tech === 'topstitch') {
      lines.push({
        id: `${action.n}:${index}:topstitch`,
        piece: part.piece,
        points: offsetTowardCentre(part.piece, points, decimal(action.raw.topstitch?.widthMm, 1.5)),
        weight: 'ink',
        dashed: true,
        kind: 'topstitch',
      });
      return;
    }
    if (action.tech === 'pressSide') {
      const weight = 'ink' as const;
      lines.push({
        id: `${action.n}:${index}:press-edge`,
        piece: part.piece,
        points,
        weight,
        kind: 'press-side',
      });
      lines.push({
        id: `${action.n}:${index}:press-offset`,
        piece: part.piece,
        points: offsetTowardCentre(part.piece, points, decimal(action.raw.seamAllowanceMm, 7)),
        weight,
        kind: 'press-side',
      });
      return;
    }
    lines.push({
      id: `${action.n}:${index}:edge`,
      piece: part.piece,
      points,
      weight: 'heavy',
      kind: action.tech,
    });
  });
  const glyphs = action.placements.map((placement): PictureActionGlyph => {
    const radians = (placement.angleDeg * Math.PI) / 180;
    return {
      id: placement.id,
      piece: placement.piece,
      kind: placement.kind,
      point: [placement.point[0], -placement.point[1]],
      direction: [Math.cos(radians), -Math.sin(radians)],
    };
  });
  return { lines, glyphs };
}

function pictureDimensions(orient: PrintOrient) {
  const d = DIM[orient];
  return {
    join: [d.joinW, d.joinH] as [number, number],
    silhouette: [d.joinW, d.joinH] as [number, number],
  };
}

function Cols({ orient }: { orient: PrintOrient }) {
  const d = DIM[orient];
  return (
    <colgroup>
      <col style={{ width: d.n }} />
      <col style={{ width: d.joinW + CELL_PAD_X }} />
      <col />
      <col style={{ width: d.tool }} />
    </colgroup>
  );
}

function Head() {
  const { t } = useT();
  return (
    <thead>
      <tr>
        <th>{t('assembly.op')}</th>
        <th data-align='left'>{t('assembly.picture')}</th>
        <th data-align='left'>{t('assembly.operation')}</th>
        <th data-align='left'>{t('assembly.machineDelta')}</th>
      </tr>
    </thead>
  );
}

/** Δ only from 0.5 mm; a broken seam prints both lengths. */
export function Delta({ metrics }: { metrics: readonly SeamMetric[] }) {
  const { t } = useT();
  const shown = shownMetrics(metrics);
  if (!shown.length) return null;
  return (
    <div className='asm-delta'>
      {shown.map((m) => {
        const right = m.right ?? 0;
        const shorterLeft = m.left <= right;
        const shorterName =
          (shorterLeft ? m.leftMachineName ?? m.leftName : m.rightMachineName ?? m.rightName) ??
          t('assembly.piece');
        const longerName =
          (shorterLeft ? m.rightMachineName ?? m.rightName : m.leftMachineName ?? m.leftName) ??
          t('assembly.piece');
        const shorter = shorterLeft ? m.left : right;
        const longer = shorterLeft ? right : m.left;
        const rawDelta = m.delta ?? 0;
        const roundedDelta = Math.round(Math.abs(rawDelta));
        const delta = m.bad ? -roundedDelta : rawDelta < 0 ? -roundedDelta : roundedDelta;
        const signed = delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`;
        return (
          <div className={`asm-delta-metric${m.bad ? ' asm-delta-bad' : ''}`} key={m.letter}>
            <span className='asm-delta-line'>{t('assembly.deltaMm', { d: signed })}</span>
            {m.bad && (
              <>
                <span className='asm-delta-line'>
                  {shorterName} {Math.round(shorter)}
                </span>
                <span className='asm-delta-line'>
                  {longerName} {Math.round(longer)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Picture({ r, orient }: { r: Row; orient: PrintOrient }) {
  const d = DIM[orient];
  const picture = pictureDimensions(orient);
  const drawing = r.pic ?? r.sil;
  const actionMarks = r.editorPic
    ? editorActionMarks(r.action, r.editorPic.geoms)
    : { lines: [], glyphs: [] };
  const showKey = asmProtoFlags().key;
  return (
    <div className='asm-picture-box' style={{ width: d.joinW, height: d.joinH }}>
      {r.editorPic ? (
        <StepPictureSvg
          w={picture.join[0]}
          h={picture.join[1]}
          pad={4}
          look='print'
          layout={r.editorPic.layout}
          geoms={r.editorPic.geoms}
          innerLines={r.editorPic.innerLines}
          marks={r.editorPic.marks.map((mark) => ({ ...mark, tone: 'stored' }))}
          actionLines={actionMarks.lines}
          actionGlyphs={actionMarks.glyphs}
          className='asm-editor-picture'
        />
      ) : drawing ? (
        <Svg
          m={drawing}
          w={r.pic ? picture.join[0] : picture.silhouette[0]}
          h={r.pic ? picture.join[1] : picture.silhouette[1]}
          label={`${r.n} ${r.words.verb}`}
        />
      ) : null}
      {showKey && <KeyArt icon={r.words.icon} w={d.keyW} h={d.keyH} className='asm-picture-key' />}
    </div>
  );
}

function SegLine({ seg, className }: { seg: Seg; className?: string }) {
  return <div className={className}>{seg.t}</div>;
}

function OpRow({ r, orient }: { r: Row; orient: PrintOrient }) {
  const { t } = useT();
  const w = r.words;
  return (
    <tr data-op={r.n}>
      <td className='asm-n'>{r.n}</td>
      <td data-align='left'>
        <Picture r={r} orient={orient} />
      </td>
      <td data-align='left'>
        <div className='asm-what'>
          <span className='asm-verb'>{w.verb}</span> {w.ins.join(' + ')}
          {w.out && (
            <>
              {' '}
              → <b>{w.out}</b>
            </>
          )}
          {w.draft && <span className='asm-marker'>{t('assembly.draft')}</span>}
          {Array.from({ length: r.photoCount }, (_, index) => (
            <span className='asm-marker' key={index}>
              {t('assembly.photo', { count: index + 1 })}
            </span>
          ))}
        </div>
        <Line segs={w.line.filter((segment) => !segment.gap)} />
        {w.params.length > 0 && <div className='asm-params'>{w.params.join(' · ')}</div>}
        {w.seams.length > 0 && (
          <div className='asm-seams'>
            {w.seams.map((seam) => (
              <div key={seam}>{seam}</div>
            ))}
          </div>
        )}
        {r.card?.turn && (
          <div className='asm-turn'>
            <KeyArt icon={TURN_KEY} w={24} h={18} />
            <span>{t('assembly.turnOut')}</span>
          </div>
        )}
      </td>
      <td data-align='left'>
        {w.tool
          .filter((segment) => !segment.gap)
          .map((t) => (
            <SegLine key={t.t} seg={t} />
          ))}
        {w.mc && <SegLine seg={w.mc} className='asm-mc' />}
        {w.machineParams.length > 0 && (
          <div className='asm-machine-params'>{w.machineParams.join(' · ')}</div>
        )}
        <Delta metrics={r.card?.metrics ?? []} />
      </td>
    </tr>
  );
}

/** A block = one operation row, kept whole during pagination. */
function BlockBody({ r, orient }: { r: Row; orient: PrintOrient }) {
  return (
    <tbody data-block={r.n}>
      <OpRow r={r} orient={orient} />
    </tbody>
  );
}

type Col = Row[];

function Table({ col, orient }: { col: Col; orient: PrintOrient }) {
  return (
    <DataTable className='asm-table'>
      <Cols orient={orient} />
      <Head />
      {col.map((r) => (
        <BlockBody key={r.n} r={r} orient={orient} />
      ))}
    </DataTable>
  );
}

function operationPhotos(techCard: common_TechCard): Photo[] {
  const urls = new Map<number, string>();
  for (const resolved of techCard.resolvedOperationMedia ?? []) {
    const id = wireInt(resolved.media?.id);
    const url =
      resolved.media?.media?.fullSize?.mediaUrl || resolved.media?.media?.thumbnail?.mediaUrl;
    if (id && url) urls.set(id, url);
  }
  return (techCard.techCard?.operations ?? []).flatMap((operation) =>
    (operation.media ?? []).flatMap((media: common_TechCardOperationMedia, index) => {
      const url = urls.get(wireInt(media.mediaId));
      return url
        ? [
            {
              op: operation.operationNumber ?? 0,
              index: index + 1,
              url,
              caption: media.caption?.trim() ?? '',
              annotations: (media.annotations ?? []).map(annotationFromWire),
            },
          ]
        : [];
    }),
  );
}

type GapGroup = { kind: string; gaps: Gap[] };
type GapPage = { groups: GapGroup[] };

function gapPages(gaps: readonly Gap[], orient: PrintOrient, t: PdfT): GapPage[] {
  const perPage = orient === 'land' ? 34 : 48;
  return chunksOf(gaps, perPage).map((pageGaps) => {
    const groups: GapGroup[] = [];
    for (const gap of pageGaps) {
      const kind = gapSection(gap, t);
      const previous = groups[groups.length - 1];
      if (previous?.kind === kind) previous.gaps.push(gap);
      else groups.push({ kind, gaps: [gap] });
    }
    return { groups };
  });
}

function PhotoSheet({
  photos,
  orient,
  docline,
  count,
  pieceLabel,
}: {
  photos: Photo[];
  orient: PrintOrient;
  docline: string;
  count: string;
  pieceLabel: (key: string) => string | undefined;
}) {
  const { t } = useT();
  return (
    <TechpackSheet orient={orient} docline={docline} count={count}>
      <SectionHeader
        title={t('assembly.photosTitle')}
        action={<HeaderNote>{t('common.photos', { count: photos.length })}</HeaderNote>}
      />
      <div className='asm-photos' data-count={photos.length} data-assembly-page='photos'>
        {photos.map((photo) => (
          <figure className='asm-photo' data-photo-op={photo.op} key={`${photo.op}-${photo.index}`}>
            <figcaption className='asm-photo-caption'>
              {t('assembly.photoCaption', { op: photo.op, index: photo.index })}
              {photo.caption ? ` · ${own(photo.caption)}` : ''}
            </figcaption>
            <div className='asm-photo-frame'>
              <AnnotationCanvas
                src={photo.url}
                alt={t('assembly.operationAlt', { op: photo.op })}
                annotations={photo.annotations}
                className='asm-photo-canvas'
                maxHeightClass='max-h-[120mm]'
                pieceLabel={pieceLabel}
                frozen
              />
            </div>
          </figure>
        ))}
      </div>
    </TechpackSheet>
  );
}

function GapsSheet({
  page,
  orient,
  docline,
  count,
  subjectOf,
  techCard,
  cardId,
}: {
  page: GapPage;
  orient: PrintOrient;
  docline: string;
  count: string;
  subjectOf: (gap: Gap) => string;
  techCard: common_TechCard;
  /** The card the lines link back to; a card not saved yet prints plain lines. */
  cardId?: number;
}) {
  const { t } = useT();
  const origin = viewerOrigin();
  return (
    <TechpackSheet orient={orient} docline={docline} count={count}>
      <SectionHeader title={t('assembly.gapsTitle')} />
      <div className='asm-gaps' data-assembly-page='gaps'>
        {page.groups.map((group, groupIndex) => (
          <div className='asm-gap-group' key={`${group.kind}-${groupIndex}`}>
            <div className='asm-gap-title'>{group.kind}</div>
            {group.gaps.map((gap) => {
              const subject = subjectOf(gap);
              const text = `${gap.target.op ? `${t('assembly.op')} ${gap.target.op} · ` : ''}${gap.label}${subject ? ` · ${own(subject)}` : ''}`;
              if (!cardId)
                return (
                  <div className='asm-gap-line' data-gap-list-row={gapKey(gap)} key={gapKey(gap)}>
                    <span className='asm-gap-text'>{text}</span>
                  </div>
                );
              return (
                <a
                  className='asm-gap-line'
                  data-gap-list-row={gapKey(gap)}
                  key={gapKey(gap)}
                  href={gapHref(gap.target, cardId, origin)}
                  target='_blank'
                  rel='noreferrer'
                >
                  <span className='asm-gap-text'>{text}</span>
                  <span className='asm-gap-to'>{gapWhere(gap.target, t, techCard)}</span>
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </TechpackSheet>
  );
}

export function AssemblyPage({
  techCard,
  orient,
  docline,
  n,
  model,
  pdfGaps = model?.gaps ?? [],
  onLaidOut,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  /** null while the pattern geometry is still loading. */
  model: AssemblyModel | null;
  /** The exact ordered source consumed by the construction audit. */
  pdfGaps: readonly Gap[];
  /** true once the rows are measured and paginated (the print-ready gate waits for it). */
  onLaidOut: (done: boolean) => void;
}) {
  const { t } = useT();
  const picture = useMemo(() => pictureDimensions(orient), [orient]);
  const photos = useMemo(() => operationPhotos(techCard), [techCard]);
  const photoSheets = useMemo(() => chunksOf(photos, 2), [photos]);
  const subjectOf = useMemo(() => gapSubjects(techCard), [techCard]);
  const photoCountByOp = useMemo(() => {
    const counts = new Map<number, number>();
    for (const photo of photos) counts.set(photo.op, (counts.get(photo.op) ?? 0) + 1);
    return counts;
  }, [photos]);
  const pictureMode = asmProtoFlags().pic;
  const editorPictures = useMemo(
    () => (pictureMode === 'editor' && model ? editorOperationPictures(techCard, model) : null),
    [pictureMode, model, techCard],
  );
  const rows = useMemo<Row[]>(
    () =>
      (model?.rows ?? []).map((r) => {
        const editorPic = editorPictures?.get(r.n);
        return {
          ...r,
          editorPic,
          pic:
            !editorPic && r.card?.items.length
              ? joinSvg(model!, r.card, true, picture.join, THUMB_BADGE_PX)
              : undefined,
          sil:
            r.card || editorPic
              ? null
              : silhouetteSvg(model!, r.target, picture.silhouette, r.action),
          photoCount: photoCountByOp.get(r.n) ?? 0,
        };
      }),
    [model, editorPictures, photoCountByOp, picture.join, picture.silhouette],
  );
  const [laid, setLaid] = useState<{ rows: Row[]; cols: Col[] } | null>(null);
  const cols = laid?.rows === rows ? laid.cols : null;
  const probe = useRef<HTMLDivElement>(null);

  // measure once FeatureMono is in (fallback-font heights would mis-paginate)
  useEffect(() => {
    if (!rows.length) return;
    let live = true;
    document.fonts.ready.then(() => {
      const root = probe.current;
      if (!live || !root) return;
      const cap = (root.querySelector<HTMLElement>('.asm-col')?.clientHeight ?? 0) - 2;
      const head = root.querySelector<HTMLElement>('thead')?.getBoundingClientRect().height ?? 0;
      const hs = rows.map(
        (r) =>
          root.querySelector<HTMLElement>(`tbody[data-block="${r.n}"]`)?.getBoundingClientRect()
            .height ?? 0,
      );
      let out: Col[] = [];
      let cur: Col | null = null;
      let used = 0;
      const perSheet = orient === 'land' ? 2 : 1;
      const rowsPerColumn = ROWS_PER_SHEET / perSheet;
      rows.forEach((r, i) => {
        if (!cur || cur.length >= rowsPerColumn || used + hs[i] > cap) {
          cur = [];
          out.push(cur);
          used = head;
        }
        cur.push(r);
        used += hs[i];
      });
      const balancedColumnCount = Math.ceil(out.length / perSheet) * perSheet;
      if (balancedColumnCount > 1) {
        const base = Math.floor(rows.length / balancedColumnCount);
        const extra = rows.length % balancedColumnCount;
        let at = 0;
        const balanced = Array.from({ length: balancedColumnCount }, (_, index) => {
          const size = base + (index < extra ? 1 : 0);
          const col = rows.slice(at, at + size);
          at += size;
          return col;
        });
        const height = new Map(rows.map((row, index) => [row, hs[index]]));
        if (
          balanced.every(
            (col) => head + col.reduce((sum, row) => sum + (height.get(row) ?? 0), 0) <= cap,
          )
        )
          out = balanced;
      }
      setLaid({ rows, cols: out });
    });
    return () => {
      live = false;
    };
  }, [orient, rows]);

  const done = !!model && (!rows.length || !!cols);
  useLayoutEffect(() => {
    onLaidOut(done);
  }, [done, onLaidOut]);

  if (!model) return null;
  const title = `${n} ${t('assembly.title')}`;

  const per = orient === 'land' ? 2 : 1;
  const pages: Col[][] = [];
  if (cols) for (let i = 0; i < cols.length; i += per) pages.push(cols.slice(i, i + per));
  const gaps = gapPages(pdfGaps, orient, t);
  const total = Math.max(1, pages.length + photoSheets.length + gaps.length);
  const pieceLabel = (key: string) =>
    model.pieces.get(key)?.name ||
    techCard.techCard?.pieces?.find((piece) => piece.lineKey === key)?.name ||
    undefined;

  return (
    <>
      <style>{KEYS_CSS + ASM_CSS}</style>
      {rows.length > 0 && !cols && (
        <div
          ref={probe}
          className='asm-measure'
          style={{ width: BODY_PX[orient].w + 90, height: BODY_PX[orient].h + 106 }}
        >
          <div className='tp-body'>
            <SectionHeader title={title} action={<HeaderNote>0</HeaderNote>} />
            <div className='asm-cols' data-orient={orient}>
              <div className='asm-col'>
                <Table col={rows} orient={orient} />
              </div>
            </div>
          </div>
        </div>
      )}
      {pages.map((pg, pageIndex) => {
        const first = pg[0][0].n;
        const lastCol = pg[pg.length - 1];
        const last = lastCol[lastCol.length - 1].n;
        return (
          <TechpackSheet
            key={first}
            orient={orient}
            docline={docline}
            count={`${pageIndex + 1} / ${total}`}
          >
            <SectionHeader
              title={title}
              action={
                <HeaderNote>
                  {t('assembly.opsRange', { first, last, count: rows.length })}
                </HeaderNote>
              }
            />
            <div className='asm-cols' data-orient={orient} data-assembly-page='operations'>
              {Array.from({ length: per }, (_, i) => (
                <div key={i} className='asm-col'>
                  {pg[i] && <Table col={pg[i]} orient={orient} />}
                </div>
              ))}
            </div>
          </TechpackSheet>
        );
      })}
      {photoSheets.map((sheetPhotos, index) => (
        <PhotoSheet
          key={sheetPhotos.map((photo) => `${photo.op}-${photo.index}`).join('-')}
          photos={sheetPhotos}
          orient={orient}
          docline={docline}
          count={`${pages.length + index + 1} / ${total}`}
          pieceLabel={pieceLabel}
        />
      ))}
      {gaps.map((page, index) => (
        <GapsSheet
          key={`gaps-${index}`}
          page={page}
          orient={orient}
          docline={docline}
          count={`${pages.length + photoSheets.length + index + 1} / ${total}`}
          subjectOf={subjectOf}
          techCard={techCard}
          cardId={techCard.id}
        />
      ))}
      {!rows.length && !photos.length && !gaps.length && (
        <TechpackSheet orient={orient} docline={docline} count='1 / 1'>
          <SectionHeader title={title} />
        </TechpackSheet>
      )}
    </>
  );
}
