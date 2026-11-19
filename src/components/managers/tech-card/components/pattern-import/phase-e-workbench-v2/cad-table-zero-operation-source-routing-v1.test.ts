import { describe, expect, it } from 'vitest';

import type { PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import {
  hasMatchingFreshPatternChoiceV1,
  routePatternImportDxfPhaseECadTableZeroOperationSourceV1,
} from './cad-table-zero-operation-source-routing-v1';

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
  it('keeps all saved scopes in the picker when a fresh session exists', () => {
    expect(routePatternImportDxfPhaseECadTableZeroOperationSourceV1(fresh, saved)).toEqual({
      mode: 'saved',
      choices: saved,
    });
  });

  it('populates the picker from fresh when the card has no complete DXF row', () => {
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

  it('admits preparation only for one matching current card, scope, token and size ID', () => {
    const size = { sizeToken: 'M', sizeId: 7, label: 'M', rank: 0 };
    const scope = {
      scopeKey: 'main',
      label: 'Main',
      fabricPurpose: 'main',
      bomLineKey: 'fabric',
      isInterlining: false,
      sizes: [size],
    };
    const session = { ...fresh, choices: [scope] };
    const current = { ...saved, choices: [scope, { ...scope, scopeKey: 'lining' }] };
    const matches = hasMatchingFreshPatternChoiceV1;
    expect(matches(session, current, 156, 'main', 'M')).toBe(true);
    expect(matches(session, current, 156, 'main', 'M', 'explicit-native-drawn-sewing')).toBe(false);
    expect(matches(session, current, 157, 'main', 'M')).toBe(false);
    expect(matches(session, current, 156, 'lining', 'M')).toBe(false);
    expect(matches(session, current, 156, 'main', 'S')).toBe(false);
    const wrongSize = { ...scope, sizes: [{ ...size, sizeId: 9 }] };
    for (const choices of [[scope, scope], [{ ...scope, sizes: [size, size] }], [wrongSize]]) {
      expect(matches({ ...session, choices }, current, 156, 'main', 'M')).toBe(false);
      expect(matches(session, { ...current, choices }, 156, 'main', 'M')).toBe(false);
    }
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
