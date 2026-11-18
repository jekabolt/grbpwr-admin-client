import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { CadTablePieceSelectionPanel } from './cad-table-piece-selection-panel-v1';
import { createPatternImportDxfPhaseECadTableZeroCanvasSessionV1 } from './cad-table-zero-connect-canvas-v1';
import { projectCadTablePieceFeatures } from './cad-table-piece-features-v1';
import type { common_TechCard, GuardedZeroOperationPieceRename } from 'api/proto-http/admin';
import { writeGuardedSavedPieceRename } from '../../guarded-piece-rename';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';

const PIECES = [
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX',
];
const PATTERN = '01ARZ3NDEKTSV4RRFFQ69G5FAY';
const NAME = 'Передняя половинка';
const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';

async function setup() {
  const seed = await createSavedThreePanelFixtureV1();
  seed.row = { ...seed.row, patternLineKey: PATTERN };
  seed.operations = [];
  if (!seed.card.existingAliases) throw new Error('The compiler fixture has no saved aliases.');
  const existingAliases = seed.card.existingAliases.map((alias, index) => ({
    ...alias,
    pieceLineKey: PIECES[index],
  }));
  seed.card = {
    ...seed.card,
    existingPieces: seed.card.existingPieces.map((piece, index) => ({
      ...piece,
      lineKey: PIECES[index],
    })),
    existingAliases,
    existingPatterns: seed.card.existingPatterns?.map((pattern) => ({
      ...pattern,
      lineKey: PATTERN,
    })),
  };

  const persisted = {
    id: seed.row.techCardId,
    lockVersion: seed.row.cardLockVersion,
    techCard: {
      operations: [],
      bomItems: [
        {
          lineKey: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: MAIN,
        },
      ],
      patterns: [
        {
          lineKey: PATTERN,
          fabricPurpose: MAIN,
          url: seed.row.url,
          downloadUrl: seed.row.url,
          sizeBytes: seed.row.sizeBytes,
          sha256: seed.row.sha256,
          savedRowRevision: seed.row.revision,
        },
      ],
      pieces: seed.card.existingPieces.map((piece) => ({ ...piece, piecesPerGarment: 2 })),
      pieceDxfAliases: {
        items: existingAliases.map((alias) => ({ ...alias, fabricPurpose: MAIN })),
      },
    },
    seams: [],
    pieceFolds: [],
  };
  const read = vi.fn(async () => structuredClone(persisted) as unknown as common_TechCard);
  const update = vi.fn(async (command: GuardedZeroOperationPieceRename) => {
    const pattern = persisted.techCard.patterns[0];
    const [piece] = persisted.techCard.pieces;
    expect(command).toEqual({
      pieceLineKey: piece.lineKey,
      expectedName: piece.name,
      nextName: NAME,
      scopeKey: 'main',
      patternLineKey: PATTERN,
      expectedSavedRowRevision: pattern.savedRowRevision,
      expectedDxfSha256: pattern.sha256,
    });
    persisted.lockVersion++;
    piece.name = command.nextName!;
    pattern.savedRowRevision++;
    return persisted.lockVersion;
  });
  const intent = {
    row: seed.row,
    pieceLineKey: PIECES[0],
    expectedName: seed.card.existingPieces[0].name,
    nextName: ` ${NAME} `,
  };
  return { seed, persisted, intent, read, update };
}

function applyReadback(seed: SavedThreePanelFixtureV1, fresh: common_TechCard) {
  const body = fresh.techCard!;
  return {
    ...seed,
    row: {
      ...seed.row,
      cardLockVersion: fresh.lockVersion!,
      revision: body.patterns![0].savedRowRevision!,
    },
    card: {
      ...seed.card,
      existingPieces: seed.card.existingPieces.map((piece, index) => ({
        ...piece,
        name: body.pieces![index].name!,
      })),
    },
  };
}

it('verifies the sparse rename and freshly opens identical exact pattern bytes with the new label', async () => {
  const { seed, intent, read, update } = await setup();
  const before = await createSavedThreePanelSourceV1(seed);
  try {
    const confirmed = await writeGuardedSavedPieceRename(intent, { read, update });
    expect(read).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(confirmed.techCard?.pieces?.[0]).toMatchObject({
      lineKey: PIECES[0],
      name: NAME,
      piecesPerGarment: 2,
    });
    const renamed = applyReadback(seed, confirmed);
    const after = await createSavedThreePanelSourceV1(renamed);
    try {
      const request = {
        schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
        sourceFileId: after.native.sourceFileId,
        sourceSha256: after.native.row.sha256,
        techCardId: after.native.row.techCardId,
        scopeKey: after.native.row.scopeKey,
        patternLineKey: after.native.row.patternLineKey,
        cardLockVersion: after.native.row.cardLockVersion,
        draft: after.native.draft,
      };
      expect(
        consumeDxfProductSavedNativeCompilerSourceV1(before.native.sourceOwner, request),
      ).toMatchObject({
        ok: false,
        blockers: [{ code: 'binding-mismatch' }],
      });
      expect(
        consumeDxfProductSavedNativeCompilerSourceV1(after.native.sourceOwner, request).ok,
      ).toBe(true);
      expect(after.native.row).toEqual(renamed.row);
      expect(after.native.row.sha256).toBe(before.native.row.sha256);
      expect(after.native.sourceFileId).toBe(before.native.sourceFileId);
      expect(after.native.draft.aliases).toEqual(before.native.draft.aliases);
      expect(after.native.draft.pieces.map(({ existingLineKey }) => existingLineKey)).toEqual(
        before.native.draft.pieces.map(({ existingLineKey }) => existingLineKey),
      );
      expect(
        after.native.draft.pieces.find(({ existingLineKey }) => existingLineKey === PIECES[0])
          ?.name,
      ).toBe(NAME);
      const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(
        after.native.draft,
        'main',
        'M',
      );
      const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        after.native.draft,
        'main',
        'M',
      );
      if (!selection.ok || !catalog.ok)
        throw new Error('The edited DXF did not re-open in the inspector.');
      const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
        catalog.catalog,
        selection.selection,
      );
      if (!projected.ok) throw new Error(projected.blockers[0].detail);
      const projection = projected.projection;
      const session = createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection);
      const selected = session.layout.pieces.find(
        ({ identity }) => identity.pieceLineKey === PIECES[0],
      );
      if (!selected) throw new Error('The saved inspector did not find the stable piece.');
      const props = {
        owner: {
          session: {
            ...session,
            layout: { ...session.layout, selectedPieceKeys: [selected.identity.key] },
          },
          update: vi.fn(),
        },
        projection,
        savedPieces: confirmed.techCard!.pieces!,
        features: projectCadTablePieceFeatures(
          catalog.catalog,
          projection,
          after.native.draft.scopes,
        ),
      };
      const save = vi.fn();
      const zeroMarkup = renderToStaticMarkup(
        <CadTablePieceSelectionPanel {...props} renamePiece={{ row: after.native.row, save }} />,
      );
      expect(zeroMarkup).toContain(NAME);
      expect(zeroMarkup).toContain('Rename piece');
      expect(save).not.toHaveBeenCalled();
      const linkedMarkup = renderToStaticMarkup(<CadTablePieceSelectionPanel {...props} />);
      expect(linkedMarkup).toContain(NAME);
      expect(linkedMarkup).not.toContain('Rename piece');
    } finally {
      after.dispose();
    }
  } finally {
    before.dispose();
  }
});

it('never sends a rename against a stale lock, missing piece or linked operation', async () => {
  const { persisted, intent, read, update } = await setup();
  persisted.lockVersion++;
  await expect(writeGuardedSavedPieceRename(intent, { read, update })).rejects.toThrow(
    /lock moved/,
  );
  persisted.lockVersion--;
  const [piece] = persisted.techCard.pieces.splice(0, 1);
  await expect(writeGuardedSavedPieceRename(intent, { read, update })).rejects.toThrow(
    /selected piece changed/,
  );
  persisted.techCard.pieces.unshift(piece);
  const linked = async () => {
    const card = await read();
    return {
      ...card,
      techCard: { ...card.techCard!, operations: [{ operationNumber: 10 } as never] },
    };
  };
  await expect(writeGuardedSavedPieceRename(intent, { read: linked, update })).rejects.toThrow(
    /assembly work/,
  );
  expect(update).not.toHaveBeenCalled();
});

it('fails verification when a fresh readback has a rebound alias and never retries the write', async () => {
  const { persisted, intent, read, update } = await setup();
  const updateAndRebind = vi.fn(async (command: GuardedZeroOperationPieceRename) => {
    const lock = await update(command);
    persisted.techCard.pieceDxfAliases.items[1].pieceLineKey = PIECES[0];
    return lock;
  });
  await expect(
    writeGuardedSavedPieceRename(intent, { read, update: updateAndRebind }),
  ).rejects.toThrow(/pattern links changed/);
  expect(updateAndRebind).toHaveBeenCalledTimes(1);
});
