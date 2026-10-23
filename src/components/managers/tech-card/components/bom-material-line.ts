import type { common_Material } from 'api/proto-http/admin';
import { materialCompositionCode } from 'components/managers/materials/components/material-code';

import { UNSET_KIND, kindLabel, kindsForSection } from './bom-kind';
import { bornBomLine, emptyBomItem } from './form-writers';
import { isRollGoodsSection } from './bom-purpose';
import { materialFabricWeight, materialFabricWidth } from './nesting/fabric-weight';
import { wireInt } from './wire-int';

// The catalog facts a BOM line snapshots off the article it links. Every catalog-backed BOM birth
// and link passes through these helpers, so a linked line cannot acquire a different shape
// depending on which screen created it.
export function materialLineFields(m: common_Material) {
  return {
    // `name` is intentionally not a catalog snapshot. Callers preserve or supply the garment role.
    section: m.section || emptyBomItem.section,
    supplier: m.supplier || '',
    supplierRef: m.supplierRef || '',
    composition: materialCompositionCode(m),
    spec: m.spec || '',
    unit: m.unit || '',
    fabricWidth: materialFabricWidth(m) || '',
    fabricWeightGsm: materialFabricWeight(m) || '',
    unitPrice: m.latestPrice?.price?.value || '',
    currency: m.latestPrice?.currency || '',
  };
}

// Fields the catalog can answer without overwriting a human decision.
export function materialAutoFields(m: common_Material, section: string) {
  const grain = (m.fabricAttrs?.fabricDirection ?? '').trim().toLowerCase();
  const name = (m.name ?? '').toLowerCase();
  const words = new Set(name.split(/[^a-z0-9]+/).filter(Boolean));
  const kind = kindsForSection(section)
    .filter((candidate) => candidate !== 'TECH_CARD_BOM_KIND_OTHER')
    .map((candidate) => ({ candidate, label: (kindLabel(candidate) ?? '').toLowerCase() }))
    .filter(({ label }) => {
      const parts = label.split(/[^a-z0-9]+/).filter(Boolean);
      return parts.length > 0 && parts.every((word) => words.has(word) || words.has(`${word}s`));
    })
    .sort((a, b) => b.label.length - a.label.length)[0]?.candidate;
  return {
    fabricDirection:
      isRollGoodsSection(section) && grain === 'any' ? 'TECH_CARD_FABRIC_DIRECTION_ANY' : '',
    color: m.color?.trim() ?? '',
    pantone: m.pantone?.trim() ?? '',
    kind: kind ?? '',
  };
}

/** Build a linked BOM line with the same defaults and catalog snapshot as the BOM add flow. */
export function bornMaterialBomLine(
  material: common_Material,
  values: Partial<typeof emptyBomItem> & Record<string, unknown> = {},
): Record<string, unknown> {
  const section = String(values.section || material.section || emptyBomItem.section);
  const auto = materialAutoFields(material, section);
  return bornBomLine({
    ...materialLineFields(material),
    kind: auto.kind || UNSET_KIND,
    color: auto.color,
    pantone: auto.pantone,
    fabricDirection: auto.fabricDirection || emptyBomItem.fabricDirection,
    ...values,
    section,
    materialId: wireInt(material.id),
  });
}
