import { describe, expect, it, vi } from 'vitest';

import { DxfProductSavedForeignDxfDetectedErrorV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';

const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 13,
  url: 'https://objects.example/pattern-main.dxf',
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
});

function input(bytes: Uint8Array) {
  return {
    row,
    sourceFileId: `saved-dxf:${row.sha256}`,
    syntheticFilename: 'authoritative-saved-pattern.dxf' as const,
    bytes,
  };
}

function host() {
  return createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: vi.fn(async () => {
      throw new Error('Card resolution must not run during manifest classification.');
    }),
    readAuthoritativeRow: vi.fn(async () => {
      throw new Error('Transport must not run during direct reprocess classification.');
    }),
  });
}

describe('saved DXF host manifest classification', () => {
  it('signals a foreign saved DXF when the leading DXF carries no GRBPWR manifest', async () => {
    const runtime = host();
    const bytes = new TextEncoder().encode('0\nSECTION\n2\nENTITIES\n0\nEOF\n');

    await expect(
      runtime.reprocess(input(bytes), new AbortController().signal, vi.fn()),
    ).rejects.toBeInstanceOf(DxfProductSavedForeignDxfDetectedErrorV1);
    runtime.dispose();
  });

  it('does not classify a tagged but corrupt GRBPWR manifest as a foreign file', async () => {
    const runtime = host();
    const bytes = new TextEncoder().encode(
      '999\nGRBPWR-MANIFEST v1z broken\n0\nSECTION\n2\nENTITIES\n0\nEOF\n',
    );

    await expect(
      runtime.reprocess(input(bytes), new AbortController().signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'ManifestError', code: 'corrupt' });
    runtime.dispose();
  });
});
