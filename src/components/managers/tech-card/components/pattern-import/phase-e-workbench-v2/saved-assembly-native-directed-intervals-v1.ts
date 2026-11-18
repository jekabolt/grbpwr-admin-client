import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  projectPatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  computeDxfProductSavedSourceFileIdV1,
  isDxfProductSavedReprocessVerifiedV1,
  type DxfProductSavedReprocessResultV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { anchorOfRunId } from 'lib/seams/anchor';
import { anchorFromWire, anchorToWire } from 'lib/seams/wire';
import {
  buildPatternImportDxfPhaseEExactAnchorEdgeV1,
  readPatternImportDxfPhaseEExactAnchorEdgeHintV1,
} from './cad-table-zero-connect-exact-anchor-geometry-v1';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import {
  bindSavedAssemblyOperationAnchorsV1,
  type SavedAssemblyPhysicalAnchorV1,
} from './saved-assembly-operation-anchors-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonicalize } from './saved-assembly-topology-hash-v1';
import { createSavedNativeSewingAuthoringViewV1 } from './saved-native-sewing-authoring-view-v1';

const schemaVersion = 'saved-assembly-native-directed-intervals/1' as const;
type Catalog = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductPhaseEAuthoringCatalogV1>>,
  { ok: true }
>['catalog'];

type DirectedSide = Readonly<{
  pieceLineKey: string;
  pieceId: string;
  contourId: string;
  /** Adjacent vertices in the catalog's forward traversal. Direction gives the stored sample walk. */
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
  /** Full anchor serialized by anchorToWire, including normalized proto defaults. */
  canonicalAnchorWire: string;
}>;

export type SavedAssemblyNativeDirectedIntervalReceiptV1 = Readonly<{
  schemaVersion: typeof schemaVersion;
  row: DxfProductSavedRowIdentityV1;
  operationNumber: number;
  serverAssemblyRevision: string;
  completeSourceSha256: string;
  sourceFileId: string;
  sizeToken: string;
  catalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  orderedSeams: readonly Readonly<{
    seamKey: string;
    seamDirection: 'same' | 'reversed';
    sides: readonly [DirectedSide, DirectedSide];
  }>[];
  /** SHA-256 over the versioned canonical receipt fields, before adding this digest. */
  canonicalSha256: string;
}>;

type BlockerCode =
  | 'saved-interval-source-stale'
  | 'saved-interval-catalog-stale'
  | 'saved-interval-operation-invalid'
  | 'saved-interval-seam-unsupported'
  | 'saved-interval-piece-unbound'
  | 'saved-interval-locator-invalid'
  | 'saved-interval-wire-mismatch'
  | 'saved-interval-wire-ambiguous'
  | 'saved-interval-cancelled';

function blocked(code: BlockerCode, seamKey?: string, sideIndex?: 0 | 1) {
  return { ok: false as const, blocker: Object.freeze({ code, seamKey, sideIndex }) };
}

const verifiedReceipts = new WeakMap<SavedAssemblyNativeDirectedIntervalReceiptV1, AbortSignal>();

export function isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(
  receipt: unknown,
): receipt is SavedAssemblyNativeDirectedIntervalReceiptV1 {
  if (typeof receipt !== 'object' || receipt === null) return false;
  const generation = verifiedReceipts.get(receipt as SavedAssemblyNativeDirectedIntervalReceiptV1);
  return generation !== undefined && !generation.aborted;
}

function sameRow(a: DxfProductSavedRowIdentityV1, b: DxfProductSavedRowIdentityV1) {
  return Object.entries(completeSavedAssemblyRowIdentityV1(a)).every(
    ([key, value]) => b[key as keyof DxfProductSavedRowIdentityV1] === value,
  );
}

function resolveSide(
  side: SavedAssemblyPhysicalAnchorV1,
  catalog: Catalog,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  aliases: Extract<DxfProductSavedReprocessResultV1, { ok: true }>['draft']['aliases'],
) {
  const { pieceLineKey, seamKey, sideIndex, anchor, source } = side;
  const savedAliases =
    source.kind === 'dxf'
      ? source.aliases.filter((alias) => alias.scopeKey === catalog.scopeKey)
      : [];
  const replayedAliases = aliases.filter(
    (alias) => alias.pieceLineKey === pieceLineKey && alias.scopeKey === catalog.scopeKey,
  );
  const piece = catalog.pieces.find((entry) => entry.pieceLineKey === pieceLineKey);
  if (
    !piece ||
    savedAliases.length !== 1 ||
    replayedAliases.length !== 1 ||
    !savedAliases[0]!.blockName ||
    savedAliases[0]!.blockName !== replayedAliases[0]!.blockName
  )
    return blocked('saved-interval-piece-unbound', seamKey, sideIndex);

  const locator = readPatternImportDxfPhaseEExactAnchorEdgeHintV1(
    pieceLineKey,
    anchor.edgeHint ?? '',
  );
  const contour = locator && piece.contours[locator.contourOrdinal];
  if (!contour || contour.role !== 'sewing-boundary')
    return blocked('saved-interval-locator-invalid', seamKey, sideIndex);
  const vertices = contour.boundaryVertices;
  const from = vertices[locator.edgeOrdinal];
  const to = vertices[locator.edgeOrdinal + 1] ?? (contour.closed ? vertices[0] : undefined);
  if (!from || !to || from.vertexId === to.vertexId)
    return blocked('saved-interval-locator-invalid', seamKey, sideIndex);

  if (
    anchor.layer !== undefined &&
    anchor.layer !== 'TECH_CARD_SEAM_LAYER_UNKNOWN' &&
    anchor.layer !== 'TECH_CARD_SEAM_LAYER_UNDER' &&
    anchor.layer !== 'TECH_CARD_SEAM_LAYER_OVER'
  )
    return blocked('saved-interval-seam-unsupported', seamKey, sideIndex);
  const persisted = anchorFromWire(anchor);
  if (
    persisted.range[0] !== 0 ||
    persisted.range[1] !== 1 ||
    persisted.samples.length !== 5 ||
    !(persisted.lenMm > 0) ||
    !(persisted.perimShare > 0) ||
    !persisted.contourSig ||
    persisted.placement
  )
    return blocked('saved-interval-seam-unsupported', seamKey, sideIndex);
  const canonicalAnchorWire = canonicalize(anchorToWire(persisted));
  const boundaryVertexIds = Object.freeze([from.vertexId, to.vertexId] as const);
  const matches: DirectedSide['direction'][] = [];
  for (const direction of ['forward', 'reverse'] as const) {
    const rebuilt = buildPatternImportDxfPhaseEExactAnchorEdgeV1(
      {
        pieceId: piece.pieceId,
        pieceLineKey,
        contourId: contour.contourId,
        boundaryVertexIds:
          direction === 'forward' ? boundaryVertexIds : [to.vertexId, from.vertexId],
      },
      catalog,
      projection,
    );
    if (!rebuilt.ok) return blocked('saved-interval-locator-invalid', seamKey, sideIndex);
    if (rebuilt.target !== persisted.edgeHint) continue;
    // rowFromHand uses anchorOfRunId for a full edge. The exact drawing writer uses grain zero.
    const rebuiltAnchor = anchorOfRunId([rebuilt.piece], rebuilt.target);
    if (!rebuiltAnchor) return blocked('saved-interval-wire-mismatch', seamKey, sideIndex);
    // Layer is separately saved seam metadata and cannot choose a native interval or direction.
    const wire = anchorToWire({ ...rebuiltAnchor, layer: persisted.layer });
    if (canonicalize(wire) === canonicalAnchorWire) matches.push(direction);
  }
  if (matches.length !== 1)
    return blocked(
      matches.length ? 'saved-interval-wire-ambiguous' : 'saved-interval-wire-mismatch',
      seamKey,
      sideIndex,
    );
  const value: DirectedSide = Object.freeze({
    pieceLineKey,
    pieceId: piece.pieceId,
    contourId: contour.contourId,
    boundaryVertexIds,
    direction: matches[0]!,
    canonicalAnchorWire,
  });
  return { ok: true as const, side: value };
}

/** The signal belongs to the caller's current read generation. The receipt binds native spans only. */
export async function resolveSavedAssemblyNativeDirectedIntervalsV1(
  input: Readonly<{
    source: CompleteSavedAssemblySourceV1;
    expectedRow: DxfProductSavedRowIdentityV1;
    replay: DxfProductSavedReprocessResultV1;
    operationNumber: number;
    sizeToken: string;
    expectedCatalogCanonicalSha256?: string;
  }>,
  signal: AbortSignal,
) {
  if (signal.aborted) return blocked('saved-interval-cancelled');
  const {
    source,
    expectedRow,
    replay,
    operationNumber,
    sizeToken,
    expectedCatalogCanonicalSha256,
  } = input;
  if (
    !isVerifiedCompleteSavedAssemblySourceV1(source) ||
    !isDxfProductSavedReprocessVerifiedV1(replay) ||
    !sameRow(expectedRow, replay.row) ||
    source.rows.filter((row) => row.scopeKey === expectedRow.scopeKey).length !== 1 ||
    !source.rows.some((row) => sameRow(expectedRow, row)) ||
    replay.sourceFileId !== computeDxfProductSavedSourceFileIdV1(expectedRow) ||
    !replay.nativeSewingReplay?.replayReady ||
    replay.nativeSewingReplay.pipeline.contentBinding?.sourceSha256 !== expectedRow.sha256
  )
    return blocked('saved-interval-source-stale');
  const row = completeSavedAssemblyRowIdentityV1(expectedRow);
  let physical;
  try {
    physical = bindSavedAssemblyOperationAnchorsV1(source).physical.filter(
      (seam) => seam.operationNumber === operationNumber,
    );
  } catch {
    return blocked('saved-interval-operation-invalid');
  }
  const operation = source.operations.find((item) => item.operationNumber === operationNumber);
  const seamKeys = operation?.seamKeys ?? [];
  if (!seamKeys.length) return blocked('saved-interval-operation-invalid');
  if (
    physical.length !== seamKeys.length ||
    physical.some(({ seamKey }, index) => seamKey !== seamKeys[index])
  )
    return blocked('saved-interval-seam-unsupported');

  const nativeDraft = createSavedNativeSewingAuthoringViewV1(
    replay.draft,
    replay.nativeSewingReplay,
    row.sha256,
  );
  const [built, selection] = await Promise.all([
    buildPatternImportDxfProductPhaseEAuthoringCatalogV1(nativeDraft, row.scopeKey, sizeToken),
    selectPatternImportDxfProductDraftPhaseDSizeV1(nativeDraft, row.scopeKey, sizeToken),
  ]);
  if (signal.aborted) return blocked('saved-interval-cancelled');
  if (
    !built.ok ||
    !selection.ok ||
    built.catalog.sourceFileId !== replay.sourceFileId ||
    selection.selection.pipeline.contentBinding?.sourceSha256 !== row.sha256 ||
    (expectedCatalogCanonicalSha256 !== undefined &&
      built.catalog.canonicalSha256 !== expectedCatalogCanonicalSha256)
  )
    return blocked('saved-interval-catalog-stale');
  const { catalog } = built;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selection.selection);
  if (!projected.ok) return blocked('saved-interval-catalog-stale');

  const orderedSeams: SavedAssemblyNativeDirectedIntervalReceiptV1['orderedSeams'][number][] = [];
  for (const { seamKey, seam, anchors } of physical) {
    const seamDirection =
      seam.direction === 'TECH_CARD_SEAM_DIRECTION_SAME'
        ? 'same'
        : seam.direction === 'TECH_CARD_SEAM_DIRECTION_REVERSED'
          ? 'reversed'
          : null;
    if (
      !seamDirection ||
      seam.anchoredSize !== sizeToken ||
      seam.kind !== 'TECH_CARD_SEAM_KIND_EDGE' ||
      seam.source !== 'TECH_CARD_SEAM_SOURCE_MANUAL' ||
      anchors.length !== 2 ||
      anchors[0]!.sideIndex !== 0 ||
      anchors[1]!.sideIndex !== 1 ||
      anchors[0]!.pieceLineKey === anchors[1]!.pieceLineKey
    )
      return blocked('saved-interval-seam-unsupported', seamKey);
    const first = resolveSide(anchors[0]!, catalog, projected.projection, replay.draft.aliases);
    if (!first.ok) return first;
    const second = resolveSide(anchors[1]!, catalog, projected.projection, replay.draft.aliases);
    if (!second.ok) return second;
    orderedSeams.push(
      Object.freeze({
        seamKey,
        seamDirection,
        sides: Object.freeze([first.side, second.side] as const),
      }),
    );
  }
  const payload = Object.freeze({
    schemaVersion,
    row,
    operationNumber,
    serverAssemblyRevision: source.serverAssemblyRevision,
    completeSourceSha256: source.sourceSha256,
    sourceFileId: replay.sourceFileId,
    sizeToken,
    catalogCanonicalSha256: catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
    orderedSeams: Object.freeze(orderedSeams),
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${schemaVersion}\0${canonicalize(payload)}`),
  );
  if (signal.aborted) return blocked('saved-interval-cancelled');
  const canonicalSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const receipt = Object.freeze({ ...payload, canonicalSha256 });
  verifiedReceipts.set(receipt, signal);
  return { ok: true as const, receipt, catalog };
}
