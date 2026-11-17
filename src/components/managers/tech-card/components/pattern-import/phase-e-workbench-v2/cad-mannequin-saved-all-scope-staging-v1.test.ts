import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import { preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1 } from './cad-mannequin-saved-all-scope-staging-v1';

const SHA = 'a'.repeat(64);
const SIZE_NAMES = new Map([[7, 'M']]);
const ORDER_SIZES = (ids: number[]) => ids;

function pattern(scopeKey: string, suffix = '') {
  return {
    lineKey: `pattern-${scopeKey}${suffix}`,
    fabricPurpose: scopeKey,
    url: `https://objects.example/${scopeKey}${suffix}.dxf`,
    downloadUrl: `/api/p/${scopeKey}${suffix}/download`,
    sizeBytes: 123,
    sha256: SHA,
    savedRowRevision: 1,
    filename: `${scopeKey}${suffix}.dxf`,
  };
}

function card(patterns = [pattern('main'), pattern('pocketing')]): common_TechCard {
  return {
    id: 6,
    lockVersion: 12,
    techCard: {
      sizeIds: [7],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'main',
        },
        {
          lineKey: 'bom-pocketing',
          name: 'Pocketing',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'pocketing',
        },
      ],
      patterns,
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

function source(scopeKey = 'main'): PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 {
  return Object.freeze({
    scopeKey,
    label: scopeKey,
    projection: Object.freeze({ pieces: Object.freeze([]) }) as never,
  });
}

function request(
  overrides: Partial<
    Parameters<typeof preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1>[0]
  > = {},
) {
  return {
    techCard: card(),
    orderSizeIds: ORDER_SIZES,
    sizeNameById: SIZE_NAMES,
    sizeToken: 'M',
    current: source(),
    authority: {} as never,
    preparationKey: 'saved-ao:6:12:10',
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('saved all-material-scope mannequin staging', () => {
  it('keeps the active scope first and reconstructs every other current saved scope', async () => {
    const prepareSaved = vi.fn(async ({ scopeKey }: { scopeKey: string }) =>
      Object.freeze({
        ok: true as const,
        scopeKey,
        projection: Object.freeze({ pieces: Object.freeze([]) }),
      }),
    );

    const result = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({ prepareSaved: prepareSaved as never }),
    );

    expect(result.ok).toBe(true);
    expect(result.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main', 'pocketing']);
    expect(prepareSaved).toHaveBeenCalledOnce();
    expect(prepareSaved.mock.calls[0][0]).toMatchObject({ scopeKey: 'pocketing', sizeToken: 'M' });
  });

  it('does not require a DXF for a roll-goods BOM slot that has no saved pattern row', async () => {
    const currentCard = card() as common_TechCard & {
      techCard: NonNullable<common_TechCard['techCard']>;
    };
    currentCard.techCard.bomItems?.push({
      lineKey: 'bom-lining-without-pattern',
      name: 'Lining without a saved pattern row',
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    } as never);
    const prepareSaved = vi.fn(async ({ scopeKey }: { scopeKey: string }) =>
      Object.freeze({
        ok: true as const,
        scopeKey,
        projection: Object.freeze({ pieces: Object.freeze([]) }),
      }),
    );

    const result = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({ techCard: currentCard, prepareSaved: prepareSaved as never }),
    );

    expect(result.ok).toBe(true);
    expect(result.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main', 'pocketing']);
  });

  it('fails closed before reconstruction when the current card is missing a material row', async () => {
    const prepareSaved = vi.fn();
    const incompletePocketing = { ...pattern('pocketing'), downloadUrl: '' };

    const result = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({
        techCard: card([pattern('main'), incompletePocketing]),
        prepareSaved: prepareSaved as never,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'saved-material-scope-set-invalid' },
    });
    expect(result.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main']);
    expect(prepareSaved).not.toHaveBeenCalled();
  });

  it('fails closed before reconstruction when a material scope has ambiguous saved rows', async () => {
    const prepareSaved = vi.fn();

    const result = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({
        techCard: card([pattern('main'), pattern('pocketing'), pattern('pocketing', '-copy')]),
        prepareSaved: prepareSaved as never,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'saved-material-scope-set-invalid' },
    });
    expect(result.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main']);
    expect(prepareSaved).not.toHaveBeenCalled();
  });

  it('does not present a partial scope set when the saved row/card lock is stale', async () => {
    const prepareSaved = vi.fn(async () =>
      Object.freeze({
        ok: false as const,
        blocker: Object.freeze({
          code: 'saved-row-authority-unavailable' as const,
          detail: 'The current saved DXF row identity moved.',
        }),
      }),
    );

    const result = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({ prepareSaved: prepareSaved as never }),
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: {
        code: 'saved-material-scope-preparation-blocked',
        detail: expect.stringContaining('identity moved'),
      },
    });
    expect(result.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main']);
  });

  it('cancels before work and discards a result superseded during reconstruction', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const neverCalled = vi.fn();
    const before = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({ signal: alreadyAborted.signal, prepareSaved: neverCalled as never }),
    );
    expect(before).toMatchObject({
      ok: false,
      blocker: { code: 'saved-material-scope-staging-cancelled' },
    });
    expect(neverCalled).not.toHaveBeenCalled();

    const during = new AbortController();
    const prepareSaved = vi.fn(async () => {
      during.abort();
      return Object.freeze({
        ok: true as const,
        scopeKey: 'pocketing',
        projection: Object.freeze({ pieces: Object.freeze([]) }),
      });
    });
    const superseded = await preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1(
      request({ signal: during.signal, prepareSaved: prepareSaved as never }),
    );
    expect(superseded).toMatchObject({
      ok: false,
      blocker: { code: 'saved-material-scope-staging-cancelled' },
    });
    expect(superseded.sources.map(({ scopeKey }) => scopeKey)).toEqual(['main']);
  });
});
