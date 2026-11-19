import {
  isSavedFixedEndAuthorityV1,
  type SavedFixedEndAuthorityV1,
  type SavedFixedEndReplacementV1,
} from './saved-fixed-end-outline-authority-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { sha256Hex } from 'lib/pattern-import/adapters/vector/builder';
import type { DxfPieceSpecContourBoundaryV1 } from 'lib/pattern-import/dxf-piece-spec-provenance-bridge-v1';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  type DxfSourceNativeStraightEdgeDescriptorV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { offsetContour, OFFSET_SCALE } from 'lib/pattern-import/semantics/offset';
import type { PtMm } from 'lib/pattern-import/types';
import type { SavedAddPointCurrentV1 } from './draft-cad-saved-add-point-review-v1';
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
} from './draft-cad-saved-source-selection-v1';
import {
  isRecordedDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';

export type SavedDraftPairedAllowanceAuthorityV1 = Readonly<{
  kind: 'saved-draft-paired-allowance/1';
}>;
export type SavedDraftPairedAllowanceProofV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  commandId: string;
  contourId: string;
  pieceId: string;
  pieceLineKey: string;
  sizeToken: string;
  widthMm: number;
  cut: readonly PtMm[];
  seam: readonly PtMm[];
  current: () => boolean;
  verifyCurrentRow?: () => Promise<void>;
  fixedEndReplacement?: SavedFixedEndReplacementV1;
}>;
const owners = new WeakMap<
  SavedDraftPairedAllowanceAuthorityV1,
  SavedDraftPairedAllowanceProofV1
>();

const samePoint = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y) <= 1e-7;
const offsetGridPoint = (a: PtMm, b: PtMm) =>
  Math.round(a.x * OFFSET_SCALE) === Math.round(b.x * OFFSET_SCALE) &&
  Math.round(a.y * OFFSET_SCALE) === Math.round(b.y * OFFSET_SCALE);
const one = <T>(values: readonly T[]) => (values.length === 1 ? values[0] : undefined);

/** Full ring comparison with only winding and cyclic start normalization. */
export function sameDraftAllowanceRingV1(
  a: readonly PtMm[],
  b: readonly PtMm[],
  matches = samePoint,
): boolean {
  const open = (p: readonly PtMm[]) =>
    p.length > 1 && samePoint(p[0]!, p.at(-1)!) ? p.slice(0, -1) : p;
  const [left, right] = [open(a), open(b)];
  if (left.length !== right.length || left.length < 3) return false;
  const start = right.findIndex((point) => matches(left[0]!, point));
  return (
    start >= 0 &&
    !right.slice(start + 1).some((point) => matches(left[0]!, point)) &&
    (left.every((point, i) => matches(point, right[(start + i) % right.length]!)) ||
      left.every((point, i) => matches(point, right[(start - i + right.length) % right.length]!)))
  );
}

function requirePair(claim: unknown, detail: string): asserts claim {
  if (!claim) throw new Error(`Paired allowance edit refused: ${detail}.`);
}

type Selected = Extract<
  Awaited<ReturnType<typeof selectPatternImportDxfProductDraftPhaseDSizeV1>>,
  { ok: true }
>['selection'];
function contourPath(
  phaseD: Selected['phaseD'],
  pieceId: string,
  sizeToken: string,
  role: DxfPieceSpecContourBoundaryV1['role'],
) {
  const contour = one(
    phaseD.contours.filter(
      (c) => c.pieceId === pieceId && c.sizeToken === sizeToken && c.role === role,
    ),
  );
  requirePair(
    contour?.closed &&
      contour.lineage.sourcePathIds.length === 1 &&
      !contour.lineage.mutations.length &&
      contour.lineage.uniformPositiveScale === 1,
    'one unchanged native path is required for each outline',
  );
  const path = one(
    phaseD.source.paths.filter(({ pathId }) => pathId === contour.lineage.sourcePathIds[0]),
  );
  requirePair(
    path?.closed &&
      path.pointsMm.length === contour.pointsMm.length &&
      path.provenance.samples.length === contour.pointsMm.length &&
      sameDraftAllowanceRingV1(path.pointsMm, contour.pointsMm),
    'native path vertices differ from the retained contour',
  );
  return { contour, path };
}

function matchesNativeLines(
  path: ReturnType<typeof contourPath>['path'],
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[],
) {
  const edges = descriptors.filter(({ path: p }) => p.sourcePathId === path.pathId);
  const samples = path.provenance.samples;
  const vertices = path.pointsMm;
  return (
    edges.length === vertices.length &&
    new Set(edges.map(({ sourceCurveId }) => sourceCurveId)).size === edges.length &&
    new Set(edges.map(({ startVertexId }) => startVertexId)).size === vertices.length &&
    edges.every((edge) => {
      const start = edge.path.startPointIndex;
      const end = (start + 1) % vertices.length;
      const a = vertices[start],
        b = vertices[end];
      return (
        edge.path.closed &&
        edge.path.endPointIndex === end &&
        a &&
        b &&
        samples[start]?.sourceCurveId === edge.sourceCurveId &&
        samples[start]?.vertexId === edge.startVertexId &&
        samples[end]?.vertexId === edge.endVertexId &&
        a.x === edge.startMm[0] &&
        a.y === edge.startMm[1] &&
        b.x === edge.endMm[0] &&
        b.y === edge.endMm[1]
      );
    })
  );
}

export async function prepareSavedDraftPairedAllowanceAuthorityV1(
  input: Readonly<{
    sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
    sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
    savedBytes: ArrayBuffer;
    readCurrent: () => SavedAddPointCurrentV1 | null;
    verifyCurrentRow?: () => Promise<void>;
    guardedAuthority?: SavedFixedEndAuthorityV1;
  }>,
): Promise<SavedDraftPairedAllowanceAuthorityV1> {
  const opening = input.readCurrent();
  requirePair(
    opening && isRecordedDraftCadSessionV1(opening.session),
    'a current recorded Draft is required',
  );
  const { session, sizeToken, generation } = opening;
  const row = structuredClone(opening.row);
  const command = session.history[0]?.commands[0];
  requirePair(
    Number.isSafeInteger(generation) &&
      generation >= 0 &&
      session.cursor === 1 &&
      session.history[0]?.commands.length === 1 &&
      (command?.tool === 'edge-length' || command?.tool === 'allowance-offset') &&
      command.payload.sizeToken === sizeToken,
    'record one edge length or allowance offset on the current saved size',
  );
  const { pieceId, pieceLineKey } = command.target;
  const turn = command.tool === 'allowance-offset' && command.payload.turnAllowance;
  const guardedAuthority =
    turn || command.tool === 'edge-length' ? input.guardedAuthority : undefined;
  if (turn || guardedAuthority)
    requirePair(
      isSavedFixedEndAuthorityV1(guardedAuthority, row, pieceLineKey),
      'the saved allowance edit requires a current guarded Assembly review',
    );
  const verifyCurrentRow = guardedAuthority
    ? async () => {
        await input.verifyCurrentRow?.();
        await guardedAuthority.verify(new AbortController().signal);
      }
    : input.verifyCurrentRow;
  requirePair(
    command.tool === 'edge-length' || verifyCurrentRow,
    'an authoritative saved row recheck is required for the offset',
  );
  const current = () => {
    const now = input.readCurrent();
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
          (a.blockName === pieceId || a.blockName === `${pieceId}_${sizeToken}`),
      ) ?? [];
    return (
      aliases.length > 0 &&
      new Set(aliases.map(({ blockName }) => blockName)).size === aliases.length &&
      aliases.every((a) => a.pieceLineKey === pieceLineKey) &&
      now.card.existingPieces.filter((p) => p.lineKey === pieceLineKey).length === 1
    );
  };
  requirePair(current(), 'the saved row, piece line, or Draft changed');
  const consumed = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  requirePair(
    consumed.ok && !consumed.value.reconstruction && sameSavedDraftRowV1(consumed.value.row, row),
    'the current own-format source capability is required',
  );
  const { draft, nativeSewingReplay, nativeRead, sourceFileId } = consumed.value;
  requirePair(
    nativeSewingReplay?.replayReady &&
      !nativeRead.scope &&
      session.source.phaseD.sourceFileId === sourceFileId &&
      session.source.phaseD.sourceSha256 === row.sha256,
    'the source does not carry both ordinary and native sewing authority',
  );
  const bytes = input.savedBytes.slice(0);
  requirePair(
    bytes.byteLength === row.sizeBytes && (await sha256Hex(bytes)) === row.sha256 && current(),
    'the saved bytes or current Draft changed',
  );
  const [ordinary, sewing] = await Promise.all([
    selectMatchingSavedDraftV1(draft, row.scopeKey, sizeToken, session),
    selectPatternImportDxfProductDraftPhaseDSizeV1(
      {
        ...draft,
        dxfProvenance: nativeSewingReplay.pipeline,
        dxfPhaseDReplay: nativeSewingReplay.replay,
      },
      row.scopeKey,
      sizeToken,
    ),
  ]);
  requirePair(
    ordinary &&
      sewing.ok &&
      current() &&
      ordinary.selection.phaseD.source.sourceFileId === sourceFileId &&
      sewing.selection.phaseD.source.sourceFileId === sourceFileId &&
      ordinary.selection.phaseD.sourceSha256 === row.sha256 &&
      sewing.selection.phaseD.sourceSha256 === row.sha256,
    'the cut and sewing selections do not share the current saved source',
  );
  const cut = contourPath(ordinary.selection.phaseD, pieceId, sizeToken, 'cut-boundary');
  const sewingPath = contourPath(sewing.selection.phaseD, pieceId, sizeToken, 'sewing-boundary');
  const projected = one(
    ordinary.projection.pieces.filter(
      (p) => p.pieceId === pieceId && p.pieceLineKey === pieceLineKey,
    ),
  );
  const projectedCut = one(
    projected?.contours.filter((c) => c.contourId === cut.contour.contourId) ?? [],
  );
  const [from, to] = command.payload.edge.boundaryVertexIds;
  requirePair(
    cut.contour.contourId === command.payload.edge.contourId &&
      projectedCut?.vertices.some(
        (v, i) =>
          v.vertexId === from &&
          projectedCut.vertices[(i + 1) % projectedCut.vertices.length]?.vertexId === to,
      ),
    'the selected endpoints are no longer one ordered cut edge',
  );
  const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
  const block = one(
    scope?.manifest.blocks.filter((b) => b.identity === pieceId && b.sizeToken === sizeToken) ?? [],
  );
  const piece = one(scope?.writerReplay?.job.pieces.filter((p) => p.identity === pieceId) ?? []);
  const size = one(piece?.sizes.filter((s) => s.sizeToken === sizeToken) ?? []);
  requirePair(
    block &&
      piece &&
      size?.seam &&
      piece.allowance.origin !== 'default' &&
      Number.isFinite(piece.allowance.allowanceMm) &&
      piece.allowance.allowanceMm > 0 &&
      sameDraftAllowanceRingV1(size.cut, cut.contour.pointsMm) &&
      sameDraftAllowanceRingV1(size.seam, sewingPath.contour.pointsMm),
    'the current writer size or its known allowance does not match the complete native rings',
  );
  const cutId = cut.path.pathId,
    seamId = sewingPath.path.pathId;
  const nativeBlock = one(
    nativeRead.read.meta.groups.filter(
      (g) =>
        g.kind === 'insert' &&
        g.block === block.block &&
        g.paths.includes(cutId) &&
        g.paths.includes(seamId),
    ),
  );
  const hasLayer = (id: number, layer: string) =>
    nativeRead.read.doc.pages.some((page) =>
      page.paths.some((p) => p.id === id && p.closed && page.styles[p.style]?.layer === layer),
    );
  requirePair(
    cutId !== seamId && nativeBlock && hasLayer(cutId, '1') && hasLayer(seamId, '14'),
    'the two native outlines are not distinct paths in one saved size block',
  );
  const native = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId,
    sourceSha256: row.sha256,
    sourcePathIds: [cutId, seamId].sort((a, b) => a - b),
  });
  requirePair(
    native.ok &&
      native.projection.complete &&
      matchesNativeLines(cut.path, native.projection.descriptors) &&
      matchesNativeLines(sewingPath.path, native.projection.descriptors),
    'the same native read did not verify every directed line on both outlines',
  );
  const widthMm = piece.allowance.allowanceMm;
  // Edge length reconstructs a constant inset. Offset edits use the independently drawn pair.
  if (command.tool === 'edge-length') {
    const expected = offsetContour(size.cut, -widthMm);
    requirePair(
      expected.report.ok && sameDraftAllowanceRingV1(size.seam, expected.pts, offsetGridPoint),
      'the drawn sewing outline does not match the known constant allowance',
    );
  }
  await verifyCurrentRow?.();
  requirePair(current(), 'the saved row or Draft changed during allowance review');
  const owner: SavedDraftPairedAllowanceAuthorityV1 = Object.freeze({
    kind: 'saved-draft-paired-allowance/1',
  });
  const points = (ring: readonly PtMm[]) => Object.freeze(ring.map((p) => Object.freeze({ ...p })));
  owners.set(
    owner,
    Object.freeze({
      session,
      commandId: command.commandId,
      contourId: cut.contour.contourId,
      pieceId,
      pieceLineKey,
      sizeToken,
      widthMm,
      cut: points(size.cut),
      seam: points(size.seam),
      current,
      verifyCurrentRow,
      ...(guardedAuthority && { fixedEndReplacement: guardedAuthority.replacement }),
    }),
  );
  return owner;
}

export function readSavedDraftPairedAllowanceAuthorityV1(
  owner: SavedDraftPairedAllowanceAuthorityV1,
  session: PatternImportDxfPhaseEDraftCadSessionV1,
) {
  const proof = owners.get(owner);
  return proof?.session === session && proof.current() ? proof : null;
}
