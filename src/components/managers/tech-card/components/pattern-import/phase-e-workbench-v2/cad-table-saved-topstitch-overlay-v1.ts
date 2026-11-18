import { abortableAdminService } from 'api/api';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PtMm } from 'lib/pattern-import/types';

import { patternImportDxfPhaseECadTablePieceKeyV1 } from './cad-table-piece-layout-session-v1';
import { sameCadTableSourceRingV1 } from './cad-table-saved-seam-allowances-v1';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import { prepareSavedFullAssemblyCompleteNativeRowsV1 } from './saved-full-assembly-complete-native-rows-v1';
import { projectSavedNativeTopstitchDisplayV1 } from './saved-native-topstitch-display-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

export type CadTableSavedTopstitchOverlayV1 = Readonly<{
  pieceKey: string;
  operationNumber: number;
  lineKey: string;
  widthMm: number;
  pointsMm: readonly [PtMm, PtMm];
}>;

/** Reads a saved one-sided finishing line and binds its original DXF frame to the visible cut. */
export async function prepareCadTableSavedTopstitchOverlayV1(
  input: Readonly<{
    authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
    row: DxfProductSavedRowIdentityV1;
    operationNumber: number;
    sizeId: number;
    projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
    orderSizeIds: (ids: number[]) => number[];
    sizeNameById: ReadonlyMap<number, string>;
  }>,
  signal: AbortSignal,
): Promise<CadTableSavedTopstitchOverlayV1> {
  const { authority, row, operationNumber, sizeId, projection } = input;
  const admin = abortableAdminService(signal);
  const [{ techCard }, complete] = await Promise.all([
    authority.resolveExactCurrentCard(row, signal),
    readCompleteSavedAssemblySourceV1(admin, row, {}, signal),
  ]);
  const card = buildPatternImportDxfPhaseESavedCardContextV1(
    techCard,
    input.orderSizeIds,
    input.sizeNameById,
  );
  const cardProjection = { card, cardLockVersion: row.cardLockVersion };
  const operation = complete.operations.find((item) => item.operationNumber === operationNumber);
  const line = operation?.topstitchLines?.[0];
  const pieceLineKey = line?.parts?.[0]?.pieceLineKey;
  if (
    !pieceLineKey ||
    line?.anchoredSize !== projection.sizeToken ||
    operation?.topstitchLines?.length !== 1
  )
    throw new Error('Choose the pattern set and size of the saved Topstitch line.');

  const native = await prepareSavedFullAssemblyCompleteNativeRowsV1(
    complete,
    cardProjection,
    signal,
    {
      card: techCard,
      sizeDictionary: [],
      selectedSizeId: sizeId,
      includeGeneratedCutGeometry: false,
    },
  );
  const belongsToPiece = (path: { row: DxfProductSavedRowIdentityV1; pieceLineKey: string }) =>
    path.row.patternLineKey === row.patternLineKey && path.pieceLineKey === pieceLineKey;
  const cuts = native.originalCutPaths.filter(belongsToPiece);
  const sewing = native.originalSewingPaths.filter(belongsToPiece);
  const [cut] = cuts;
  const [path] = sewing;
  if (cuts.length !== 1 || sewing.length !== 1 || projection.sourceFileId !== path.sourceFileId)
    throw new Error('The saved Topstitch is not on an exact piece in this pattern set.');

  const pieces = projection.pieces.filter(
    (piece) => piece.pieceId === cut.pieceId && piece.pieceLineKey === cut.pieceLineKey,
  );
  const visibleCut = pieces[0]?.contours.find(
    ({ contourId, role, closed }) =>
      closed && role === 'cut-boundary' && contourId === cut.contourId,
  );
  if (
    pieces.length !== 1 ||
    !visibleCut ||
    !sameCadTableSourceRingV1(
      visibleCut.vertices.map(({ pointMm }) => pointMm),
      cut.nativePointsMm,
    )
  )
    throw new Error('The displayed cut is not in the saved Topstitch source frame.');

  const host = createSavedFullAssemblyCompleteDxfHostsV1(
    complete,
    cardProjection,
  ).createCanonical();
  let bytes: Uint8Array | undefined;
  try {
    ({ bytes } = await host.readAuthoritativeRow(row, signal, () => {}));
    const display = await projectSavedNativeTopstitchDisplayV1(
      {
        source: complete,
        card: techCard,
        projection: cardProjection,
        operationNumber,
        sizeId,
        path,
        file: bytes,
      },
      signal,
    );
    await readCompleteSavedAssemblySourceV1(
      admin,
      row,
      {
        expectedServerAssemblyRevision: complete.serverAssemblyRevision,
        expectedCompleteSourceSha256: complete.sourceSha256,
      },
      signal,
    );
    const [a, b] = display.pieceLocalSegmentMm.map(({ x, y }) => ({
      x: x + display.nativeOriginMm.x,
      y: y + display.nativeOriginMm.y,
    }));
    return {
      pieceKey: patternImportDxfPhaseECadTablePieceKeyV1(path.pieceId, path.pieceLineKey),
      operationNumber,
      lineKey: display.lineKey,
      widthMm: display.widthMm,
      pointsMm: [a, b],
    };
  } finally {
    bytes?.fill(0);
    host.dispose();
  }
}
