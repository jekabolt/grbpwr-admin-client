import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_V1 =
  'pattern-import-dxf-phase-e-cad-table-piece-layout-session/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_CLAIMS_V1 = Object.freeze({
  arbitraryPieceCount: true,
  stablePieceIdentityUsesIdAndLineKey: true,
  sessionOnly: true,
  authoritativeContourGeometryMutated: false,
  placementOffsetsAreDisplayOnly: true,
  multiSelection: true,
  shiftToggle: true,
  boxSelectionByDisplayedMaterial: true,
  lassoSelectionByDisplayedMaterial: true,
  groupTranslation: true,
  resetOffsets: true,
  fitDisplayedBounds: true,
} as const);

type ProjectedPieceV1 = PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];

export type PatternImportDxfPhaseECadTablePieceIdentityV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  key: string;
}>;

export type PatternImportDxfPhaseECadTablePieceLayoutV1 = Readonly<{
  identity: PatternImportDxfPhaseECadTablePieceIdentityV1;
  /** Exact source bounds copied from the projection; never rewritten by table placement. */
  sourceBounds: BoxMm;
  /** Closed outer contour and holes in source coordinates, shared by selection and rendering. */
  sourceMaterialRings: readonly (readonly PtMm[])[];
  /** Session-only display translation. It is not part of Phase-D or card geometry. */
  offsetMm: PtMm;
  /** Counterclockwise in source millimetres about the source-bounds centre. Legacy layouts use 0. */
  rotationDegrees?: number;
  /** All rendered contour points, including open paths outside the material. */
  sourceContourPoints?: readonly PtMm[];
}>;

export type PatternImportDxfPhaseECadTablePieceLayoutSessionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_V1;
  pieces: readonly PatternImportDxfPhaseECadTablePieceLayoutV1[];
  selectedPieceKeys: readonly string[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTablePieceSelectionModeV1 = 'replace' | 'add' | 'toggle';

const ZERO_OFFSET = Object.freeze({ x: 0, y: 0 });

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function finitePoint(point: PtMm): boolean {
  return finite(point.x) && finite(point.y);
}

function normalizeBounds(bounds: BoxMm): BoxMm {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(finite))
    throw new TypeError('CAD table piece bounds must contain finite coordinates.');
  return Object.freeze({
    minX: Math.min(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxY: Math.max(bounds.minY, bounds.maxY),
  });
}

function projectionBounds(piece: ProjectedPieceV1): BoxMm {
  return normalizeBounds({
    minX: piece.cameraMm.minX,
    minY: piece.cameraMm.minY,
    maxX: piece.cameraMm.maxX,
    maxY: piece.cameraMm.maxY,
  });
}

function materialRings(piece: ProjectedPieceV1): readonly (readonly PtMm[])[] {
  const closed = piece.contours.filter(({ closed, vertices }) => closed && vertices.length >= 3);
  const outerRole = closed.some(({ role }) => role === 'cut-boundary')
    ? 'cut-boundary'
    : 'sewing-boundary';
  if (!closed.some(({ role }) => role === outerRole)) return Object.freeze([]);
  return Object.freeze(
    closed
      .filter(({ role }) => role === outerRole || role === 'hole')
      .map(({ vertices }) => Object.freeze(vertices.map(({ pointMm }) => pointMm))),
  );
}

export function patternImportDxfPhaseECadTablePieceKeyV1(
  pieceId: string,
  pieceLineKey: string,
): string {
  const id = pieceId.trim();
  const lineKey = pieceLineKey.trim();
  if (!id || !lineKey)
    throw new TypeError('CAD table piece identity requires pieceId and pieceLineKey.');
  return `${encodeURIComponent(id)}::${encodeURIComponent(lineKey)}`;
}

function identityOf(piece: Pick<ProjectedPieceV1, 'pieceId' | 'pieceLineKey'>) {
  const pieceId = piece.pieceId.trim();
  const pieceLineKey = piece.pieceLineKey.trim();
  return Object.freeze({
    pieceId,
    pieceLineKey,
    key: patternImportDxfPhaseECadTablePieceKeyV1(pieceId, pieceLineKey),
  });
}

function freezePiece(
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
): PatternImportDxfPhaseECadTablePieceLayoutV1 {
  return Object.freeze({
    identity: Object.freeze({ ...piece.identity }),
    sourceBounds: normalizeBounds(piece.sourceBounds),
    sourceMaterialRings: piece.sourceMaterialRings,
    sourceContourPoints: piece.sourceContourPoints,
    rotationDegrees: piece.rotationDegrees ?? 0,
    offsetMm: Object.freeze({ ...piece.offsetMm }),
  });
}

function freezeSession(
  pieces: readonly PatternImportDxfPhaseECadTablePieceLayoutV1[],
  selectedPieceKeys: readonly string[],
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  const pieceKeys = new Set(pieces.map(({ identity }) => identity.key));
  const selected = pieces
    .map(({ identity }) => identity.key)
    .filter((key) => selectedPieceKeys.includes(key) && pieceKeys.has(key));
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_V1,
    pieces: Object.freeze(pieces.map(freezePiece)),
    selectedPieceKeys: Object.freeze(selected),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PIECE_LAYOUT_SESSION_CLAIMS_V1,
  });
}

function validatedPieces(
  pieces: readonly ProjectedPieceV1[],
): readonly PatternImportDxfPhaseECadTablePieceLayoutV1[] {
  const keys = new Set<string>();
  return Object.freeze(
    pieces.map((piece) => {
      const identity = identityOf(piece);
      if (keys.has(identity.key))
        throw new TypeError(`Duplicate CAD table piece identity: ${identity.key}.`);
      keys.add(identity.key);
      return freezePiece({
        identity,
        sourceBounds: projectionBounds(piece),
        sourceMaterialRings: materialRings(piece),
        sourceContourPoints: Object.freeze(
          piece.contours.flatMap(({ vertices }) => vertices.map(({ pointMm }) => pointMm)),
        ),
        offsetMm: ZERO_OFFSET,
      });
    }),
  );
}

export function createPatternImportDxfPhaseECadTablePieceLayoutSessionV1(
  pieces: readonly ProjectedPieceV1[],
  selectedPieceKeys: readonly string[] = [],
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  return freezeSession(validatedPieces(pieces), selectedPieceKeys);
}

/** Keeps local placement only for exact identities still present in a newly prepared projection. */
export function reconcilePatternImportDxfPhaseECadTablePieceLayoutSessionV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  pieces: readonly ProjectedPieceV1[],
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  const previous = new Map(session.pieces.map((piece) => [piece.identity.key, piece] as const));
  const next = validatedPieces(pieces).map((piece) => ({
    ...piece,
    offsetMm: previous.get(piece.identity.key)?.offsetMm ?? ZERO_OFFSET,
    rotationDegrees: previous.get(piece.identity.key)?.rotationDegrees ?? 0,
  }));
  return freezeSession(next, session.selectedPieceKeys);
}

function selectedKeys(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  candidates: readonly string[],
  mode: PatternImportDxfPhaseECadTablePieceSelectionModeV1,
): readonly string[] {
  const pieceOrder = session.pieces.map(({ identity }) => identity.key);
  const validCandidates = new Set(candidates.filter((key) => pieceOrder.includes(key)));
  const next = new Set(mode === 'replace' ? [] : session.selectedPieceKeys);
  for (const key of validCandidates) {
    if (mode === 'toggle' && next.has(key)) next.delete(key);
    else next.add(key);
  }
  return pieceOrder.filter((key) => next.has(key));
}

export function selectPatternImportDxfPhaseECadTablePiecesV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  pieceKeys: readonly string[],
  mode: PatternImportDxfPhaseECadTablePieceSelectionModeV1 = 'replace',
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  return freezeSession(session.pieces, selectedKeys(session, pieceKeys, mode));
}

function centre(bounds: BoxMm): PtMm {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

function normalizedDegrees(degrees: number) {
  if (!finite(degrees)) throw new TypeError('CAD table rotation must be finite.');
  const remainder = degrees % 360;
  return remainder < 0 ? (remainder + 360) % 360 : remainder || 0;
}

function rotation(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  // Exact quarter turns preserve boundary comparisons on axis-aligned contours.
  const quadrant = degrees % 90 === 0;
  const cos = quadrant ? Math.round(Math.cos(radians)) : Math.cos(radians);
  const sin = quadrant ? Math.round(Math.sin(radians)) : Math.sin(radians);
  return { cos, sin };
}

/** The same rigid map drives SVG contours, exact seam hits, material selection and fitted bounds. */
export function cadTablePieceRigidTransformV1(piece: PatternImportDxfPhaseECadTablePieceLayoutV1) {
  const pivot = centre(piece.sourceBounds);
  const offset = piece.offsetMm;
  const angle = normalizedDegrees(piece.rotationDegrees ?? 0);
  const { cos, sin } = rotation(angle);
  return {
    toDisplay(point: PtMm): PtMm {
      if (!angle) return { x: point.x + offset.x, y: point.y + offset.y };
      const x = point.x - pivot.x;
      const y = point.y - pivot.y;
      return {
        x: pivot.x + offset.x + cos * x - sin * y,
        y: pivot.y + offset.y + sin * x + cos * y,
      };
    },
    toSource(point: PtMm): PtMm {
      if (!angle) return { x: point.x - offset.x, y: point.y - offset.y };
      const x = point.x - offset.x - pivot.x;
      const y = point.y - offset.y - pivot.y;
      return { x: pivot.x + cos * x + sin * y, y: pivot.y - sin * x + cos * y };
    },
    svgTransform(yAxis: 'source' | 'inverted') {
      const sign = yAxis === 'inverted' ? -1 : 1;
      const translation = `translate(${offset.x} ${sign * offset.y})`;
      return angle
        ? `${translation} rotate(${sign * angle} ${pivot.x} ${sign * pivot.y})`
        : translation;
    },
  };
}

export function cadTablePieceSvgTransformV1(
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
  yAxis: 'source' | 'inverted',
) {
  return cadTablePieceRigidTransformV1(piece).svgTransform(yAxis);
}

export function displayedPatternImportDxfPhaseECadTablePieceBoundsV1(
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
): BoxMm {
  const { minX, maxX, minY, maxY } = piece.sourceBounds;
  if (!piece.rotationDegrees)
    return Object.freeze({
      minX: minX + piece.offsetMm.x,
      minY: minY + piece.offsetMm.y,
      maxX: maxX + piece.offsetMm.x,
      maxY: maxY + piece.offsetMm.y,
    });
  const { toDisplay } = cadTablePieceRigidTransformV1(piece);
  const points = piece.sourceContourPoints?.length
    ? piece.sourceContourPoints
    : [
        { x: minX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
      ];
  const first = toDisplay(points[0]!);
  const bounds = { minX: first.x, maxX: first.x, minY: first.y, maxY: first.y };
  for (const point of points) {
    const { x, y } = toDisplay(point);
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return Object.freeze(bounds);
}

function boundsIntersect(left: BoxMm, right: BoxMm): boolean {
  return !(
    left.maxX < right.minX ||
    left.minX > right.maxX ||
    left.maxY < right.minY ||
    left.minY > right.maxY
  );
}

export function selectPatternImportDxfPhaseECadTablePiecesInBoxV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  box: BoxMm,
  mode: PatternImportDxfPhaseECadTablePieceSelectionModeV1 = 'replace',
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  const { minX, minY, maxX, maxY } = normalizeBounds(box);
  return selectPatternImportDxfPhaseECadTablePiecesInLassoV1(
    session,
    [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    mode,
  );
}

function pointInPolygon(point: PtMm, polygon: readonly PtMm[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInMaterial(point: PtMm, rings: readonly (readonly PtMm[])[]): boolean {
  if (rings.reduce((inside, ring) => inside !== pointInPolygon(point, ring), false)) return true;
  return rings.some((ring) =>
    ring.some((start, i) => onSegment(start, point, ring[(i + 1) % ring.length]!)),
  );
}

/** The first click follows SVG paint order. A repeated click can reach pieces underneath. */
export function nextPatternImportDxfPhaseECadTablePieceHitV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  pointedKey: string,
  point: PtMm,
): string {
  if (!pointedKey || session.selectedPieceKeys.length !== 1) return pointedKey;
  const bounds = { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
  const hits = session.pieces
    .filter(
      (piece) =>
        boundsIntersect(displayedPatternImportDxfPhaseECadTablePieceBoundsV1(piece), bounds) &&
        pointInMaterial(
          cadTablePieceRigidTransformV1(piece).toSource(point),
          piece.sourceMaterialRings,
        ),
    )
    .map(({ identity }) => identity.key)
    .reverse();
  const currentIndex = hits.indexOf(session.selectedPieceKeys[0]!);
  return currentIndex >= 0 && hits.includes(pointedKey)
    ? hits[(currentIndex + 1) % hits.length]!
    : pointedKey;
}

function orientation(a: PtMm, b: PtMm, c: PtMm): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: PtMm, b: PtMm, c: PtMm): boolean {
  // Inverting a free-angle display rotation can move an exact boundary point by a few ulps.
  const tolerance =
    16 *
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(a.x),
      Math.abs(a.y),
      Math.abs(b.x),
      Math.abs(b.y),
      Math.abs(c.x),
      Math.abs(c.y),
    );
  return (
    b.x >= Math.min(a.x, c.x) - tolerance &&
    b.x <= Math.max(a.x, c.x) + tolerance &&
    b.y >= Math.min(a.y, c.y) - tolerance &&
    b.y <= Math.max(a.y, c.y) + tolerance &&
    Math.abs(orientation(a, b, c)) <=
      tolerance * Math.max(1, Math.abs(c.x - a.x), Math.abs(c.y - a.y))
  );
}

function segmentsIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return onSegment(a, c, b) || onSegment(a, d, b) || onSegment(c, a, d) || onSegment(c, b, d);
}

function polygonIntersectsMaterial(
  polygon: readonly PtMm[],
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
): boolean {
  const rings = piece.sourceMaterialRings;
  const local = polygon.map(cadTablePieceRigidTransformV1(piece).toSource);
  if (local.some((point) => pointInMaterial(point, rings))) return true;

  return rings.some((ring) =>
    ring.some(
      (start, index) =>
        pointInPolygon(start, local) ||
        local.some((from, edgeIndex) =>
          segmentsIntersect(
            start,
            ring[(index + 1) % ring.length]!,
            from,
            local[(edgeIndex + 1) % local.length]!,
          ),
        ),
    ),
  );
}

export function selectPatternImportDxfPhaseECadTablePiecesInLassoV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  polygon: readonly PtMm[],
  mode: PatternImportDxfPhaseECadTablePieceSelectionModeV1 = 'replace',
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  if (polygon.length < 3 || polygon.some((point) => !finitePoint(point)))
    throw new TypeError('CAD table lasso requires at least three finite points.');
  const bounds = polygon.reduce(
    ({ minX, minY, maxX, maxY }, { x, y }) => ({
      minX: Math.min(minX, x),
      minY: Math.min(minY, y),
      maxX: Math.max(maxX, x),
      maxY: Math.max(maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const candidates = session.pieces
    .filter(
      (piece) =>
        boundsIntersect(bounds, displayedPatternImportDxfPhaseECadTablePieceBoundsV1(piece)) &&
        polygonIntersectsMaterial(polygon, piece),
    )
    .map(({ identity }) => identity.key);
  return selectPatternImportDxfPhaseECadTablePiecesV1(session, candidates, mode);
}

export function translateSelectedPatternImportDxfPhaseECadTablePiecesV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  deltaMm: PtMm,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  if (!finitePoint(deltaMm)) throw new TypeError('CAD table translation must be finite.');
  if ((!deltaMm.x && !deltaMm.y) || !session.selectedPieceKeys.length) return session;
  const selected = new Set(session.selectedPieceKeys);
  return freezeSession(
    session.pieces.map((piece) =>
      selected.has(piece.identity.key)
        ? {
            ...piece,
            offsetMm: {
              x: piece.offsetMm.x + deltaMm.x,
              y: piece.offsetMm.y + deltaMm.y,
            },
          }
        : piece,
    ),
    session.selectedPieceKeys,
  );
}

/** Rotates the selection as a rigid group about its mean displayed piece centre. */
export function rotateSelectedCadTablePiecesV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  deltaDegrees: number,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  const angle = normalizedDegrees(deltaDegrees);
  if (!angle || !session.selectedPieceKeys.length) return session;
  const selected = new Set(session.selectedPieceKeys);
  const centres = new Map(
    session.pieces
      .filter((piece) => selected.has(piece.identity.key))
      .map((piece) => {
        const point = centre(piece.sourceBounds);
        return [
          piece.identity.key,
          { x: point.x + piece.offsetMm.x, y: point.y + piece.offsetMm.y },
        ] as const;
      }),
  );
  const pivot = { x: 0, y: 0 };
  for (const point of centres.values()) {
    pivot.x += point.x / centres.size;
    pivot.y += point.y / centres.size;
  }
  const { cos, sin } = rotation(angle);
  return freezeSession(
    session.pieces.map((piece) => {
      const point = centres.get(piece.identity.key);
      if (!point) return piece;
      const x = point.x - pivot.x;
      const y = point.y - pivot.y;
      return {
        ...piece,
        rotationDegrees: normalizedDegrees((piece.rotationDegrees ?? 0) + angle),
        offsetMm: {
          x: piece.offsetMm.x + ((cos - 1) * x - sin * y),
          y: piece.offsetMm.y + (sin * x + (cos - 1) * y),
        },
      };
    }),
    session.selectedPieceKeys,
  );
}

export type CadTablePieceAlignmentV1 =
  | 'left'
  | 'center-x'
  | 'right'
  | 'bottom'
  | 'center-y'
  | 'top';

/** Aligns selected displayed bounds in source millimetres (top is maximum Y). */
export function alignSelectedCadTablePiecesV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  alignment: CadTablePieceAlignmentV1,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  if (session.selectedPieceKeys.length < 2) return session;
  const selected = new Set(session.selectedPieceKeys);
  const boxes = new Map(
    session.pieces
      .filter((piece) => selected.has(piece.identity.key))
      .map(
        (piece) =>
          [
            piece.identity.key,
            displayedPatternImportDxfPhaseECadTablePieceBoundsV1(piece),
          ] as const,
      ),
  );
  const group = unionBounds([...boxes.values()]);
  const horizontal = alignment === 'left' || alignment === 'center-x' || alignment === 'right';
  const edge = (box: BoxMm) => {
    switch (alignment) {
      case 'left':
        return box.minX;
      case 'right':
        return box.maxX;
      case 'bottom':
        return box.minY;
      case 'top':
        return box.maxY;
      case 'center-x':
        return (box.minX + box.maxX) / 2;
      case 'center-y':
        return (box.minY + box.maxY) / 2;
    }
  };
  const target = edge(group);
  return freezeSession(
    session.pieces.map((piece) => {
      const box = boxes.get(piece.identity.key);
      if (!box) return piece;
      const delta = target - edge(box);
      return {
        ...piece,
        offsetMm: {
          x: piece.offsetMm.x + (horizontal ? delta : 0),
          y: piece.offsetMm.y + (horizontal ? 0 : delta),
        },
      };
    }),
    session.selectedPieceKeys,
  );
}

export function resetPatternImportDxfPhaseECadTablePieceOffsetsV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  return freezeSession(
    session.pieces.map((piece) => ({ ...piece, offsetMm: ZERO_OFFSET })),
    session.selectedPieceKeys,
  );
}

/**
 * Packs displayed piece bounds into compact shelves without changing any source contour. This is
 * a session-only starting layout for the CAD table; operators can still move every piece freely.
 */
export function compactPatternImportDxfPhaseECadTablePieceOffsetsV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  gapMm = 24,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  if (!finite(gapMm) || gapMm < 0)
    throw new TypeError('CAD table compact-layout gap must be a finite non-negative number.');
  if (session.pieces.length < 2) return session;
  const dimensions = session.pieces
    .map(displayedPatternImportDxfPhaseECadTablePieceBoundsV1)
    .map((bounds) => ({
      bounds,
      width: Math.max(bounds.maxX - bounds.minX, 1),
      height: Math.max(bounds.maxY - bounds.minY, 1),
    }));
  const totalArea = dimensions.reduce((sum, { width, height }) => sum + width * height, 0);
  const widest = Math.max(...dimensions.map(({ width }) => width));
  const targetRowWidth = Math.max(widest, Math.sqrt(totalArea * 1.6));
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const compacted = session.pieces.map((piece, index) => {
    const size = dimensions[index]!;
    if (cursorX > 0 && cursorX + size.width > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + gapMm;
      rowHeight = 0;
    }
    const targetMinX = cursorX;
    const targetMinY = cursorY;
    cursorX += size.width + gapMm;
    rowHeight = Math.max(rowHeight, size.height);
    return {
      ...piece,
      offsetMm: {
        x: piece.offsetMm.x + (targetMinX - size.bounds.minX),
        y: piece.offsetMm.y + (targetMinY - size.bounds.minY),
      },
    };
  });
  return freezeSession(compacted, session.selectedPieceKeys);
}

function unionBounds(boxes: readonly BoxMm[]): BoxMm {
  return boxes.reduce(
    (bounds, box) => ({
      minX: Math.min(bounds.minX, box.minX),
      minY: Math.min(bounds.minY, box.minY),
      maxX: Math.max(bounds.maxX, box.maxX),
      maxY: Math.max(bounds.maxY, box.maxY),
    }),
    boxes[0]!,
  );
}

export function fitPatternImportDxfPhaseECadTablePieceBoundsV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  paddingMm = 0,
): BoxMm | null {
  if (!finite(paddingMm) || paddingMm < 0)
    throw new TypeError('CAD table fit padding must be a finite non-negative number.');
  if (!session.pieces.length) return null;
  const bounds = unionBounds(
    session.pieces.map(displayedPatternImportDxfPhaseECadTablePieceBoundsV1),
  );
  return Object.freeze({
    minX: bounds.minX - paddingMm,
    minY: bounds.minY - paddingMm,
    maxX: bounds.maxX + paddingMm,
    maxY: bounds.maxY + paddingMm,
  });
}
