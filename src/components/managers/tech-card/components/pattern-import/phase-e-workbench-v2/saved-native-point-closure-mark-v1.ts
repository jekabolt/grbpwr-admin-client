import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
import type { DxfPathProvenanceDetailedReadV1 } from 'lib/pattern-import/adapters/dxf/dxf-types';
import { readDxfWithPathProvenanceV1 } from 'lib/pattern-import/adapters/dxf/extract';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import { createDxfSourceCurveIdV1 } from 'lib/pattern-import/dxf-path-provenance-v1';
import {
  computeDxfProductSavedSourceFileIdV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1,
  type DxfSourceNativeStraightEdgeDescriptorV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { bboxOf, footOnSegment, pointInPolygon } from 'lib/pattern-import/semantics/geom';
import { PATIMPORT, type IRPath } from 'lib/pattern-import/types';

export type SavedNativePointClosureMarkSelectionV1 = Readonly<{
  pieceLineKey: string;
  patternLineKey: string;
  dxfSha256: string;
  sizeId: number;
  aliasBlockName: string;
  role: 'BUTTONHOLE_MIDPOINT' | 'BUTTON_MARK_CENTER';
}>;

type MarkLocator = Readonly<{
  nativeBlockName: string;
  sourceInstancePath: readonly string[];
  sourceEntityOp: number;
}>;

export type SavedNativePointClosureMarkRequestV1 = SavedNativePointClosureMarkSelectionV1 &
  MarkLocator;

/** Supplied together by the caller's current saved-row, alias and selected-rank read. */
export type SavedNativePointClosureMarkSourceV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  bytes: ArrayBuffer;
  aliases: readonly Readonly<{ scopeKey: string; blockName: string; pieceLineKey: string }>[];
  size: Readonly<{ sizeId: number; sizeToken: string }>;
}>;

export type SavedNativePointClosureMarkV1 = SavedNativePointClosureMarkRequestV1 &
  Readonly<{
    sourceFileId: string;
    nativePathId: number;
    pointMm: Vec2Mm;
    markedSegmentMm?: readonly [Vec2Mm, Vec2Mm];
  }>;

const maxMarkVertices = 256;
const maxSelectableMarks = 128;
const readOptions = { sagittaMm: PATIMPORT.sagittaMm, keepFills: true };
type MarkPath = { path: IRPath; instancePath: readonly string[] };
const exactSequence = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function requireMark(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Saved native closure mark refused: ${detail}.`);
}

function captureLocator(sourceFileId: string, locator: MarkLocator): MarkLocator {
  const { nativeBlockName, sourceEntityOp } = locator;
  requireMark(
    nativeBlockName &&
      Array.isArray(locator.sourceInstancePath) &&
      locator.sourceInstancePath.length > 0 &&
      locator.sourceInstancePath.length <= 64,
    'one exact DXF block instance is required',
  );
  const sourceInstancePath = Object.freeze([...locator.sourceInstancePath]);
  requireMark(
    createDxfSourceCurveIdV1({
      sourceFileId,
      instancePath: sourceInstancePath,
      entityHandle: null,
      entityOp: sourceEntityOp,
      sub: 0,
      primitiveSegmentIndex: 0,
    }).ok,
    'the original instance or entity locator is invalid',
  );
  return { nativeBlockName, sourceEntityOp, sourceInstancePath };
}

function isRoleShape(path: IRPath, closed: boolean): boolean {
  return (
    path.closed === closed &&
    (closed ? path.pts.length >= 3 && path.pts.length <= maxMarkVertices : path.pts.length === 2)
  );
}

function markPaths(
  { read, provenance }: DxfPathProvenanceDetailedReadV1,
  aliasBlockName: string,
  sizeToken: string,
  closed: boolean,
  locator: MarkLocator | undefined,
): MarkPath[] {
  const ranked = segmentDxf(read).pieces.filter(
    (piece) =>
      piece.identity === aliasBlockName &&
      piece.sizeSource !== 'none' &&
      piece.size === sizeToken &&
      !piece.uni &&
      !piece.nested,
  );
  const instances = new Map(
    provenance.paths.map(({ pathId, provenance }) => [pathId, provenance.instancePath]),
  );
  const l8Paths = read.doc.pages.flatMap(({ paths, styles }) => {
    const l8 = new Set(styles.filter(({ layer }) => layer === '8').map(({ id }) => id));
    return paths.filter(({ style }) => l8.has(style));
  });

  if (locator) {
    const matches = l8Paths.filter(({ id, src }) => {
      const instance = instances.get(id);
      return (
        instance &&
        exactSequence(instance, locator.sourceInstancePath) &&
        src.block === locator.nativeBlockName &&
        src.op === locator.sourceEntityOp
      );
    });
    requireMark(matches.length === 1, 'the locator must select one original L8 entity');
    const [path] = matches;
    const groups = read.meta.groups.filter(({ paths }) => paths.includes(path.id));
    requireMark(
      groups.length === 1 &&
        groups[0].kind === 'insert' &&
        groups[0].block === locator.nativeBlockName,
      'the original L8 entity is outside the named block occurrence',
    );
    const current = ranked.filter(({ group }) => group === groups[0].index);
    requireMark(
      current.length === 1 && current[0].block === locator.nativeBlockName,
      'the original block does not match the current piece alias and declared rank',
    );
    requireMark(
      isRoleShape(path, closed),
      'the mark must be a closed polygon or a single open segment as declared by its role',
    );
    return [{ path, instancePath: locator.sourceInstancePath }];
  }

  requireMark(
    ranked.length === 1,
    'the current alias and declared rank must select one original block',
  );
  const [piece] = ranked;
  const groups = read.meta.groups.filter(
    ({ kind, block }) => kind === 'insert' && block === piece.block,
  );
  // Segmentation can collapse repeated copies. The list has no occurrence locator and cannot
  // choose one copy's page-space marks on the operator's behalf.
  requireMark(
    groups.length === 1 && groups[0].index === piece.group,
    'the current ranked block must have one original occurrence',
  );
  const ids = new Set(groups[0].paths);
  const l8 = l8Paths.filter(({ id, src }) => ids.has(id) && src.block === piece.block);
  const unique = new Set<number>();
  const duplicate = new Set<number>();
  for (const path of l8) {
    if (unique.has(path.src.op)) duplicate.add(path.src.op);
    unique.add(path.src.op);
  }
  return l8
    .flatMap((path) => {
      const instancePath = instances.get(path.id);
      const role = piece.roles[path.id];
      return instancePath?.length &&
        !duplicate.has(path.src.op) &&
        (role === 'internal' || role === 'drill') &&
        isRoleShape(path, closed)
        ? [{ path, instancePath }]
        : [];
    })
    .sort((a, b) => a.path.src.op - b.path.src.op);
}

async function readNativeEdges(
  file: { id: string; name: string; bytes: ArrayBuffer },
  sourceSha256: string,
  candidates: MarkPath[],
  allowUnsupported: boolean,
  signal?: AbortSignal,
): Promise<ReadonlyMap<number, DxfSourceNativeStraightEdgeDescriptorV1[]>> {
  const grouped = new Map<number, DxfSourceNativeStraightEdgeDescriptorV1[]>();
  if (candidates.length === 0) return grouped;
  requireMark(
    candidates.length <= maxSelectableMarks,
    'the selected piece has too many mark paths',
  );
  const selection = {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId: file.id,
    sourceSha256,
    sourcePathIds: candidates.map(({ path }) => path.id).sort((a, b) => a - b),
  };
  const native = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
    file,
    readOptions,
    selection,
  );
  signal?.throwIfAborted();
  if (!native.ok && allowUnsupported && native.blockers.length > 0) {
    const reject = new Set(native.blockers.map(({ sourcePathId }) => sourcePathId));
    if (
      native.blockers.every(
        ({ code, sourcePathId }) =>
          code === 'path-provenance-unavailable' &&
          sourcePathId !== null &&
          selection.sourcePathIds.includes(sourcePathId),
      )
    ) {
      // One fresh replay of the surviving paths is required. A global blocker never reaches here.
      return readNativeEdges(
        file,
        sourceSha256,
        candidates.filter(({ path }) => !reject.has(path.id)),
        false,
        signal,
      );
    }
  }
  requireMark(native.ok, 'the selected mark has no exact native straight-edge authority');
  const exact = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(
    native.value.owner,
    selection,
  );
  signal?.throwIfAborted();
  requireMark(exact.ok && exact.projection.complete, 'the selected native mark is incomplete');
  for (const edge of exact.projection.descriptors) {
    const id = edge.path.sourcePathId;
    const group = grouped.get(id) ?? [];
    group.push(edge);
    grouped.set(id, group);
  }
  return grouped;
}

function exactMarkPoint(
  sourceFileId: string,
  { path, instancePath }: MarkPath,
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[],
): Vec2Mm | null {
  const { pts: points, closed } = path;
  const edges = descriptors.toSorted((a, b) => a.path.startPointIndex - b.path.startPointIndex);
  if (
    edges.length !== (closed ? points.length : 1) ||
    !edges.every((edge, index) => {
      const next = (index + 1) % points.length;
      return (
        edge.sourceFileId === sourceFileId &&
        exactSequence(edge.instancePath, instancePath) &&
        edge.primitive.entityOp === path.src.op &&
        edge.path.sourcePathId === path.id &&
        edge.path.closed === closed &&
        edge.path.startPointIndex === index &&
        edge.path.endPointIndex === next &&
        edge.startMm[0] === points[index].x &&
        edge.startMm[1] === points[index].y &&
        edge.endMm[0] === points[next].x &&
        edge.endMm[1] === points[next].y &&
        (!closed || edge.endVertexId === edges[next].startVertexId)
      );
    })
  )
    return null;
  // Page-space bounds center for polygons and the exact endpoint midpoint for single segments.
  const box = bboxOf(points);
  const point = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  if (
    closed &&
    (ringSelfIntersects(points) ||
      !pointInPolygon(point, points) ||
      !points.every(
        (start, i) => footOnSegment(point, start, points[(i + 1) % points.length]).d > 0,
      ))
  )
    return null;
  return Object.freeze([point.x, point.y] as const);
}

async function readMarks(
  source: SavedNativePointClosureMarkSourceV1,
  request: SavedNativePointClosureMarkSelectionV1,
  locator: MarkLocator | undefined,
  signal?: AbortSignal,
): Promise<readonly SavedNativePointClosureMarkV1[]> {
  signal?.throwIfAborted();
  const { row, size } = source;
  const { pieceLineKey, patternLineKey, dxfSha256, sizeId, aliasBlockName, role } = request;
  requireMark(
    Number.isSafeInteger(row.techCardId) &&
      row.techCardId > 0 &&
      row.scopeKey &&
      Number.isSafeInteger(row.revision) &&
      row.revision >= 0 &&
      Number.isSafeInteger(row.cardLockVersion) &&
      row.cardLockVersion >= 0 &&
      row.patternLineKey === patternLineKey &&
      patternLineKey &&
      row.sha256 === dxfSha256 &&
      /^[a-f0-9]{64}$/.test(dxfSha256) &&
      source.bytes.byteLength === row.sizeBytes &&
      row.sizeBytes > 0 &&
      row.sizeBytes <= PATIMPORT.maxInputBytes,
    'the selected row or its bytes changed',
  );
  requireMark(
    Number.isSafeInteger(sizeId) &&
      sizeId > 0 &&
      sizeId === size.sizeId &&
      size.sizeToken &&
      pieceLineKey &&
      aliasBlockName &&
      (role === 'BUTTONHOLE_MIDPOINT' || role === 'BUTTON_MARK_CENTER'),
    'one explicit saved rank, piece and mark role are required',
  );
  const token = size.sizeToken;
  const aliases = source.aliases.filter(
    (alias) => alias.scopeKey === row.scopeKey && alias.blockName === aliasBlockName,
  );
  requireMark(
    aliases.length === 1 && aliases[0].pieceLineKey === pieceLineKey,
    'the current material scope has no unique matching piece alias',
  );
  const sourceFileId = computeDxfProductSavedSourceFileIdV1(row);
  const exactLocator = locator && captureLocator(sourceFileId, locator);
  const bytes = source.bytes.slice(0);
  try {
    const file = { id: sourceFileId, name: 'saved-closure-mark.dxf', bytes };
    const discovery = await readDxfWithPathProvenanceV1(file, readOptions, { sourceFileId });
    signal?.throwIfAborted();
    requireMark(
      discovery.ok && discovery.value.read.doc.file.sha256 === dxfSha256,
      'the downloaded DXF hash differs from the current row',
    );
    const candidates = markPaths(
      discovery.value,
      aliasBlockName,
      token,
      role === 'BUTTON_MARK_CENTER',
      exactLocator,
    );
    const edges = await readNativeEdges(file, dxfSha256, candidates, !exactLocator, signal);
    signal?.throwIfAborted();
    return Object.freeze(
      candidates.flatMap((candidate) => {
        const { path, instancePath } = candidate;
        const group = edges.get(path.id);
        const pointMm = group && exactMarkPoint(sourceFileId, candidate, group);
        if (exactLocator)
          requireMark(
            pointMm,
            'the native mark does not have complete ordered geometry or an interior center',
          );
        if (!pointMm || !path.src.block) return [];
        const edge = role === 'BUTTONHOLE_MIDPOINT' ? group?.[0] : undefined;
        return [
          Object.freeze({
            sourceFileId,
            nativePathId: path.id,
            role,
            pieceLineKey,
            patternLineKey,
            dxfSha256,
            sizeId,
            aliasBlockName,
            nativeBlockName: path.src.block,
            sourceInstancePath: Object.freeze([...instancePath]),
            sourceEntityOp: path.src.op,
            pointMm,
            ...(edge && {
              markedSegmentMm: Object.freeze([
                Object.freeze([...edge.startMm] as [number, number]),
                Object.freeze([...edge.endMm] as [number, number]),
              ] as const),
            }),
          }),
        ];
      }),
    );
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}

/** Resolves only an explicitly selected original straight L8 mark in the saved DXF page frame. */
export async function resolveSavedNativePointClosureMarkV1(
  source: SavedNativePointClosureMarkSourceV1,
  request: SavedNativePointClosureMarkRequestV1,
  signal?: AbortSignal,
): Promise<SavedNativePointClosureMarkV1> {
  const marks = await readMarks(source, request, request, signal);
  requireMark(marks.length === 1, 'the locator must resolve one exact native mark');
  return marks[0];
}

/** Lists eligible L8 shapes in original entity order. The caller supplies the intended role. */
export function listSavedNativePointClosureMarksV1(
  source: SavedNativePointClosureMarkSourceV1,
  selection: SavedNativePointClosureMarkSelectionV1,
  signal?: AbortSignal,
): Promise<readonly SavedNativePointClosureMarkV1[]> {
  return readMarks(source, selection, undefined, signal);
}
