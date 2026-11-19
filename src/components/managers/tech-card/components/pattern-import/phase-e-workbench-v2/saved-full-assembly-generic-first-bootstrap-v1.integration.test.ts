import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1,
  clonePatternImportDxfPhaseEGoldenSavedCardV1,
} from './golden-card-6-11-saved-card-fixtures-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { resolvePatternImportDxfPhaseESavedPatternRowV1 } from './saved-pattern-row-resolver-v1';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { Session } from 'lib/pattern-import/worker/session';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import type { PatternImportOpenFile, StageName, StageIO } from 'lib/pattern-import/types';
import { createDxfProductSavedForeignNativeReprocessOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import type { ImportClient } from '../client';
import { createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1 } from './foreign-saved-dxf-reprocess-host-v1';

import {
  createSavedFullAssemblyCompileSessionV1,
  type SavedFullAssemblyCompileRequestV1,
} from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  fullAssemblyFixtureWireV1,
  savedThreePanelCompileRequestV1,
  digestFullAssemblyFixture,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import {
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
  SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
  buildSavedFullAssemblyGenericFirstCompileRequestV1,
  savedFullAssemblyFirstContourRoleV1,
  type SavedFullAssemblyGenericFirstBootstrapV1,
  type SavedFullAssemblyGenericFirstCompileChoicesV1,
} from './saved-full-assembly-generic-first-bootstrap-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));

let seed: SavedThreePanelFixtureV1;

// Replace only worker transport; all source decoding, semantic replay and private owners are real.
class DirectClient implements ImportClient {
  readonly kind = 'worker' as const;
  private next = 1;
  private sessions = new Map<number, Session>();
  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const session = new Session(sessionId, files);
    this.sessions.set(sessionId, session);
    return { sessionId, files: session.files };
  }
  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
  ): Promise<StageIO[S]['out']> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Missing in-process worker session.');
    return session.runStage(stage, input, { checkCancel() {}, progress() {} });
  }
  cancel() {}
  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }
  dispose() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

async function nativeDrawnSource() {
  const job = structuredClone(seed.job);
  for (const piece of job.pieces) {
    piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
    for (const size of piece.sizes) {
      const xs = size.cut.map(({ x }) => x),
        ys = size.cut.map(({ y }) => y);
      const left = Math.min(...xs) + 10,
        right = Math.max(...xs) - 10;
      const bottom = Math.min(...ys) + 10,
        top = Math.max(...ys) - 10;
      size.seam = [
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: left, y: top },
      ];
    }
  }
  const written = writeDxfDetailed(job, {
    now: () => new Date(seed.written.manifest.createdAt),
    embed: null,
  });
  const bytes = new TextEncoder().encode(written.dxfText);
  seed = {
    ...seed,
    bytes,
    row: { ...seed.row, sizeBytes: bytes.length, sha256: await digestFullAssemblyFixture(bytes) },
  };
  // Exercise the production enum-to-domain scope boundary before genuine native replay.
  const savedCard = clonePatternImportDxfPhaseEGoldenSavedCardV1(
    PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[0].card,
  );
  savedCard.id = seed.row.techCardId;
  savedCard.lockVersion = seed.row.cardLockVersion;
  const savedInsert = savedCard.techCard;
  if (!savedInsert || !seed.card.existingAliases)
    throw new Error('Complete saved-card fixture required');
  const bomTemplate = savedInsert.bomItems?.[0];
  const pieceTemplate = savedInsert.pieces?.[0];
  const aliasTemplate = savedInsert.pieceDxfAliases?.items?.[0];
  const patternTemplate = savedInsert.patterns?.[0];
  if (!bomTemplate || !pieceTemplate || !aliasTemplate || !patternTemplate)
    throw new Error('Complete saved-card row templates required');
  savedInsert.sizeIds = [7];
  savedInsert.bomItems = [
    {
      ...bomTemplate,
      lineKey: 'bom-main',
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    },
  ];
  savedInsert.pieces = seed.card.existingPieces.map((piece) => ({
    ...pieceTemplate,
    lineKey: piece.lineKey,
    name: piece.name,
  }));
  savedInsert.pieceDxfAliases = {
    items: seed.card.existingAliases.map((alias) => ({
      ...aliasTemplate,
      blockName: alias.blockName,
      pieceLineKey: alias.pieceLineKey,
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      bomLineKey: 'bom-main',
    })),
  };
  savedInsert.patterns = [
    {
      ...patternTemplate,
      lineKey: seed.row.patternLineKey,
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      bomLineKey: 'bom-main',
      url: seed.row.url,
      sizeBytes: seed.row.sizeBytes,
      sha256: seed.row.sha256,
      savedRowRevision: seed.row.revision,
    },
  ];
  const insert = savedCard.techCard!;
  const resolved = resolvePatternImportDxfPhaseESavedPatternRowV1({
    techCardId: savedCard.id!,
    cardLockVersion: savedCard.lockVersion!,
    scopes: rollGoodsScopes(insert.bomItems!),
    patterns: insert.patterns!,
    aliases: insert.pieceDxfAliases!.items!,
    pieceLineKeys: ['line-FRONT', 'line-BACK'],
  });
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.blockers));
  expect(resolved.row).toEqual(seed.row);
  seed = {
    ...seed,
    row: resolved.row,
    card: buildPatternImportDxfPhaseESavedCardContextV1(
      savedCard,
      (ids) => ids,
      new Map([[7, 'M']]),
    ),
  };
  const host = createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1({
    nativeSewingReplay: true,
    resolveCard: async () => ({
      card: structuredClone(seed.card),
      cardLockVersion: seed.row.cardLockVersion,
    }),
    readAuthoritativeRow: async () => ({ row: seed.row, downloadUrl: seed.row.url }),
    createClient: () => new DirectClient(),
    fetch: async () =>
      new Response(bytes.slice(), {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      }),
  });
  const owner = createDxfProductSavedForeignNativeReprocessOwnerV1(host);
  const native = await owner.run({
    schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
    row: seed.row,
  });
  if (!native.ok || !native.nativeSewingReplay?.replayReady)
    throw new Error(JSON.stringify(native.blockers));
  return { native, dispose: () => owner.dispose() };
}

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
  it.each([
    { sourceSurface: 'zero-allowance-cut', anchorOrder: 'catalog', mapping: 'equal' },
    { sourceSurface: 'native-drawn-sewing', anchorOrder: 'catalog', mapping: 'equal' },
    { sourceSurface: 'native-drawn-sewing', anchorOrder: 'traversal', mapping: 'equal' },
    { sourceSurface: 'native-drawn-sewing', anchorOrder: 'traversal', mapping: 'eased' },
    { sourceSurface: 'native-drawn-sewing', anchorOrder: 'traversal', mapping: 'gathered' },
  ] as const)(
    'validates $mapping on genuine $sourceSurface with $anchorOrder anchors',
    async ({ sourceSurface, anchorOrder, mapping }) => {
      const source =
        sourceSurface === 'native-drawn-sewing'
          ? await nativeDrawnSource()
          : await createSavedThreePanelSourceV1(seed);
      const session = createSavedFullAssemblyCompileSessionV1();
      try {
        const native = source.native.nativeSewingReplay;
        const catalogDraft =
          sourceSurface === 'native-drawn-sewing' && native?.replayReady
            ? {
                ...source.native.draft,
                dxfProvenance: native.pipeline,
                dxfPhaseDReplay: native.replay,
              }
            : source.native.draft;
        const prepared = await savedThreePanelCompileRequestV1(seed, {
          ...source,
          native: { ...source.native, draft: catalogDraft },
        });
        const base = {
          ...prepared,
          sourceRequest: { ...prepared.sourceRequest, draft: source.native.draft },
        };
        const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
          catalogDraft,
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
          const contours =
            piece?.contours.filter(
              ({ role }) => role === savedFullAssemblyFirstContourRoleV1(sourceSurface),
            ) ?? [];
          expect(contours).toHaveLength(1);
          const contour = contours[0]!;
          const anchors = [
            contour.boundaryVertices[ordinal]!.vertexId,
            contour.boundaryVertices[(ordinal + 1) % contour.boundaryVertices.length]!.vertexId,
          ] as [string, string];
          // The native replay may carry reversed anchors in traversal order. In particular this
          // fixture's B span is the closing edge, from the last catalog vertex to vertex zero.
          if (anchorOrder === 'traversal' && direction === 'reverse') anchors.reverse();
          return Object.freeze({
            pieceId,
            pieceLineKey,
            contourId: contour.contourId,
            anchors: Object.freeze(anchors),
            direction,
          });
        };
        const bootstrap: SavedFullAssemblyGenericFirstBootstrapV1 = Object.freeze({
          schemaVersion: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
          sourceSurface,
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
              pieceLineKeys: Object.freeze(['line-FRONT', 'line-BACK']) as readonly [
                string,
                string,
              ],
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
        const chosenB = choices.seamChoices[0]!.sides[1];
        const expectedNativeAnchors =
          anchorOrder === 'traversal' ? [...chosenB.anchors].reverse() : chosenB.anchors;
        expect(request.intent.seams[0]!.sides[1]).toMatchObject({
          anchors: expectedNativeAnchors,
          direction: 'reverse',
        });
        if (mapping !== 'equal') {
          const refused = await session.consume({
            ...request,
            intent: {
              ...request.intent,
              seams: [{ ...request.intent.seams[0]!, mapping, lengthRatio: 1.1 }],
            },
          } as unknown as SavedFullAssemblyCompileRequestV1);
          expect(refused, JSON.stringify(refused.blockers)).toMatchObject({
            compiled: false,
            blockers: [
              expect.objectContaining({ detail: expect.stringMatching(/equal|mapping/i) }),
            ],
          });
          return;
        }
        const result = await session.consume(request);
        expect(result.compiled, result.blockers.map(({ detail }) => detail).join('; ')).toBe(true);
        expect(result.evidence?.zeroAllowanceEquivalence).toHaveLength(
          sourceSurface === 'native-drawn-sewing' ? 0 : 2,
        );
        expect(result.graph?.source.handoffSource.exportSha256).toBe(seed.row.sha256);
        expect(request.sourceRequest.draft).toBe(source.native.draft);
        if (sourceSurface === 'native-drawn-sewing') {
          expect(result.graph?.seams[0]).toMatchObject({
            mapping: 'equal',
            lengthRatio: 1,
            sides: [
              { direction: 'forward' },
              { direction: 'reverse', anchors: expectedNativeAnchors },
            ],
          });
          expect(result.evidence?.sourceSurface).toBe('explicit-native-drawn-sewing');
          expect(result.evidence?.writerSha256).not.toBe(seed.row.sha256);
          expect(result.graph?.source.handoffSource.exporterId).toBe(
            'grbpwr.saved-native-drawn-sewing',
          );
        } else {
          expect(
            result.evidence?.zeroAllowanceEquivalence.map(({ contourId }) => contourId),
          ).toEqual(
            catalog.pieces.map(
              (piece) => piece.contours.find(({ role }) => role === 'cut-boundary')!.contourId,
            ),
          );
        }
      } finally {
        session.dispose();
        source.dispose();
      }
    },
  );
});
