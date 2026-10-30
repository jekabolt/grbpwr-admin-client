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
  stepLayout,
  type StepLayout,
} from 'components/managers/tech-card/components/step-seams/step-picture';
import type { Affine, Pt2 } from 'lib/assembly-skeleton/types';
import { pairOverlap, pieceKeyOf, rasterize } from 'lib/assembly-skeleton/union';
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
  const visible = visiblePictureKeys(picture);
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
  const oneBodyView =
    new Set(bodyPair.map((key) => role(key).role)).has('front') &&
    new Set(bodyPair.map((key) => role(key).role)).has('back') &&
    bodyPair.every((key) => !role(key).hand);
  const bodyLeaders = oneBodyView
    ? [bodyPair.find((key) => role(key).role === 'front') ?? bodyPair[0]]
    : bodyPair;

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
  }
  const bodyPoints = bodyLeaders.flatMap((key) =>
    ring(key).map((point) => apply(T.get(key)!, point)),
  );
  let bodyBox = boxOf(bodyPoints);
  const [leftSleeve, rightSleeve] = sleevePair;
  const leftBox = boxOf(ring(leftSleeve));
  const rightBox = boxOf(ring(rightSleeve));
  place(leftSleeve, bodyBox.x0 - leftBox.x1, bodyBox.y1 - leftBox.y1);
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

  const pieceLayers = [...picture.layout.pieceLayers];
  const layerOn = (key: string, leaders: readonly string[]) => {
    const hand = role(key).hand;
    const leader = leaders.find((candidate) => hand && role(candidate).hand === hand) ?? leaders[0];
    pieceLayers.push([key, leader]);
    T.set(key, T.get(leader)!);
  };
  for (const key of bodies) if (!bodyLeaders.includes(key)) layerOn(key, bodyLeaders);
  for (const key of sleeves) if (!sleevePair.includes(key)) layerOn(key, sleevePair);

  const collar = [...collars].sort((a, b) => area(b) - area(a))[0];
  if (collar) {
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
      const host = (picture.geoms.get(hostKey)?.rs ?? []).map((point) =>
        apply(T.get(hostKey)!, point),
      );
      const part = (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
      let nearest: { distance: number; host: Pt2; part: Pt2 } | null = null;
      for (const hostPoint of host)
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
  if (keys.length < 3) return null;
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const area = (key: string) => Math.abs(picture.geoms.get(key)?.areaMm2 ?? 0);
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

/** Re-attach named edge treatments after compact packing. */
function restoreEdgeTreatments(picture: StepPicture): StepPicture {
  const visible = visiblePictureKeys(picture);
  const reading = (key: string) => readName(picture.geoms.get(key)?.name ?? '');
  const T = new Map(picture.layout.T);
  const ring = (key: string) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(T.get(key)!, point));
  const move = (key: string, dx: number, dy: number) =>
    T.set(key, compose(translate(dx, dy), T.get(key)!));
  const collarRoles = new Set(['collar', 'stand', 'rib']);
  const collars = visible.filter((key) => collarRoles.has(reading(key).role ?? ''));
  const body = visible.filter((key) => !collars.includes(key) && reading(key).role !== 'cuff');
  const sleeves = visible.filter((key) => reading(key).role === 'sleeve');
  const collarBody = body.filter((key) =>
    ['front', 'back', 'yoke', 'side'].includes(reading(key).role ?? ''),
  );
  if (collars.length && collarBody.length) {
    const leader = [...collars].sort(
      (left, right) =>
        Math.abs(picture.geoms.get(right)?.areaMm2 ?? 0) -
        Math.abs(picture.geoms.get(left)?.areaMm2 ?? 0),
    )[0];
    const initial = ring(leader);
    const centrePoint: Pt2 = [
      initial.reduce((sum, point) => sum + point[0], 0) / initial.length,
      initial.reduce((sum, point) => sum + point[1], 0) / initial.length,
    ];
    const covariance = initial.reduce<[number, number, number]>(
      (sum, point) => {
        const x = point[0] - centrePoint[0];
        const y = point[1] - centrePoint[1];
        return [sum[0] + x * x, sum[1] + x * y, sum[2] + y * y];
      },
      [0, 0, 0],
    );
    const angle = 0.5 * Math.atan2(2 * covariance[1], covariance[0] - covariance[2]);
    if (Math.abs(Math.sin(angle)) > 0.12) {
      const cosine = Math.cos(-angle);
      const sine = Math.sin(-angle);
      const straighten: Affine = [cosine, sine, -sine, cosine, 0, 0];
      T.set(
        leader,
        compose(
          translate(centrePoint[0], centrePoint[1]),
          compose(straighten, compose(translate(-centrePoint[0], -centrePoint[1]), T.get(leader)!)),
        ),
      );
    }
    const bodyPoints = collarBody.flatMap(ring);
    const bodyBox = boxOf(bodyPoints);
    const centre = (bodyBox.x0 + bodyBox.x1) / 2;
    const necks = collarBody.flatMap((key) => {
      const points = ring(key);
      const box = boxOf(points);
      const height = Math.max(box.y1 - box.y0, 1);
      const crown = points.filter((point) => point[1] >= box.y1 - 0.02 * height);
      const stride = Math.max(1, Math.floor(crown.length / 24));
      return crown.filter((_, index) => index % stride === 0);
    });
    const points = ring(leader);
    const box = boxOf(points);
    const low = Math.min(...points.map((point) => point[1]));
    const contact = points
      .filter((point) => point[1] <= low + 0.15 * Math.max(box.y1 - box.y0, 1))
      .reduce((best, point) =>
        Math.abs(point[0] - (box.x0 + box.x1) / 2) < Math.abs(best[0] - (box.x0 + box.x1) / 2)
          ? point
          : best,
      );
    const neck = necks.reduce((best, point) => {
      const score = (candidate: Pt2) => {
        const moved = points.map(
          ([x, y]) => [x + candidate[0] - contact[0], y + candidate[1] - contact[1]] as Pt2,
        );
        const raster = rasterize(moved, 2);
        const overlap = Math.max(
          ...body.map((key) => pairOverlap(raster, rasterize(ring(key), 2))),
          0,
        );
        return overlap + 0.00001 * Math.abs(candidate[0] - centre);
      };
      return score(point) < score(best) ? point : best;
    });
    move(leader, neck[0] - contact[0], neck[1] - contact[1]);
    const collarCentreX = () => {
      const collarBox = boxOf(ring(leader));
      return (collarBox.x0 + collarBox.x1) / 2;
    };
    const sleeveGroups = new Map<string, string[]>();
    for (const sleeve of sleeves) {
      const group = reading(sleeve).hand ?? sleeve;
      sleeveGroups.set(group, [...(sleeveGroups.get(group) ?? []), sleeve]);
    }
    for (const group of sleeveGroups.values()) {
      const sleeveBox = boxOf(group.flatMap(ring));
      const direction = (sleeveBox.x0 + sleeveBox.x1) / 2 < collarCentreX() ? -2 : 2;
      const maxShift = 0.35 * Math.max(sleeveBox.x1 - sleeveBox.x0, 1);
      for (let shifted = 0; shifted <= maxShift; shifted += 2) {
        const collarRaster = rasterize(ring(leader), 2);
        const overlap = Math.max(
          ...group.map((sleeve) => pairOverlap(collarRaster, rasterize(ring(sleeve), 2))),
          0,
        );
        if (overlap <= 0.15) break;
        for (const sleeve of group) move(sleeve, direction, 0);
      }
    }
    const maxOverlap = () => {
      const collarRing = ring(leader);
      const collarRaster = rasterize(collarRing, 2);
      return Math.max(...body.map((key) => pairOverlap(collarRaster, rasterize(ring(key), 2))), 0);
    };
    const clearance = 0.15 * Math.max(bodyBox.x1 - bodyBox.x0, bodyBox.y1 - bodyBox.y0, 1);
    for (let offset = 2; maxOverlap() > 0.15 && offset <= clearance; offset += 2)
      move(leader, 0, 2);
  }

  const cuffs = visible.filter((key) => reading(key).role === 'cuff');
  const bodyPoints = body.filter((key) => !sleeves.includes(key)).flatMap(ring);
  const bodyCentre = bodyPoints.length
    ? (bodyPoints
        .reduce<Pt2>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
        .map((value) => value / bodyPoints.length) as Pt2)
    : ([0, 0] as Pt2);
  for (const cuff of cuffs) {
    const hand = reading(cuff).hand;
    const sleeve =
      sleeves.find((key) => hand && reading(key).hand === hand) ??
      sleeves.sort(
        (left, right) =>
          Math.abs(picture.geoms.get(right)?.areaMm2 ?? 0) -
          Math.abs(picture.geoms.get(left)?.areaMm2 ?? 0),
      )[0];
    if (!sleeve) continue;
    const sleevePoints = ring(sleeve);
    const end = sleevePoints.reduce((best, point) =>
      Math.hypot(point[0] - bodyCentre[0], point[1] - bodyCentre[1]) >
      Math.hypot(best[0] - bodyCentre[0], best[1] - bodyCentre[1])
        ? point
        : best,
    );
    const cuffPoints = ring(cuff);
    const contact = cuffPoints.reduce((best, point) =>
      Math.hypot(point[0] - end[0], point[1] - end[1]) <
      Math.hypot(best[0] - end[0], best[1] - end[1])
        ? point
        : best,
    );
    move(cuff, end[0] - contact[0], end[1] - contact[1]);
  }
  const points = [...T].flatMap(([key, transform]) =>
    (picture.geoms.get(key)?.rs ?? []).map((point) => apply(transform, point)),
  );
  const collarLeader = [...collars].sort(
    (left, right) =>
      Math.abs(picture.geoms.get(right)?.areaMm2 ?? 0) -
      Math.abs(picture.geoms.get(left)?.areaMm2 ?? 0),
  )[0];
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
function compactFinalPicture(picture: StepPicture, force = false): StepPicture {
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
  const sleeved = sleevedFinalPicture(picture);
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
        ['collar', 'stand', 'rib', 'cuff'].includes(
          readName(picture.geoms.get(key)?.name ?? '').role ?? '',
        ),
      );
      const needsStructuralRepair = useInferredLayout || rawNeedsCompact || rawNeedsAspect;
      const radial = needsStructuralRepair ? radialBasePicture(picture) : null;
      const panelTopology = trouserFrontPicture(picture);
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
      const sleeved = needsStructuralRepair ? sleevedFinalPicture(picture) : null;
      const panelUnit = needsStructuralRepair ? panelUnitPicture(picture) : null;
      let revised = radial ?? trouser ?? sleeved ?? panelUnit ?? picture;
      const rings = visiblePictureKeys(revised).map((key) =>
        (revised.geoms.get(key)?.rs ?? []).map((point) => apply(revised.layout.T.get(key)!, point)),
      );
      if (rings.length < 2) {
        pictures.set(number, revised);
        continue;
      }
      const needsCompact = hullCompactness(rings) < 0.355;
      const needsAspect = !rings.every((ring) => ringAspect(ring) >= 4) && ringsAspect(rings) > 4;
      const needsFinalFrame =
        number === final?.[0] && rings.length > 2 && frameFill(rings.flat()) < 0.59;
      if (needsCompact || needsAspect || needsFinalFrame)
        revised = compactFinalPicture(revised, true);
      const restored =
        needsStructuralRepair || hasEdgeTreatments || revised !== picture
          ? restoreEdgeTreatments(revised)
          : revised;
      pictures.set(number, hasEdgeTreatments ? dockLoosePicture(restored) : restored);
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
    const points = part.pts.map(([x, y]) => [x, -y] as Pt2);
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
