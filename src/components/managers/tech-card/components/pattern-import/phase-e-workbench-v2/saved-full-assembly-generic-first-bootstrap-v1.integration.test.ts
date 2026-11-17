import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';

import {
  createSavedFullAssemblyCompileSessionV1,
  type SavedFullAssemblyCompileRequestV1,
} from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  fullAssemblyFixtureWireV1,
  savedThreePanelCompileRequestV1,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import {
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
  buildSavedFullAssemblyGenericFirstCompileRequestV1,
  type SavedFullAssemblyGenericFirstBootstrapV1,
  type SavedFullAssemblyGenericFirstCompileChoicesV1,
} from './saved-full-assembly-generic-first-bootstrap-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));

let seed: SavedThreePanelFixtureV1;

beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1(2);
});

beforeEach(() => {
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: (request: GetTechCardSavedAssemblySnapshotRequest) =>
          fullAssemblyFixtureWireV1(seed, request.selectedOperationNumber!),
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});

describe('genuine first-authoring catalog → full assembly compiler', () => {
  it('passes exact cut-boundary IDs into the existing zero-allowance proof', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const base = await savedThreePanelCompileRequestV1(seed, source);
      const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        source.native.draft,
        seed.row.scopeKey,
        'M',
      );
      if (!catalogResult.ok) throw new Error(catalogResult.blockers[0].detail);
      const catalog = catalogResult.catalog;
      const side = (
        pieceId: string,
        pieceLineKey: string,
        ordinal: number,
        direction: 'forward' | 'reverse',
      ) => {
        const piece = catalog.pieces.find((candidate) => candidate.pieceId === pieceId);
        const contours = piece?.contours.filter(({ role }) => role === 'cut-boundary') ?? [];
        expect(contours).toHaveLength(1);
        const contour = contours[0]!;
        return Object.freeze({
          pieceId,
          pieceLineKey,
          contourId: contour.contourId,
          anchors: Object.freeze([
            contour.boundaryVertices[ordinal]!.vertexId,
            contour.boundaryVertices[(ordinal + 1) % contour.boundaryVertices.length]!.vertexId,
          ]) as readonly [string, string],
          direction,
        });
      };
      const bootstrap: SavedFullAssemblyGenericFirstBootstrapV1 = Object.freeze({
        schemaVersion: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
        row: seed.row,
        sourceOwner: base.sourceOwner,
        sourceRequest: base.sourceRequest,
        expected: base.expected,
        seedOperationNumber: base.seedOperationNumber,
        catalog,
        documentAuthority: Object.freeze({
          schemaVersion: 'pattern-import-dxf-phase-e-document-authority/1',
          evidence: Object.freeze({
            techCardId: seed.row.techCardId,
            scopeKey: seed.row.scopeKey,
            patternLineKey: seed.row.patternLineKey,
            dxfSha256: seed.row.sha256,
            patternVersion: 1,
            cardLockVersion: seed.row.cardLockVersion,
          }),
          sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
          catalogCanonicalSha256: catalog.canonicalSha256,
          documentId: base.intent.documentId,
          revision: base.intent.revision,
        }),
        pieces: Object.freeze(
          base.intent.pieces.map(({ pieceId, pieceLineKey, grainDegrees }) =>
            Object.freeze({ pieceId, pieceLineKey, grainDegrees }),
          ),
        ),
        operations: Object.freeze(
          seed.operations.map((operation) =>
            Object.freeze({
              ...operation,
              outputUnitName: '',
            }),
          ),
        ),
        seams: Object.freeze([
          Object.freeze({
            seamKey: 'seam-ab',
            sourceOperationNumber: 10,
            anchoredSize: 'M',
            direction: 'reversed' as const,
            pieceLineKeys: Object.freeze(['line-FRONT', 'line-BACK']) as readonly [string, string],
          }),
        ]),
        existingExactSeamChoices: Object.freeze([]),
        diagnosticProfiles: Object.freeze([
          Object.freeze({
            id: 'browser-medium-isotropic-diagnostic',
            revision: '1',
            label: 'Medium diagnostic preview',
            description: 'Explicit uncalibrated visual diagnostic.',
          }),
        ]),
        claims: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
      });
      const choices: SavedFullAssemblyGenericFirstCompileChoicesV1 = Object.freeze({
        seamChoices: Object.freeze([
          Object.freeze({
            sourceSeamKey: 'seam-ab',
            sides: Object.freeze([
              side('FRONT', 'line-FRONT', 1, 'forward'),
              side('BACK', 'line-BACK', 3, 'reverse'),
            ]) as SavedFullAssemblyGenericFirstCompileChoicesV1['seamChoices'][number]['sides'],
          }),
        ]),
        diagnosticProfile: Object.freeze({
          id: 'browser-medium-isotropic-diagnostic',
          revision: '1',
        }),
      });

      const request: SavedFullAssemblyCompileRequestV1 =
        buildSavedFullAssemblyGenericFirstCompileRequestV1(bootstrap, choices);
      expect(
        request.intent.seams.flatMap(({ sides }) => sides.map(({ contourId }) => contourId)),
      ).toEqual(
        choices.seamChoices.flatMap(({ sides }) => sides.map(({ contourId }) => contourId)),
      );
      const result = await session.consume(request);
      expect(result.compiled, result.blockers.map(({ detail }) => detail).join('; ')).toBe(true);
      expect(result.evidence?.zeroAllowanceEquivalence).toHaveLength(2);
      expect(result.evidence?.zeroAllowanceEquivalence.map(({ contourId }) => contourId)).toEqual(
        catalog.pieces.map(
          (piece) => piece.contours.find(({ role }) => role === 'cut-boundary')!.contourId,
        ),
      );
    } finally {
      session.dispose();
      source.dispose();
    }
  });
});
