import type { common_TechCard } from 'api/proto-http/admin';
import { bindingScopes } from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { describe, expect, it } from 'vitest';
import {
  savedWorkbenchBindingScopeKeyV1,
  savedWorkbenchScopeKeyV1,
} from './saved-workbench-scope-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { resolvePatternImportDxfPhaseESavedPatternRowV1 } from './saved-pattern-row-resolver-v1';

it.each([
  ['TECH_CARD_BOM_PURPOSE_MAIN', 'main'],
  ['TECH_CARD_BOM_PURPOSE_POCKETING', 'pocketing'],
])(
  'projects typed GetTechCard %s consistently into saved row and replay context',
  (purpose, expected) => {
    const card = {
      id: 156,
      lockVersion: 7,
      techCard: {
        sizeIds: [1],
        bomItems: [{ lineKey: 'fabric-line', section: 'TECH_CARD_BOM_SECTION_FABRIC', purpose }],
        patterns: [
          {
            lineKey: 'pattern-line',
            fabricPurpose: purpose,
            url: '/source.dxf',
            sizeBytes: 713,
            sha256: 'a'.repeat(64),
            savedRowRevision: 3,
          },
        ],
        pieces: [{ lineKey: 'piece-a' }, { lineKey: 'piece-b' }],
        pieceDxfAliases: {
          items: ['piece-a', 'piece-b'].map((pieceLineKey) => ({
            fabricPurpose: purpose,
            pieceLineKey,
            blockName: pieceLineKey,
          })),
        },
      },
    } as common_TechCard;
    const context = buildPatternImportDxfPhaseESavedCardContextV1(
      card,
      (ids) => ids,
      new Map([[1, 'M']]),
    );
    const insert = card.techCard!;
    const resolved = resolvePatternImportDxfPhaseESavedPatternRowV1({
      techCardId: card.id!,
      cardLockVersion: card.lockVersion!,
      patterns: insert.patterns!,
      aliases: insert.pieceDxfAliases!.items!,
      scopes: rollGoodsScopes(insert.bomItems!),
      pieceLineKeys: ['piece-a', 'piece-b'],
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error('row required');
    expect(resolved.row.scopeKey).toBe(expected);
    expect(context.scopes.map((scope) => scope.scopeKey)).toEqual([expected]);
    expect(context.scopes[0].fabricPurpose).toBe(purpose);
    expect(context.existingPatterns.map((pattern) => pattern.scopeKey)).toEqual([expected]);
    expect(context.existingAliases.map((alias) => alias.scopeKey)).toEqual([expected, expected]);
  },
);

describe('live scope proof, not string rewriting', () => {
  it('preserves even enum-looking ordinary line keys', () => {
    expect(savedWorkbenchScopeKeyV1({ key: 'TECH_CARD_BOM_PURPOSE_MAIN', byPurpose: false })).toBe(
      'TECH_CARD_BOM_PURPOSE_MAIN',
    );
  });
  it('preserves explicit interlining and its unambiguous legacy purpose alias', () => {
    const lines = [
      {
        lineKey: 'fusing-line',
        section: 'TECH_CARD_BOM_SECTION_INTERLINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
      },
    ];
    const scopes = rollGoodsScopes(lines);
    const legacy = { fabricPurpose: 'TECH_CARD_BOM_PURPOSE_INTERFACING', bomLineKey: '' };
    expect(
      savedWorkbenchBindingScopeKeyV1(legacy.fabricPurpose, '', bindingScopes(scopes, [legacy])),
    ).toBe('fusing-line');
    const direct = { fabricPurpose: '', bomLineKey: 'fusing-line' };
    const bindings = bindingScopes(scopes, [legacy, direct]);
    expect(savedWorkbenchBindingScopeKeyV1(direct.fabricPurpose, direct.bomLineKey, bindings)).toBe(
      'fusing-line',
    );
    expect(savedWorkbenchBindingScopeKeyV1(legacy.fabricPurpose, '', bindings)).toBe('');
  });
});
