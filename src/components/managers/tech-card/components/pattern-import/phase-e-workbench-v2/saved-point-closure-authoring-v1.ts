import type {
  common_TechCardSeam,
  common_TechCardSeamAnchor,
  common_TechCardSeamPointClosureIntent,
} from 'api/proto-http/admin';
import { newSeamKey } from 'lib/seams';
import type { PointClosureWrite, SeamChange, StepRef } from '../../assembly-seams/seam-change-plan';
import {
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import type {
  SavedNativePointClosureMarkRequestV1,
  SavedNativePointClosureMarkV1,
} from './saved-native-point-closure-mark-v1';

export const POINT_CLOSURE_KIND = 'TECH_CARD_SEAM_KIND_POINT_CLOSURE';
const holeRole = 'TECH_CARD_SEAM_POINT_CLOSURE_ROLE_BUTTONHOLE_MIDPOINT';
const buttonRole = 'TECH_CARD_SEAM_POINT_CLOSURE_ROLE_BUTTON_MARK_CENTER';
const openIntent = 'TECH_CARD_SEAM_POINT_CLOSURE_INTENT_OPEN';
const closedIntent = 'TECH_CARD_SEAM_POINT_CLOSURE_INTENT_CLOSED';
type Intent = 'open' | 'closed';

function savedOperation(source: CompleteSavedAssemblySourceV1, number: number, work: string) {
  const operations = source.operations.filter(({ operationNumber }) => operationNumber === number);
  if (operations.length !== 1 || operations[0].work !== work)
    throw new Error('The saved fastening operation changed.');
  return operations[0];
}

function pointRequest(
  anchor: common_TechCardSeamAnchor,
  role: SavedNativePointClosureMarkRequestV1['role'],
): SavedNativePointClosureMarkRequestV1 {
  const point = anchor.pointClosure;
  if (
    !point ||
    point.role !== (role === 'BUTTONHOLE_MIDPOINT' ? holeRole : buttonRole) ||
    !anchor.pieceLineKey ||
    !point.patternLineKey ||
    !point.dxfSha256 ||
    !point.sizeId ||
    !point.aliasBlockName ||
    !point.nativeBlockName ||
    !point.sourceInstancePath?.length ||
    point.sourceEntityOp === undefined
  )
    throw new Error('A saved fastening mark is missing its native identity.');
  return {
    pieceLineKey: anchor.pieceLineKey,
    patternLineKey: point.patternLineKey,
    dxfSha256: point.dxfSha256,
    sizeId: point.sizeId,
    aliasBlockName: point.aliasBlockName,
    nativeBlockName: point.nativeBlockName,
    sourceInstancePath: point.sourceInstancePath,
    sourceEntityOp: point.sourceEntityOp,
    role,
  };
}

export function savedPointClosures(
  source: CompleteSavedAssemblySourceV1,
  operationNumber: number,
  sizeId: number,
) {
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new Error('Read the exact saved Assembly source before resolving a fastening.');
  const operation = savedOperation(source, operationNumber, 'button_attach');
  const rows = new Map(source.ownedSeams.map((row) => [row.seamKey, row]));
  return (operation.seamKeys ?? []).flatMap((key) => {
    const row = rows.get(key);
    if (row?.kind !== POINT_CLOSURE_KIND) return [];
    const [a] = row.sideA?.parts ?? [];
    const [b] = row.sideB?.parts ?? [];
    if (!a || !b || row.sideA?.parts?.length !== 1 || row.sideB?.parts?.length !== 1)
      throw new Error('The saved fastening has no exact point pair.');
    if (a.pointClosure?.sizeId !== sizeId && b.pointClosure?.sizeId !== sizeId) return [];
    const hole = pointRequest(a, 'BUTTONHOLE_MIDPOINT');
    const button = pointRequest(b, 'BUTTON_MARK_CENTER');
    const buttonholeOperation = a.pointClosure?.buttonholeOperationNumber;
    const intent = a.pointClosure?.intent;
    if (
      hole.sizeId !== sizeId ||
      button.sizeId !== sizeId ||
      !buttonholeOperation ||
      a.pointClosure?.buttonOperationNumber !== operationNumber ||
      (intent !== openIntent && intent !== closedIntent)
    )
      throw new Error('The saved fastening no longer matches this operation and size.');
    return [
      {
        key,
        hole,
        button,
        buttonholeOperation,
        intent: intent === closedIntent ? 'closed' : 'open',
        stale: row.stale === true,
      },
    ] as const;
  });
}

function anchorForMark(
  source: CompleteSavedAssemblySourceV1,
  mark: SavedNativePointClosureMarkV1,
  role: SavedNativePointClosureMarkRequestV1['role'],
  decision?: Readonly<{
    intent: common_TechCardSeamPointClosureIntent;
    buttonholeOperationNumber: number;
    buttonOperationNumber: number;
  }>,
): common_TechCardSeamAnchor {
  const row = source.rows.find(({ patternLineKey }) => patternLineKey === mark.patternLineKey);
  if (
    !row ||
    row.sha256 !== mark.dxfSha256 ||
    mark.role !== role ||
    !source.aliases.some(
      ({ scopeKey, blockName, pieceLineKey }) =>
        scopeKey === row.scopeKey &&
        blockName === mark.aliasBlockName &&
        pieceLineKey === mark.pieceLineKey,
    )
  )
    throw new Error('The fastening mark is outside the current saved material scope.');
  return {
    pieceLineKey: mark.pieceLineKey,
    samples: undefined,
    perimShare: undefined,
    lenMm: undefined,
    notches: undefined,
    turnDeg: undefined,
    rangeFrom: undefined,
    rangeTo: undefined,
    edgeHint: undefined,
    contourSig: undefined,
    layer: undefined,
    placement: undefined,
    pointClosure: {
      patternLineKey: row.patternLineKey,
      savedRowRevision: row.revision,
      dxfSha256: row.sha256,
      sizeId: mark.sizeId,
      aliasBlockName: mark.aliasBlockName,
      nativeBlockName: mark.nativeBlockName,
      sourceInstancePath: [...mark.sourceInstancePath],
      sourceEntityOp: mark.sourceEntityOp,
      role: role === 'BUTTONHOLE_MIDPOINT' ? holeRole : buttonRole,
      intent: decision?.intent,
      buttonholeOperationNumber: decision?.buttonholeOperationNumber,
      buttonOperationNumber: decision?.buttonOperationNumber,
    },
  };
}

export function createSavedPointClosureChange(
  input: Readonly<{
    source: CompleteSavedAssemblySourceV1;
    buttonOperationNumber: number;
    buttonholeOperationNumber: number;
    step: StepRef;
    size: Readonly<{ sizeId: number; sizeToken: string }>;
    hole: SavedNativePointClosureMarkV1;
    button: SavedNativePointClosureMarkV1;
    intent: Intent;
    existing?: common_TechCardSeam;
  }>,
): SeamChange {
  const { source, buttonOperationNumber, buttonholeOperationNumber, step, size, hole, button } =
    input;
  if (!isVerifiedCompleteSavedAssemblySourceV1(source) || !source.sourceOnly || !step.historyKey)
    throw new Error('Read the exact saved Assembly operation before saving a fastening.');
  const owner = savedOperation(source, buttonOperationNumber, 'button_attach');
  const holeOwner = savedOperation(source, buttonholeOperationNumber, 'buttonhole');
  if (
    hole.sizeId !== size.sizeId ||
    button.sizeId !== size.sizeId ||
    !size.sizeToken ||
    !holeOwner.pieceLineKeys?.includes(hole.pieceLineKey)
  )
    throw new Error('Both marks must belong to the selected size and saved fastening work.');
  const existing = input.existing;
  if (
    existing &&
    (existing.kind !== POINT_CLOSURE_KIND ||
      !existing.seamKey ||
      !owner.seamKeys?.includes(existing.seamKey) ||
      !source.ownedSeams.includes(existing))
  )
    throw new Error('The original fastening binding is no longer owned by this operation.');
  const seamKey = existing?.seamKey ?? newSeamKey();
  const row: PointClosureWrite = {
    seamKey,
    status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
    kind: POINT_CLOSURE_KIND,
    direction: 'TECH_CARD_SEAM_DIRECTION_UNKNOWN',
    source: 'TECH_CARD_SEAM_SOURCE_MANUAL',
    sideA: {
      parts: [
        anchorForMark(source, hole, 'BUTTONHOLE_MIDPOINT', {
          intent: input.intent === 'closed' ? closedIntent : openIntent,
          buttonholeOperationNumber,
          buttonOperationNumber,
        }),
      ],
    },
    sideB: { parts: [anchorForMark(source, button, 'BUTTON_MARK_CENTER')] },
    anchoredSize: size.sizeToken,
    note: existing?.note,
    stale: undefined,
    createdBy: undefined,
    createdAt: undefined,
    updatedBy: undefined,
    updatedAt: undefined,
  };
  return {
    expectedServerAssemblyRevision: source.serverAssemblyRevision,
    upsertPointClosures: [row],
    ...(existing ? {} : { link: [{ step, seamKey }] }),
  };
}
