import { common_Dictionary } from 'api/proto-http/admin';
import { sortItems } from 'lib/features/filter-size-measurements';
import { useCategories } from 'lib/features/useCategories';
import { useMemo } from 'react';
import { getMeasurementsForCategory } from './mappingMeasurementsForCategories';

export function useMeasurements(
  dictionary?: common_Dictionary,
  topCategoryId?: number,
  subCategoryId?: number,
  typeId?: number,
) {
  const { selectedTopCategoryName, selectedSubCategoryName, selectedTypeName } = useCategories(
    topCategoryId || 0,
    subCategoryId || 0,
    typeId || 0,
  );

  const measurements = useMemo(() => {
    if (!dictionary?.measurements) return [];

    const requiredMeasurements = new Set([
      ...getMeasurementsForCategory(selectedTopCategoryName?.toLowerCase()),
      ...getMeasurementsForCategory(selectedSubCategoryName?.toLowerCase(), true),
      ...getMeasurementsForCategory(selectedTypeName?.toLowerCase(), false, selectedTypeName),
    ]);

    return sortItems(dictionary.measurements)
      .filter((m): m is { id: number; name?: string } => {
        if (typeof m?.id !== 'number') return false;
        return !!m.name?.toLowerCase() && requiredMeasurements.has(m.name?.toLowerCase() || '');
      })
      .map((m) => ({
        id: m.id,
        name: m.name || '',
      }));
  }, [dictionary, selectedTopCategoryName, selectedSubCategoryName, selectedTypeName]);

  return { measurements, selectedTopCategoryName, selectedSubCategoryName, selectedTypeName };
}
