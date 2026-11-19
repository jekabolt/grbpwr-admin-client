import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
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
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { bboxOf, footOnSegment, pointInPolygon } from 'lib/pattern-import/semantics/geom';
import { PATIMPORT } from 'lib/pattern-import/types';

export type SavedNativePointClosureMarkRequestV1 = Readonly<{
  pieceLineKey: string;
  patternLineKey: string;
  dxfSha256: string;
  sizeId: number;
  aliasBlockName: string;
  nativeBlockName: string;
  sourceInstancePath: readonly string[];
  sourceEntityOp: number;
  role: 'BUTTONHOLE_MIDPOINT' | 'BUTTON_MARK_CENTER';
}>;

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
  }>;

const maxMarkVertices = 256;
const exactSequence = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function requireMark(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Saved native closure mark refused: ${detail}.`);
}

/** Resolves only an explicitly selected original straight L8 mark in the saved DXF page frame. */
export async function resolveSavedNativePointClosureMarkV1(
  source: SavedNativePointClosureMarkSourceV1,
  request: SavedNativePointClosureMarkRequestV1,
  signal?: AbortSignal,
): Promise<SavedNativePointClosureMarkV1> {
  signal?.throwIfAborted();
  const { row, size } = source;
  const {
    pieceLineKey,
    patternLineKey,
    dxfSha256,
    sizeId,
    aliasBlockName,
    nativeBlockName,
    sourceEntityOp,
    role,
  } = request;
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
      nativeBlockName &&
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
  requireMark(
    Array.isArray(request.sourceInstancePath) &&
      request.sourceInstancePath.length > 0 &&
      request.sourceInstancePath.length <= 64,
    'one exact DXF block instance is required',
  );
  const sourceInstancePath = Object.freeze([...request.sourceInstancePath]);
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

  const bytes = source.bytes.slice(0);
  try {
    const file = { id: sourceFileId, name: 'saved-closure-mark.dxf', bytes };
    const options = { sagittaMm: PATIMPORT.sagittaMm, keepFills: true };
    const discovery = await readDxfWithPathProvenanceV1(file, options, { sourceFileId });
    signal?.throwIfAborted();
    requireMark(
      discovery.ok && discovery.value.read.doc.file.sha256 === dxfSha256,
      'the downloaded DXF hash differs from the current row',
    );
    const { read, provenance } = discovery.value;
    const occurrencePaths = new Set(
      provenance.paths
        .filter(({ provenance }) => exactSequence(provenance.instancePath, sourceInstancePath))
        .map(({ pathId }) => pathId),
    );
    const candidates = read.doc.pages.flatMap(({ paths, styles }) => {
      const l8 = new Set(styles.filter(({ layer }) => layer === '8').map(({ id }) => id));
      return paths.filter(
        ({ id, src, style }) =>
          occurrencePaths.has(id) &&
          src.block === nativeBlockName &&
          src.op === sourceEntityOp &&
          l8.has(style),
      );
    });
    requireMark(candidates.length === 1, 'the locator must select one original L8 entity');
    const [path] = candidates;
    const groups = read.meta.groups.filter(({ paths }) => paths.includes(path.id));
    requireMark(
      groups.length === 1 && groups[0].kind === 'insert' && groups[0].block === nativeBlockName,
      'the original L8 entity is outside the named block occurrence',
    );
    const ranked = segmentDxf(read).pieces.filter(({ group }) => group === groups[0].index);
    requireMark(
      ranked.length === 1 &&
        ranked[0].block === nativeBlockName &&
        ranked[0].identity === aliasBlockName &&
        ranked[0].sizeSource !== 'none' &&
        ranked[0].size === token &&
        !ranked[0].uni &&
        !ranked[0].nested,
      'the original block does not match the current piece alias and declared rank',
    );
    const closed = role === 'BUTTON_MARK_CENTER';
    requireMark(
      path.closed === closed &&
        (closed
          ? path.pts.length >= 3 && path.pts.length <= maxMarkVertices
          : path.pts.length === 2),
      'the mark must be a closed polygon or a single open segment as declared by its role',
    );

    const selection = {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
      sourceFileId,
      sourceSha256: dxfSha256,
      sourcePathIds: [path.id],
    } as const;
    const native = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
      file,
      options,
      selection,
    );
    signal?.throwIfAborted();
    requireMark(native.ok, 'the selected mark has no exact native straight-edge authority');
    const exact = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(
      native.value.owner,
      selection,
    );
    signal?.throwIfAborted();
    requireMark(exact.ok && exact.projection.complete, 'the selected native mark is incomplete');
    const edges = exact.projection.descriptors.toSorted(
      (a, b) => a.path.startPointIndex - b.path.startPointIndex,
    );
    const points = path.pts;
    requireMark(
      edges.length === (closed ? points.length : 1) &&
        edges.every((edge, index) => {
          const next = (index + 1) % points.length;
          return (
            edge.sourceFileId === sourceFileId &&
            exactSequence(edge.instancePath, sourceInstancePath) &&
            edge.primitive.entityOp === sourceEntityOp &&
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
        }),
      'the native edge identity or complete ordered mark geometry differs',
    );

    // The original mark station uses the page-space bounds center of the selected polygon.
    // For a single segment the same calculation gives the exact endpoint midpoint.
    const box = bboxOf(points);
    const point = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    if (closed)
      requireMark(
        !ringSelfIntersects(points) &&
          pointInPolygon(point, points) &&
          points.every(
            (start, i) => footOnSegment(point, start, points[(i + 1) % points.length]).d > 0,
          ),
        'the mark must be one simple polygon with a strictly interior bounds center',
      );
    return Object.freeze({
      sourceFileId,
      nativePathId: path.id,
      role,
      pieceLineKey,
      patternLineKey,
      dxfSha256,
      sizeId,
      aliasBlockName,
      nativeBlockName,
      sourceInstancePath,
      sourceEntityOp,
      pointMm: Object.freeze([point.x, point.y] as const),
    });
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}
