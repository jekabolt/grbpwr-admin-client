import { describe, expect, it } from 'vitest';

import type { PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { routePatternImportDxfPhaseECadTableZeroOperationSourceV1 } from './cad-table-zero-operation-source-routing-v1';

const fresh = {
  ok: true,
  techCardId: 156,
  importGeneration: 7,
  choices: [],
  blocker: null,
  claims: {},
} as unknown as Extract<
  PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  { ok: true }
>;

const saved = {
  ok: true,
  techCardId: 156,
  choices: [],
  blocker: null,
} as const satisfies Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
  { ok: true }
>;

describe('zero-operation source routing', () => {
  it('keeps an existing card on its durable saved DXF even when a cached import session exists', () => {
    expect(routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, saved)).toEqual({
      mode: 'saved',
      choices: saved,
    });
  });

  it('uses a fresh import only before the card has a complete saved DXF row', () => {
    const savedUnavailable = {
      ok: false,
      techCardId: 156,
      choices: [],
      blocker: {
        code: 'saved-pattern-unavailable',
        detail: 'No complete saved DXF row exists yet.',
      },
    } as const satisfies Extract<
      PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
      { ok: false }
    >;

    expect(
      routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, savedUnavailable),
    ).toEqual({ mode: 'fresh', choices: fresh });
  });

  it('reports the saved-row blocker when neither source is usable', () => {
    const freshUnavailable = {
      ok: false,
      techCardId: 156,
      importGeneration: null,
      choices: [],
      blocker: {
        code: 'fresh-session-invalid',
        detail: 'No current import session.',
      },
      claims: {},
    } as unknown as Extract<
      PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
      { ok: false }
    >;
    const savedUnavailable = {
      ok: false,
      techCardId: 156,
      choices: [],
      blocker: {
        code: 'saved-pattern-unavailable',
        detail: 'No complete saved DXF row exists.',
      },
    } as const satisfies Extract<
      PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
      { ok: false }
    >;

    expect(
      routePatternImportDxfPhaseECadTableZeroOperationSourceV1(freshUnavailable, savedUnavailable),
    ).toEqual({ mode: 'saved', choices: savedUnavailable });
  });
});
