import { sameDraftAllowanceRingV1 } from './draft-cad-paired-allowance-authority-v1';
import { bboxOf } from 'lib/pattern-import/semantics/geom';
import { transformSizeSpec } from 'lib/pattern-import/semantics/pairs';
import type { PtMm } from 'lib/pattern-import/types';
import { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  authoredInternalVertices,
  decodeAuthoredQuadratic,
} from 'lib/pattern-import/manifest/authored-internal';
import type { ConversionManifest, WriteJob } from 'lib/pattern-import/types';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import {
  readCompiledPairedAllowanceReviewV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 as CompileInput,
  type PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 as Artifact,
} from './draft-cad-geometry-compile-v1';
import type { prepareSavedAddPointReviewV1 } from './draft-cad-saved-add-point-review-v1';
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
} from './draft-cad-saved-source-selection-v1';
import { activeDraftCadTransactionsV1, isRecordedDraftCadSessionV1 } from './draft-cad-session-v1';
import { registerSavedDartTipFileV1 } from './draft-cad-saved-dart-tip-file-v1';
import {
  adjustedSavedDartFeetV1,
  canMoveSavedDartTipV1,
  movedSavedFishEyePointsV1,
  selectSavedDartTipV1,
  selectSavedFishEyeMoveV1,
  sameDartVertices,
} from './draft-cad-saved-dart-tip-v1';

import { selectSavedFrenchCurveV1 } from './draft-cad-saved-french-curve-v1';

const prepared = new WeakSet<CompileInput>();
export const hasSavedDraftGeometrySourceV1 = (input: CompileInput) => prepared.has(input);
function requireSavedEdit(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}
const one = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
type Review = {
  kind:
    | 'parallel opening'
    | 'saved dart'
    | 'saved French curve'
    | 'saved corner'
    | 'saved allowance offset';
  current: () => boolean;
  verifyCurrentRow: () => Promise<void>;
  manifest: ConversionManifest;
  geometry: string;
  cardId: number;
  scopeKey: string;
};
const artifacts = new WeakMap<Artifact, Review>();
function markers(manifest: ConversionManifest) {
  return JSON.stringify(
    manifest.blocks
      .map((b) => [b.block, b.identity, b.sizeToken, b.sizeId, b.authoredInternal ?? []])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

function headings(manifest: ConversionManifest) {
  return JSON.stringify(
    manifest.pieces.map(({ identity, displayName, nameOrigin }) => [
      identity,
      displayName,
      nameOrigin,
    ]),
  );
}
// Compare what can be written in every size. Worker-local path ids are allocated anew on reopen.
function geometry(job: WriteJob) {
  return JSON.stringify(
    job.pieces.map((piece) => [
      piece.identity,
      piece.pairOf,
      piece.pairHand,
      piece.unfoldedFold,
      piece.piecesPerGarment,
      piece.sizes.map((size) => [
        size.rank,
        size.sizeToken,
        size.sizeId,
        size.cut,
        size.cutLoops ?? [],
        size.seam,
        size.grain && [size.grain.a, size.grain.b],
        size.fold && [size.fold.a, size.fold.b],
        size.notches.map((n) => [n.at, n.seg, n.depthMm, n.authoredGroup]),
        size.drills.map((d) => [d.at, d.form, d.sizeMm]),
        size.internal.map((p) => [p.label, p.closed, p.pts, p.authoredQuadratic]),
        size.pointMarks ?? [],
        size.textMarks ?? [],
      ]),
    ]),
  );
}
function openingGeometry(job: WriteJob, frame: 'size' | 'grade' = 'size') {
  const ring = (points: PtMm[]) => {
    const start = points.reduce(
      (best, p, i) =>
        p.x < points[best]!.x || (p.x === points[best]!.x && p.y < points[best]!.y) ? i : best,
      0,
    );
    return [...points.slice(start), ...points.slice(0, start)];
  };
  return geometry({
    ...job,
    pieces: job.pieces.map((piece) => ({
      ...piece,
      sizes: piece.sizes.map((size) => {
        // An allowance edit may move the whole piece on the writer sheet. All ranks must keep
        // their position relative to the same unchanged sewing contour.
        const first = piece.sizes[0]!;
        const origin = frame === 'grade' ? bboxOf(first.seam ?? first.cut) : size.bbox;
        const z = transformSizeSpec(size, {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: -origin.minX,
          f: -origin.minY,
        });
        return {
          ...z,
          cut: ring(z.cut),
          seam: z.seam && ring(z.seam),
          ...(z.cutLoops && { cutLoops: z.cutLoops.map(ring) }),
        };
      }),
    })),
  });
}
export async function compileSavedDraftGeometryReviewV1(
  {
    readCurrent,
    sourceOwner,
    sourceRequest,
  }: Pick<
    Parameters<typeof prepareSavedAddPointReviewV1>[0],
    'readCurrent' | 'sourceOwner' | 'sourceRequest'
  >,
  verifyCurrentRow: () => Promise<void>,
) {
  const opening = readCurrent();
  requireSavedEdit(
    opening && isRecordedDraftCadSessionV1(opening.session),
    'Record the saved geometry edit again.',
  );
  const { session, generation, sizeToken } = opening,
    row = structuredClone(opening.row);
  const commands = activeDraftCadTransactionsV1(session).flatMap((tx) => tx.commands);
  const command = commands[0],
    last = commands[1];
  const parallel =
    commands.length === 2 &&
    command?.tool === 'cut' &&
    last?.tool === 'spread' &&
    last.payload.mode === 'parallel' &&
    last.target.pieceId === command.target.pieceId &&
    last.target.pieceLineKey === command.target.pieceLineKey &&
    last.payload.cutLineEntityId === command.payload.entityId;
  const savedTip = command?.tool === 'dart' ? command.payload.savedTip : undefined;
  const savedMove = command?.tool === 'fish-eye' ? command.payload.savedMove : undefined;
  const savedDart = savedTip ?? savedMove;
  const savedCurve = command?.tool === 'french-curve' ? command.payload.savedCurve : undefined;
  const sharpen = command?.tool === 'sharpen-corner';
  requireSavedEdit(
    command && (parallel || (commands.length === 1 && (savedDart || savedCurve || sharpen))),
    'Record a saved corner, curve, dart or parallel opening edit.',
  );
  const { pieceId, pieceLineKey } = command.target;
  let affectedBlockNames = [pieceId + '_' + sizeToken];
  const current = () => {
    const now = readCurrent();
    if (
      !now ||
      now.session !== session ||
      now.generation !== generation ||
      now.sizeToken !== sizeToken ||
      !sameSavedDraftRowV1(now.row, row) ||
      now.card.techCardId !== row.techCardId
    )
      return false;
    const aliases =
      now.card.existingAliases?.filter(
        (a) =>
          a.scopeKey === row.scopeKey &&
          (a.blockName === pieceId || affectedBlockNames.includes(a.blockName)),
      ) ?? [];
    return (
      aliases.length > 0 &&
      affectedBlockNames.every((name) =>
        aliases.some((a) => a.blockName === pieceId || a.blockName === name),
      ) &&
      new Set(aliases.map((a) => a.blockName)).size === aliases.length &&
      aliases.every((a) => a.pieceLineKey === pieceLineKey) &&
      now.card.existingPieces.filter((p) => p.lineKey === pieceLineKey).length === 1
    );
  };
  requireSavedEdit(
    current() && session.source.phaseD.sourceSha256 === row.sha256,
    sharpen
      ? 'The saved bevel row, size or piece changed.'
      : savedCurve
        ? 'The saved French curve row, size or piece changed.'
        : 'The saved dart or opening row, size or piece changed.',
  );
  const source = consumeDxfProductSavedNativeCompilerSourceV1(sourceOwner, sourceRequest);
  requireSavedEdit(
    source.ok &&
      !source.value.reconstruction &&
      !source.value.nativeRead.scope &&
      sameSavedDraftRowV1(source.value.row, row) &&
      source.value.sourceFileId === session.source.phaseD.sourceFileId,
    'Reopen the current exact saved DXF.',
  );
  const { draft, nativeRead } = source.value;
  const selection = await selectMatchingSavedDraftV1(draft, row.scopeKey, sizeToken, session);
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft);
  requireSavedEdit(
    selection && compileSource,
    'The saved geometry selection no longer matches the Draft.',
  );
  const compileInput = { ...selection, session, compileSource };
  if (parallel) {
    const { checkSavedParallelSpreadSourceV1 } = await import(
      './draft-cad-parallel-spread-source-v1'
    );
    const affected = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
    requireSavedEdit(affected, 'The saved material is unavailable.');
    affectedBlockNames = affected.manifest.blocks
      .filter((b) => b.identity === pieceId)
      .map((b) => b.block);
    requireSavedEdit(affectedBlockNames.length && current(), 'A graded piece alias changed.');
    await checkSavedParallelSpreadSourceV1(source.value, pieceId);
  } else if (sharpen) {
    const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
    const block = one(
      scope?.manifest.blocks.filter((b) => b.identity === pieceId && b.sizeToken === sizeToken) ??
        [],
    );
    const selectedCut = one(
      selection.selection.phaseD.contours.filter(
        (c) =>
          c.contourId === command.payload.edge.contourId &&
          c.pieceId === pieceId &&
          c.sizeToken === sizeToken &&
          c.role === 'cut-boundary',
      ),
    );
    const cutId = one(selectedCut?.lineage.sourcePathIds ?? []);
    const { read } = nativeRead;
    const page = read.doc.pages[0];
    const group =
      block && one(read.meta.groups.filter((g) => g.kind === 'insert' && g.block === block.block));
    requireSavedEdit(
      command.payload.sizeToken === sizeToken &&
        selectedCut?.closed &&
        !selectedCut.lineage.mutations.length &&
        selectedCut.lineage.uniformPositiveScale === 1 &&
        block &&
        group &&
        page &&
        cutId !== undefined &&
        read.meta.units.mmPerUnit === 1,
      'Sharpening requires the exact original saved cut and sewing block.',
    );
    const { a, b, c, d } = group.transform;
    const pathById = new Map(page.paths.map((p) => [p.id, p]));
    const closedLayer = (layer: string) =>
      group.paths
        .map((id) => pathById.get(id))
        .filter(
          (p) =>
            p?.closed &&
            page.styles[p.style]?.layer === layer &&
            p.src.block === block.block &&
            ['POLYLINE', 'LWPOLYLINE'].includes(read.meta.pathEntity[p.id]),
        );
    const cut = one(closedLayer('1').filter((p) => p?.id === cutId));
    const seam = one(closedLayer('14'));
    requireSavedEdit(
      a === 1 &&
        b === 0 &&
        c === 0 &&
        d === 1 &&
        cut &&
        seam &&
        cut.id !== seam.id &&
        sameDraftAllowanceRingV1(cut.pts, selectedCut.pointsMm) &&
        sameDraftAllowanceRingV1(cut.pts, seam.pts),
      'Sharpening requires coincident original L1 and L14 polylines.',
    );
    const edges = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
      sourceSha256: row.sha256,
      sourceFileId: source.value.sourceFileId,
      sourcePathIds: [cut.id, seam.id].sort((a, b) => a - b),
    });
    requireSavedEdit(
      edges.ok &&
        edges.projection.complete &&
        [cut, seam].every((path) => {
          const nativeEdges = edges.projection.descriptors.filter(
            (edge) => edge.path.sourcePathId === path.id,
          );
          return (
            nativeEdges.length === path.pts.length &&
            path.pts.every((start, index) => {
              const next = (index + 1) % path.pts.length;
              const native = one(
                nativeEdges.filter(
                  (edge) =>
                    edge.path.closed &&
                    edge.path.startPointIndex === index &&
                    edge.path.endPointIndex === next,
                ),
              );
              return (
                native &&
                sameDartVertices(
                  [
                    { x: native.startMm[0], y: native.startMm[1] },
                    { x: native.endMm[0], y: native.endMm[1] },
                  ],
                  [start, path.pts[next]!],
                )
              );
            })
          );
        }),
      'Sharpening needs both original closed outlines made entirely of straight native edges.',
    );
  } else if (savedCurve && command.tool === 'french-curve') {
    const candidate = selectSavedFrenchCurveV1(compileInput, command.target);
    const sourcePathId = savedCurve.sourcePathId;
    requireSavedEdit(
      candidate &&
        savedCurve.pieceId === pieceId &&
        savedCurve.pieceLineKey === pieceLineKey &&
        savedCurve.sourceSha256 === row.sha256 &&
        savedCurve.scopeKey === row.scopeKey &&
        savedCurve.sizeToken === sizeToken &&
        savedCurve.sizeId === candidate.savedCurve.sizeId &&
        savedCurve.rank === candidate.savedCurve.rank &&
        savedCurve.index === candidate.savedCurve.index &&
        sourcePathId === candidate.savedCurve.sourcePathId &&
        sameDartVertices(candidate.controlPointsMm, savedCurve.original) &&
        !sameDartVertices(candidate.controlPointsMm, command.payload.controlPointsMm),
      'The saved French curve or its selected source changed.',
    );
    const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
    const block = one(
      scope?.manifest.blocks.filter(
        (b) =>
          b.identity === pieceId && b.sizeToken === sizeToken && b.sizeId === savedCurve.sizeId,
      ) ?? [],
    );
    const { read } = nativeRead;
    const group =
      block &&
      one(
        read.meta.groups.filter(
          (g) => g.kind === 'insert' && g.block === block.block && g.paths.includes(sourcePathId),
        ),
      );
    const marker =
      block &&
      one(
        read.meta.authoredInternalByBlock
          ?.get(block.block)
          ?.filter((m) => m.label === 'draft-cad:french-curve') ?? [],
      );
    const page = read.doc.pages[0];
    requireSavedEdit(
      block && group && page && marker?.quadratic && !marker.closed,
      'The original analytical French curve is unavailable in the signed DXF.',
    );
    const paths = new Map(page.paths.map((path) => [path.id, path]));
    const native = group.paths
      .map((id) => paths.get(id))
      .filter((path) => path && page.styles[path.style]?.layer === '8')[marker.index];
    const { a, b, c, d, e, f } = group.transform;
    requireSavedEdit(
      current() &&
        a === 1 &&
        b === 0 &&
        c === 0 &&
        d === 1 &&
        native?.id === sourcePathId &&
        native.src.block === block.block &&
        !native.closed &&
        sameDartVertices(native.pts, candidate.pointsMm) &&
        sameDartVertices(
          decodeAuthoredQuadratic(marker.quadratic, { x: e, y: f }),
          candidate.controlPointsMm,
        ),
      'The native French curve no longer matches its signed layer-8 path and controls.',
    );
  } else {
    requireSavedEdit(
      savedDart &&
        current() &&
        savedDart.pieceId === pieceId &&
        savedDart.pieceLineKey === pieceLineKey &&
        savedDart.sourceSha256 === row.sha256 &&
        savedDart.scopeKey === row.scopeKey &&
        savedDart.sizeToken === sizeToken,
      'The saved dart row, size or piece changed.',
    );
    const base = command.tool === 'dart' ? command.payload.base : undefined;
    const sameBinding = (candidate: typeof savedDart) =>
      candidate.index === savedDart.index &&
      candidate.rank === savedDart.rank &&
      candidate.sizeId === savedDart.sizeId &&
      sameDartVertices(candidate.original, savedDart.original);
    const intakePathId =
      command.tool === 'dart' ? command.payload.savedIntakeSourcePathId : undefined;
    const candidate =
      command.tool === 'dart' ? selectSavedDartTipV1(compileInput, command.target) : null;
    if (command.tool === 'dart') {
      requireSavedEdit(
        candidate &&
          base &&
          sameBinding(candidate.savedTip) &&
          candidate.base.contourId === base.contourId &&
          candidate.base.boundaryVertexIds.every((id, i) => id === base.boundaryVertexIds[i]) &&
          candidate.base.progress === base.progress,
        'The saved dart or its two original feet changed.',
      );
      const { apexMm, intakeMm } = command.payload;
      requireSavedEdit(
        intakePathId === undefined
          ? canMoveSavedDartTipV1(candidate.apexMm, apexMm) && candidate.intakeMm === intakeMm
          : candidate.intakeSourcePathId === intakePathId &&
              candidate.apexMm.x === apexMm.x &&
              candidate.apexMm.y === apexMm.y &&
              adjustedSavedDartFeetV1(candidate.edge, candidate.savedTip.original, intakeMm),
        'The saved dart edit no longer matches its original path, apex or intake.',
      );
    } else {
      const candidate = selectSavedFishEyeMoveV1(compileInput, command.target);
      requireSavedEdit(
        command.tool === 'fish-eye' &&
          savedMove &&
          candidate &&
          sameBinding(candidate.savedMove) &&
          candidate.savedMove.sourcePathId === savedMove.sourcePathId &&
          movedSavedFishEyePointsV1(savedMove.original, command.payload.centerMm),
        'The exact saved fish-eye or its proposed centre changed.',
      );
    }
    const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
    const block = one(
      scope?.manifest.blocks.filter(
        (b) => b.identity === pieceId && b.sizeToken === sizeToken && b.sizeId === savedDart.sizeId,
      ) ?? [],
    );
    const cut = one(
      selection.selection.phaseD.contours.filter(
        (c) =>
          (!base || c.contourId === base.contourId) &&
          c.pieceId === pieceId &&
          c.sizeToken === sizeToken &&
          c.role === 'cut-boundary',
      ),
    );
    const pathId = one(cut?.lineage.sourcePathIds ?? []);
    requireSavedEdit(
      block &&
        cut &&
        pathId !== undefined &&
        !cut.lineage.mutations.length &&
        cut.lineage.uniformPositiveScale === 1,
      'The dart needs its original cut outline.',
    );
    const group = one(
      nativeRead.read.meta.groups.filter(
        (g) => g.kind === 'insert' && g.block === block.block && g.paths.includes(pathId),
      ),
    );
    const page = nativeRead.read.doc.pages[0];
    const closed = Boolean(savedMove);
    const nativeLabel = closed ? 'draft-cad:fish-eye' : 'draft-cad:dart';
    const markers = nativeRead.read.meta.authoredInternalByBlock?.get(block.block);
    const marker = one(markers?.filter((entry) => entry.label === nativeLabel) ?? []);
    requireSavedEdit(
      group && page && marker && marker.closed === closed,
      'The original native layer-8 dart is unavailable.',
    );
    const paths = new Map(page.paths.map((p) => [p.id, p]));
    const layer8 = group.paths
      .map((id) => paths.get(id))
      .filter((p) => p && page.styles[p.style]?.layer === '8');
    const dart = layer8[marker.index];
    const { a, b, c, d, e, f } = group.transform;
    requireSavedEdit(
      a === 1 &&
        d === 1 &&
        b === 0 &&
        c === 0 &&
        dart &&
        dart.closed === closed &&
        (!savedMove || dart.id === savedMove.sourcePathId) &&
        (intakePathId === undefined || dart.id === intakePathId) &&
        dart.src.block === block.block &&
        sameDartVertices(dart.pts, savedDart.original) &&
        JSON.stringify(authoredInternalVertices(dart.pts, { x: e, y: f })) ===
          JSON.stringify(marker.vertices),
      'The native dart no longer matches its ordered saved layer-8 vertices.',
    );
    const edges = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
      sourceSha256: row.sha256,
      sourceFileId: source.value.sourceFileId,
      sourcePathIds: [pathId, dart.id].sort((a, b) => a - b),
    });
    requireSavedEdit(
      edges.ok && edges.projection.complete,
      'The saved dart needs original native straight geometry.',
    );
    if (base) {
      const cutEdge = one(
        edges.projection.descriptors.filter(
          (edge) =>
            edge.path.sourcePathId === pathId &&
            edge.startVertexId === base.boundaryVertexIds[0] &&
            edge.endVertexId === base.boundaryVertexIds[1],
        ),
      );
      requireSavedEdit(
        cutEdge &&
          (intakePathId === undefined ||
            (candidate &&
              sameDartVertices(
                [
                  { x: cutEdge.startMm[0], y: cutEdge.startMm[1] },
                  { x: cutEdge.endMm[0], y: cutEdge.endMm[1] },
                ],
                candidate.edge,
              ))),
        'The dart feet need one original straight cut edge.',
      );
    }
    const legs = edges.projection.descriptors.filter((edge) => edge.path.sourcePathId === dart.id);
    const legCount = closed ? 4 : 2;
    requireSavedEdit(
      legs.length === legCount &&
        Array.from({ length: legCount }, (_, start) => start).every((start) => {
          const end = (start + 1) % dart.pts.length;
          return one(
            legs.filter(
              (edge) =>
                edge.path.closed === closed &&
                edge.path.startPointIndex === start &&
                edge.path.endPointIndex === end &&
                sameDartVertices(
                  [
                    { x: edge.startMm[0], y: edge.startMm[1] },
                    { x: edge.endMm[0], y: edge.endMm[1] },
                  ],
                  [dart.pts[start]!, dart.pts[end]!],
                ),
            ),
          );
        }),
      closed
        ? 'The saved fish-eye needs four ordered native straight sides.'
        : 'The original dart must contain exactly two native straight legs.',
    );
  }
  await verifyCurrentRow();
  requireSavedEdit(current(), 'The saved geometry changed during verification.');
  const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
    './draft-cad-geometry-compile-v1'
  );
  requireSavedEdit(current(), 'The saved geometry changed before compiling.');
  prepared.add(compileInput);
  try {
    const result = compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput);
    if (result.ok)
      artifacts.set(result.artifact, {
        current,
        kind: parallel
          ? 'parallel opening'
          : sharpen
            ? 'saved corner'
            : savedCurve
              ? 'saved French curve'
              : 'saved dart',
        verifyCurrentRow,
        manifest: result.artifact.manifest,
        geometry: (parallel ? openingGeometry : geometry)(result.artifact.compiledJob),
        cardId: row.techCardId,
        scopeKey: row.scopeKey,
      });
    return result;
  } finally {
    prepared.delete(compileInput);
  }
}

export const compileSavedDartTipReviewV1 = compileSavedDraftGeometryReviewV1;

function readOffsetReview(artifact: Artifact): Review | undefined {
  if (
    artifact.compiledFeatures.length !== 1 ||
    artifact.compiledFeatures[0]?.output !== 'allowance-offset'
  )
    return undefined;
  const proof = readCompiledPairedAllowanceReviewV1(artifact);
  if (!proof?.verifyCurrentRow) return undefined;
  return {
    kind: 'saved allowance offset',
    current: proof.current,
    verifyCurrentRow: proof.verifyCurrentRow,
    manifest: artifact.manifest,
    geometry: openingGeometry(artifact.compiledJob, 'grade'),
    cardId: artifact.scope.techCardId,
    scopeKey: artifact.scope.scopeKey,
  };
}

export function openSavedDraftGeometryFileV1(artifact: Artifact, name: string) {
  const review = artifacts.get(artifact) ?? readOffsetReview(artifact);
  requireSavedEdit(review && review.current(), 'Compile the current saved geometry again.');
  const file = new File([artifact.dxfText], name, { type: 'image/vnd.dxf' });
  registerSavedDartTipFileV1(
    file,
    async (draft, scope, isCurrent) => {
      requireSavedEdit(review.current() && isCurrent(), 'The saved geometry review changed.');
      requireSavedEdit(
        draft.techCardId === review.cardId &&
          scope.target.scopeKey === review.scopeKey &&
          scope.manifest.gate?.passed &&
          markers(scope.manifest) === markers(review.manifest) &&
          (review.kind !== 'saved allowance offset' ||
            headings(scope.manifest) === headings(review.manifest)) &&
          scope.writerReplay &&
          (review.kind === 'saved allowance offset'
            ? openingGeometry(scope.writerReplay.job, 'grade')
            : review.kind === 'parallel opening'
              ? openingGeometry(scope.writerReplay.job)
              : geometry(scope.writerReplay.job)) === review.geometry,
        review.kind === 'saved dart'
          ? 'The reviewed native dart paths or size blocks changed.'
          : `The reviewed ${review.kind} or another size changed.`,
      );
      await review.verifyCurrentRow();
      requireSavedEdit(
        review.current() && isCurrent(),
        'The saved geometry row changed before Apply.',
      );
    },
    review.kind,
    review.kind === 'saved allowance offset'
      ? { scopeKey: review.scopeKey, manifest: review.manifest }
      : undefined,
  );
  return file;
}

export const openSavedDartTipReviewFileV1 = openSavedDraftGeometryFileV1;
export const hasSavedDartTipSourceV1 = hasSavedDraftGeometrySourceV1;
