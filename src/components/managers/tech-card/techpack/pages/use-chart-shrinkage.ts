import type { common_TechCard } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';

const numberOf = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const idOf = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
};

/** Main-fabric fallback for charts whose card-level shrinkage override is empty. */
export function useChartFabricShrinkage(techCard: common_TechCard): number {
  const bom = techCard.techCard?.bomItems ?? [];
  const line =
    bom.find((item) => item.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN') ??
    bom.find((item) => item.section === 'TECH_CARD_BOM_SECTION_FABRIC');
  const materialId = idOf(line?.materialId);
  const { data } = useMaterials('', true, materialId > 0);
  const material = (data?.materials ?? []).find((item) => idOf(item.id) === materialId);
  return numberOf(material?.fabricAttrs?.shrinkagePct?.value) ?? 0;
}
