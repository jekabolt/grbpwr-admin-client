import { describe, expect, it, vi } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
} from './cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from './draft-cad-geometry-compile-v1';
import {
  registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1,
  type PatternImportDxfPhaseEPatternsFieldCompiledReimportReviewV1,
} from './patterns-field-compiled-reimport-owner-v1';

const SECONDARY = 'TECH_CARD_BOM_PURPOSE_LINING';

function artifact(
  techCardId: number,
  scopeKey = SECONDARY,
): PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 {
  return {
    schemaVersion: 'pattern-import-dxf-phase-e-draft-cad-geometry-compile/1',
    status: 'compiled-reimport-required',
    source: {
      revision: 7,
      sourceFileId: 'saved-lining.dxf',
      sourceSha256: 'a'.repeat(64),
      selectedGeometrySha256: 'b'.repeat(64),
      catalogCanonicalSha256: 'c'.repeat(64),
      sizeSelectionCanonicalSha256: 'd'.repeat(64),
    },
    scope: { techCardId, scopeKey, sizeToken: 'M' },
    compiledJob: {} as never,
    dxfText: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',
    manifest: {} as never,
    warnings: [],
    compiledFeatures: [],
    reimport: {
      required: true,
      boundary: 'ordinary-import-semantics-phase-d-phase-e',
      applyEligible: false,
    },
    claims: {} as never,
  };
}

function request(
  compiled: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  generation = 0,
) {
  return requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
    artifact: compiled,
    confirmedImportGenerationAtCompile: generation,
    cadSessionCursorAtCompile: 1,
  });
}

describe('PatternsField compiled reimport owner', () => {
  it('opens the ordinary import review for a secondary saved scope and never applies it directly', async () => {
    const techCardId = 60_006;
    let generation = 0;
    let reviewOpen = false;
    const scopes = new Set([SECONDARY]);
    const reviews: PatternImportDxfPhaseEPatternsFieldCompiledReimportReviewV1[] = [];
    const unregister = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
      techCardId,
      readConfirmedImportGeneration: () => generation,
      scopeAvailable: (scopeKey) => scopes.has(scopeKey),
      reviewAlreadyOpen: () => reviewOpen,
      openExistingImportReview: (review) => {
        reviews.push(review);
        reviewOpen = true;
      },
    });

    try {
      expect(
        readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1(techCardId).available,
      ).toBe(true);

      expect(request(artifact(techCardId))).toMatchObject({
        ok: true,
        status: 'review-opened',
        claims: { opensReviewBeforeApply: true, performsNetworkWrite: false },
      });
      expect(reviews).toHaveLength(1);
      expect(reviews[0]?.scopeKey).toBe(SECONDARY);
      expect(reviews[0]?.files).toHaveLength(1);
      expect(reviews[0]?.files[0]).toMatchObject({
        name: 'TECH_CARD_BOM_PURPOSE_LINING-cad-compiled.dxf',
        type: 'image/vnd.dxf',
      });
      expect(await reviews[0]?.files[0].text()).toContain('ENTITIES');

      expect(request(artifact(techCardId))).toMatchObject({
        ok: false,
        blocker: { code: 'reimport-review-already-open' },
      });
      reviewOpen = false;
      generation = 1;
      expect(request(artifact(techCardId))).toMatchObject({
        ok: false,
        blocker: { code: 'reimport-generation-stale' },
      });
      generation = 0;
      scopes.clear();
      expect(request(artifact(techCardId))).toMatchObject({
        ok: false,
        blocker: { code: 'reimport-scope-unavailable' },
      });
    } finally {
      unregister();
    }

    expect(
      readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1(techCardId).available,
    ).toBe(false);
    expect(request(artifact(techCardId))).toMatchObject({
      ok: false,
      blocker: { code: 'reimport-owner-unavailable' },
    });
  });

  it('does not let a stale cleanup unregister the current Patterns owner', () => {
    const techCardId = 60_011;
    const firstReview = vi.fn();
    const secondReview = vi.fn();
    const firstCleanup = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
      techCardId,
      readConfirmedImportGeneration: () => 0,
      scopeAvailable: () => true,
      reviewAlreadyOpen: () => false,
      openExistingImportReview: firstReview,
    });
    const secondCleanup = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
      techCardId,
      readConfirmedImportGeneration: () => 0,
      scopeAvailable: () => true,
      reviewAlreadyOpen: () => false,
      openExistingImportReview: secondReview,
    });

    firstCleanup();
    expect(request(artifact(techCardId))).toMatchObject({ ok: true, status: 'review-opened' });
    expect(firstReview).not.toHaveBeenCalled();
    expect(secondReview).toHaveBeenCalledOnce();

    secondCleanup();
    expect(request(artifact(techCardId))).toMatchObject({
      ok: false,
      blocker: { code: 'reimport-owner-unavailable' },
    });
  });
});
