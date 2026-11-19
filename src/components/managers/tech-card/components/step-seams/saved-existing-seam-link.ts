import { abortableAdminService } from 'api/api';
import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import type { TechCardOperation, TechCardSeam, TechCardSeamAnchor } from 'api/proto-http/common';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { anchorFromWire } from 'lib/seams/wire';
import { isDxfUrl } from 'utils/pattern';
import { capturedSeamWriteOptions } from '../assembly-seams/seam-change';
import type { SeamWrites } from '../assembly-seams/use-seam-decisions';
import { bindingScopes } from '../bom-purpose';
import { rollGoodsScopes } from '../piece-block-refs';
import {
  completeSavedAssemblyRowIdentityV1,
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from '../pattern-import/phase-e-workbench-v2/saved-assembly-complete-source-rpc-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from '../pattern-import/phase-e-workbench-v2/saved-card-production-projection-v1';
import { savedWorkbenchBindingScopeKeyV1 } from '../pattern-import/phase-e-workbench-v2/saved-workbench-scope-v1';
import { assertExactZeroOperationSavedPatternRowV1 } from '../pattern-import/phase-e-workbench-v2/zero-operation-saved-card-authority-v1';
import { inputGroups } from './step-seams-model';

type Row = DxfProductSavedRowIdentityV1;
type Group = ReturnType<typeof inputGroups>[number];
type NativeSpan = ReturnType<
  typeof import('../pattern-import/phase-e-workbench-v2/saved-legacy-native-stitch-run-v8').resolveSavedLegacyNativeStitchRangeV1
>;
type SavedEdge = TechCardSeam & { seamKey: string; anchoredSize: string };
type Capture = Readonly<{
  cardId: number;
  lock: number;
  operationNumber: number;
  operationOrder: number;
  historyKey: string;
  seam: SavedEdge;
  operation: TechCardOperation;
  groups: readonly Group[];
  row: Row;
}>;
export type ExistingSeamLinkReview = Readonly<{
  sizeId: number;
  sizeToken: string;
  lengthsMm: readonly [number, number];
  ratio: number;
  stationCount: number;
}>;
type SizeDictionary = Readonly<{
  sizes: readonly common_Size[];
  names: ReadonlyMap<number, string>;
  order: (ids: number[]) => number[];
}>;
const reviews = new WeakMap<
  ExistingSeamLinkReview,
  { capture: Capture; source: CompleteSavedAssemblySourceV1; before: common_TechCard }
>();
const moved = 'The saved operation or seam changed. Reopen the current Assembly Order.';
const unverifiable =
  'The saved seam link could not be verified. Reload Assembly Order before trying again.';
const stationSampling = { minSegmentMm: 0.002, maxSegmentMm: 18, maxPairs: 128 } as const;

function orderedWire(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}
const sameWire = (a: unknown, b: unknown) => orderedWire(a) === orderedWire(b);

function candidateEdge(seam: TechCardSeam): seam is SavedEdge {
  const a = seam.sideA?.parts;
  const b = seam.sideB?.parts;
  return (
    !!seam.seamKey &&
    !!seam.anchoredSize &&
    seam.kind === 'TECH_CARD_SEAM_KIND_EDGE' &&
    seam.status === 'TECH_CARD_SEAM_STATUS_CONFIRMED' &&
    seam.stale === false &&
    (seam.direction === 'TECH_CARD_SEAM_DIRECTION_SAME' ||
      seam.direction === 'TECH_CARD_SEAM_DIRECTION_REVERSED') &&
    a?.length === 1 &&
    b?.length === 1 &&
    a[0].pieceLineKey !== b[0].pieceLineKey &&
    [a[0], b[0]].every((part) => {
      const saved = anchorFromWire(part);
      return (
        !!part.pieceLineKey &&
        !!part.contourSig &&
        part.edgeHint?.startsWith(`${part.pieceLineKey}#`) &&
        !part.edgeHint.includes('#dxf:') &&
        !part.placement &&
        !part.pointClosure &&
        saved.range[0] === 0 &&
        saved.range[1] === 1
      );
    })
  );
}

/** The menu uses exact persisted unit lineage. Choosing a row still requires native review. */
export function existingSeamLinkCandidates(card: common_TechCard, operationNumber: number) {
  const ops = card.techCard?.operations ?? [];
  const n = ops.findIndex((op) => op.operationNumber === operationNumber);
  if (
    n < 0 ||
    ops.filter((op) => op.operationNumber === operationNumber).length !== 1 ||
    ops[n].operationType !== 'TECH_CARD_OPERATION_TYPE_MACHINE' ||
    ops[n].work !== 'join_lockstitch'
  )
    return [];
  const pieces = new Set(
    (card.techCard?.pieces ?? []).flatMap(({ lineKey }) => (lineKey ? [lineKey] : [])),
  );
  const groups = inputGroups(ops, n, pieces);
  const owned = new Set(ops.flatMap(({ seamKeys }) => seamKeys ?? []));
  const seams = card.seams ?? [];
  const acrossGroups = (seam: SavedEdge) => {
    const a = seam.sideA!.parts![0].pieceLineKey!;
    const b = seam.sideB!.parts![0].pieceLineKey!;
    const left = groups.find((group) => group.pieces.includes(a));
    const right = groups.find((group) => group.pieces.includes(b));
    return !!left && !!right && left !== right;
  };
  return seams.filter(
    (seam): seam is SavedEdge =>
      candidateEdge(seam) &&
      !owned.has(seam.seamKey) &&
      seams.filter(({ seamKey }) => seamKey === seam.seamKey).length === 1 &&
      acrossGroups(seam),
  );
}

function mainRow(card: common_TechCard): Row {
  const body = card.techCard!;
  const patterns = body.patterns ?? [];
  const bindings = bindingScopes(rollGoodsScopes(body.bomItems ?? []), patterns);
  const found = patterns.filter(
    ({ fabricPurpose, bomLineKey, url }) =>
      isDxfUrl(url) &&
      savedWorkbenchBindingScopeKeyV1(fabricPurpose, bomLineKey, bindings) === 'main',
  );
  const [pattern] = found;
  if (found.length !== 1 || !pattern.lineKey || !pattern.url)
    throw new Error('This review requires one exact saved MAIN DXF.');
  return assertExactZeroOperationSavedPatternRowV1(card, {
    techCardId: card.id!,
    cardLockVersion: card.lockVersion!,
    patternLineKey: pattern.lineKey,
    scopeKey: 'main',
    revision: pattern.savedRowRevision ?? 0,
    sha256: pattern.sha256 ?? '',
    url: pattern.url,
    sizeBytes: Number(pattern.sizeBytes ?? 0),
  }).row;
}

export function captureExistingSeamLink(
  card: common_TechCard,
  operationNumber: number,
  historyKey: string,
  key: string,
): Capture {
  const seam = existingSeamLinkCandidates(card, operationNumber).find(
    ({ seamKey }) => seamKey === key,
  );
  const ops = card.techCard?.operations ?? [];
  const operationOrder = ops.findIndex((op) => op.operationNumber === operationNumber);
  if (!seam || !card.id || card.lockVersion == null || !historyKey || operationOrder < 0)
    throw new Error(moved);
  const keys = new Set(
    (card.techCard?.pieces ?? []).flatMap(({ lineKey }) => (lineKey ? [lineKey] : [])),
  );
  return structuredClone({
    cardId: card.id,
    lock: card.lockVersion,
    operationNumber,
    operationOrder,
    historyKey,
    operation: ops[operationOrder],
    groups: inputGroups(ops, operationOrder, keys),
    seam,
    row: mainRow(card),
  });
}

async function readFullCard(cardId: number, lock: number, signal: AbortSignal) {
  const result = await abortableAdminService(signal).GetTechCard({
    id: cardId,
    vatCountryCode: undefined,
  });
  signal.throwIfAborted();
  if (result.techCard?.id !== cardId || result.techCard.lockVersion !== lock)
    throw new Error(moved);
  return result.techCard;
}

async function readCurrent(
  capture: Capture,
  signal: AbortSignal,
  prior?: CompleteSavedAssemblySourceV1,
) {
  const { cardId, lock, operationNumber, historyKey, seam, row } = capture;
  const card = await readFullCard(cardId, lock, signal);
  if (!sameWire(capture, captureExistingSeamLink(card, operationNumber, historyKey, seam.seamKey)))
    throw new Error(moved);
  const source = await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    row,
    {
      sourceOnly: true,
      ...(prior && {
        expectedServerAssemblyRevision: prior.serverAssemblyRevision,
        expectedCompleteSourceSha256: prior.sourceSha256,
      }),
    },
    signal,
  );
  const operation = source.operations[capture.operationOrder];
  // Numeric BOM IDs are response-local. The stable bomLineKeys remain in the sealed comparison.
  const comparable = (op: TechCardOperation) => ({ ...op, bomItemIds: undefined });
  if (
    !operation ||
    !sameWire(comparable(operation), comparable(capture.operation)) ||
    source.operations.some((op) => op.seamKeys?.includes(seam.seamKey)) ||
    source.ownedSeams.some((owned) => owned.seamKey === seam.seamKey)
  )
    throw new Error(moved);
  return { card, source };
}

function runsOverlap(a: NativeSpan, b: NativeSpan) {
  return a.intervals.some((left) =>
    b.intervals.some(
      (right) =>
        left.nativeCurveId === right.nativeCurveId &&
        Math.max(Math.min(left.t0, left.t1), Math.min(right.t0, right.t1)) <
          Math.min(Math.max(left.t0, left.t1), Math.max(right.t0, right.t1)),
    ),
  );
}

async function verifyNative(
  capture: Capture,
  card: common_TechCard,
  source: CompleteSavedAssemblySourceV1,
  dictionary: SizeDictionary,
  signal: AbortSignal,
) {
  const projection = {
    card: buildPatternImportDxfPhaseESavedCardContextV1(card, dictionary.order, dictionary.names),
    cardLockVersion: capture.lock,
  };
  const sizes = projection.card.sizes.filter(({ token }) => token === capture.seam.anchoredSize);
  const [size] = sizes;
  if (sizes.length !== 1 || dictionary.sizes.filter(({ id }) => id === size.sizeId).length !== 1)
    throw new Error('The saved seam does not identify one exact current size.');

  const [
    { prepareSavedFullAssemblyCompleteNativeRowsV1 },
    { createSavedFullAssemblyCompleteDxfHostsV1 },
    { consumeDxfProductSavedNativeCompilerSourceV1 },
    {
      parseSavedNativeStitchRowV1,
      readSavedNativeStraightStitchPathsV1,
      resolveSavedLegacyNativeStitchRangeV1,
      savedNativeStitchRawBlockV1,
    },
    { compileSourceCutRegisteredStitchPairsV1 },
  ] = await Promise.all([
    import('../pattern-import/phase-e-workbench-v2/saved-full-assembly-complete-native-rows-v1'),
    import('../pattern-import/phase-e-workbench-v2/saved-full-assembly-complete-dxf-host-v1'),
    import('lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1'),
    import('../pattern-import/phase-e-workbench-v2/saved-legacy-native-stitch-run-v8'),
    import('lib/cloth/compiler/source-cut-registered-stitch-pairs-v1'),
  ]);
  signal.throwIfAborted();
  const built = await prepareSavedFullAssemblyCompleteNativeRowsV1(source, projection, signal, {
    card,
    sizeDictionary: dictionary.sizes,
    selectedSizeId: size.sizeId,
    includeGeneratedCutGeometry: false,
  });
  const parts = [capture.seam.sideA!.parts![0], capture.seam.sideB!.parts![0]] as const;
  const paths = parts.map(({ pieceLineKey }) => {
    const hits = built.originalSewingPaths.filter((path) => path.pieceLineKey === pieceLineKey);
    if (hits.length !== 1 || !sameWire(hits[0].row, capture.row))
      throw new Error('Both existing seam parts must have exact MAIN native paths.');
    return hits[0];
  });
  const members = built.nativeRows.filter(({ row }) => sameWire(row, capture.row));
  const [member] = members;
  if (members.length !== 1) throw new Error('The existing seam source is unavailable.');
  const native = consumeDxfProductSavedNativeCompilerSourceV1(
    member.sourceOwner,
    member.sourceRequest,
  );
  if (!native.ok) throw new Error(native.blockers[0]?.detail);

  const host = createSavedFullAssemblyCompleteDxfHostsV1(source, projection).createCanonical();
  let bytes: Uint8Array | undefined;
  let file: Uint8Array<ArrayBuffer> | undefined;
  try {
    ({ bytes } = await host.readAuthoritativeRow(capture.row, signal, () => {}));
    file = new Uint8Array(bytes);
    const parsed = await parseSavedNativeStitchRowV1(file, 'main.dxf');
    if (parsed.failedFiles || parsed.skippedBlocks)
      throw new Error('The saved native DXF is incomplete.');
    const decoded = await readSavedNativeStraightStitchPathsV1(
      file,
      paths[0],
      paths.map(({ nativePathId }) => nativePathId).sort((left, right) => left - right),
      signal,
    );
    const replay = (part: TechCardSeamAnchor, index: number) => {
      const path = paths[index];
      const blockName = savedNativeStitchRawBlockV1(native.value, path);
      return resolveSavedLegacyNativeStitchRangeV1(
        parsed.pieces.filter((piece) => piece.blockName === blockName),
        path,
        part,
        decoded.descriptors.filter(({ path: edge }) => edge.sourcePathId === path.nativePathId),
      );
    };
    const spans = parts.map(replay);
    for (const seam of source.ownedSeams) {
      if (seam.kind === 'TECH_CARD_SEAM_KIND_POSE') continue;
      for (const existing of [...(seam.sideA?.parts ?? []), ...(seam.sideB?.parts ?? [])]) {
        const index = parts.findIndex((part) => part.pieceLineKey === existing.pieceLineKey);
        if (index === -1) continue;
        if (
          seam.stale ||
          seam.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED' ||
          existing.pointClosure
        )
          throw new Error('A current seam on these pieces needs separate review.');
        if (runsOverlap(spans[index], replay(existing, index)))
          throw new Error('An original curve of this seam is already used by an owned seam.');
      }
    }
    const run = (index: number, reverse: boolean) => {
      const intervals = spans[index].intervals.map(({ startMm, endMm }) => ({ startMm, endMm }));
      return {
        pieceId: parts[index].pieceLineKey!,
        intervals: reverse
          ? intervals.toReversed().map(({ startMm, endMm }) => ({ startMm: endMm, endMm: startMm }))
          : intervals,
      };
    };
    const grid = compileSourceCutRegisteredStitchPairsV1(
      [
        {
          operationOrder: capture.operationOrder,
          seamId: capture.seam.seamKey,
          sections: [
            {
              sideA: run(0, false),
              sideB: run(1, capture.seam.direction === 'TECH_CARD_SEAM_DIRECTION_REVERSED'),
            },
          ],
        },
      ],
      stationSampling,
      signal,
    );
    const lengthsMm = [spans[0].nativeLengthMm, spans[1].nativeLengthMm] as const;
    return {
      sizeId: size.sizeId,
      sizeToken: size.token,
      stationCount: grid.length,
      lengthsMm,
      ratio: lengthsMm[1] / lengthsMm[0],
    };
  } finally {
    file?.fill(0);
    bytes?.fill(0);
    host.dispose();
  }
}

export async function reviewExistingSeamLink(
  capture: Capture,
  dictionary: SizeDictionary,
  isCurrent: () => boolean,
  signal: AbortSignal,
): Promise<ExistingSeamLinkReview> {
  if (!isCurrent()) throw new Error(moved);
  const ownedCapture = structuredClone(capture);
  const { card, source } = await readCurrent(ownedCapture, signal);
  if (!isCurrent()) throw new Error(moved);
  const review = await verifyNative(ownedCapture, card, source, dictionary, signal);
  await readCurrent(ownedCapture, signal, source);
  signal.throwIfAborted();
  if (!isCurrent()) throw new Error(moved);
  const result = Object.freeze({ ...review, lengthsMm: Object.freeze(review.lengthsMm) });
  reviews.set(result, { capture: ownedCapture, source, before: structuredClone(card) });
  return result;
}

export async function linkReviewedExistingSeam(
  review: ExistingSeamLinkReview,
  change: SeamWrites['change'],
  isCurrent: () => boolean,
  signal: AbortSignal,
) {
  const intent = reviews.get(review);
  if (!intent || !isCurrent()) throw new Error(moved);
  reviews.delete(review);
  const { capture, source, before } = intent;
  await readCurrent(capture, signal, source);
  signal.throwIfAborted();
  if (!isCurrent()) throw new Error(moved);
  const result = await change(
    {
      expectedServerAssemblyRevision: source.serverAssemblyRevision,
      link: [{ step: { historyKey: capture.historyKey }, seamKey: capture.seam.seamKey }],
    },
    {
      verb: 'Link existing seam',
      errorAt: capture.seam.seamKey,
      ...capturedSeamWriteOptions({
        expectedLockVersion: capture.lock,
        validate: () => (!signal.aborted && isCurrent() ? { ok: true } : { ok: false, why: moved }),
      }),
    },
  );
  if (!result.ok) throw new Error(result.why);
  if (result.lockVersion !== capture.lock + 1 || result.deletedKeys.length || result.keyMap.size)
    throw new Error(unverifiable);

  // Once committed, finish the independent read even if the editor already displays the new link.
  const readback = new AbortController().signal;
  const saved = await readFullCard(capture.cardId, result.lockVersion, readback);
  const operations = before.techCard!.operations!.map((operation, ordinal) =>
    ordinal === capture.operationOrder
      ? { ...operation, seamKeys: [...(operation.seamKeys ?? []), capture.seam.seamKey] }
      : operation,
  );
  if (!sameWire(before.seams, saved.seams) || !sameWire(saved.techCard?.operations, operations))
    throw new Error(unverifiable);

  const fresh = await readCompleteSavedAssemblySourceV1(
    abortableAdminService(readback),
    { ...capture.row, cardLockVersion: result.lockVersion },
    { sourceOnly: true },
    readback,
  );
  const owned = fresh.ownedSeams.filter(({ seamKey }) => seamKey === capture.seam.seamKey);
  const exactRows = (data: CompleteSavedAssemblySourceV1) =>
    data.rows.map((row) => ({ ...completeSavedAssemblyRowIdentityV1(row), cardLockVersion: 0 }));
  if (
    fresh.serverAssemblyRevision === source.serverAssemblyRevision ||
    !sameWire(
      fresh.operations[capture.operationOrder]?.seamKeys,
      operations[capture.operationOrder].seamKeys,
    ) ||
    owned.length !== 1 ||
    !sameWire(owned[0], capture.seam) ||
    !sameWire(exactRows(fresh), exactRows(source)) ||
    !sameWire(fresh.aliases, source.aliases) ||
    !sameWire(
      fresh.ownedSeams.filter(({ seamKey }) => seamKey !== capture.seam.seamKey),
      source.ownedSeams,
    )
  )
    throw new Error(unverifiable);
}
