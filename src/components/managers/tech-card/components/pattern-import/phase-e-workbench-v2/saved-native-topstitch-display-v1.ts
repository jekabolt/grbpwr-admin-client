import type { common_TechCard } from 'api/proto-http/admin';
import {
  bareToken,
  splitBlockSize,
} from 'components/managers/tech-card/components/nesting/block-code';
import { isTopstitchStep } from 'components/managers/tech-card/components/operation-kinds';
import { isTopstitchThreadLine } from 'components/managers/tech-card/components/topstitch-lines';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { aliasKey } from 'lib/pattern-import/fabrics/draft';
import { signedArea } from 'lib/pattern-import/semantics/geom';
import { PATIMPORT, type PtMm } from 'lib/pattern-import/types';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  parseSavedNativeStitchRowV1,
  resolveSavedLegacyNativeStitchRangeV1,
  type SavedNativeCurveIntervalV1,
} from './saved-legacy-native-stitch-run-v8';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

type Input = Readonly<{
  source: CompleteSavedAssemblySourceV1;
  card: common_TechCard;
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1;
  operationNumber: number;
  sizeId: number;
  path: SavedAssemblyNativeSewingPathV1;
  file: Uint8Array;
}>;

function inwardParallelSegment(
  path: SavedAssemblyNativeSewingPathV1,
  interval: SavedNativeCurveIntervalV1,
  widthMm: number,
) {
  const origin = path.nativePointsMm[0]!;
  const local = (x: number, y: number): PtMm => ({ x: x - origin.x, y: y - origin.y });
  const ring = path.nativePointsMm.map(({ x, y }) => local(x, y));
  const winding = Math.sign(signedArea(ring));
  const insideOfEdge = (point: PtMm, index: number) => {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    return winding * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
  };
  // A strictly convex ring supplies one interior and makes containment of the two endpoints
  // sufficient for the entire offset. Other outlines require a separate intra-piece check.
  if (
    !winding ||
    !ring.every((_, edge) =>
      ring.every(
        (point, index) =>
          index === edge || index === (edge + 1) % ring.length || insideOfEdge(point, edge) > 0,
      ),
    )
  )
    throw new Error('Topstitch display requires one strictly convex original L14 ring.');

  const start = local(...interval.startMm);
  const end = local(...interval.endMm);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const inward = (Math.sign(interval.t1 - interval.t0) * winding * widthMm) / length;
  const offset = (point: PtMm) =>
    Object.freeze({
      x: point.x - dy * inward,
      y: point.y + dx * inward,
    });
  const segment = [offset(start), offset(end)] as const;
  if (!ring.every((_, edge) => segment.every((point) => insideOfEdge(point, edge) > 0)))
    throw new Error('The requested Topstitch offset does not lie strictly inside the L14 ring.');
  return Object.freeze({
    nativeOriginMm: Object.freeze({ x: origin.x, y: origin.y }),
    pieceLocalSegmentMm: Object.freeze(segment),
  });
}

/** Projects one saved, straight, inward AO Topstitch run into its L14-local DXF frame. */
export async function projectSavedNativeTopstitchDisplayV1(input: Input, signal: AbortSignal) {
  signal.throwIfAborted();
  const { source, card, projection, sizeId, operationNumber } = input;
  const path = structuredClone(input.path);
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new Error('Topstitch display requires the verified complete Assembly source.');

  const row = completeSavedAssemblyRowIdentityV1(path.row);
  const sizes = projection.card.sizes.filter((size) => size.sizeId === sizeId);
  const size = sizes[0];
  const expectedRow = source.rows.find(
    ({ patternLineKey }) => patternLineKey === row.patternLineKey,
  );
  if (
    !size ||
    !Number.isSafeInteger(sizeId) ||
    sizeId < 1 ||
    !Number.isSafeInteger(size.rank) ||
    size.rank < 0 ||
    sizes.length !== 1 ||
    !size.token ||
    size.token !== path.sizeToken ||
    projection.card.sizes.filter(({ token }) => bareToken(token) === bareToken(size.token))
      .length !== 1 ||
    card.techCard?.sizeIds?.filter((id) => id === sizeId).length !== 1 ||
    card.techCard.pieces?.filter(({ lineKey }) => lineKey === path.pieceLineKey).length !== 1 ||
    card.id !== row.techCardId ||
    card.lockVersion !== row.cardLockVersion ||
    projection.card.techCardId !== row.techCardId ||
    projection.cardLockVersion !== row.cardLockVersion ||
    !expectedRow ||
    source.rows.filter(({ scopeKey }) => scopeKey === row.scopeKey).length !== 1 ||
    !Object.entries(row).every(([key, value]) => expectedRow[key as keyof typeof row] === value) ||
    path.sourceFileId !== computeDxfProductSavedSourceFileIdV1(row) ||
    input.file.byteLength !== row.sizeBytes
  )
    throw new Error(
      'Topstitch display requires the current card, size and exact saved pattern row.',
    );

  const operations = source.operations.filter(
    (operation) => operation.operationNumber === operationNumber,
  );
  const operation = operations[0];
  const lines = operation?.topstitchLines ?? [];
  const line = lines[0];
  const anchors = line?.parts ?? [];
  const width = operation?.topstitch?.widthMm?.value;
  const widthMm = width && /^\d+(\.\d+)?$/.test(width) ? Number(width) : NaN;
  const mode = operation?.topstitch?.mode;
  const operationRows = operation?.topstitch?.rows ?? 0;
  if (
    !Number.isSafeInteger(operationNumber) ||
    operationNumber < 1 ||
    operations.length !== 1 ||
    !operation ||
    !isTopstitchStep({ ...operation, topstitchMode: mode }) ||
    mode !== 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM' ||
    !Number.isFinite(widthMm) ||
    widthMm <= 0 ||
    (operationRows !== 0 && operationRows !== 1) ||
    operation.inputKeys?.length !== 1 ||
    operation.inputKeys[0] !== path.pieceLineKey ||
    operation.seamKeys?.length ||
    lines.length !== 1 ||
    !line?.lineKey ||
    source.operations
      .flatMap(({ topstitchLines }) => topstitchLines ?? [])
      .filter(({ lineKey }) => lineKey === line.lineKey).length !== 1 ||
    line.stale ||
    line.rows !== 1 ||
    line.anchoredSize !== size.token ||
    anchors.length !== 1 ||
    anchors[0]?.pieceLineKey !== path.pieceLineKey
  )
    throw new Error('Topstitch display requires one current, one-sided and one-row L14 line.');

  const threadKey = line.bomLineKey;
  const threadLines = card.techCard.bomItems?.filter(({ lineKey }) => lineKey === threadKey) ?? [];
  const [thread] = threadLines;
  if (
    !threadKey ||
    operation.bomLineKeys?.filter((key) => key === threadKey).length !== 1 ||
    threadLines.length !== 1 ||
    !thread ||
    !isTopstitchThreadLine({ section: thread.section, kind: thread.kind, unit: thread.unit })
  )
    throw new Error('Topstitch display requires one linked current metre-based Topstitch thread.');

  const sizeToken = size.token;
  const sizeRank = size.rank;
  const knownSizeTokens = new Set(projection.card.sizes.map(({ token }) => bareToken(token)));
  const file = new Uint8Array(input.file);
  try {
    const fileName = path.blockName + '.dxf';
    const request = {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
      sourceFileId: path.sourceFileId,
      sourceSha256: row.sha256,
      sourcePathIds: [path.nativePathId],
    } as const;
    const read = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
      { id: path.sourceFileId, name: fileName, bytes: file.buffer },
      { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
      request,
    );
    signal.throwIfAborted();
    if (!read.ok)
      throw new Error(read.blockers[0]?.detail ?? 'Saved Topstitch DXF is unavailable.');

    const rings = read.value.read.doc.pages.flatMap(({ paths, styles }) => {
      const layer14 = new Set(styles.filter(({ layer }) => layer === '14').map(({ id }) => id));
      return paths.filter(({ style, closed }) => closed && layer14.has(style));
    });
    const raw = rings.find(({ id }) => id === path.nativePathId);
    const rawBlock = raw?.src.block;
    if (!rawBlock || rings.filter(({ src }) => src.block === rawBlock).length !== 1)
      throw new Error('Topstitch display requires one original L14 path in its native block.');

    const block = splitBlockSize(rawBlock, knownSizeTokens);
    const names = new Set([block.raw, block.identity].map((name) => aliasKey(row.scopeKey, name)));
    const aliases = source.aliases.filter(({ scopeKey, blockName }) =>
      names.has(aliasKey(scopeKey ?? '', blockName ?? '')),
    );
    const alias = aliases[0];
    if (
      bareToken(block.size) !== bareToken(sizeToken) ||
      aliases.length !== 1 ||
      source.aliases.filter(
        (alias) => alias.scopeKey === row.scopeKey && alias.pieceLineKey === path.pieceLineKey,
      ).length !== 1 ||
      alias?.pieceLineKey !== path.pieceLineKey ||
      !alias.blockName ||
      aliasKey(row.scopeKey, alias.blockName) !== aliasKey(row.scopeKey, path.blockName)
    )
      throw new Error('The original L14 path has no unique current piece, block and size binding.');

    const native = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(
      read.value.owner,
      request,
    );
    const ordinary = await parseSavedNativeStitchRowV1(file, fileName);
    signal.throwIfAborted();
    if (
      !native.ok ||
      !native.projection.complete ||
      native.projection.descriptors.some(
        ({ instancePath }) =>
          instancePath.length !== path.sourceInstancePath.length ||
          instancePath.some((part, i) => part !== path.sourceInstancePath[i]),
      ) ||
      ordinary.failedFiles ||
      ordinary.skippedBlocks
    )
      throw new Error(
        'Topstitch display requires the unambiguous original straight L14 occurrence.',
      );

    const span = resolveSavedLegacyNativeStitchRangeV1(
      ordinary.pieces.filter(({ blockName }) => blockName === rawBlock),
      path,
      anchors[0]!,
      native.projection.descriptors,
    );
    const interval = span.intervals[0];
    if (!interval || span.intervals.length !== 1)
      throw new Error('Topstitch display supports a range on one original straight L14 segment.');

    return Object.freeze({
      kind: 'saved-native-topstitch-display' as const,
      ...inwardParallelSegment(path, interval, widthMm),
      sizeId,
      sizeToken,
      sizeRank,
      operationNumber,
      lineKey: line.lineKey,
      threadBomLineKey: threadKey,
      mode,
      widthMm,
      rows: 1 as const,
      pieceLineKey: path.pieceLineKey,
      originalLengthMm: span.nativeLengthMm,
      originalRange: span.fraction,
      originalInterval: interval,
      provenance: Object.freeze({
        row,
        assemblyRevision: source.serverAssemblyRevision,
        completeSourceSha256: source.sourceSha256,
        sourceFileId: path.sourceFileId,
        nativePathId: path.nativePathId,
        nativeStraightAuthoritySha256: native.projection.authoritySha256,
        rawBlock,
        sourceInstancePath: Object.freeze([...path.sourceInstancePath]),
      }),
    });
  } finally {
    file.fill(0);
  }
}
