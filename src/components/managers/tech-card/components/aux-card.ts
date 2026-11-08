import type {
  common_AuxMadeBy,
  common_MaterialPrice,
  common_TechCardOutputVariant,
} from 'api/proto-http/admin';

export type AuxKind = 'product' | 'own' | 'bought';

export const AUX_MADE_BY_UNKNOWN: common_AuxMadeBy = 'AUX_MADE_BY_UNKNOWN';
export const AUX_MADE_BY_US: common_AuxMadeBy = 'AUX_MADE_BY_US';
export const AUX_MADE_BY_SUPPLIER: common_AuxMadeBy = 'AUX_MADE_BY_SUPPLIER';

export function auxKind(purpose?: string, madeBy?: common_AuxMadeBy): AuxKind {
  if (purpose !== 'TECH_CARD_PURPOSE_AUXILIARY') return 'product';
  return madeBy === AUX_MADE_BY_SUPPLIER ? 'bought' : 'own';
}

export function madeByForKind(kind: AuxKind): common_AuxMadeBy {
  if (kind === 'own') return AUX_MADE_BY_US;
  if (kind === 'bought') return AUX_MADE_BY_SUPPLIER;
  return AUX_MADE_BY_UNKNOWN;
}

export function isBoughtAux(purpose?: string, madeBy?: common_AuxMadeBy): boolean {
  return auxKind(purpose, madeBy) === 'bought';
}

export function isOwnAux(purpose?: string, madeBy?: common_AuxMadeBy): boolean {
  return auxKind(purpose, madeBy) === 'own';
}

/** The MAKES material shown in the card header: first live colour, then any colour, then legacy. */
export function makesMaterialId(
  variants: readonly common_TechCardOutputVariant[],
  legacyMaterialId: number,
): number {
  return (
    variants.find((variant) => variant.active && (variant.materialId ?? 0) > 0)?.materialId ??
    variants.find((variant) => (variant.materialId ?? 0) > 0)?.materialId ??
    legacyMaterialId
  );
}

/** Supplier price excludes receipts: only authored manual/purchase history is eligible. */
export function latestSupplierPrice(
  prices: readonly common_MaterialPrice[],
): common_MaterialPrice | undefined {
  return prices
    .filter((price) => {
      const source = price.source?.trim().toLowerCase();
      return source === 'manual' || source === 'purchase';
    })
    .sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0];
}
