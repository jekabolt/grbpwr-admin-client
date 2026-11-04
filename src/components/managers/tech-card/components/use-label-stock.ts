// What a label row reads from outside the card: the catalogue's label materials, how many of each are
// on hand, and how many garments the open run plans.
import type { common_Material, common_TechCard } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMaterialStock } from 'components/managers/materials/components/useWarehouse';
import { isRunOpen } from 'components/managers/production-runs/components/options';
import { runQty } from 'components/managers/production-runs/components/run-rows';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { useMemo } from 'react';
import { decimalToInput } from 'utils/decimal';

import { LABEL_BOM_SECTION } from './label-bom';
import { wireInt } from './wire-int';

export function useLabelStock(techCard?: common_TechCard) {
  const materialsQuery = useMaterials(LABEL_BOM_SECTION, true);
  const stockQuery = useMaterialStock({ section: LABEL_BOM_SECTION });
  const techCardId = wireInt(techCard?.id);
  const runsQuery = useProductionRuns(techCardId, '', 0, false, techCardId > 0);

  const materials = useMemo(() => materialsQuery.data?.materials ?? [], [materialsQuery.data]);
  const materialById = useMemo(
    () => new Map(materials.map((material) => [wireInt(material.id), material])),
    [materials],
  );
  const stock = useMemo(() => {
    const map = new Map<number, string>();
    for (const stockRow of stockQuery.data?.rows ?? []) {
      map.set(wireInt(stockRow.material?.id), decimalToInput(stockRow.onHand) || '0');
    }
    return map;
  }, [stockQuery.data]);

  const stockKnown = stockQuery.isSuccess;
  const currentRun = (runsQuery.data?.runs ?? []).find((run) => isRunOpen(run.run?.status));
  const plannedQty = currentRun ? runQty(currentRun).planned : undefined;

  /** A material no stock row names has none on hand, once the stock is known. */
  const onHandOf = (material?: common_Material): string | undefined =>
    material ? stock.get(wireInt(material.id)) ?? (stockKnown ? '0' : undefined) : undefined;

  return { materials, materialById, stock, stockKnown, plannedQty, onHandOf };
}
