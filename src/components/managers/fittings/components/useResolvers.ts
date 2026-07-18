import { useQueries } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_Model,
  common_Colorway,
  common_Sample,
  common_TechCard,
} from 'api/proto-http/admin';
import { modelKeys } from 'components/managers/models/components/useModelQuery';
import { sampleKeys } from 'components/managers/tech-card/components/useSamples';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';

// There is no batch get-by-ids endpoint, so we resolve names per id. React Query
// dedupes and caches each id, so a fittings table only fetches each distinct
// product/model once and reuses it across pages and re-renders.
export function useProductsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['products', 'detail', id],
      queryFn: async () => {
        const res = await adminService.GetColorwayByID({ colorwayId: id });
        return res.colorway?.colorway ?? null;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_Colorway>();
  unique.forEach((id, i) => {
    const product = results[i]?.data;
    if (product) map.set(id, product);
  });
  return map;
}

export function useModelsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: modelKeys.detail(id),
      queryFn: async () => (await adminService.GetModel({ id })).model ?? null,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_Model>();
  unique.forEach((id, i) => {
    const model = results[i]?.data;
    if (model) map.set(id, model);
  });
  return map;
}

// Mirrors useModelsByIds: a fitting card list otherwise has nothing but the bare
// tech_card_id/sample_id to show (task M10) even though both are one id-keyed fetch away —
// GetTechCard/GetSample are already used elsewhere per-id (tech-card-field.tsx, sample edit).
// Shared query keys (techCardKeys/sampleKeys) mean these dedupe with/warm the cache other
// screens already populate, instead of issuing a second parallel fetch per id.
export function useTechCardsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: techCardKeys.detail(id),
      queryFn: async () => (await adminService.GetTechCard({ id })).techCard ?? null,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_TechCard>();
  unique.forEach((id, i) => {
    const techCard = results[i]?.data;
    if (techCard) map.set(id, techCard);
  });
  return map;
}

export function useSamplesByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: sampleKeys.detail(id),
      queryFn: async () => (await adminService.GetSample({ id })).sample ?? null,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_Sample>();
  unique.forEach((id, i) => {
    const sample = results[i]?.data;
    if (sample) map.set(id, sample);
  });
  return map;
}
