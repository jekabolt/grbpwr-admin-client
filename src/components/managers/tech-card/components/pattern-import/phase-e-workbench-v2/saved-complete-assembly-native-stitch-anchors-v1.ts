import { abortableAdminService } from 'api/api';
import type { common_Size, common_TechCard, common_TechCardSeam } from 'api/proto-http/admin';
import { buildDxfIndex } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import type { PieceDTO } from 'lib/nesting/types';
import { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { DxfSourceNativeStraightEdgeDescriptorV1 } from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
  type SavedAssemblyAuthoredFoldsV1,
} from './saved-assembly-complete-source-rpc-v1';
import type { SavedAssemblyPhysicalAnchorV1 } from './saved-assembly-operation-anchors-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import { prepareSavedFullAssemblyCompleteNativeRowsV1 } from './saved-full-assembly-complete-native-rows-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  parseSavedNativeStitchRowV1,
  readSavedNativeStraightStitchPathsV1,
  resolveSavedLegacyNativeStitchRangeV1,
  savedNativeStitchRawBlockV1,
  type SavedNativeStitchCompilerSourceV1,
} from './saved-legacy-native-stitch-run-v8';
import {
  resolveSavedNativeSurfaceStitchAnchorV1,
  savedNativeInternalAnchorIndexV1,
} from './saved-native-surface-stitch-anchor-v1';
import { resolveSavedNativeAuthoredFoldGeometryV1 } from './saved-native-authored-fold-geometry-v1';
import { readSavedGarmentLabelStitchAnchorV1 } from './saved-garment-label-stitch-anchor-v1';
import { readSavedCutStripStitchAnchorV1 } from './saved-cut-strip-stitch-anchor-v1';
import { savedPointClosures } from './saved-point-closure-authoring-v1';
import {
  resolveSavedNativePointClosureMarkV1,
  type SavedNativePointClosureMarkV1,
} from './saved-native-point-closure-mark-v1';
import {
  bindSavedNativePointFasteningV1,
  savedNativeFasteningApertureV1,
} from './saved-native-point-fastening-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

type OperationAnchorIdentity = Readonly<{
  /** Zero-based ordinal in the exact persisted Complete Source operation list. */
  operationOrder: number;
  operationNumber: number;
  seamKey: string;
  seamKind: common_TechCardSeam['kind'];
  direction: common_TechCardSeam['direction'];
  anchoredSize: string | undefined;
  sideIndex: 0 | 1;
  partOrdinal: number;
  pieceLineKey: string;
  edgeHint: string | undefined;
  storedAnchor: Readonly<SavedAssemblyPhysicalAnchorV1['anchor']>;
}>;
type PatternAnchorIdentity = OperationAnchorIdentity &
  Readonly<{
    row: SavedAssemblyNativeSewingPathV1['row'];
    blockName: string;
  }>;
export type SavedCompleteNativeStitchAnchorV1 = PatternAnchorIdentity &
  (
    | Readonly<{
        kind: 'native-directed-l14';
        span: Readonly<ReturnType<typeof resolveSavedLegacyNativeStitchRangeV1>>;
      }>
    | Readonly<{
        kind: 'native-internal-l8';
        span: Readonly<Awaited<ReturnType<typeof resolveSavedNativeSurfaceStitchAnchorV1>>>;
      }>
  );
export type SavedCompleteGarmentLabelAnchorV1 = OperationAnchorIdentity &
  Readonly<{
    kind: 'garment-label';
    label: CompleteSavedAssemblySourceV1['garmentLabels'][number];
    geometry: ReturnType<typeof readSavedGarmentLabelStitchAnchorV1>;
  }>;

export type SavedCompleteCutStripAnchorV1 = OperationAnchorIdentity &
  Readonly<{
    kind: 'cut-strip';
    binding: Extract<SavedAssemblyPhysicalAnchorV1['source'], { kind: 'cut-strip' }>['binding'];
    geometry: NonNullable<ReturnType<typeof readSavedCutStripStitchAnchorV1>>;
  }>;
type NativeAnchorJob = Readonly<{
  identity: PatternAnchorIdentity;
  anchor: SavedAssemblyPhysicalAnchorV1['anchor'];
  path: SavedAssemblyNativeSewingPathV1;
  index: number;
  internalIndex: number | null;
}>;

type AuthoredFoldJob = Readonly<{
  authored: SavedAssemblyAuthoredFoldsV1['folds'][number];
  path: SavedAssemblyNativeSewingPathV1;
}>;

type WholeAnchorInputs = Readonly<{
  card: common_TechCard;
  sizeDictionary: readonly common_Size[];
  selectedSizeId: number;
}>;

type OriginalCut = Awaited<
  ReturnType<typeof prepareSavedFullAssemblyCompleteNativeRowsV1>
>['originalCutPaths'][number];

type NativeNotchPoint = Readonly<{
  nativePathId: number;
  rawBlock: string;
  entityOp: number;
  positionMm: readonly [number, number];
}>;

/** Keeps the original POINT occurrence separate from any inferred seam registration. */
function recordSavedNativeNotchPoints(
  native: SavedNativeStitchCompilerSourceV1,
  cuts: readonly OriginalCut[],
  byPiece: Map<string, readonly NativeNotchPoint[]>,
) {
  const { doc, meta } = native.nativeRead.read;
  for (const { paths, styles } of doc.pages) {
    const layerByStyle = new Map(styles.map(({ id, layer }) => [id, layer]));
    const layerOne = new Map<string, number[]>();
    const notchPoints = new Map<string, NativeNotchPoint[]>();
    for (const path of paths) {
      const rawBlock = path.src.block;
      if (!rawBlock) continue;
      const layer = layerByStyle.get(path.style);
      if (layer === '1' && path.closed) {
        const sameBlock = layerOne.get(rawBlock);
        if (sameBlock) sameBlock.push(path.id);
        else layerOne.set(rawBlock, [path.id]);
      }
      if (layer !== '4' || meta.pathEntity[path.id] !== 'POINT') continue;
      const at = meta.points[path.id]?.at;
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
      const mark: NativeNotchPoint = Object.freeze({
        nativePathId: path.id,
        rawBlock,
        entityOp: path.src.op,
        positionMm: Object.freeze([at.x, at.y] as const),
      });
      const sameBlock = notchPoints.get(rawBlock);
      if (sameBlock) sameBlock.push(mark);
      else notchPoints.set(rawBlock, [mark]);
    }
    for (const { nativePathId, pieceLineKey } of cuts) {
      const original = paths.find((path) => path.id === nativePathId);
      const rawBlock = original?.src.block;
      const bound = rawBlock ? layerOne.get(rawBlock) : undefined;
      if (rawBlock && bound?.length === 1 && bound[0] === nativePathId)
        byPiece.set(pieceLineKey, Object.freeze(notchPoints.get(rawBlock) ?? []));
    }
  }
}

/** Reads native physical anchors in saved operation, seam, side and part order for one exact size. */
export async function readSavedCompleteAssemblyNativeStitchAnchorsV1(
  source: CompleteSavedAssemblySourceV1,
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1,
  input: WholeAnchorInputs,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new TypeError(
      'Whole native stitch anchors require a verified current card and exact size.',
    );
  const { card, sizeDictionary, selectedSizeId } = structuredClone(input);
  const selectedSizes = projection.card.sizes.filter(({ sizeId }) => sizeId === selectedSizeId);
  const [size] = selectedSizes;
  const authored = source.authoredFolds;
  const anchorRow = source.rows.find(({ scopeKey }) => scopeKey === 'main');
  if (
    !anchorRow ||
    !size ||
    selectedSizes.length !== 1 ||
    sizeDictionary.filter(({ id }) => id === selectedSizeId).length !== 1 ||
    !card.techCard?.sizeIds?.includes(selectedSizeId) ||
    card.id !== anchorRow.techCardId ||
    card.lockVersion !== anchorRow.cardLockVersion ||
    projection.cardLockVersion !== anchorRow.cardLockVersion ||
    (authored && (authored.sizeId !== selectedSizeId || authored.sizeToken !== size.token))
  )
    throw new TypeError(
      'Whole native stitch anchors require a verified current card and exact size.',
    );
  const built = await prepareSavedFullAssemblyCompleteNativeRowsV1(source, projection, signal, {
    card,
    sizeDictionary,
    selectedSizeId,
    includeGeneratedCutGeometry: false,
  });
  const jobsByRow = new Map<string, NativeAnchorJob[]>();
  const labels: SavedCompleteGarmentLabelAnchorV1[] = [];
  const strips: SavedCompleteCutStripAnchorV1[] = [];
  const spans: SavedCompleteNativeStitchAnchorV1[] = [];
  const operationOrders = new Map(
    source.operations.map(({ operationNumber }, index) => [operationNumber, index]),
  );
  let nextIndex = 0;
  for (const { seam, anchors } of built.operationAnchors.physical) {
    if (seam.anchoredSize && seam.anchoredSize !== size.token)
      throw new Error(`Saved seam ${seam.seamKey} is anchored to a different size.`);
    for (const bound of anchors) {
      const {
        operationNumber,
        seamKey,
        sideIndex,
        partOrdinal,
        pieceLineKey,
        anchor,
        source: binding,
      } = bound;
      const operationOrder = operationOrders.get(operationNumber);
      if (operationOrder === undefined)
        throw new Error('A saved anchor has no persisted operation order.');
      const identity = {
        operationOrder,
        operationNumber,
        seamKey,
        sideIndex,
        partOrdinal,
        pieceLineKey,
        seamKind: seam.kind,
        direction: seam.direction,
        anchoredSize: seam.anchoredSize,
        edgeHint: anchor.edgeHint,
        storedAnchor: anchor,
      };
      if (binding.kind === 'garment-label') {
        labels.push(
          Object.freeze({
            ...identity,
            kind: 'garment-label',
            label: binding.label,
            geometry: readSavedGarmentLabelStitchAnchorV1(binding.label, anchor, size.token),
          }),
        );
        continue;
      }
      if (binding.kind === 'cut-strip') {
        const geometry = readSavedCutStripStitchAnchorV1(
          binding.binding,
          anchor,
          selectedSizeId,
          size.token,
        );
        if (!geometry)
          throw new Error(
            `Saved seam ${seamKey} has no matching cut strip edge for ${size.token}.`,
          );
        strips.push(
          Object.freeze({ ...identity, kind: 'cut-strip', binding: binding.binding, geometry }),
        );
        continue;
      }
      const path = binding.nativeSewingPath;
      if (!path) throw new Error(`Saved seam ${seamKey} has no unique original native DXF path.`);
      const internalIndex = savedNativeInternalAnchorIndexV1(anchor);
      if (internalIndex !== null && seam.kind !== 'TECH_CARD_SEAM_KIND_SURFACE')
        throw new Error(`Saved seam ${seamKey} has an internal anchor outside a surface seam.`);
      const job = {
        identity: { ...identity, row: path.row, blockName: path.blockName },
        anchor,
        path,
        index: nextIndex++,
        internalIndex,
      };
      const key = path.row.patternLineKey;
      const existing = jobsByRow.get(key);
      if (existing) existing.push(job);
      else jobsByRow.set(key, [job]);
    }
  }

  const foldJobsByRow = new Map<string, AuthoredFoldJob[]>();
  for (const fold of authored?.folds ?? []) {
    const paths = built.originalSewingPaths.filter(
      ({ pieceLineKey }) => pieceLineKey === fold.fold.pieceLineKey,
    );
    if (paths.length !== 1)
      throw new Error(`Saved fold ${fold.fold.foldKey} has no unique current native sewing piece.`);
    const [path] = paths;
    const lineKey = path.row.patternLineKey;
    const existing = foldJobsByRow.get(lineKey);
    const job = { authored: fold, path };
    if (existing) existing.push(job);
    else foldJobsByRow.set(lineKey, [job]);
  }
  const resolvedFolds = new Map<
    string,
    Awaited<ReturnType<typeof resolveSavedNativeAuthoredFoldGeometryV1>>
  >();
  const ownedClosures = [
    ...new Set(built.operationAnchors.pointClosures?.map(({ operationNumber }) => operationNumber)),
  ].flatMap((operationNumber) =>
    savedPointClosures(source, operationNumber, selectedSizeId).filter(({ stale }) => !stale),
  );
  type ClosureJob = Readonly<{
    key: string;
    buttonOperation: number;
    point: ReturnType<typeof savedPointClosures>[number]['hole'];
  }>;
  const closureJobsByRow = new Map<string, ClosureJob[]>();
  for (const { key, buttonOperation, hole, button } of ownedClosures) {
    for (const point of [hole, button]) {
      const jobs = closureJobsByRow.get(point.patternLineKey);
      const job = { key, buttonOperation, point };
      if (jobs) jobs.push(job);
      else closureJobsByRow.set(point.patternLineKey, [job]);
    }
  }
  const closureAliases = source.aliases.flatMap(({ scopeKey, blockName, pieceLineKey }) =>
    scopeKey && blockName && pieceLineKey ? [{ scopeKey, blockName, pieceLineKey }] : [],
  );
  const closureMarks = new Map<
    string,
    Map<
      SavedNativePointClosureMarkV1['role'],
      Readonly<{ row: SavedAssemblyNativeSewingPathV1['row']; mark: SavedNativePointClosureMarkV1 }>
    >
  >();
  const usedNativeClosureMarks = new Set<string>();
  const nativeNotchesByPiece = new Map<string, readonly NativeNotchPoint[]>();
  const host = createSavedFullAssemblyCompleteDxfHostsV1(source, projection).createCanonical();
  try {
    for (const lineKey of new Set([
      ...jobsByRow.keys(),
      ...foldJobsByRow.keys(),
      ...closureJobsByRow.keys(),
    ])) {
      signal.throwIfAborted();
      const jobs = jobsByRow.get(lineKey) ?? [];
      const foldJobs = foldJobsByRow.get(lineKey) ?? [];
      const member = built.nativeRows.find(({ row }) => row.patternLineKey === lineKey);
      if (!member) throw new Error('The saved seam has no current native compiler row.');
      const native = consumeDxfProductSavedNativeCompilerSourceV1(
        member.sourceOwner,
        member.sourceRequest,
      );
      if (!native.ok)
        throw new Error(native.blockers[0]?.detail ?? 'The native compiler source is unavailable.');
      recordSavedNativeNotchPoints(
        native.value,
        built.originalCutPaths.filter(({ row }) => row.patternLineKey === lineKey),
        nativeNotchesByPiece,
      );
      const { bytes } = await host.readAuthoritativeRow(member.row, signal, () => {});
      const file = new Uint8Array(bytes);
      try {
        for (const { key, buttonOperation, point } of closureJobsByRow.get(lineKey) ?? []) {
          if (point.savedRowRevision !== member.row.revision)
            throw new Error('A saved fastening mark belongs to a different pattern revision.');
          const mark = await resolveSavedNativePointClosureMarkV1(
            {
              row: member.row,
              bytes: file.buffer,
              aliases: closureAliases,
              size: { sizeId: selectedSizeId, sizeToken: size.token },
            },
            point,
            signal,
          );
          const identity = JSON.stringify([buttonOperation, mark.sourceFileId, mark.nativePathId]);
          const marks = closureMarks.get(key) ?? new Map();
          if (usedNativeClosureMarks.has(identity) || marks.has(mark.role))
            throw new Error('A saved fastening mark is registered more than once.');
          usedNativeClosureMarks.add(identity);
          marks.set(mark.role, { row: member.row, mark });
          closureMarks.set(key, marks);
        }
        const firstPath = jobs[0]?.path ?? foldJobs[0]?.path;
        if (!firstPath) continue;
        const parsed = await parseSavedNativeStitchRowV1(file, `${firstPath.blockName}.dxf`);
        signal.throwIfAborted();
        if (parsed.failedFiles || parsed.skippedBlocks)
          throw new Error('Ordinary saved DXF geometry is incomplete.');
        const layersByBlock = new Map<string, PieceDTO[]>();
        for (const piece of parsed.pieces) {
          if (!piece.blockName) continue;
          const existing = layersByBlock.get(piece.blockName);
          if (existing) existing.push(piece);
          else layersByBlock.set(piece.blockName, [piece]);
        }
        const ids = [
          ...new Set(
            jobs
              .filter(({ internalIndex }) => internalIndex === null)
              .map(({ path }) => path.nativePathId),
          ),
        ].sort((a, b) => a - b);
        const edgesByPath = new Map<number, DxfSourceNativeStraightEdgeDescriptorV1[]>();
        if (ids.length) {
          const straight = await readSavedNativeStraightStitchPathsV1(file, firstPath, ids, signal);
          for (const segment of straight.descriptors) {
            const id = segment.path.sourcePathId;
            const list = edgesByPath.get(id);
            if (list) list.push(segment);
            else edgesByPath.set(id, [segment]);
          }
        }
        const grainLayer =
          jobs.some(({ internalIndex }) => internalIndex !== null) || foldJobs.length > 0
            ? buildDxfIndex(
                {
                  pieces: parsed.pieces,
                  scopeByFile: new Map([[0, member.row.scopeKey]]),
                  warnings: parsed.warnings,
                },
                new Set(projection.card.sizes.map(({ token }) => token)),
              ).grainLayer
            : '';
        for (const { path, anchor, identity, index, internalIndex } of jobs) {
          signal.throwIfAborted();
          const rawBlock = savedNativeStitchRawBlockV1(native.value, path);
          const block = layersByBlock.get(rawBlock);
          if (!block)
            throw new Error('A current native seam lacks its ordinary saved DXF occurrence.');
          try {
            spans[index] =
              internalIndex === null
                ? Object.freeze({
                    ...identity,
                    kind: 'native-directed-l14',
                    span: Object.freeze(
                      resolveSavedLegacyNativeStitchRangeV1(
                        block,
                        path,
                        anchor,
                        edgesByPath.get(path.nativePathId) ?? [],
                      ),
                    ),
                  })
                : Object.freeze({
                    ...identity,
                    kind: 'native-internal-l8',
                    span: Object.freeze(
                      await resolveSavedNativeSurfaceStitchAnchorV1(
                        {
                          card,
                          sizeToken: size.token,
                          grainLayer,
                          file,
                          block,
                          rawBlock,
                          nativeSource: native.value,
                          parent: path,
                          anchor,
                          index: internalIndex,
                        },
                        signal,
                      ),
                    ),
                  });
          } catch (error) {
            signal.throwIfAborted();
            throw new Error(
              `Saved seam ${identity.seamKey} side ${identity.sideIndex} part ${identity.partOrdinal} could not be replayed: ${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            );
          }
        }
        for (const { authored, path } of foldJobs) {
          const rawBlock = savedNativeStitchRawBlockV1(native.value, path);
          const block = layersByBlock.get(rawBlock);
          if (!block) throw new Error('A current fold lacks its ordinary saved DXF occurrence.');
          const fold = await resolveSavedNativeAuthoredFoldGeometryV1(
            { authored, path, block, rawBlock, grainLayer, native: native.value, file },
            signal,
          );
          resolvedFolds.set(fold.foldKey, fold);
        }
      } finally {
        file.fill(0);
        bytes.fill(0);
      }
    }
  } finally {
    host.dispose();
  }
  const fresh = await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    completeSavedAssemblyRowIdentityV1(anchorRow),
    {
      expectedServerAssemblyRevision: source.serverAssemblyRevision,
      expectedCompleteSourceSha256: source.sourceSha256,
      ...(source.sourceOnly && { sourceOnly: true }),
      ...(authored && {
        authoredFolds: {
          sizeId: authored.sizeId,
          sizeToken: authored.sizeToken,
          expectedSourceSha256: authored.sourceSha256,
        },
      }),
    },
    signal,
  );
  if (
    fresh.priorCarrier?.sidecarSha256 !== source.priorCarrier?.sidecarSha256 ||
    fresh.priorCarrier?.mediaType !== source.priorCarrier?.mediaType
  )
    throw new Error('The saved Assembly carrier changed while reading its native stitch anchors.');
  const nativePointFastenings = Object.freeze(
    ownedClosures.map((binding) => {
      const marks = closureMarks.get(binding.key);
      return bindSavedNativePointFasteningV1(
        binding,
        { sizeId: selectedSizeId, sizeToken: size.token },
        marks?.get('BUTTONHOLE_MIDPOINT'),
        marks?.get('BUTTON_MARK_CENTER'),
      );
    }),
  );
  const ownedSeamKeys = new Set(source.ownedSeams.map(({ seamKey }) => seamKey));
  return Object.freeze({
    schemaVersion: 'saved-complete-assembly-native-stitch-anchors/1' as const,
    cardId: anchorRow.techCardId,
    cardLockVersion: anchorRow.cardLockVersion,
    sourceSha256: fresh.sourceSha256,
    serverAssemblyRevision: fresh.serverAssemblyRevision,
    savedCarrier: fresh.priorCarrier
      ? Object.freeze({
          mediaType: fresh.priorCarrier.mediaType,
          sidecarSha256: fresh.priorCarrier.sidecarSha256,
        })
      : null,
    sizeId: selectedSizeId,
    sizeToken: size.token,
    rows: Object.freeze(
      fresh.rows.map(({ patternVersion, ...row }) =>
        Object.freeze({
          ...completeSavedAssemblyRowIdentityV1(row),
          patternVersion,
        }),
      ),
    ),
    sourceCuts: Object.freeze(
      built.originalCutPaths.map((cut) =>
        Object.freeze({
          ...cut,
          nativeNotchPoints: nativeNotchesByPiece.get(cut.pieceLineKey) ?? null,
        }),
      ),
    ),
    operations: fresh.operations,
    spans: Object.freeze(spans),
    labelAnchors: Object.freeze(labels),
    ...(strips.length && { stripAnchors: Object.freeze(strips) }),
    poses: built.operationAnchors.poses,
    ...(built.operationAnchors.pointClosures && {
      pointClosures: built.operationAnchors.pointClosures,
    }),
    ...(nativePointFastenings.length && {
      nativePointFastenings,
      pointClosureApertures: Object.freeze(
        nativePointFastenings.map(savedNativeFasteningApertureV1),
      ),
    }),
    ...(fresh.authoredFolds && {
      authoredFoldSourceSha256: fresh.authoredFolds.sourceSha256,
      authoredFolds: Object.freeze(
        fresh.authoredFolds.folds.map(({ fold }) => {
          const resolved = resolvedFolds.get(fold.foldKey!);
          if (!resolved)
            throw new Error('A verified authored fold has no current native geometry.');
          return resolved;
        }),
      ),
    }),
    rawUnownedSeams: Object.freeze(
      (card.seams ?? []).filter(({ seamKey }) => !ownedSeamKeys.has(seamKey)),
    ),
    unavailable: built.operationAnchors.unavailable,
  });
}

export type SavedCompleteAssemblyNativeStitchAnchorsV1 = Awaited<
  ReturnType<typeof readSavedCompleteAssemblyNativeStitchAnchorsV1>
>;
