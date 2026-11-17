import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import type { PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 } from './cad-mannequin-saved-all-scope-staging-v1';

type PendingMount = Readonly<{
  key: string;
  controller: AbortController;
}>;

function source(scopeKey: string): PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 {
  return Object.freeze({
    scopeKey,
    label: scopeKey,
    projection: Object.freeze({ pieces: Object.freeze([]) }) as never,
  });
}

function ready(
  ...scopeKeys: readonly string[]
): PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 {
  return Object.freeze({
    ok: true as const,
    sources: Object.freeze(scopeKeys.map(source)),
    blocker: null,
  });
}

function blocked(
  activeScopeKey: string,
): PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 {
  return Object.freeze({
    ok: false as const,
    sources: Object.freeze([source(activeScopeKey)]),
    blocker: Object.freeze({
      code: 'saved-material-scope-preparation-blocked' as const,
      detail: 'The secondary saved row moved.',
    }),
  });
}

/** Test-only model of the exact keyed React effect boundary used by AssemblyOrderEntry V2. */
function createMountLifecycle() {
  let current: PendingMount | null = null;
  let published: Readonly<{
    key: string;
    result: PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1;
  }> | null = null;
  return Object.freeze({
    begin(
      key: string,
      prepare: (
        signal: AbortSignal,
      ) => Promise<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1>,
    ) {
      current?.controller.abort();
      const controller = new AbortController();
      const mount = Object.freeze({ key, controller });
      current = mount;
      published = null;
      void prepare(controller.signal).then((result) => {
        if (controller.signal.aborted || current !== mount) return;
        published = Object.freeze({ key, result });
      });
      return () => {
        if (current === mount) current = null;
        controller.abort();
      };
    },
    read: () => published,
    activeSignal: () => current?.controller.signal ?? null,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('saved all-scope Assembly Order mount lifecycle', () => {
  it('publishes MAIN + POCKETING or MAIN + LINING with the active source first', async () => {
    for (const secondary of ['TECH_CARD_BOM_PURPOSE_POCKETING', 'TECH_CARD_BOM_PURPOSE_LINING']) {
      const lifecycle = createMountLifecycle();
      lifecycle.begin('card:6:lock:12:operation:10', async () =>
        ready('TECH_CARD_BOM_PURPOSE_MAIN', secondary),
      );
      await Promise.resolve();

      expect(lifecycle.read()).toMatchObject({
        result: { ok: true },
      });
      expect(lifecycle.read()?.result.sources.map(({ scopeKey }) => scopeKey)).toEqual([
        'TECH_CARD_BOM_PURPOSE_MAIN',
        secondary,
      ]);
    }
  });

  it('aborts an old operation/row/lock mount and never publishes its late result', async () => {
    const lifecycle = createMountLifecycle();
    const old = deferred<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1>();
    const next = deferred<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1>();
    const oldPrepare = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return old.promise;
    });
    lifecycle.begin('card:6:lock:12:operation:10:row:main-r1', oldPrepare);
    const oldSignal = lifecycle.activeSignal();
    lifecycle.begin('card:6:lock:13:operation:20:row:main-r1', () => next.promise);

    expect(oldSignal?.aborted).toBe(true);
    old.resolve(ready('TECH_CARD_BOM_PURPOSE_MAIN', 'TECH_CARD_BOM_PURPOSE_POCKETING'));
    await Promise.resolve();
    expect(lifecycle.read()).toBeNull();

    next.resolve(ready('TECH_CARD_BOM_PURPOSE_MAIN', 'TECH_CARD_BOM_PURPOSE_LINING'));
    await Promise.resolve();
    expect(lifecycle.read()).toMatchObject({
      key: 'card:6:lock:13:operation:20:row:main-r1',
      result: { ok: true },
    });
  });

  it('keeps only the active source and a visible blocked state on partial failure', async () => {
    const lifecycle = createMountLifecycle();
    lifecycle.begin('card:11:lock:31:operation:40', async () =>
      blocked('TECH_CARD_BOM_PURPOSE_MAIN'),
    );
    await Promise.resolve();

    expect(lifecycle.read()).toMatchObject({
      result: {
        ok: false,
        sources: [{ scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN' }],
        blocker: { code: 'saved-material-scope-preparation-blocked' },
      },
    });
  });

  it('pins the production V2 effect, keyed publication and compact alert contract', () => {
    const sourceText = readFileSync(new URL('./assembly-order-entry.tsx', import.meta.url), 'utf8');
    const outerText = readFileSync(
      new URL('../phase-e-workbench/assembly-order-entry.tsx', import.meta.url),
      'utf8',
    );

    expect(sourceText).toContain('const savedAllScopeMannequinStagingKey =');
    for (const identityField of ['row:', 'operationNumber:', 'scopeKey:', 'sizeToken:'])
      expect(sourceText).toContain(identityField);
    expect(sourceText).toContain('const controller = new AbortController();');
    expect(sourceText).toContain('if (!live || controller.signal.aborted) return;');
    expect(sourceText).toContain('controller.abort();');
    expect(sourceText).toContain('return savedAllScopeMannequinStaging.result.sources;');
    expect(sourceText).toContain(
      'Some saved pattern sets could not be opened. Only the active set is shown.',
    );
    expect(outerText).toContain(
      'prepareAllMaterialScopeStaging: prepareSavedAllMaterialScopeStaging',
    );
    expect(outerText).toContain('savedProjection.row.cardLockVersion');
    expect(outerText).toContain('savedProjection.selectedOperationNumber');
  });
});
