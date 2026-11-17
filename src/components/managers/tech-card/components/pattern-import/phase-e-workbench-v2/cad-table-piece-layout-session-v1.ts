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

export function displayedPatternImportDxfPhaseECadTablePieceBoundsV1(
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
): BoxMm {
  return Object.freeze({
    minX: piece.sourceBounds.minX + piece.offsetMm.x,
    minY: piece.sourceBounds.minY + piece.offsetMm.y,
    maxX: piece.sourceBounds.maxX + piece.offsetMm.x,
    maxY: piece.sourceBounds.maxY + piece.offsetMm.y,
  });
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
  return rings.reduce((inside, ring) => inside !== pointInPolygon(point, ring), false);
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
          { x: point.x - piece.offsetMm.x, y: point.y - piece.offsetMm.y },
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
  return (
    b.x >= Math.min(a.x, c.x) &&
    b.x <= Math.max(a.x, c.x) &&
    b.y >= Math.min(a.y, c.y) &&
    b.y <= Math.max(a.y, c.y)
  );
}

function segmentsIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (
    (abC === 0 && onSegment(a, c, b)) ||
    (abD === 0 && onSegment(a, d, b)) ||
    (cdA === 0 && onSegment(c, a, d)) ||
    (cdB === 0 && onSegment(c, b, d))
  );
}

function polygonIntersectsMaterial(
  polygon: readonly PtMm[],
  piece: PatternImportDxfPhaseECadTablePieceLayoutV1,
): boolean {
  const { sourceMaterialRings: rings, offsetMm } = piece;
  const local = polygon.map(({ x, y }) => ({ x: x - offsetMm.x, y: y - offsetMm.y }));
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
  const dimensions = session.pieces.map(({ sourceBounds }) => ({
    width: Math.max(sourceBounds.maxX - sourceBounds.minX, 1),
    height: Math.max(sourceBounds.maxY - sourceBounds.minY, 1),
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
        x: targetMinX - piece.sourceBounds.minX,
        y: targetMinY - piece.sourceBounds.minY,
      },
    };
  });
  return freezeSession(compacted, session.selectedPieceKeys);
}

export function fitPatternImportDxfPhaseECadTablePieceBoundsV1(
  session: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  paddingMm = 0,
): BoxMm | null {
  if (!finite(paddingMm) || paddingMm < 0)
    throw new TypeError('CAD table fit padding must be a finite non-negative number.');
  if (!session.pieces.length) return null;
  const displayed = session.pieces.map(displayedPatternImportDxfPhaseECadTablePieceBoundsV1);
  return Object.freeze({
    minX: Math.min(...displayed.map(({ minX }) => minX)) - paddingMm,
    minY: Math.min(...displayed.map(({ minY }) => minY)) - paddingMm,
    maxX: Math.max(...displayed.map(({ maxX }) => maxX)) + paddingMm,
    maxY: Math.max(...displayed.map(({ maxY }) => maxY)) + paddingMm,
  });
}
