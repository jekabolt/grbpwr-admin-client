import { createHash, webcrypto } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createDxfProductSavedForeignReprocessOwnerV1,
  DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
  type DxfProductSavedForeignReprocessHostV1,
} from './dxf-product-saved-foreign-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from './dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
  type DraftScopeTarget,
  type WriteJob,
} from './types';
import { writeDxfDetailed } from './write';

const CREATED_AT = '2026-11-16T00:00:00.000Z';
const FOREIGN_BYTES = new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nEOF\n');
const FOREIGN_SHA = createHash('sha256').update(FOREIGN_BYTES).digest('hex');
const TARGET: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: 'bom:main',
  label: 'MAIN',
  isInterlining: false,
  sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
};

function row(patch: Partial<DxfProductSavedRowIdentityV1> = {}): DxfProductSavedRowIdentityV1 {
  return {
    techCardId: 156,
    scopeKey: TARGET.scopeKey,
    patternLineKey: 'pattern:main',
    revision: 1,
    cardLockVersion: 3,
    url: 'https://objects.example/card-156-main.dxf',
    sizeBytes: FOREIGN_BYTES.byteLength,
    sha256: FOREIGN_SHA,
    ...patch,
  };
}

function jobFor(identity: DxfProductSavedRowIdentityV1): WriteJob {
  return {
    techCardId: identity.techCardId,
    scope: { ...TARGET, scopeKey: identity.scopeKey },
    pieces: [],
    sizes: [],
    source: {
      files: [
        {
          name: 'authoritative-saved-pattern.dxf',
          sha256: identity.sha256,
          bytes: identity.sizeBytes,
          kind: 'dxf',
          pages: 1,
        },
      ],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'dxf-block',
      variant: null,
    },
    generator: 'foreign-saved-owner-test',
    dialect: 'r12',
  };
}

function draftFor(
  identity: DxfProductSavedRowIdentityV1,
  sourceFileId: string,
  jobPatch: Partial<WriteJob> = {},
): CardDraft {
  const job = { ...jobFor(identity), ...jobPatch };
  const written = writeDxfDetailed(job, { now: () => new Date(CREATED_AT) });
  return {
    techCardId: identity.techCardId,
    scopes: [
      {
        target: job.scope,
        filename: 'canonical.dxf',
        name: 'MAIN',
        dxfText: written.dxfText,
        manifest: written.manifest,
        identities: [],
        writerReplay: {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
          createdAt: CREATED_AT,
          job,
        },
      },
    ],
    pieces: [],
    aliases: [],
    pieceUpdates: [],
    downloads: [{ filename: 'must-not-escape.dxf', dxfText: 'RAW' }],
    dxfProvenance: {
      pipelineIntegrated: true,
      contentBinding: { sourceFileId, sourceSha256: identity.sha256 },
    } as never,
    dxfPhaseDReplay: {
      replayReady: true,
      carrier: { sourceFileId, sourceSha256: identity.sha256 },
    } as never,
  };
}

function host(
  identity: DxfProductSavedRowIdentityV1,
  patch: Partial<DxfProductSavedForeignReprocessHostV1> = {},
): DxfProductSavedForeignReprocessHostV1 {
  return {
    crypto: webcrypto as unknown as Pick<Crypto, 'subtle'>,
    readAuthoritativeRow: vi.fn(async () => ({ row: identity, bytes: FOREIGN_BYTES.slice() })),
    reprocess: vi.fn(async ({ sourceFileId }) => ({
      row: identity,
      draft: draftFor(identity, sourceFileId),
    })),
    readCurrentRowIdentity: vi.fn(async () => identity),
    ...patch,
  };
}

describe('foreign saved DXF reprocess owner', () => {
  it('keeps the verified foreign source binding and returns a redacted canonical draft', async () => {
    const identity = row();
    const runtime = host(identity);
    const owner = createDxfProductSavedForeignReprocessOwnerV1(runtime);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
      row: identity,
    });

    if (!result.ok) throw new Error(`${result.blockers[0].code}: ${result.blockers[0].detail}`);
    expect(result.ok).toBe(true);
    expect(result.canonicalWriterSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.draft.downloads).toEqual([]);
    expect(result.draft.scopes[0].dxfText).toBe('');
    expect(result.draft.scopes[0].manifest.source.files).toEqual([
      expect.objectContaining({ sha256: identity.sha256, bytes: identity.sizeBytes, kind: 'dxf' }),
    ]);
    expect(runtime.readCurrentRowIdentity).toHaveBeenCalledOnce();
    owner.dispose();
  });

  it('fails closed when the canonical writer provenance is not the verified source row', async () => {
    const identity = row();
    const runtime = host(identity, {
      reprocess: vi.fn(async ({ sourceFileId }) => ({
        row: identity,
        draft: draftFor(identity, sourceFileId, {
          source: {
            ...jobFor(identity).source,
            files: [{ ...jobFor(identity).source.files[0], sha256: 'f'.repeat(64) }],
          },
        }),
      })),
    });
    const owner = createDxfProductSavedForeignReprocessOwnerV1(runtime);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
      row: identity,
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: 'foreign-writer-source-mismatch' }],
    });
    expect(runtime.readCurrentRowIdentity).not.toHaveBeenCalled();
    owner.dispose();
  });

  it('rejects a row that changes after reconstruction', async () => {
    const identity = row();
    const runtime = host(identity, {
      readCurrentRowIdentity: vi.fn(async () => row({ revision: identity.revision + 1 })),
    });
    const owner = createDxfProductSavedForeignReprocessOwnerV1(runtime);

    const result = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
      row: identity,
    });

    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'saved-row-became-stale' }] });
    owner.dispose();
  });
});
