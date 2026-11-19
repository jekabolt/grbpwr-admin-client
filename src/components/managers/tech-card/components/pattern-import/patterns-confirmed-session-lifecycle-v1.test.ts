import type {
  common_TechCard,
  common_TechCardBomPurpose,
  common_TechCardPiece,
} from 'api/proto-http/admin';
import type { CardDraft } from 'lib/pattern-import/types';
import { describe, expect, it, vi } from 'vitest';
import {
  reconstructConfirmedSavedPatternV1,
  type ConfirmedPatternApplyV1,
} from './confirmed-saved-pattern-reconstruction-v1';
import { buildCardContext } from './entry';
import { createPatternsConfirmedSessionLifecycleV1 } from './patterns-confirmed-session-lifecycle-v1';
import { readPatternImportDxfPhaseECardSessionV1 } from './phase-e-workbench-card-session-v1';

const sha = 'a'.repeat(64);
const apply: ConfirmedPatternApplyV1 = {
  ok: true,
  uploaded: [
    { scopeKey: 'main', url: 'saved.dxf', filename: 'main.dxf', sha256: sha, sizeBytes: 10 },
  ],
  commitReceipt: {
    schemaVersion: 'pattern-import-apply-commit-receipt/1',
    techCardId: 156,
    previousLockVersion: 3,
    scopes: [
      {
        scopeKey: 'main',
        patternLineKey: 'pattern-main',
        patternUrl: 'saved.dxf',
        patternSizeId: 1,
        pieceLineKeys: ['front', 'back'],
        aliases: [
          { scopeKey: 'main', blockName: 'FRONT', pieceLineKey: 'front' },
          { scopeKey: 'main', blockName: 'BACK', pieceLineKey: 'back' },
        ],
      },
    ],
  },
};
function piece(lineKey: string): common_TechCardPiece {
  return {
    lineKey,
    name: lineKey,
    piecesPerGarment: 1,
    mirrored: undefined,
    grainline: undefined,
    fused: undefined,
    note: undefined,
    materials: undefined,
    detached: undefined,
    fusingWidthMm: undefined,
    fusingEdges: undefined,
    fusingZone: undefined,
    fusingInsetMm: undefined,
    fusingBase: undefined,
  };
}
const card = {
  createdAt: undefined,
  updatedAt: undefined,
  createdBy: undefined,
  updatedBy: undefined,
  roleAssignments: undefined,
  revisions: undefined,
  resolvedMoodboardMedia: undefined,
  resolvedTechnicalMedia: undefined,
  colorways: undefined,
  compositionEntries: undefined,
  fit: undefined,
  composition: undefined,
  careInstructions: undefined,
  ageGroup: undefined,
  careEntries: undefined,
  sectionDigests: undefined,
  modelWearsHeightCm: undefined,
  modelWearsSizeId: undefined,
  topCategoryId: undefined,
  subCategoryId: undefined,
  typeId: undefined,
  outputVariants: undefined,
  markers: undefined,
  pieceAreaScopes: undefined,
  resolvedOperationMedia: undefined,
  resolvedLabelMedia: undefined,
  guided: undefined,
  seams: undefined,
  removedPatternHistory: undefined,
  pieceFolds: undefined,
  cutStrips: undefined,
  cutStripNorms: undefined,
  releaseSizeChart: undefined,
  id: 156,
  lockVersion: 4,
  techCard: {
    styleNumber: undefined,
    styleNumberSource: undefined,
    name: undefined,
    brand: undefined,
    collection: undefined,
    categoryId: undefined,
    targetGender: undefined,
    stage: undefined,
    status: undefined,
    approvalState: undefined,
    releasedAt: undefined,
    measurementUnit: undefined,
    baseModelId: undefined,
    baseSampleSizeId: undefined,
    notes: undefined,
    sizeIds: undefined,
    moodboardMedia: undefined,
    technicalMedia: undefined,
    callouts: undefined,
    bomItems: [
      {
        name: undefined,
        supplier: undefined,
        supplierRef: undefined,
        color: undefined,
        composition: undefined,
        spec: undefined,
        unit: undefined,
        unitPrice: undefined,
        currency: undefined,
        comment: undefined,
        fabricWidth: undefined,
        fabricWeightGsm: undefined,
        wastagePercent: undefined,
        materialId: undefined,
        id: undefined,
        priceSource: undefined,
        priceSnapshotAt: undefined,
        effectiveFabricWidthCm: undefined,
        selvedgeCm: undefined,
        unitCode: undefined,
        wastageAppliedAt: undefined,
        cuttingCoefficient: undefined,
        qtyPerGarment: undefined,
        spareQty: undefined,
        pantone: undefined,
        estUsage: undefined,
        consumptionPerUnit: undefined,
        threadPerMm: undefined,
        lineKey: 'fabric-main',
        purpose: 'TECH_CARD_BOM_PURPOSE_MAIN' as common_TechCardBomPurpose,
        section: 'TECH_CARD_BOM_SECTION_FABRIC' as const,
      },
    ],
    construction: undefined,
    operations: undefined,
    labels: undefined,
    packaging: undefined,
    costing: undefined,
    approvedAt: undefined,
    concept: undefined,
    issues: undefined,
    sizeQuantities: undefined,
    signoffs: undefined,
    details: undefined,
    pieces: [piece('front'), piece('back')],
    purpose: undefined,
    outputMaterialId: undefined,
    skuSeason: undefined,
    auxSubtype: undefined,
    auxMadeBy: undefined,
    targetDropDate: undefined,
    pieceDxfAliases: {
      items: [
        {
          bomLineKey: 'fabric-main',
          fabricPurpose: undefined,
          blockName: 'Front',
          pieceLineKey: 'front',
        },
        {
          bomLineKey: 'fabric-main',
          fabricPurpose: undefined,
          blockName: 'Back',
          pieceLineKey: 'back',
        },
        {
          bomLineKey: 'fabric-main',
          fabricPurpose: undefined,
          blockName: 'Old Front',
          pieceLineKey: 'front',
        },
      ],
    },
    requiredSeamAllowanceMm: undefined,
    machineFieldsAware: undefined,
    assemblyAware: undefined,
    assemblyCleared: undefined,
    mediaAware: undefined,
    mediaCleared: undefined,
    operationKindsAware: undefined,
    operationWorkAware: undefined,
    bomQtyAware: undefined,
    careLabel: undefined,
    garmentLabels: undefined,
    packagingItems: undefined,
    labelsAware: undefined,
    operationDraftAware: undefined,
    operationReviewAware: undefined,
    operationBlockMembershipAware: undefined,
    operationSeamsAware: undefined,
    operationSeamKindAware: undefined,
    operationFoldsAware: undefined,
    operationLayerOrderAware: undefined,
    operationSeamToleranceAware: undefined,
    packagingPicksAware: undefined,
    cutStrips: undefined,
    cutStripsAware: undefined,
    topstitchLinesAware: undefined,
    patterns: [
      {
        sizeId: 1,
        filename: undefined,
        sizeBytes: 10,
        version: 7,
        uploadedAt: undefined,
        viewUrl: undefined,
        downloadUrl: 'https://patterns.invalid/saved.dxf',
        history: undefined,
        lineKey: 'pattern-main',
        bomLineKey: 'fabric-main',
        url: 'saved.dxf',
        sha256: sha,
        savedRowRevision: 2,
      },
    ],
  },
} satisfies common_TechCard;
const draft: CardDraft = {
  techCardId: 156,
  scopes: [],
  pieces: [],
  aliases: [],
  pieceUpdates: [],
  downloads: [],
};

function service() {
  return {
    GetTechCard: vi.fn(async () => ({
      techCard: structuredClone(card),
      patternViewerToken: '',
    })),
    GetTechCardPatternSemanticSidecar: vi.fn(async () => ({ semanticSidecar: undefined })),
    PutTechCardPatternSemanticSidecar: vi.fn(async () => ({ semanticSidecar: undefined })),
  };
}

function lifecycle(
  api: ReturnType<typeof service>,
  reconstruct?: typeof reconstructConfirmedSavedPatternV1,
) {
  return createPatternsConfirmedSessionLifecycleV1(
    {
      techCardId: 156,
      service: api,
      readCard: async () => (await api.GetTechCard()).techCard,
      buildCardContext: () =>
        buildCardContext({
          techCardId: 156,
          orderedSizeIds: [],
          sizeName: String,
          rawSizeName: () => undefined,
          scopes: [],
          pieces: [],
          styleLabel: '',
        }),
    },
    reconstruct,
  );
}

const loaded = {
  draft,
  patternVersion: 7,
  row: {
    techCardId: 156,
    cardLockVersion: 4,
    scopeKey: 'main',
    patternLineKey: 'pattern-main',
    revision: 2,
    url: 'saved.dxf',
    sha256: sha,
    sizeBytes: 10,
  },
};

describe('confirmed pattern import session lifecycle', () => {
  it('revalidates the exact reconstructed row at a newer AO lock', async () => {
    const api = service();
    const owner = lifecycle(api, async () => loaded);
    try {
      await owner.afterConfirmedSave(draft, apply);
      const session = readPatternImportDxfPhaseECardSessionV1(156);
      expect(session?.confirmedApply.commitReceipt).toEqual(apply.commitReceipt);
      expect(session?.draft).not.toBe(draft);
      expect(api.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();

      const changed = structuredClone(card);
      changed.lockVersion = 5;
      api.GetTechCard.mockResolvedValue({ techCard: changed, patternViewerToken: '' });
      expect(await session!.loadDocumentEvidence('main')).toMatchObject({
        ok: true,
        evidence: { patternVersion: 7, cardLockVersion: 5, dxfSha256: sha },
      });

      changed.techCard.patterns[0].savedRowRevision++;
      expect(await session!.loadDocumentEvidence('main')).toMatchObject({
        ok: false,
        blocker: { detail: 'The saved pattern changed after this session was reconstructed.' },
      });
    } finally {
      owner.dispose();
    }
    expect(readPatternImportDxfPhaseECardSessionV1(156)).toBeNull();
  });

  it.each(['lock', 'sha', 'duplicate', 'revision', 'card', 'scope', 'length', 'size'] as const)(
    'refuses changed %s before loading bytes',
    async (change) => {
      const api = service();
      const changed = structuredClone(card);
      const pattern = changed.techCard.patterns[0];
      if (change === 'lock') changed.lockVersion = 3;
      if (change === 'sha') pattern.sha256 = 'b'.repeat(64);
      if (change === 'duplicate') changed.techCard.patterns.push({ ...pattern });
      if (change === 'revision') pattern.savedRowRevision = 0;
      if (change === 'card') changed.id = 157;
      if (change === 'scope') pattern.bomLineKey = 'unknown-material';
      if (change === 'length') pattern.sizeBytes++;
      if (change === 'size') pattern.sizeId++;
      api.GetTechCard.mockResolvedValue({ techCard: changed, patternViewerToken: '' });
      const owner = lifecycle(api);
      try {
        await expect(owner.afterConfirmedSave(draft, apply)).rejects.toThrow('current saved DXF');
        expect(api.GetTechCard).toHaveBeenCalledTimes(1);
        expect(readPatternImportDxfPhaseECardSessionV1(156)).toBeNull();
        expect(api.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
      } finally {
        owner.dispose();
      }
    },
  );

  it.each([
    'rebound alias',
    'moved alias',
    'missing alias',
    'duplicate alias',
    'conflicting alias',
    'missing piece',
    'duplicate piece',
  ] as const)('refuses a %s with unchanged DXF bytes at an advanced card lock', async (change) => {
    const api = service();
    const changed = structuredClone(card);
    changed.lockVersion++;
    const { items } = changed.techCard.pieceDxfAliases;
    if (change === 'rebound alias') items[0].pieceLineKey = 'back';
    if (change === 'moved alias') {
      changed.techCard.bomItems.push({
        ...changed.techCard.bomItems[0],
        lineKey: 'fabric-contrast',
        purpose: 'TECH_CARD_BOM_PURPOSE_CONTRAST',
      });
      items[0].bomLineKey = 'fabric-contrast';
    }
    if (change === 'missing alias') items.shift();
    if (change === 'duplicate alias') items.push({ ...items[0], blockName: '  FRONT ' });
    if (change === 'conflicting alias') items.push({ ...items[0], pieceLineKey: 'back' });
    if (change === 'missing piece') changed.techCard.pieces.shift();
    if (change === 'duplicate piece') changed.techCard.pieces.push(piece('front'));

    const owner = lifecycle(api, async () => loaded);
    try {
      await owner.afterConfirmedSave(draft, apply);
      const session = readPatternImportDxfPhaseECardSessionV1(156);
      api.GetTechCard.mockResolvedValue({ techCard: changed, patternViewerToken: '' });
      expect(await session!.loadDocumentEvidence('main')).toMatchObject({
        ok: false,
        blocker: {
          detail: 'The saved DXF piece and block bindings no longer match the confirmed import.',
        },
      });
    } finally {
      owner.dispose();
    }

    const reconstructing = lifecycle(api);
    try {
      await expect(reconstructing.afterConfirmedSave(draft, apply)).rejects.toThrow(
        'The saved DXF piece and block bindings no longer match the confirmed import.',
      );
      expect(api.GetTechCard).toHaveBeenCalledTimes(2);
      expect(readPatternImportDxfPhaseECardSessionV1(156)).toBeNull();
      expect(api.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    } finally {
      reconstructing.dispose();
    }
  });

  it('keeps the receipt detached while a newer import cancels the pending reconstruction', async () => {
    const api = service();
    let resolve!: (value: typeof loaded) => void;
    let olderSignal!: AbortSignal;
    const reconstruct = vi.fn<typeof reconstructConfirmedSavedPatternV1>();
    reconstruct.mockImplementationOnce(({ signal }) => {
      olderSignal = signal;
      return new Promise((done) => {
        resolve = done;
      });
    });
    reconstruct.mockResolvedValueOnce(loaded);

    const owner = lifecycle(api, reconstruct);
    try {
      const mutable = structuredClone(apply);
      const older = owner.afterConfirmedSave(draft, mutable);
      mutable.commitReceipt.scopes[0].patternUrl = 'other.dxf';
      expect(reconstruct.mock.calls[0][0].apply.commitReceipt).toEqual(apply.commitReceipt);
      await owner.afterConfirmedSave(draft, apply);
      expect(olderSignal.aborted).toBe(true);

      const session = readPatternImportDxfPhaseECardSessionV1(156);
      expect(session?.confirmedApply.commitReceipt).toEqual(apply.commitReceipt);
      resolve(loaded);
      await older;
      expect(readPatternImportDxfPhaseECardSessionV1(156)).toBe(session);
    } finally {
      owner.dispose();
    }
  });

  it('cancels a pending read on disposal without publishing', async () => {
    const api = service();
    let resolve!: (value: { techCard: typeof card; patternViewerToken: string }) => void;
    api.GetTechCard.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const owner = lifecycle(api);
    const pending = owner.afterConfirmedSave(draft, apply);
    owner.dispose();
    resolve({ techCard: card, patternViewerToken: '' });
    await pending;
    expect(readPatternImportDxfPhaseECardSessionV1(156)).toBeNull();
  });

  it('refuses an already aborted reconstruction before reading the card', async () => {
    const readCard = vi.fn();
    await expect(
      reconstructConfirmedSavedPatternV1({
        apply,
        scopeKey: 'main',
        readCard,
        buildCardContext: () => {
          throw new Error('unexpected projection');
        },
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(readCard).not.toHaveBeenCalled();
  });
});
