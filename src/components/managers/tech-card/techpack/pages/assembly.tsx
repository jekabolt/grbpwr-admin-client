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

const sameCutGeometry = (picture: StepPicture, left: string, right: string) => {
  const a = picture.geoms.get(left);
  const b = picture.geoms.get(right);
  if (!a || !b) return false;
  if (
    a.twinOf.some((twin) => twin.key === right && twin.kind === 'identical') ||
    b.twinOf.some((twin) => twin.key === left && twin.kind === 'identical')
  )
    return true;
  const aBox = boxOf(a.rs);
  const bBox = boxOf(b.rs);
  const near = (first: number, second: number) =>
    Math.abs(first - second) <= 0.01 * Math.max(Math.abs(first), Math.abs(second), 1);
  return (
    near(Math.abs(a.areaMm2), Math.abs(b.areaMm2)) &&
    near(aBox.x1 - aBox.x0, bBox.x1 - bBox.x0) &&
    near(aBox.y1 - aBox.y0, bBox.y1 - bBox.y0)
  );
};

const identicalCutFamilyCache = new WeakMap<object, Map<string, string[]>>();

const identicalCutFamily = (picture: StepPicture, seed: string) => {
  let byPiece = identicalCutFamilyCache.get(picture.geoms);
  if (!byPiece) {
    byPiece = new Map();
    identicalCutFamilyCache.set(picture.geoms, byPiece);
  }
  const cached = byPiece.get(seed);
  if (cached) return cached;
  const family = new Set([seed]);
  const pending = [seed];
  while (pending.length) {
    const key = pending.pop()!;
    for (const [candidate, geom] of picture.geoms) {
      if (family.has(candidate)) continue;
      const direct = picture.geoms
        .get(key)
        ?.twinOf.some((twin) => twin.key === candidate && twin.kind === 'identical');
      const reverse = geom.twinOf.some((twin) => twin.key === key && twin.kind === 'identical');
      if (!direct && !reverse) continue;
      family.add(candidate);
      pending.push(candidate);
    }
  }
  const resolved = [...family];
  for (const key of resolved) byPiece.set(key, resolved);
  return resolved;
};

/** An explicitly named inner copy of the same outer cut piece is a construction layer. */
const isInteriorDuplicate = (picture: StepPicture, key: string) => {
  const geom = picture.geoms.get(key);
  if (!geom || !nameTokens(geom.name).includes('inner')) return false;
  if (identicalCutFamily(picture, key).length >= 3) return false;
  const reading = readName(geom.name);
  return [...picture.geoms].some(([candidate, other]) => {
    const otherReading = readName(other.name);
    return (
      candidate !== key &&
      nameTokens(other.name).includes('outer') &&
      reading.family === otherReading.family &&
      sameCutGeometry(picture, key, candidate)
    );
  });
};

const isLiningPiece = (picture: StepPicture, key: string) => {
  const tokens = nameTokens(picture.geoms.get(key)?.name ?? '');
  return (
    tokens.some((token) => ROLE_BOOK.liningTokens?.includes(token)) ||
    isInteriorDuplicate(picture, key)
  );
};

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

const seamPieceSides = (seam: StepPicture['frameSeams'][number]): [string[], string[]] =>
  seam.kind === 'surface' && seam.surface
    ? [[seam.surface.host], [seam.surface.part]]
    : [(seam.aParts ?? [seam.a]).map(pieceKeyOf), (seam.bParts ?? [seam.b]).map(pieceKeyOf)];

/** A stored or derived sewing decision, not a merely plausible residual candidate. */
const sewnPairing = (seam: StepPicture['frameSeams'][number]) =>
  confidentSeam(seam) || (!!seam.sewn && seam.score >= 0.9);

/** B3 layers that deliberately represent construction inside their finished host. */
function explicitConstructionLayer(picture: StepPicture, piece: string, host?: string): boolean {
  const reading = readName(picture.geoms.get(piece)?.name ?? '');
  if (
    isLiningPiece(picture, piece) ||
    ['pocket', 'facing', 'placket', 'fly'].includes(reading.role ?? '')
  )
    return true;
  if (!host) return false;
  const hostReading = readName(picture.geoms.get(host)?.name ?? '');
  const area = Math.abs(picture.geoms.get(piece)?.areaMm2 ?? 0);
  const hostArea = Math.abs(picture.geoms.get(host)?.areaMm2 ?? 0);
  return (
    !!reading.role &&
    reading.role === hostReading.role &&
    reading.family === hostReading.family &&
    reading.hand === hostReading.hand &&
    hostArea >= 3 * area
  );
}

/** Dominant sewn-and-touching cluster, captured before completeness normalization moves loose units. */
function dominantSeamCluster(picture: StepPicture): string[] {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 2) return keys;
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point));
  const touches = (left: readonly Pt2[], right: readonly Pt2[]) => {
    if (
      Math.max(
        boxOf(left).x0 - boxOf(right).x1,
        boxOf(right).x0 - boxOf(left).x1,
        boxOf(left).y0 - boxOf(right).y1,
        boxOf(right).y0 - boxOf(left).y1,
        0,
      ) > 3
    )
      return false;
    const near = (points: readonly Pt2[], target: readonly Pt2[]) =>
      points.some((point) =>
        target.some((start, index) => {
          const end = target[(index + 1) % target.length];
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          const length2 = dx * dx + dy * dy;
          const share = length2
            ? Math.max(
                0,
                Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
              )
            : 0;
          return (
            Math.hypot(point[0] - start[0] - share * dx, point[1] - start[1] - share * dy) <= 3
          );
        }),
      );
    return near(left, right) || near(right, left);
  };
  const adjacent = new Map(keys.map((key) => [key, new Set<string>()]));
  const link = (a: string, b: string) => {
    if (a === b || !adjacent.has(a) || !adjacent.has(b) || !touches(ring(a), ring(b))) return;
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
  const components: string[][] = [];
  const seen = new Set<string>();
  for (const start of keys) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.shift()!;
      component.push(key);
      for (const next of adjacent.get(key) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    components.push(component);
  }
  const anchor = (component: readonly string[]) =>
    Math.max(
      ...component.map((key) => {
        const geom = picture.geoms.get(key);
        if (!geom) return 0;
        const box = boxOf(geom.rs);
        return (
          Math.abs(geom.areaMm2) *
          (Math.min(box.x1 - box.x0, box.y1 - box.y0) /
            Math.max(box.x1 - box.x0, box.y1 - box.y0, 1))
        );
      }),
      0,
    );
  return components.sort(
    (a, b) =>
      anchor(b) - anchor(a) || pictureClusterArea(picture, b) - pictureClusterArea(picture, a),
  )[0];
}

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

/** Keep every confidently sewn component; only genuinely unpaired pieces become B3 layers. */
function layerUnpairedPieces(
  picture: StepPicture,
  originalApart: ReadonlySet<string> = new Set(picture.layout.apart),
  preferred: ReadonlySet<string> = new Set(),
): StepPicture {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 2) return picture;
  const adjacent = new Map(keys.map((key) => [key, new Set<string>()]));
  const link = (a: string, b: string) => {
    if (a === b || !adjacent.has(a) || !adjacent.has(b)) return;
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  };
  for (const seam of picture.frameSeams) {
    if (!sewnPairing(seam)) continue;
    const sides = seamPieceSides(seam);
    for (const a of sides[0]) for (const b of sides[1]) link(a, b);
  }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const start of keys) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.shift()!;
      component.push(key);
      for (const next of adjacent.get(key) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    components.push(component);
  }
  const anchorShape = (component: readonly string[]) =>
    Math.max(
      ...component.map((key) => {
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
  components.sort(
    (a, b) =>
      anchorShape(b) - anchorShape(a) ||
      pictureClusterArea(picture, b) - pictureClusterArea(picture, a),
  );
  const established = originalApart.size ? keys.filter((key) => !originalApart.has(key)) : [];
  const preferredKeys = keys.filter((key) => preferred.has(key));
  const seeds = preferredKeys.length
    ? preferredKeys
    : established.length
      ? established
      : components[0];
  const sewn = new Set(seeds);
  const seamQueue = [...seeds];
  while (seamQueue.length) {
    const key = seamQueue.shift()!;
    for (const next of adjacent.get(key) ?? [])
      if (!sewn.has(next)) {
        sewn.add(next);
        seamQueue.push(next);
      }
  }
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const rings = new Map(
    keys.map((key) => [
      key,
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
    ]),
  );
  const touches = (left: readonly Pt2[], right: readonly Pt2[]) => {
    const distance = 3;
    const a = boxOf(left);
    const b = boxOf(right);
    if (Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0) > distance) return false;
    if (pairOverlap(rasterize(left, 2), rasterize(right, 2)) > 0) return true;
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
    const near = (points: readonly Pt2[], ring: readonly Pt2[]) =>
      points.some((point) =>
        ring.some(
          (start, index) =>
            pointSegmentDistance(point, start, ring[(index + 1) % ring.length]) <= distance,
        ),
      );
    return near(left, right) || near(right, left);
  };
  const physicalAdjacent = new Map(keys.map((key) => [key, new Set<string>()]));
  for (const left of keys)
    for (const right of keys)
      if (left < right && touches(rings.get(left)!, rings.get(right)!)) {
        physicalAdjacent.get(left)!.add(right);
        physicalAdjacent.get(right)!.add(left);
      }
  const physicalComponents: string[][] = [];
  const physicallySeen = new Set<string>();
  for (const start of keys) {
    if (physicallySeen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    physicallySeen.add(start);
    while (queue.length) {
      const key = queue.shift()!;
      component.push(key);
      for (const next of physicalAdjacent.get(key) ?? [])
        if (!physicallySeen.has(next)) {
          physicallySeen.add(next);
          queue.push(next);
        }
    }
    physicalComponents.push(component);
  }
  const protectedComponents = physicalComponents
    .filter((component) => component.some((key) => sewn.has(key)))
    .sort(
      (a, b) =>
        anchorShape(b) - anchorShape(a) ||
        pictureClusterArea(picture, b) - pictureClusterArea(picture, a),
    );
  const hosts = protectedComponents[0];
  const shown = new Set(protectedComponents.flat());
  const explicitLayers = new Map(picture.layout.pieceLayers);
  for (const key of shown)
    if (!preferred.has(key) && explicitConstructionLayer(picture, key, explicitLayers.get(key)))
      shown.delete(key);
  const hidden = keys.filter((key) => !shown.has(key));
  if (!hidden.length) return picture;
  const existing = new Set(picture.layout.pieceLayers.map(([piece]) => piece));
  const hostFor = (piece: string) => {
    const wanted = reading(piece);
    return [...hosts].sort((left, right) => {
      const score = (candidate: string) => {
        const actual = reading(candidate);
        return (
          (wanted.role && actual.role === wanted.role ? 1e12 : 0) +
          (wanted.hand && actual.hand === wanted.hand ? 1e9 : 0) +
          Math.abs(picture.geoms.get(candidate)?.areaMm2 ?? 0)
        );
      };
      return score(right) - score(left);
    })[0];
  };
  const pieceLayers: [string, string][] = [
    ...picture.layout.pieceLayers,
    ...hidden
      .filter((piece) => !existing.has(piece))
      .map((piece) => [piece, hostFor(piece)] as [string, string]),
  ];
  return { ...picture, layout: { ...picture.layout, pieceLayers } };
}

/** Keep the primary shell; construction details remain present as layers on their host. */
function layerSecondaryPieces(picture: StepPicture, operation: SceneOp): StepPicture {
  const stackHosts = new Set(picture.layout.stacked.map(([host]) => host));
  if (
    !visiblePictureKeys(picture).length &&
    picture.layout.T.size === 2 &&
    picture.layout.pieceLayers.some(([piece]) => stackHosts.has(piece))
  )
    picture = {
      ...picture,
      layout: {
        ...picture.layout,
        pieceLayers: picture.layout.pieceLayers.filter(([piece]) => !stackHosts.has(piece)),
      },
    };
  const baseVisible = visiblePictureKeys(picture);
  if (baseVisible.length < 2) return picture;
  const all = [...picture.layout.T.keys()];
  const aspect = (key: string) => {
    const box = boxOf(picture.geoms.get(key)?.rs ?? []);
    const width = Math.max(box.x1 - box.x0, 1);
    const height = Math.max(box.y1 - box.y0, 1);
    return Math.max(width, height) / Math.min(width, height);
  };
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
  const largest = Math.max(...baseVisible.map(area), 1);
  const directSew = /(?:join|sew|stitch|overlock|serge|attach|bind|zigzag)/i.test(
    operation.work ?? '',
  );
  const directInputs = new Set(
    (operation.inputKeys ?? []).map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')),
  );
  const directlyNamed = (key: string) => {
    const geom = picture.geoms.get(key);
    return [key, geom?.name ?? ''].some((value) =>
      directInputs.has(value.toLowerCase().replace(/[^a-z0-9]+/g, '')),
    );
  };
  const secondaryRoles = new Set(['pocket', 'facing', 'placket', 'fly']);
  const treatmentRoles = new Set(['collar', 'stand', 'rib', 'cuff', 'hemband', 'waistband']);
  const knownSecondary = (key: string) =>
    isLiningPiece(picture, key) ||
    secondaryRoles.has(readName(picture.geoms.get(key)?.name ?? '').role ?? '');
  const areaPrimaries = baseVisible.filter(
    (key) => aspect(key) < 5 && area(key) >= 0.12 * largest && !knownSecondary(key),
  );
  const constructionLayers = new Set(
    areaPrimaries.filter((key) =>
      areaPrimaries.some(
        (host) =>
          host !== key && area(host) > area(key) && explicitConstructionLayer(picture, key, host),
      ),
    ),
  );
  const shellPrimaries = areaPrimaries.filter((key) => !constructionLayers.has(key));
  const pairedToShell = (key: string) =>
    picture.frameSeams.some((seam) => {
      if (!sewnPairing(seam)) return false;
      const [left, right] = seamPieceSides(seam);
      return (
        (left.includes(key) && right.some((candidate) => shellPrimaries.includes(candidate))) ||
        (right.includes(key) && left.some((candidate) => shellPrimaries.includes(candidate)))
      );
    });
  const treatmentPieces = new Set(
    all.filter((key) =>
      treatmentRoles.has(readName(picture.geoms.get(key)?.name ?? '').role ?? ''),
    ),
  );
  const treatmentStackFollowers = new Set(
    picture.layout.stacked
      .filter((group) => group.length === 2 && group.every((key) => treatmentPieces.has(key)))
      .flatMap((group) => group.slice(1)),
  );
  const explicitlyDocked = (key: string) =>
    picture.frameSeams.some((seam) => {
      if (!/collar follows the complete garment neckline/.test(seam.evidence.rule ?? ''))
        return false;
      const [left, right] = seamPieceSides(seam);
      return left.includes(key) || right.includes(key);
    });
  const dockedTreatments = new Set(
    [...treatmentPieces].filter((key) => pairedToShell(key) || explicitlyDocked(key)),
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const seam of picture.frameSeams) {
      if (!sewnPairing(seam)) continue;
      const [left, right] = seamPieceSides(seam);
      const leftDocked = left.some((key) => dockedTreatments.has(key));
      const rightDocked = right.some((key) => dockedTreatments.has(key));
      if (!leftDocked && !rightDocked) continue;
      for (const key of leftDocked ? right : left)
        if (treatmentPieces.has(key) && !dockedTreatments.has(key)) {
          dockedTreatments.add(key);
          changed = true;
        }
    }
  }
  const dockedStrips = all.filter(
    (key) => dockedTreatments.has(key) && !knownSecondary(key) && !treatmentStackFollowers.has(key),
  );
  const visible = [...new Set([...baseVisible, ...dockedStrips])];
  const primaries = new Set([...shellPrimaries, ...dockedStrips]);
  const directDetails = visible.filter(
    (key) =>
      !primaries.has(key) && !isInteriorDuplicate(picture, key) && directSew && directlyNamed(key),
  );
  const toLayer = visible.filter((key) => !primaries.has(key) && !directDetails.includes(key));
  if (primaries.size < 2) {
    const interior = visible.filter((key) => isInteriorDuplicate(picture, key));
    if (!interior.length) return picture;
    toLayer.splice(0, toLayer.length, ...interior);
  }
  if (!toLayer.length && !directDetails.length) return picture;
  const restoredStrips = new Set(dockedStrips);
  const retainedLayers = picture.layout.pieceLayers.filter(([piece]) => !restoredStrips.has(piece));
  const existing = new Set(retainedLayers.map(([piece]) => piece));
  const hosts = primaries.size ? [...primaries] : visible.filter((key) => !toLayer.includes(key));
  if (!hosts.length) return picture;
  const hostFor = (piece: string) => {
    const wanted = readName(picture.geoms.get(piece)?.name ?? '');
    return [...hosts].sort((left, right) => {
      const score = (candidate: string) => {
        const actual = readName(picture.geoms.get(candidate)?.name ?? '');
        return (
          (wanted.family && actual.family === wanted.family ? 1e12 : 0) +
          (wanted.hand && actual.hand === wanted.hand ? 1e9 : 0) +
          area(candidate)
        );
      };
      return score(right) - score(left);
    })[0];
  };
  const pieceLayers: [string, string][] = [
    ...retainedLayers,
    ...toLayer
      .filter((key) => !existing.has(key))
      .map((key) => [key, hostFor(key)] as [string, string]),
  ];
  const T = new Map(picture.layout.T);
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
  for (const key of directDetails) {
    const pieceBox = boxOf(ring(key));
    const alreadyDocked = hosts.some((candidate) => {
      const candidateBox = boxOf(ring(candidate));
      const gap = Math.max(
        pieceBox.x0 - candidateBox.x1,
        candidateBox.x0 - pieceBox.x1,
        pieceBox.y0 - candidateBox.y1,
        candidateBox.y0 - pieceBox.y1,
        0,
      );
      const horizontal =
        Math.min(pieceBox.x1, candidateBox.x1) - Math.max(pieceBox.x0, candidateBox.x0);
      const vertical =
        Math.min(pieceBox.y1, candidateBox.y1) - Math.max(pieceBox.y0, candidateBox.y0);
      return gap <= 3 && Math.max(horizontal, vertical) >= 4;
    });
    if (alreadyDocked) continue;
    const host = hostFor(key);
    const hostBox = boxOf(ring(host));
    const width = Math.max(pieceBox.x1 - pieceBox.x0, 1);
    const height = Math.max(pieceBox.y1 - pieceBox.y0, 1);
    const vertical = height >= width;
    const dx = vertical
      ? [hostBox.x0 - pieceBox.x1, hostBox.x1 - pieceBox.x0].sort(
          (left, right) => Math.abs(left) - Math.abs(right),
        )[0]
      : (hostBox.x0 + hostBox.x1 - pieceBox.x0 - pieceBox.x1) / 2;
    const dy = vertical
      ? (hostBox.y0 + hostBox.y1 - pieceBox.y0 - pieceBox.y1) / 2
      : [hostBox.y0 - pieceBox.y1, hostBox.y1 - pieceBox.y0].sort(
          (top, bottom) => Math.abs(top) - Math.abs(bottom),
        )[0];
    T.set(key, compose(translate(dx, dy), T.get(key)!));
  }
  const shown = visible.filter((key) => !toLayer.includes(key));
  const points = shown.flatMap((key) => ring(key));
  const stacked = picture.layout.stacked
    .map((group) => group.filter((key, index) => index === 0 || !restoredStrips.has(key)))
    .filter((group) => group.length > 0);
  let result: StepPicture = {
    ...picture,
    layout: { ...picture.layout, T, pieceLayers, stacked, bbox: boxOf(points) },
  };
  const sleeves = shown.filter(
    (key) => readName(picture.geoms.get(key)?.name ?? '').role === 'sleeve',
  );
  const bodies = shown.filter(
    (key) =>
      !sleeves.includes(key) &&
      !treatmentRoles.has(readName(picture.geoms.get(key)?.name ?? '').role ?? ''),
  );
  if (sleeves.length === 2 && bodies.length >= 2) {
    const shownBox = boxOf(points);
    const width = shownBox.x1 - shownBox.x0;
    const height = shownBox.y1 - shownBox.y0;
    const targetAspect = 1.82;
    const lift = Math.max(0, width / targetAspect - height);
    const sleeveBoxes = sleeves.map((key) => boxOf(ring(key)));
    const sleeveTop = Math.min(...sleeveBoxes.map((box) => box.y0));
    const sleeveHeights = sleeveBoxes.map((box) => box.y1 - box.y0);
    if (lift > 0 && sleeveTop <= shownBox.y0 + 3 && lift <= 0.08 * Math.min(...sleeveHeights)) {
      const moved = new Map(result.layout.T);
      const shiftWithLayers = (leader: string) => {
        const followers = new Set([
          leader,
          ...pieceLayers.filter(([, host]) => host === leader).map(([piece]) => piece),
          ...stacked.filter(([host]) => host === leader).flatMap((group) => group.slice(1)),
        ]);
        for (const key of followers) {
          const transform = moved.get(key);
          if (transform) moved.set(key, compose(translate(0, -lift), transform));
        }
      };
      for (const sleeve of sleeves) shiftWithLayers(sleeve);
      const tightenedPoints = shown.flatMap((key) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(moved.get(key)!, point)),
      );
      result = {
        ...result,
        layout: { ...result.layout, T: moved, bbox: boxOf(tightenedPoints) },
      };
    }
  }
  if (restoredStrips.size) {
    const moved = new Map(result.layout.T);
    for (const strip of restoredStrips) {
      const matches = result.frameSeams.flatMap((seam) => {
        if (!sewnPairing(seam) || seam.kind === 'surface' || seam.kind === 'closure-not-seam')
          return [];
        const a = seam.aParts?.length ? seam.aParts : [seam.a];
        const b = seam.bParts?.length ? seam.bParts : [seam.b];
        const partEdges = a.filter((edge) => pieceKeyOf(edge) === strip);
        const targetEdges = b.filter((edge) => shellPrimaries.includes(pieceKeyOf(edge)));
        const reversePart = b.filter((edge) => pieceKeyOf(edge) === strip);
        const reverseTarget = a.filter((edge) => shellPrimaries.includes(pieceKeyOf(edge)));
        const parts = partEdges.length && targetEdges.length ? partEdges : reversePart;
        const targets = partEdges.length && targetEdges.length ? targetEdges : reverseTarget;
        const edgePoints = (edges: readonly string[]) =>
          edges.flatMap((edge) => {
            const key = pieceKeyOf(edge);
            const transform = moved.get(key);
            const resolved = resolveEdge(edge, result.geoms);
            return transform && resolved
              ? resolved.pts.map((point) => apply(transform, point))
              : [];
          });
        const partPoints = edgePoints(parts);
        const targetPoints = edgePoints(targets);
        return partPoints.length > 1 && targetPoints.length > 1
          ? [
              {
                partPoints,
                targetPoints,
                targetKeys: [...new Set(targets.map(pieceKeyOf))],
              },
            ]
          : [];
      });
      const match = matches.sort(
        (left, right) => right.targetKeys.length - left.targetKeys.length,
      )[0];
      if (!match) continue;
      const partBox = boxOf(match.partPoints);
      const targetBox = boxOf(match.targetPoints);
      let dx = (targetBox.x0 + targetBox.x1 - partBox.x0 - partBox.x1) / 2;
      let dy = (targetBox.y0 + targetBox.y1 - partBox.y0 - partBox.y1) / 2;
      const stripRing = (result.geoms.get(strip)?.rs ?? []).map((point) =>
        apply(moved.get(strip)!, point),
      );
      const targetRings = match.targetKeys.map((key) =>
        (result.geoms.get(key)?.rs ?? []).map((point) => apply(moved.get(key)!, point)),
      );
      const overlapAt = (offsetX: number, offsetY: number) => {
        const ring = stripRing.map(([x, y]) => [x + dx + offsetX, y + dy + offsetY] as Pt2);
        return targetRings.reduce(
          (largestOverlap, target) =>
            Math.max(largestOverlap, pairOverlap(rasterize(ring, 2), rasterize(target, 2))),
          0,
        );
      };
      if (overlapAt(0, 0) > 0.15) {
        const horizontal = targetBox.x1 - targetBox.x0 >= targetBox.y1 - targetBox.y0;
        const directions: Pt2[] = horizontal
          ? [
              [0, 1],
              [0, -1],
            ]
          : [
              [1, 0],
              [-1, 0],
            ];
        const stripBox = boxOf(stripRing);
        const minor = Math.min(stripBox.x1 - stripBox.x0, stripBox.y1 - stripBox.y0);
        let clearance: { direction: Pt2; distance: number } | null = null;
        for (const direction of directions) {
          for (let distance = 1; distance <= minor; distance += 1) {
            if (overlapAt(direction[0] * distance, direction[1] * distance) > 0.15) continue;
            if (!clearance || distance < clearance.distance) clearance = { direction, distance };
            break;
          }
        }
        if (clearance) {
          dx += clearance.direction[0] * clearance.distance;
          dy += clearance.direction[1] * clearance.distance;
        }
      }
      const followers = new Set([
        strip,
        ...pieceLayers.filter(([, host]) => host === strip).map(([piece]) => piece),
        ...stacked.filter(([host]) => host === strip).flatMap((group) => group.slice(1)),
      ]);
      for (const key of followers) {
        const transform = moved.get(key);
        if (transform) moved.set(key, compose(translate(dx, dy), transform));
      }
    }
    const dockedPoints = shown.flatMap((key) =>
      (result.geoms.get(key)?.rs ?? []).map((point) => apply(moved.get(key)!, point)),
    );
    result = {
      ...result,
      layout: { ...result.layout, T: moved, bbox: boxOf(dockedPoints) },
    };
  }
  return shown.length === 2 && toLayer.length ? dockLoosePicture(result) : result;
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
    if (Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0) > 3) return false;
    if (pairOverlap(rasterize(left, 2), rasterize(right, 2)) > 0) return true;
    const grid = new Map<string, Pt2[]>();
    for (const point of right) {
      const cell = `${Math.floor(point[0] / 3)}:${Math.floor(point[1] / 3)}`;
      grid.set(cell, [...(grid.get(cell) ?? []), point]);
    }
    return left.some(([x, y]) => {
      const gx = Math.floor(x / 3);
      const gy = Math.floor(y / 3);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (
            (grid.get(`${gx + dx}:${gy + dy}`) ?? []).some(
              (point) => Math.hypot(x - point[0], y - point[1]) <= 3,
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

/** Conceal only B3 construction layers that collide with their finished shell. */
function layerOverlappingConstruction(picture: StepPicture): StepPicture {
  const visible = visiblePictureKeys(picture);
  if (visible.length < 2) return picture;
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point));
  const pieceLayers = [...picture.layout.pieceLayers];
  const hidden = new Set(pieceLayers.map(([piece]) => piece));
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const representedSleeve = (key: string) => {
    const role = reading(key);
    if (role.role !== 'sleeve') return true;
    return visible.some((other) => {
      if (other === key || hidden.has(other)) return false;
      const candidate = reading(other);
      return candidate.role === 'sleeve' && candidate.hand === role.hand;
    });
  };
  for (let left = 0; left < visible.length; left++)
    for (let right = left + 1; right < visible.length; right++) {
      const a = visible[left];
      const b = visible[right];
      if (hidden.has(a) || hidden.has(b)) continue;
      if (pairOverlap(rasterize(ring(a), 2), rasterize(ring(b), 2)) <= 0.15) continue;
      const candidate = [a, b]
        .filter((key) => {
          const role = reading(key).role;
          return (
            representedSleeve(key) &&
            (isLiningPiece(picture, key) ||
              ['pocket', 'facing', 'placket', 'fly'].includes(role ?? ''))
          );
        })
        .sort(
          (first, second) =>
            Math.abs(picture.geoms.get(first)?.areaMm2 ?? 0) -
            Math.abs(picture.geoms.get(second)?.areaMm2 ?? 0),
        )[0];
      if (!candidate) continue;
      const host = candidate === a ? b : a;
      pieceLayers.push([candidate, host]);
      hidden.add(candidate);
    }
  return pieceLayers.length === picture.layout.pieceLayers.length
    ? picture
    : { ...picture, layout: { ...picture.layout, pieceLayers } };
}

/** A completed lined garment shows the shell; its lining remains present as a B3 inner layer. */
function layerFinishedLining(picture: StepPicture): StepPicture {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const shell = visible.filter((key) => !isLiningPiece(picture, key));
  const shellBodies = shell.filter(
    (key) =>
      ![
        'sleeve',
        'collar',
        'stand',
        'rib',
        'cuff',
        'hemband',
        'waistband',
        'pocket',
        'facing',
        'placket',
        'fly',
      ].includes(reading(key).role ?? ''),
  );
  const shellSleeves = shell.filter((key) => reading(key).role === 'sleeve');
  const lining = visible.filter((key) => isLiningPiece(picture, key));
  if (shellBodies.length < 2 || shellSleeves.length < 2 || !lining.length) return picture;
  const pieceLayers = [...picture.layout.pieceLayers];
  for (const key of lining) {
    const piece = reading(key);
    const host =
      shell.find((candidate) => {
        const target = reading(candidate);
        return (
          target.role === piece.role && (!piece.hand || !target.hand || target.hand === piece.hand)
        );
      }) ?? shellBodies[0];
    if (!pieceLayers.some(([layer]) => layer === key)) pieceLayers.push([key, host]);
  }
  return { ...picture, layout: { ...picture.layout, pieceLayers } };
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

const compactnessFloor = () => 0.355;

/** Close small gaps in panel-heavy assemblies without re-laying their sewn ring or fan. */
function tightenPanelAssembly(picture: StepPicture): StepPicture {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 6) return picture;
  const shown = new Set(keys);
  if (
    !keys.some(
      (key) =>
        identicalCutFamily(picture, key).filter((candidate) => shown.has(candidate)).length >= 3,
    )
  )
    return picture;
  const rings = new Map(
    keys.map((key) => [
      key,
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
    ]),
  );
  const current = hullCompactness([...rings.values()]);
  if (current < 0.4 || current >= 0.45) return picture;
  const bounds = boxOf([...rings.values()].flat());
  const center: Pt2 = [(bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2];
  const centers = new Map(
    [...rings].map(([key, ring]) => {
      const box = boxOf(ring);
      return [key, [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2] as Pt2] as const;
    }),
  );
  for (let factor = 0.99; factor >= 0.9; factor -= 0.01) {
    const moves = new Map(
      [...centers].map(([key, point]) => [
        key,
        [(center[0] - point[0]) * (1 - factor), (center[1] - point[1]) * (1 - factor)] as Pt2,
      ]),
    );
    for (const stack of picture.layout.stacked)
      for (const follower of stack.slice(1))
        if (moves.has(stack[0])) moves.set(follower, moves.get(stack[0])!);
    for (const [piece, partner] of picture.layout.pieceLayers)
      if (moves.has(partner)) moves.set(piece, moves.get(partner)!);
    for (const [layerInput, partnerInput] of picture.layout.layers) {
      const partner = [...picture.layout.input].find(
        ([key, input]) => input === partnerInput && moves.has(key),
      );
      if (!partner) continue;
      for (const [key, input] of picture.layout.input)
        if (input === layerInput) moves.set(key, moves.get(partner[0])!);
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
    const tightenedRings = keys.map((key) =>
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
    );
    if (hullCompactness(tightenedRings) < 0.452) continue;
    const points = [...T].flatMap(([key, transform]) =>
      (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
    );
    return { ...picture, layout: { ...picture.layout, T, bbox: boxOf(points) } };
  }
  return picture;
}

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
  const snap = (key: string, hosts: readonly string[], side?: 'L' | 'R') => {
    const part = ring(key).map((point) => apply(T.get(key)!, point));
    const target = hosts.flatMap((host) => ring(host).map((point) => apply(T.get(host)!, point)));
    const partBox = boxOf(part);
    const targetBox = boxOf(target);
    const partCandidates = side
      ? part.filter(
          (point) =>
            point[1] >= partBox.y0 + 0.45 * (partBox.y1 - partBox.y0) &&
            (side === 'L'
              ? point[0] >= partBox.x1 - 0.18 * (partBox.x1 - partBox.x0)
              : point[0] <= partBox.x0 + 0.18 * (partBox.x1 - partBox.x0)),
        )
      : part;
    const targetCandidates = side
      ? target.filter(
          (point) =>
            point[1] >= targetBox.y0 + 0.45 * (targetBox.y1 - targetBox.y0) &&
            (side === 'L'
              ? point[0] <= targetBox.x0 + 0.18 * (targetBox.x1 - targetBox.x0)
              : point[0] >= targetBox.x1 - 0.18 * (targetBox.x1 - targetBox.x0)),
        )
      : target;
    let nearest: { distance: number; part: Pt2; target: Pt2 } | null = null;
    for (const partPoint of partCandidates.length ? partCandidates : part)
      for (const targetPoint of targetCandidates.length ? targetCandidates : target) {
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
  snap(leftSleeve, [bodyLeaders[0]], 'L');
  snap(rightSleeve, [bodyLeaders[bodyLeaders.length - 1]], 'R');
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
    bodyBox = boxOf(bodyPoints);
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
  if (rawSleeves.length < 2) return true;
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
  const layeredInputs = new Set(picture.layout.layers.map(([input]) => input));
  const layeredPieces = new Set(picture.layout.pieceLayers.map(([piece]) => piece));
  const visible = [...picture.layout.T.keys()].filter(
    (key) => !layeredInputs.has(picture.layout.input.get(key) ?? -1) && !layeredPieces.has(key),
  );
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

  const T = new Map(picture.layout.T);
  T.set(baseKey, [1, 0, 0, 1, 0, 0]);
  const positioned = new Set([baseKey]);
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
    positioned.add(key);
  });
  if (positioned.size < 7) return null;
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const input = new Map(picture.layout.input);
  if (!input.has(baseKey)) input.set(baseKey, input.size);
  const stacked = picture.layout.stacked
    .map((stack) => stack.filter((key, index) => index === 0 || !positioned.has(key)))
    .filter((stack) => stack.length > 1);
  const pieceLayers = picture.layout.pieceLayers.filter(([piece]) => !positioned.has(piece));
  return separateAddedBodyPieces(
    {
      ...picture,
      layout: {
        ...picture.layout,
        T,
        input,
        stacked,
        pieceLayers,
        bbox: boxOf(points),
      },
    },
    positioned,
  );
}

/** Collapse construction plies that describe one panel rather than three separate products. */
function panelUnitPicture(picture: StepPicture): StepPicture | null {
  const keys = visiblePictureKeys(picture);
  if (keys.length < 2) return null;
  if (
    keys.some(
      (seed) => identicalCutFamily(picture, seed).filter((key) => keys.includes(key)).length >= 3,
    )
  )
    return null;
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
    const originalTransform = T.get(key)!;
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
    if (collarLike) {
      const centredBox = boxOf(ring(key));
      const centred: Pt2 = [
        (centredBox.x0 + centredBox.x1) / 2,
        (centredBox.y0 + centredBox.y1) / 2,
      ];
      const offset =
        (centred[0] - target.midpoint[0]) * target.axis[0] +
        (centred[1] - target.midpoint[1]) * target.axis[1];
      if (Math.abs(offset) > allowance) {
        const correction = offset - Math.sign(offset) * allowance;
        move(key, -correction * target.axis[0], -correction * target.axis[1]);
      }
    }
    if (role === 'waistband' && receivers.length) {
      const receiverPoints = receivers.flatMap((candidate) => ring(candidate));
      const receiverTop = Math.max(...receiverPoints.map((point) => point[1]));
      const treatment = ring(key);
      const treatmentBox = boxOf(treatment);
      const receiverBox = boxOf(receiverPoints);
      const overlapLeft = Math.max(treatmentBox.x0, receiverBox.x0);
      const overlapRight = Math.min(treatmentBox.x1, receiverBox.x1);
      const span = Math.max(overlapRight - overlapLeft, 1);
      const differences: number[] = [];
      for (let index = 0; index < 48; index++) {
        const x = overlapLeft + (span * (index + 0.5)) / 48;
        const radius = Math.max(span / 48, 1);
        const bandSlice = treatment.filter((point) => Math.abs(point[0] - x) <= radius);
        const crownSlice = receiverPoints.filter((point) => Math.abs(point[0] - x) <= radius);
        if (!bandSlice.length || !crownSlice.length) continue;
        const sewingY = Math.min(...bandSlice.map((point) => point[1]));
        const crownY = Math.max(...crownSlice.map((point) => point[1]));
        differences.push(crownY - sewingY);
      }
      if (differences.length >= 6) {
        move(key, 0, Math.max(...differences));
      } else {
        const treatmentBottom = treatmentBox.y0;
        if (treatmentBottom < receiverTop) move(key, 0, receiverTop - treatmentBottom);
      }
      const placedBottom = boxOf(ring(key)).y0;
      const bandPoints = ring(key).filter((point) => point[1] <= placedBottom + 0.5);
      const crownPoints = receivers
        .flatMap((candidate) => ring(candidate))
        .filter((point) => point[1] >= receiverTop - 0.5);
      const nearestOnSegment = (point: Pt2, start: Pt2, end: Pt2) => {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const length2 = dx * dx + dy * dy;
        const share = length2
          ? Math.max(
              0,
              Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
            )
          : 0;
        const target: Pt2 = [start[0] + share * dx, start[1] + share * dy];
        return { target, distance: Math.hypot(point[0] - target[0], point[1] - target[1]) };
      };
      const receiverRings = receivers.map((candidate) => ring(candidate));
      let contact: { band: Pt2; target: Pt2; distance: number } | null = null;
      for (const band of ring(key))
        for (const receiverRing of receiverRings)
          for (let index = 0; index < receiverRing.length; index++) {
            const nearest = nearestOnSegment(
              band,
              receiverRing[index],
              receiverRing[(index + 1) % receiverRing.length],
            );
            if (!contact || nearest.distance < contact.distance)
              contact = { band, target: nearest.target, distance: nearest.distance };
          }
      let closest: { band: Pt2; crown: Pt2; distance: number } | null = null;
      for (const band of bandPoints)
        for (const crown of crownPoints) {
          const distance = Math.abs(band[0] - crown[0]);
          if (!closest || distance < closest.distance) closest = { band, crown, distance };
        }
      if (contact && contact.distance > 0.1) {
        const share = 1;
        move(
          key,
          (contact.target[0] - contact.band[0]) * share,
          (contact.target[1] - contact.band[1]) * share,
        );
      } else if (closest) move(key, closest.crown[0] - closest.band[0], 0);

      // An explicit multi-panel sewing edge is the authoritative crown. Clearance and
      // compaction may leave a visually obvious gap even though another outline point
      // happens to touch, so finish by docking the transformed sewing edge itself.
      if (matches.length) {
        const correction = compose(T.get(key)!, invert(originalTransform));
        const transformedSource = sourcePoints.map((point) => apply(correction, point));
        const sampled = (points: readonly Pt2[]) => {
          const stride = Math.max(1, Math.floor(points.length / 160));
          return points.filter((_, index) => index % stride === 0);
        };
        let seamContact: { source: Pt2; target: Pt2; distance: number } | null = null;
        for (const sourcePoint of sampled(transformedSource))
          for (const targetPoint of sampled(targetPoints)) {
            const distance = Math.hypot(
              sourcePoint[0] - targetPoint[0],
              sourcePoint[1] - targetPoint[1],
            );
            if (!seamContact || distance < seamContact.distance)
              seamContact = { source: sourcePoint, target: targetPoint, distance };
          }
        if (seamContact && seamContact.distance > 0.1)
          move(
            key,
            seamContact.target[0] - seamContact.source[0],
            seamContact.target[1] - seamContact.source[1],
          );
        for (let offset = 0; maxOverlap() > allowedOverlap && offset < clearance; offset += 1)
          move(key, ux, uy);
      }
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

const stripOnlyPicture = (picture: StepPicture) => {
  const keys = visiblePictureKeys(picture);
  return keys.length > 0 && keys.every((key) => ringAspect(picture.geoms.get(key)?.rs ?? []) >= 4);
};

const polylineLength = (points: readonly Pt2[], closed = false) =>
  points.reduce((sum, point, index) => {
    if (index === 0 && !closed) return sum;
    const previous = points[(index + points.length - 1) % points.length];
    return sum + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);

/** Whether this operation sews a closed run around at least 80% of every finished input. */
export function closedLoopFinishedJoin(
  picture: StepPicture,
  sources: readonly StepPicture[],
): boolean {
  if (sources.length < 2) return false;
  return sources.every((source) => {
    const keys = new Set(visiblePictureKeys(source));
    if (!keys.size) return false;
    const edges = [...new Set(picture.marks.map((mark) => mark.id))].flatMap((id) => {
      const piece = pieceKeyOf(id);
      const edge = keys.has(piece) ? resolveEdge(id, picture.geoms) : null;
      const transform = source.layout.T.get(piece);
      return edge && transform ? [edge.pts.map((point) => apply(transform, point))] : [];
    });
    if (!edges.length) return false;
    const outline = convexHull(
      [...keys].flatMap((key) =>
        (source.geoms.get(key)?.rs ?? []).map((point) => apply(source.layout.T.get(key)!, point)),
      ),
    );
    const perimeter = polylineLength(outline, true);
    const sewn = edges.reduce((sum, edge) => sum + polylineLength(edge), 0);
    if (perimeter <= 0 || sewn + 1e-6 < 0.8 * perimeter) return false;

    // Length alone can mistake several long open seams for a loop. A closed join has no free end:
    // every transformed seam endpoint meets exactly one other endpoint in one connected cycle.
    const tolerance = 3;
    const nodes: { point: Pt2; degree: number; links: Set<number> }[] = [];
    const nodeOf = (point: Pt2) => {
      const found = nodes.findIndex(
        (node) => Math.hypot(node.point[0] - point[0], node.point[1] - point[1]) <= tolerance,
      );
      if (found >= 0) return found;
      nodes.push({ point, degree: 0, links: new Set() });
      return nodes.length - 1;
    };
    for (const edge of edges) {
      if (edge.length < 2) return false;
      const start = nodeOf(edge[0]);
      const end = nodeOf(edge[edge.length - 1]);
      nodes[start].degree++;
      nodes[end].degree++;
      nodes[start].links.add(end);
      nodes[end].links.add(start);
    }
    if (!nodes.length || nodes.some((node) => node.degree !== 2)) return false;
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const node = queue.shift()!;
      for (const linked of nodes[node].links)
        if (!reached.has(linked)) {
          reached.add(linked);
          queue.push(linked);
        }
    }
    return reached.size === nodes.length;
  });
}

/** Add a separately built edge treatment to its finished host without changing either unit. */
function dockFinishedPictures(host: StepPicture, treatment: StepPicture): StepPicture {
  const treatmentKeys = new Set(visiblePictureKeys(treatment));
  for (let changed = true; changed; ) {
    changed = false;
    const inputs = new Set(
      [...treatmentKeys]
        .map((key) => treatment.layout.input.get(key))
        .filter((input): input is number => input != null),
    );
    for (const [key, input] of treatment.layout.input)
      if (inputs.has(input) && !treatmentKeys.has(key)) {
        treatmentKeys.add(key);
        changed = true;
      }
    for (const stack of treatment.layout.stacked)
      if (stack.some((key) => treatmentKeys.has(key)))
        for (const key of stack)
          if (!treatmentKeys.has(key)) {
            treatmentKeys.add(key);
            changed = true;
          }
  }
  const treatmentEntries = [...treatment.layout.T].filter(([key]) => treatmentKeys.has(key));
  const hostEntries = [...host.layout.T].filter(([key]) => !treatmentKeys.has(key));
  if (!hostEntries.length) return treatment;

  const treatmentInputs = [...treatment.layout.input.values()];
  const nextInput = treatmentInputs.length ? Math.max(...treatmentInputs) + 1 : 0;
  const hostInputIds = [...new Set(host.layout.input.values())];
  const hostInput = new Map(hostInputIds.map((input, index) => [input, nextInput + index]));
  const remap = (input: number) => hostInput.get(input) ?? input;
  const hostPoints = hostEntries.flatMap(([key, transform]) =>
    (treatment.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const treatmentPoints = treatmentEntries.flatMap(([key, transform]) =>
    (treatment.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const hostBox = boxOf(hostPoints);
  const treatmentBox = boxOf(treatmentPoints);
  const gap = 0.08 * Math.max(hostBox.x1 - hostBox.x0, hostBox.y1 - hostBox.y0, 1);
  const clear = translate(hostBox.x1 + gap - treatmentBox.x0, hostBox.y0 - treatmentBox.y0);
  const T = new Map([
    ...hostEntries,
    ...treatmentEntries.map(([key, transform]) => [key, compose(clear, transform)] as const),
  ]);
  const input = new Map<string, number>([
    ...[...host.layout.input]
      .filter(([key]) => !treatmentKeys.has(key))
      .map(([key, value]) => [key, remap(value)] as const),
    ...[...treatment.layout.input].filter(([key]) => treatmentKeys.has(key)),
  ]);
  const points = [...T].flatMap(([key, transform]) =>
    (treatment.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const merged: StepPicture = {
    ...treatment,
    leaves: [...host.leaves, ...treatment.leaves],
    layoutLeaves: [...host.layoutLeaves, ...treatment.layoutLeaves],
    layout: {
      ...treatment.layout,
      T,
      input,
      ghosts: [
        ...host.layout.ghosts.map((ghost) => ({ ...ghost, input: remap(ghost.input) })),
        ...treatment.layout.ghosts,
      ],
      stacked: [
        ...host.layout.stacked,
        ...treatment.layout.stacked
          .map((stack) => stack.filter((key) => treatmentKeys.has(key)))
          .filter((stack) => stack.length > 1),
      ],
      onRuns: [
        ...host.layout.onRuns,
        ...treatment.layout.onRuns.filter((key) => treatmentKeys.has(key)),
      ],
      apart: [
        ...host.layout.apart,
        ...treatment.layout.apart.filter((key) => treatmentKeys.has(key)),
      ],
      clusters: [
        ...host.layout.clusters.map((cluster) => cluster.map(remap)),
        ...treatment.layout.clusters,
      ],
      layers: [
        ...host.layout.layers.map(
          ([layer, partner]) => [remap(layer), remap(partner)] as [number, number],
        ),
        ...treatment.layout.layers,
      ],
      pieceLayers: [
        ...host.layout.pieceLayers,
        ...treatment.layout.pieceLayers.filter(
          ([piece, partner]) => treatmentKeys.has(piece) && treatmentKeys.has(partner),
        ),
      ],
      hand: new Map([
        ...host.layout.hand,
        ...[...treatment.layout.hand].filter(([key]) => treatmentKeys.has(key)),
      ]),
      bbox: boxOf(points),
    },
  };
  const hostVisible = visiblePictureKeys(host).filter((key) => T.has(key));
  const treatmentVisible = visiblePictureKeys(treatment).filter((key) => T.has(key));
  if (!hostVisible.length || !treatmentVisible.length) return merged;
  const hostOutline = hostVisible.flatMap((key) =>
    (merged.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
  );
  const treatmentOutline = treatmentVisible.flatMap((key) =>
    (merged.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point)),
  );
  const dockHost = boxOf(hostOutline);
  const dockTreatment = boxOf(treatmentOutline);
  const width = dockTreatment.x1 - dockTreatment.x0;
  const height = dockTreatment.y1 - dockTreatment.y0;
  const delta: Pt2 =
    Math.max(width, height) >= 4 * Math.max(Math.min(width, height), 1)
      ? width >= height
        ? [
            (dockHost.x0 + dockHost.x1 - dockTreatment.x0 - dockTreatment.x1) / 2,
            dockHost.y1 - dockTreatment.y0,
          ]
        : [
            dockHost.x1 - dockTreatment.x0,
            (dockHost.y0 + dockHost.y1 - dockTreatment.y0 - dockTreatment.y1) / 2,
          ]
      : (() => {
          const right = hostOutline.reduce((best, point) => (point[0] > best[0] ? point : best));
          const left = treatmentOutline.reduce((best, point) =>
            point[0] < best[0] ? point : best,
          );
          return [right[0] - left[0], right[1] - left[1]];
        })();
  const translatedTreatment = treatmentOutline.map(([x, y]) => [x + delta[0], y + delta[1]] as Pt2);
  let nearest: { host: Pt2; treatment: Pt2; distance: number } | null = null;
  for (const hostPoint of hostOutline)
    for (const treatmentPoint of translatedTreatment) {
      const distance = Math.hypot(
        hostPoint[0] - treatmentPoint[0],
        hostPoint[1] - treatmentPoint[1],
      );
      if (!nearest || distance < nearest.distance)
        nearest = { host: hostPoint, treatment: treatmentPoint, distance };
    }
  const dock = nearest
    ? compose(
        translate(nearest.host[0] - nearest.treatment[0], nearest.host[1] - nearest.treatment[1]),
        translate(delta[0], delta[1]),
      )
    : translate(delta[0], delta[1]);
  const dockedT = new Map(T);
  for (const key of treatmentKeys) {
    const transform = dockedT.get(key);
    if (transform) dockedT.set(key, compose(dock, transform));
  }
  const dockedPoints = [...dockedT].flatMap(([key, transform]) =>
    (merged.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return { ...merged, layout: { ...merged.layout, T: dockedT, bbox: boxOf(dockedPoints) } };
}

/** Restore each earlier output around its current anchor, including what that output drew. */
function restoreFinishedInputPictures(
  picture: StepPicture,
  sources: readonly StepPicture[],
): StepPicture {
  const T = new Map(picture.layout.T);
  const visible = new Set<string>();
  const restacked = new Set<string>();
  const sourceStacks: string[][] = [];
  const rigidGroups: { all: string[]; shown: string[] }[] = [];
  let restored = false;
  for (const source of sources) {
    const sourceKeys = [...source.layout.T.keys()].filter((key) => T.has(key));
    if (sourceKeys.length < 2) continue;
    const anchor = [...sourceKeys].sort(
      (left, right) =>
        Math.abs(picture.geoms.get(right)?.areaMm2 ?? 0) -
        Math.abs(picture.geoms.get(left)?.areaMm2 ?? 0),
    )[0];
    const sourceAnchor = source.layout.T.get(anchor);
    const currentAnchor = T.get(anchor);
    if (!sourceAnchor || !currentAnchor) continue;
    const correction = compose(currentAnchor, invert(sourceAnchor));
    for (const key of sourceKeys) {
      const transform = source.layout.T.get(key);
      if (transform) T.set(key, compose(correction, transform));
    }
    // Only an edge-treatment source needs its leader explicitly unhidden here. Surface-detail
    // inputs (a pocket/flap unit entering a panel ring) keep the joined step's layer semantics.
    if (stripOnlyPicture(source)) {
      for (const key of visiblePictureKeys(source)) if (T.has(key)) visible.add(key);
      sourceKeys.forEach((key) => restacked.add(key));
      sourceStacks.push(
        ...source.layout.stacked
          .map((stack) => stack.filter((key) => T.has(key)))
          .filter((stack) => stack.length > 1),
      );
    }
    rigidGroups.push({
      all: sourceKeys,
      shown: visiblePictureKeys(source).filter((key) => T.has(key)),
    });
    restored = true;
  }
  if (!restored) return picture;
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
  const settled: string[] = [];
  for (const group of rigidGroups) {
    if (!settled.length) {
      settled.push(...group.shown);
      continue;
    }
    const intersects = group.shown.some((key) =>
      settled.some((host) => pairOverlap(rasterize(ring(key), 2), rasterize(ring(host), 2)) > 0.15),
    );
    if (intersects) {
      const host = settled.flatMap(ring);
      const part = group.shown.flatMap(ring);
      const right = host.reduce((best, point) => (point[0] > best[0] ? point : best));
      const left = part.reduce((best, point) => (point[0] < best[0] ? point : best));
      const move = translate(right[0] - left[0], right[1] - left[1]);
      for (const key of group.all) T.set(key, compose(move, T.get(key)!));
    }
    settled.push(...group.shown);
  }
  const visibleInputs = new Set(
    [...visible]
      .map((key) => picture.layout.input.get(key))
      .filter((input): input is number => input != null),
  );
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  return dockLoosePicture({
    ...picture,
    layout: {
      ...picture.layout,
      T,
      bbox: boxOf(points),
      stacked: [
        ...picture.layout.stacked.filter((stack) => !stack.some((key) => restacked.has(key))),
        ...sourceStacks,
      ],
      layers: picture.layout.layers.filter(([layer]) => !visibleInputs.has(layer)),
      pieceLayers: picture.layout.pieceLayers.filter(([piece]) => !visible.has(piece)),
    },
  });
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
              ...picture.hands,
              inputLayouts: picture.groups.map((group) => assembledByUnit.get(group.key)),
              stackIdentical: true,
              joinedOverlap: 0.15,
              honorRanges: true,
              garmentLayout: true,
            }
          : {
              explode: 0,
              rasterMm: STEP_TILE_RASTER_MM,
              ...picture.hands,
              joinedOverlap: 0,
              honorRanges: false,
              bagsAsLayers: false,
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
              ? layerUnpairedPieces(assembled, new Set(), new Set(dominantSeamCluster(assembled)))
              : assembled;
            pictures.set(number, useInferredLayout ? result : dockLoosePicture(assembled));
            const output = operation.outputUnitKey?.trim();
            if (output) assembledByUnit.set(output, result.layout);
            else if (picture.groups.length === 1)
              assembledByUnit.set(picture.groups[0].key, result.layout);
            if (!useInferredLayout)
              assembledByPieces.set(
                picturePieceSignature(picture.leaves.flatMap((leaf) => leaf)),
                dockLoosePicture({ ...assembled, marks: [] }),
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
            pictures.set(number, dockLoosePicture({ ...assembled, op: operation, marks: [] }));
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
            ...picture.hands,
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
          const shown = useInferredLayout ? result : dockLoosePicture(result);
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
    if (final) pictures.set(final[0], compactFinalPicture(final[1]));
    const completeAssemblies = new Set<number>();
    for (const [number, picture] of pictures) {
      const rawKeys = visiblePictureKeys(picture);
      const rawRings = rawKeys.map((key) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
      );
      const rawNeedsCompact = rawRings.length > 1 && hullCompactness(rawRings) < compactnessFloor();
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
        anonymous ?? storedSleeves ?? sleeved ?? radial ?? trouser ?? panelUnit ?? picture;
      revised = layerFinishedLining(layerOverlappingConstruction(revised));
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
      const needsCompact = hullCompactness(rings) < compactnessFloor();
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
      const layeredPicture = layerFinishedLining(
        layerOverlappingConstruction(hasEdgeTreatments ? restoreEdgeTreatments(docked) : docked),
      );
      const layeredRings = visiblePictureKeys(layeredPicture).map((key) =>
        (layeredPicture.geoms.get(key)?.rs ?? []).map((point) =>
          apply(layeredPicture.layout.T.get(key)!, point),
        ),
      );
      const compactedPicture =
        layeredRings.length > 1 &&
        (hullCompactness(layeredRings) < compactnessFloor() ||
          (number === final?.[0] && frameFill(layeredRings.flat()) < 0.59))
          ? compactFinalPicture(layeredPicture, true)
          : layeredPicture;
      const redockedPicture = dockLoosePicture(compactedPicture);
      const finalPicture = layerFinishedLining(
        layerOverlappingConstruction(
          hasEdgeTreatments ? restoreEdgeTreatments(redockedPicture) : redockedPicture,
        ),
      );
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
      const continuesWholeUnit =
        (!!output &&
          (operation.inputKeys ?? []).filter((key) => key.trim()).length === 1 &&
          (operation.inputKeys ?? []).includes(output)) ||
        (!!inputSignature(operation) &&
          inputSignature(operation) === inputSignature(previousOperation));
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
      if (!joins.has(number) && keepsWholeUnit && continuesWholeUnit) {
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
    for (let index = operations.length - 2; index >= 0; index--) {
      const operation = operations[index];
      const nextOperation = operations[index + 1];
      const number = operation.operationNumber ?? 0;
      const nextNumber = nextOperation.operationNumber ?? 0;
      const output = operation.outputUnitKey?.trim();
      const picture = pictures.get(number);
      const nextPicture = pictures.get(nextNumber);
      if (
        !output ||
        !(nextOperation.inputKeys ?? []).includes(output) ||
        !picture ||
        !nextPicture ||
        rowByNumber.get(nextNumber)?.card?.turn
      )
        continue;
      const keys = visiblePictureKeys(picture);
      const nextKeys = new Set(visiblePictureKeys(nextPicture));
      if (
        keys.length < 3 ||
        keys.length !== nextKeys.size ||
        keys.some((key) => !nextKeys.has(key))
      )
        continue;
      const rings = keys.map((key) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(picture.layout.T.get(key)!, point)),
      );
      const nextRings = keys.map((key) =>
        (nextPicture.geoms.get(key)?.rs ?? []).map((point) =>
          apply(nextPicture.layout.T.get(key)!, point),
        ),
      );
      const currentCompactness = hullCompactness(rings);
      const nextCompactness = hullCompactness(nextRings);
      if (currentCompactness >= 0.5 || nextCompactness < currentCompactness + 0.08) continue;
      const T = new Map(picture.layout.T);
      for (const key of keys) T.set(key, nextPicture.layout.T.get(key)!);
      const points = [...T].flatMap(([key, transform]) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
      );
      pictures.set(number, {
        ...picture,
        layout: { ...picture.layout, T, bbox: boxOf(points) },
      });
    }
    // Once an operation joins two earlier multi-piece outputs, those finished inputs and the unit
    // they create stay rigid. Ordinary one-unit construction remains free to use its established
    // semantic placement until it enters such a finished-unit join.
    const outputPictures = new Map<string, StepPicture>();
    const protectedUnits = new Set<string>();
    const secondaryRoles = new Set([
      'pocket',
      'facing',
      'placket',
      'fly',
      'collar',
      'stand',
      'rib',
      'cuff',
      'hemband',
      'waistband',
    ]);
    const finishedStructuralUnit = (source: StepPicture) =>
      visiblePictureKeys(source).filter(
        (key) => !secondaryRoles.has(readName(source.geoms.get(key)?.name ?? '').role ?? ''),
      ).length >= 2;
    for (const operation of operations) {
      const output = operation.outputUnitKey?.trim();
      const picture = pictures.get(operation.operationNumber ?? 0);
      if (output && picture) outputPictures.set(output, picture);
    }
    for (const operation of operations) {
      const number = operation.operationNumber ?? 0;
      const picture = pictures.get(number);
      if (!picture) continue;
      const producedInputs = (operation.inputKeys ?? []).flatMap((input) => {
        const key = input.trim();
        const source = outputPictures.get(key);
        return source && source !== picture ? [{ key, source }] : [];
      });
      const finishedInputs = producedInputs.filter(({ source }) => finishedStructuralUnit(source));
      const joinsFinishedUnits =
        finishedInputs.length >= 2 &&
        closedLoopFinishedJoin(
          picture,
          finishedInputs.map(({ source }) => source),
        );
      const continuesProtectedUnit = producedInputs.some(({ key }) => protectedUnits.has(key));
      const inputPictures = producedInputs
        .filter(
          ({ key, source }) =>
            protectedUnits.has(key) || (joinsFinishedUnits && finishedStructuralUnit(source)),
        )
        .map(({ source }) => source);
      if (!inputPictures.length) continue;
      const stabilized = restoreFinishedInputPictures(picture, inputPictures);
      if (stabilized === picture) continue;
      pictures.set(number, stabilized);
      const output = operation.outputUnitKey?.trim();
      if (output) {
        outputPictures.set(output, stabilized);
        if (joinsFinishedUnits || continuesProtectedUnit) protectedUnits.add(output);
      }
    }
    for (const [number, picture] of pictures)
      if (sleevedPictureNeedsRepair(picture)) {
        const repaired = sleevedFinalPicture(picture);
        if (repaired) {
          pictures.set(number, repaired);
          completeAssemblies.add(number);
        }
      }
    const collarUnits = new Set<string>();
    for (const operation of operations) {
      const number = operation.operationNumber ?? 0;
      const picture = pictures.get(number);
      if (!picture) continue;
      const continuedCollarSource =
        operation.inputKeys?.length === 1 && collarUnits.has(operation.inputKeys[0].trim())
          ? outputPictures.get(operation.inputKeys[0].trim())
          : undefined;
      const introducedCollar = (operation.inputKeys ?? []).some((input) => {
        const source = outputPictures.get(input.trim());
        if (!source)
          return ['collar', 'stand'].includes(
            readName(picture.geoms.get(input.trim())?.name ?? '').role ?? '',
          );
        const sourceKeys = visiblePictureKeys(source);
        const sourceStructure = sourceKeys.filter((key) =>
          ['front', 'back', 'yoke', 'side', 'sleeve'].includes(
            readName(source.geoms.get(key)?.name ?? '').role ?? '',
          ),
        );
        return (
          sourceStructure.length < 3 &&
          sourceKeys.some((key) =>
            ['collar', 'stand'].includes(readName(source.geoms.get(key)?.name ?? '').role ?? ''),
          )
        );
      });
      const inheritedBodies = introducedCollar
        ? (operation.inputKeys ?? []).flatMap((input) => {
            const source = outputPictures.get(input.trim());
            if (!source) return [];
            const structural = visiblePictureKeys(source).filter((key) => {
              const role = readName(source.geoms.get(key)?.name ?? '').role;
              return (
                ['front', 'back', 'yoke', 'side', 'sleeve'].includes(role ?? '') &&
                !isLiningPiece(source, key)
              );
            });
            // Preserve a body that was already assembled as one input. Doing this for the separate
            // panel inputs of the body-assembly operation itself can undo its valid seam layout.
            return structural.length >= 3
              ? [{ source, keys: visiblePictureKeys(source), structural }]
              : [];
          })
        : [];
      const inheritedStructure = new Set(inheritedBodies.flatMap(({ structural }) => structural));
      const inheritedPieces = new Set(inheritedBodies.flatMap(({ keys }) => keys));
      let finalized = layerSecondaryPieces(picture, operation);
      if (continuedCollarSource) {
        finalized = {
          ...finalized,
          layoutLeaves: continuedCollarSource.layoutLeaves,
          layout: continuedCollarSource.layout,
        };
      }
      if (inheritedStructure.size) {
        const layeredInputs = new Set(
          [...inheritedStructure]
            .map((key) => finalized.layout.input.get(key))
            .filter((input): input is number => input != null),
        );
        const T = new Map(finalized.layout.T);
        for (const { source, keys } of inheritedBodies) {
          const anchor = [...keys].sort(
            (left, right) =>
              Math.abs(finalized.geoms.get(right)?.areaMm2 ?? 0) -
              Math.abs(finalized.geoms.get(left)?.areaMm2 ?? 0),
          )[0];
          const sourceAnchor = source.layout.T.get(anchor);
          const currentAnchor = T.get(anchor);
          if (!sourceAnchor || !currentAnchor) continue;
          const correction = compose(currentAnchor, invert(sourceAnchor));
          for (const key of keys) {
            const transform = source.layout.T.get(key);
            if (transform && T.has(key)) T.set(key, compose(correction, transform));
          }
        }
        const points = [...T].flatMap(([key, transform]) =>
          (finalized.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
        );
        finalized = {
          ...finalized,
          layout: {
            ...finalized.layout,
            T,
            bbox: boxOf(points),
            layers: finalized.layout.layers.filter(([input]) => !layeredInputs.has(input)),
            pieceLayers: finalized.layout.pieceLayers.filter(
              ([piece]) => !inheritedStructure.has(piece),
            ),
          },
        };
        finalized = separateAddedBodyPieces(finalized, inheritedPieces);
      }
      finalized = tightenPanelAssembly(dockLoosePicture(restoreEdgeTreatments(finalized)));
      pictures.set(number, finalized);
      const output = operation.outputUnitKey?.trim();
      if (output) {
        outputPictures.set(output, finalized);
        if (introducedCollar) collarUnits.add(output);
      }
    }

    // The semantic layering/collar pass above is allowed to place new work, but it may not hide or
    // re-form an input that was already complete. Reassert the finished-input contract last and
    // carry the corrected result forward through output units.
    const finalOutputs = new Map<string, StepPicture>();
    for (const operation of operations) {
      const number = operation.operationNumber ?? 0;
      const picture = pictures.get(number);
      if (!picture) continue;
      const sources = (operation.inputKeys ?? []).flatMap((input) => {
        const key = input.trim();
        const source = finalOutputs.get(key);
        return protectedUnits.has(key) && source && source !== picture ? [source] : [];
      });
      const finalPicture = sources.length
        ? restoreEdgeTreatments(restoreFinishedInputPictures(picture, sources))
        : picture;
      pictures.set(number, finalPicture);
      const output = operation.outputUnitKey?.trim();
      if (output) finalOutputs.set(output, finalPicture);
    }

    // A handle/binding or tiny anonymous detail can be finished in parallel after a panel-ring
    // host is complete. Its own operation still shows that host; ordinary garment details keep
    // their semantic edge-placement pass above.
    const finishedPictures = new Map(pictures);
    const producer = new Map<string, number>();
    operations.forEach((operation, index) => {
      const output = operation.outputUnitKey?.trim();
      if (output) producer.set(output, index);
    });
    const latestPictureOf = (unit: string, before: number) => {
      let latest: StepPicture | undefined;
      for (let index = 0; index < before; index++) {
        const operation = operations[index];
        const output = operation.outputUnitKey?.trim();
        const continues =
          !output &&
          (operation.inputKeys ?? []).filter((key) => key.trim()).length === 1 &&
          operation.inputKeys?.[0]?.trim() === unit;
        if (output === unit || continues)
          latest = finishedPictures.get(operation.operationNumber ?? 0) ?? latest;
      }
      return latest;
    };
    const futureHostOf = (at: number) => {
      const operation = operations[at];
      const initial = operation.outputUnitKey?.trim()
        ? [operation.outputUnitKey.trim()]
        : (operation.inputKeys ?? []).map((key) => key.trim()).filter(Boolean);
      const lineage = new Set(initial);
      let best: StepPicture | undefined;
      let bestPieces = 0;
      for (let index = at + 1; index < operations.length; index++) {
        const candidate = operations[index];
        const inputs = (candidate.inputKeys ?? []).map((key) => key.trim()).filter(Boolean);
        if (!inputs.some((key) => lineage.has(key))) continue;
        for (const key of inputs) {
          if (lineage.has(key) || (producer.get(key) ?? Infinity) >= at) continue;
          const picture = latestPictureOf(key, at);
          const pieces = picture ? visiblePictureKeys(picture).length : 0;
          if (picture && !stripOnlyPicture(picture) && pieces > bestPieces) {
            best = picture;
            bestPieces = pieces;
          }
        }
        const output = candidate.outputUnitKey?.trim();
        if (output) lineage.add(output);
      }
      return best;
    };
    operations.forEach((operation, index) => {
      const number = operation.operationNumber ?? 0;
      const picture = finishedPictures.get(number);
      if (!picture) return;
      const shown = visiblePictureKeys(picture);
      const shownSet = new Set(shown);
      const panelRingKeys = shown.filter(
        (key) =>
          identicalCutFamily(picture, key).filter((candidate) => shownSet.has(candidate)).length >=
          6,
      );
      const carriesPanelRing = panelRingKeys.length >= 6;
      if (carriesPanelRing) {
        const corrected = dockLoosePicture(
          separateAddedBodyPieces(picture, new Set(panelRingKeys)),
        );
        pictures.set(number, corrected);
        finishedPictures.set(number, corrected);
        return;
      }
      const tinyAnonymous =
        shown.length <= 2 &&
        shown.every((key) => !readName(picture.geoms.get(key)?.name ?? '').role);
      if (!stripOnlyPicture(picture) && !tinyAnonymous) return;
      const host = futureHostOf(index);
      if (!host) return;
      const hostShown = new Set(visiblePictureKeys(host));
      if (
        ![...hostShown].some(
          (key) =>
            identicalCutFamily(host, key).filter((candidate) => hostShown.has(candidate)).length >=
            6,
        )
      )
        return;
      const docked = dockLoosePicture(dockFinishedPictures(host, picture));
      pictures.set(number, docked);
      finishedPictures.set(number, docked);
    });
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
