import type { JSX } from 'react';

import { GARMENT_SHAPES, GarmentPictogram, type GarmentFamily } from './garment-pictograms';

/**
 * ⚠ ЗАГЛУШКА ЛЕЙНА C (квиз доски, 04.10). Настоящий файл — `GARMENT_PARTS`, подсветка детали и
 * `PART_LABEL` — пишет лейн P (20-DESIGN O6) в своём ворктри и ЗАМЕНЯЕТ этот файл при слиянии.
 * Интерфейс один: `PartPictogram({ family, part, className })`. Здесь — пиктограмма семейства
 * фасом без подсветки; незнакомое семейство — ничего (слот 64×96 у вызывающего держит сетку).
 */
export function PartPictogram({
  family,
  className,
}: {
  family: string;
  part: string;
  className?: string;
}): JSX.Element | null {
  if (!Object.prototype.hasOwnProperty.call(GARMENT_SHAPES, family)) return null;
  return <GarmentPictogram family={family as GarmentFamily} view='front' className={className} />;
}
