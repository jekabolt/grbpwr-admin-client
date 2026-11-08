import { adminService } from 'api/api';
import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useRef } from 'react';
import { useChartFabricShrinkage } from './pages/use-chart-shrinkage';

/**
 * `release`: `techCard` is a frozen release snapshot. Its size chart is the one frozen with it
 * (`releaseSizeChart`), never the live one, so every print of a revision carries the same numbers.
 * A release frozen before the chart was captured has none, and the page says so.
 */
export function useTechpackMeasurements(techCard: common_TechCard, release = false) {
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
    enabled: !!techCard.id && !release,
    retry: false,
  });
  const sizeNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const size of dictionary?.sizes ?? []) {
      if (size.id != null) names[size.id] = formatSizeName(size.name ?? `#${size.id}`);
    }
    return names;
  }, [dictionary?.sizes]);
  const orderSizes = useSizeOrdering();
  const fabricShrinkage = useChartFabricShrinkage(techCard);
  return {
    measurements,
    fabricShrinkage,
    sizeChart: release ? techCard.releaseSizeChart : chart.data?.chart,
    sizeNames,
    orderSizes,
    isLoading: dictionaryLoading || (!release && chart.isLoading),
    isError: !!dictionaryError || (!release && chart.isError),
  };
}

export function useTechpackMarkerLayouts(techCard: common_TechCard, enabled: boolean) {
  const summaries = (techCard.markers ?? []).filter((marker) => !!marker.id);
  const queries = useQueries({
    queries: summaries.map((marker) => ({
      queryKey: ['tech-card-marker', marker.id, 'techpack-v6'],
      queryFn: () => adminService.GetTechCardMarker({ id: marker.id ?? 0 }),
      enabled: enabled && !!marker.id,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const markerDataKey = queries
    .map((query) => `${query.dataUpdatedAt}:${query.data?.marker?.summary?.id ?? 0}`)
    .join('|');
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const markerLayouts = useMemo(
    () =>
      enabled
        ? queriesRef.current
            .map((query) => query.data?.marker)
            .filter((marker): marker is common_TechCardMarker => !!marker)
        : [],
    // Query-result wrappers are recreated by useQueries. Their data timestamps are the stable key
    // that keeps the marker array, and therefore the expensive SVG memo, unchanged across renders.
    [enabled, markerDataKey],
  );
  return {
    markerLayouts,
    isLoading: enabled && queries.some((query) => query.isLoading),
    isError: enabled && queries.some((query) => query.isError),
  };
}
