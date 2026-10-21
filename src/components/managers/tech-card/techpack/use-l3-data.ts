import { adminService } from 'api/api';
import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import { useQueries, useQuery } from '@tanstack/react-query';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
import { useDictionary } from 'lib/providers/dictionary-provider';

export function useTechpackMeasurements(techCard: common_TechCard) {
  const { dictionary, loading: dictionaryLoading, error: dictionaryError } = useDictionary();
  const { measurements } = useMeasurements(
    dictionary,
    techCard.topCategoryId,
    techCard.subCategoryId,
    techCard.typeId,
  );
  const chart = useQuery({
    queryKey: ['styleSizeChart', techCard.id, 'techpack-v6'],
    queryFn: () => adminService.GetStyleSizeChart({ styleId: techCard.id ?? 0 }),
    enabled: !!techCard.id,
    retry: false,
  });
  const sizeNames: Record<number, string> = {};
  for (const size of dictionary?.sizes ?? []) {
    if (size.id != null) sizeNames[size.id] = formatSizeName(size.name ?? `#${size.id}`);
  }
  return {
    measurements,
    sizeChart: chart.data?.chart,
    sizeNames,
    isLoading: dictionaryLoading || chart.isLoading,
    isError: !!dictionaryError || chart.isError,
  };
}

export function useTechpackMarkerLayouts(techCard: common_TechCard) {
  const summaries = (techCard.markers ?? []).filter((marker) => !!marker.id);
  const queries = useQueries({
    queries: summaries.map((marker) => ({
      queryKey: ['tech-card-marker', marker.id, 'techpack-v6'],
      queryFn: () => adminService.GetTechCardMarker({ id: marker.id ?? 0 }),
      enabled: !!marker.id,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  return {
    markerLayouts: queries
      .map((query) => query.data?.marker)
      .filter((marker): marker is common_TechCardMarker => !!marker),
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
  };
}
