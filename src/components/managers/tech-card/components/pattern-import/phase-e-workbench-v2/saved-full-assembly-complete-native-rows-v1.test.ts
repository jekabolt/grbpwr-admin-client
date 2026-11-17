import { createHash } from 'node:crypto';
import type { GetTechCardSavedAssemblySnapshotResponse } from 'api/proto-http/admin';
import {
  computeDxfProductSavedSourceFileIdV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  readSnapshot: vi.fn(),
  canonicalRun: vi.fn(),
  foreignRun: vi.fn(),
  canonicalCancel: vi.fn(),
  foreignCancel: vi.fn(),
  canonicalDispose: vi.fn(),
  foreignDispose: vi.fn(),
  hostDispose: vi.fn(),
}));

vi.mock('api/api', () => ({
  abortableAdminService: () => ({ GetTechCardSavedAssemblySnapshot: mocked.readSnapshot }),
}));
vi.mock('lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1', async (load) => ({
  ...(await load<
    typeof import('lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1')
  >()),
  createDxfProductSavedNativeReprocessOwnerV1: () => ({
    run: mocked.canonicalRun,
    cancel: mocked.canonicalCancel,
    dispose: mocked.canonicalDispose,
  }),
  createDxfProductSavedForeignNativeReprocessOwnerV1: () => ({
    run: mocked.foreignRun,
    cancel: mocked.foreignCancel,
    dispose: mocked.foreignDispose,
  }),
}));
vi.mock('./saved-full-assembly-complete-dxf-host-v1', () => ({
  createSavedFullAssemblyCompleteDxfHostsV1: () => ({
    createCanonical: () => ({ dispose: mocked.hostDispose }),
    createForeign: () => ({ dispose: mocked.hostDispose }),
  }),
}));

import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { prepareSavedFullAssemblyCompleteNativeRowsV1 } from './saved-full-assembly-complete-native-rows-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

function savedRow(scopeKey: string): DxfProductSavedRowIdentityV1 {
  return {
    techCardId: 11,
    scopeKey,
    patternLineKey: `row-${scopeKey}`,
    revision: 3,
    cardLockVersion: 12,
    url: `https://objects.invalid/${scopeKey}.dxf`,
    sizeBytes: 20,
    sha256: (scopeKey === 'main' ? 'a' : 'b').repeat(64),
  };
}

const main = savedRow('main');
const pocket = savedRow('pocketing');
const unusedMockProjection = {} as PatternImportDxfPhaseESavedRowCardProjectionV1;

function response(): GetTechCardSavedAssemblySnapshotResponse {
  const serverAssemblyRevision = `asm:v1:${'9'.repeat(32)}:42`;
  const rows = [main, pocket].map(({ revision: savedRowRevision, ...row }) => ({
    ...row,
    patternVersion: 7,
    savedRowRevision,
  }));
  const projection = {
    serverAssemblyRevision,
    rows,
    operations: [],
    ownedSeams: [],
    aliases: [],
    garmentLabels: [],
  };
  const json = JSON.stringify(projection, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
  const sourceSha256 = createHash('sha256')
    .update('tech-card-saved-assembly-complete-source/1\0')
    .update(json)
    .digest('hex');
  const downloadable = rows.map((row) => ({
    ...row,
    downloadUrl: `/api/${row.patternLineKey}/download`,
  }));
  return {
    row: downloadable[0]!,
    serverAssemblyRevision,
    completeSourceV1: {
      rows: downloadable,
      ownedSeams: [],
      aliases: [],
      garmentLabels: [],
      sourceSha256,
      canonicalJson: Buffer.from(json).toString('base64'),
    },
    operations: [],
  } as unknown as GetTechCardSavedAssemblySnapshotResponse;
}

function result(row: DxfProductSavedRowIdentityV1, sewingReady = true) {
  return {
    ok: true,
    row,
    sourceFileId: computeDxfProductSavedSourceFileIdV1(row),
    sourceOwner: {},
    draft: {},
    nativeSewingReplay: { replayReady: sewingReady },
  };
}

const readVerified = (signal: AbortSignal) =>
  readCompleteSavedAssemblySourceV1(
    { GetTechCardSavedAssemblySnapshot: mocked.readSnapshot },
    main,
    {},
    signal,
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocked.readSnapshot.mockResolvedValue(response());
  mocked.canonicalRun.mockImplementation(async ({ row }) => result(row));
  mocked.foreignRun.mockImplementation(async ({ row }) => result(row, false));
});

describe('complete saved Assembly native row preparation', () => {
  it('prepares exact rows, falls back only for a foreign DXF and finally revalidates the full source seal', async () => {
    const signal = new AbortController().signal;
    const verified = await readVerified(signal);
    mocked.canonicalRun.mockResolvedValueOnce(result(main)).mockResolvedValueOnce({
      ok: false,
      blockers: [{ code: 'foreign-saved-dxf-detected' }],
    });
    const actual = await prepareSavedFullAssemblyCompleteNativeRowsV1(
      verified,
      unusedMockProjection,
      signal,
    );
    expect(
      actual.nativeRows.map(({ row, nativeSewingAvailable }) => [
        row.scopeKey,
        nativeSewingAvailable,
      ]),
    ).toEqual([
      ['main', true],
      ['pocketing', false],
    ]);
    expect(actual.fusingLayers).toEqual([]);
    expect(mocked.foreignRun).toHaveBeenCalledOnce();
    expect(mocked.foreignRun.mock.calls[0]?.[0].row).toEqual(pocket);
    expect(mocked.canonicalDispose).toHaveBeenCalledTimes(2);
    expect(mocked.foreignDispose).toHaveBeenCalledOnce();
    expect(mocked.hostDispose).toHaveBeenCalledTimes(3);
    expect(mocked.readSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({
      expectedCompleteSourceSha256: verified.sourceSha256,
      expectedServerAssemblyRevision: verified.serverAssemblyRevision,
    });
  });

  it('publishes nothing when the final full source differs, even if every row owner succeeded', async () => {
    const signal = new AbortController().signal;
    const verified = await readVerified(signal);
    const drifted = { ...response(), serverAssemblyRevision: `asm:v1:${'9'.repeat(32)}:43` };
    mocked.readSnapshot.mockResolvedValueOnce(drifted);
    await expect(
      prepareSavedFullAssemblyCompleteNativeRowsV1(verified, unusedMockProjection, signal),
    ).rejects.toThrow('complete saved Assembly source is unavailable');
    expect(mocked.canonicalDispose).toHaveBeenCalledTimes(2);
  });

  it('cancels and disposes a pending row without starting the next worker after abort', async () => {
    const controller = new AbortController();
    const verified = await readVerified(controller.signal);
    let release!: () => void;
    mocked.canonicalRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(result(main));
        }),
    );
    const prepare = prepareSavedFullAssemblyCompleteNativeRowsV1(
      verified,
      unusedMockProjection,
      controller.signal,
    );
    controller.abort();
    release();
    await expect(prepare).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocked.canonicalRun).toHaveBeenCalledOnce();
    expect(mocked.canonicalCancel).toHaveBeenCalledOnce();
    expect(mocked.canonicalDispose).toHaveBeenCalledOnce();
    expect(mocked.foreignRun).not.toHaveBeenCalled();
    expect(mocked.readSnapshot).toHaveBeenCalledOnce();
  });
});
