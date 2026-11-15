import {
  isTopstitchThreadLine,
  type TopstitchBomLine,
  type TopstitchOperation,
} from '../../topstitch-lines';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-cad-workbench-bom-visual-authority/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_CLAIMS_V1 =
  Object.freeze({
    existingTechCardColorwaysReused: true,
    existingBomThreadLinesReused: true,
    createsColorwayAuthority: false,
    createsBomAuthority: false,
    colorwaySelectionPreviewOnly: true,
    networkRequested: false,
    autosaveRequested: false,
  } as const);

export type PatternImportDxfPhaseECadWorkbenchColorwayOptionV1 = Readonly<{
  id: number;
  label: string;
  swatchHex?: string;
}>;

type CardColorwayRefV1 = Readonly<{
  colorwayId?: number;
  baseSku?: string;
  colorCode?: string;
  status?: string;
  devName?: string;
  devHex?: string;
}>;

export type PatternImportDxfPhaseECadWorkbenchColorwayProjectionV1 =
  | Readonly<{
      ok: true;
      options: readonly PatternImportDxfPhaseECadWorkbenchColorwayOptionV1[];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      options: readonly [];
      blocker: Readonly<{
        code:
          | 'card-unavailable'
          | 'card-identity-mismatch'
          | 'colorway-identity-invalid'
          | 'colorway-identity-duplicate'
          | 'colorway-status-unknown';
        detail: string;
      }>;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_CLAIMS_V1;
    }>;

const stableId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const blockedColorways = (
  code: Extract<
    PatternImportDxfPhaseECadWorkbenchColorwayProjectionV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): Extract<PatternImportDxfPhaseECadWorkbenchColorwayProjectionV1, { ok: false }> =>
  Object.freeze({
    ok: false as const,
    options: Object.freeze([]) as readonly [],
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_CLAIMS_V1,
  });

/**
 * Read-only projection of the card query. A stale/ambiguous response yields no selectable preview
 * instead of letting a local picker become a competing colourway or recipe owner.
 */
export function projectPatternImportDxfPhaseECadWorkbenchColorwaysV1(
  input: Readonly<{
    expectedTechCardId: number | undefined;
    card:
      | Readonly<{
          id?: number;
          colorways?: readonly CardColorwayRefV1[];
        }>
      | null
      | undefined;
  }>,
): PatternImportDxfPhaseECadWorkbenchColorwayProjectionV1 {
  if (!stableId(input.expectedTechCardId) || !input.card)
    return blockedColorways('card-unavailable', 'The current saved Tech Card is unavailable.');
  if (input.card.id !== input.expectedTechCardId)
    return blockedColorways(
      'card-identity-mismatch',
      'The saved colorway response belongs to another Tech Card.',
    );

  const refs = input.card.colorways ?? [];
  const ids = new Set<number>();
  const options: PatternImportDxfPhaseECadWorkbenchColorwayOptionV1[] = [];
  for (const ref of refs) {
    const id = ref.colorwayId;
    if (!stableId(id))
      return blockedColorways(
        'colorway-identity-invalid',
        'A saved colorway has no stable positive identity.',
      );
    if (ids.has(id))
      return blockedColorways('colorway-identity-duplicate', `Saved colorway ${id} is duplicated.`);
    const status = text(ref.status);
    if (!status || status.endsWith('_UNKNOWN'))
      return blockedColorways(
        'colorway-status-unknown',
        `Saved colorway ${id} has no known lifecycle status.`,
      );
    ids.add(id);

    const rawHex = text(ref.devHex);
    const swatchHex = /^#?[0-9a-f]{6}$/i.test(rawHex)
      ? rawHex.startsWith('#')
        ? rawHex
        : `#${rawHex}`
      : undefined;
    options.push(
      Object.freeze({
        id,
        label: text(ref.devName) || text(ref.colorCode) || text(ref.baseSku) || `#${id}`,
        ...(swatchHex ? { swatchHex } : {}),
      }),
    );
  }
  return Object.freeze({
    ok: true as const,
    options: Object.freeze(options),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_BOM_VISUAL_AUTHORITY_CLAIMS_V1,
  });
}

export type PatternImportDxfPhaseECadWorkbenchThreadCatalogV1 =
  | Readonly<{ ok: true; keys: readonly string[]; blocker: null }>
  | Readonly<{
      ok: false;
      keys: readonly [];
      blocker: Readonly<{
        code: 'thread-line-key-missing' | 'thread-line-key-duplicate';
        detail: string;
      }>;
    }>;

/** A thread picker is usable only when every eligible BOM line has one globally unique line key. */
export function resolvePatternImportDxfPhaseECadWorkbenchThreadCatalogV1(
  bomItems: readonly TopstitchBomLine[],
): PatternImportDxfPhaseECadWorkbenchThreadCatalogV1 {
  const allCounts = new Map<string, number>();
  for (const item of bomItems) {
    const key = text(item.lineKey);
    if (key) allCounts.set(key, (allCounts.get(key) ?? 0) + 1);
  }
  const keys: string[] = [];
  for (const item of bomItems.filter(isTopstitchThreadLine)) {
    const key = text(item.lineKey);
    if (!key)
      return Object.freeze({
        ok: false as const,
        keys: Object.freeze([]) as readonly [],
        blocker: Object.freeze({
          code: 'thread-line-key-missing' as const,
          detail: 'A TOPSTITCH_THREAD BOM line has no stable line key.',
        }),
      });
    if (allCounts.get(key) !== 1)
      return Object.freeze({
        ok: false as const,
        keys: Object.freeze([]) as readonly [],
        blocker: Object.freeze({
          code: 'thread-line-key-duplicate' as const,
          detail: `TOPSTITCH_THREAD BOM line ${key} is not unique.`,
        }),
      });
    keys.push(key);
  }
  return Object.freeze({
    ok: true as const,
    keys: Object.freeze(keys),
    blocker: null,
  });
}

/**
 * Strict read-only thread projection. Explicit stale or conflicting references never fall through
 * to a plausible-looking card default.
 */
export function resolvePatternImportDxfPhaseECadWorkbenchThreadRefV1(
  operation: Pick<TopstitchOperation, 'topstitchLines' | 'bomLineKeys'>,
  bomItems: readonly TopstitchBomLine[],
): string | null {
  const catalog = resolvePatternImportDxfPhaseECadWorkbenchThreadCatalogV1(bomItems);
  if (!catalog.ok) return null;
  const eligible = new Set(catalog.keys);
  const explicit = (operation.topstitchLines ?? [])
    .map(({ bomLineKey }) => text(bomLineKey))
    .filter(Boolean);
  if (explicit.length) {
    const unique = new Set(explicit);
    return unique.size === 1 && [...unique].every((key) => eligible.has(key)) ? explicit[0]! : null;
  }
  const linked = (operation.bomLineKeys ?? []).map(text).filter((key) => eligible.has(key));
  const uniqueLinked = new Set(linked);
  if (linked.length !== uniqueLinked.size) return null;
  if (uniqueLinked.size === 1) return [...uniqueLinked][0]!;
  return uniqueLinked.size === 0 && catalog.keys.length === 1 ? catalog.keys[0]! : null;
}
