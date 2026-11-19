import {
  authoredQuadraticGrid,
  sampleAuthoredQuadratic,
} from 'lib/pattern-import/manifest/authored-internal';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PtMm } from 'lib/pattern-import/types';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 as CompileInput } from './draft-cad-geometry-compile-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type DraftCadFrenchCurveHandleV1,
  type PatternImportDxfPhaseEDraftCadTargetV1,
  type SavedDraftFrenchCurveBindingV1,
} from './draft-cad-session-v1';
import {
  sameDartVertices as sameInternalGridVertices,
  selectSavedDraftInternalPathPieceV1,
} from './draft-cad-saved-dart-tip-v1';

export function selectSavedFrenchCurveV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
) {
  const source = input.session.source.phaseD;
  const selectedBinding = input.selection.pipeline.contentBinding;
  const writerBinding = input.compileSource.dxfProvenance?.contentBinding;
  if (
    selectedBinding?.sourceFileId !== source.sourceFileId ||
    selectedBinding?.sourceSha256 !== source.sourceSha256 ||
    selectedBinding?.selectedGeometrySha256 !== source.selectedGeometrySha256 ||
    writerBinding?.sourceFileId !== source.sourceFileId ||
    writerBinding?.sourceSha256 !== source.sourceSha256 ||
    input.projection.sizeSelectionCanonicalSha256 !== input.selection.selection.canonicalSha256
  )
    return null;
  const selected = selectSavedDraftInternalPathPieceV1(input, target);
  if (!selected) return null;
  const { scopeKey, sizeToken, size } = selected;
  const curves = size.internal.filter(({ label }) => label === 'draft-cad:french-curve');
  const [curve] = curves;
  if (curves.length !== 1 || !curve || curve.closed || curve.graded || !curve.authoredQuadratic)
    return null;
  const [range] = curve.ranges;
  if (curve.ranges.length !== 1 || !range || range.from !== 0 || range.to !== curve.pts.length - 1)
    return null;
  const savedCurve: SavedDraftFrenchCurveBindingV1 = {
    pieceId: target.pieceId,
    pieceLineKey: target.pieceLineKey,
    sourceSha256: input.session.source.phaseD.sourceSha256,
    scopeKey,
    sizeToken,
    sizeId: size.sizeId,
    rank: size.rank,
    index: size.internal.indexOf(curve),
    original: curve.authoredQuadratic,
    sourcePathId: range.path,
  };
  return { savedCurve, controlPointsMm: curve.authoredQuadratic, pointsMm: curve.pts };
}

export function recordSavedFrenchCurveHandleV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
  handle: DraftCadFrenchCurveHandleV1,
  pointMm: PtMm,
) {
  const candidate = selectSavedFrenchCurveV1(input, target);
  if (
    input.session.cursor !== 0 ||
    !candidate ||
    ![0, 1, 2].includes(handle) ||
    ![pointMm.x, pointMm.y].every(
      (coordinate) => Number.isFinite(coordinate) && coordinate === Number(coordinate.toFixed(6)),
    ) ||
    sameInternalGridVertices([pointMm], [candidate.controlPointsMm[handle]])
  )
    return null;
  const controlPointsMm: [PtMm, PtMm, PtMm] = [...candidate.controlPointsMm];
  controlPointsMm[handle] = pointMm;
  const grid = authoredQuadraticGrid(controlPointsMm);
  if (!grid || !sampleAuthoredQuadratic(grid)) return null;
  const id = 'saved-french-curve';
  return recordPatternImportDxfPhaseEDraftCadTransactionV1(input.session, {
    transactionId: id,
    label: 'Move saved French curve handle',
    commands: [
      {
        tool: 'french-curve',
        commandId: id,
        target,
        payload: { entityId: id, controlPointsMm, savedCurve: candidate.savedCurve },
      },
    ],
  });
}

/** The ordinary fallback already holds the exact signed-row Draft input for this size. */
export function selectSavedFrenchCurveTableEditV1(
  prepared: Readonly<{
    catalog: CompileInput['session']['source']['catalog'];
    selection: CompileInput['selection'];
    projection: CompileInput['projection'];
    draftCadCompileSource: CompileInput['compileSource'];
  }>,
  row: DxfProductSavedRowIdentityV1,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
) {
  const { catalog, selection, projection, draftCadCompileSource } = prepared;
  const initial = createPatternImportDxfPhaseEDraftCadSessionV1({
    revision: row.revision,
    phaseD: {
      sourceFileId: selection.phaseD.source.sourceFileId,
      sourceSha256: row.sha256,
      selectedGeometrySha256: selection.selection.selectedGeometrySha256,
    },
    catalog,
  });
  if (!initial.ok) return null;
  const input = {
    session: initial.session,
    projection,
    selection,
    compileSource: draftCadCompileSource,
  };
  const curve = selectSavedFrenchCurveV1(input, target);
  return curve ? { row, input, target, curve } : null;
}
