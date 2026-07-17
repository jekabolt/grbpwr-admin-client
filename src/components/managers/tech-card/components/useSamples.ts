import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_Fitting,
  common_SampleInsert,
  common_SampleSubstitutionInsert,
} from 'api/proto-http/admin';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo } from 'react';

// Samples (сэмплы) of a tech card (new-flow NF-04). A sample is one sewn prototype; its `number`
// is server-assigned (MAX+1 per card) and its composed cost is filled only by GetSample.
export const sampleKeys = {
  all: ['samples'] as const,
  list: (techCardId: number) => [...sampleKeys.all, 'list', techCardId] as const,
  detail: (id: number) => [...sampleKeys.all, 'detail', id] as const,
};

export function useSamples(techCardId?: number) {
  return useQuery({
    queryKey: sampleKeys.list(techCardId ?? 0),
    queryFn: () =>
      adminService.ListSamples({
        limit: 200,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_ASC',
        techCardId: techCardId ?? 0,
        status: '',
        purpose: '',
      }),
    enabled: !!techCardId,
  });
}

// Fittings that tried each sample on, grouped by sample_id (NF-04: a sample:fittings 1:N link).
// Built from the card's already-cached fitting list (one request, shared with TechCardFittings —
// this adds no extra fetch), so the card board's "N fittings · last verdict" chip and the open
// sample's fittings panel always read the exact same grouping.
export function useSampleFittings(techCardId?: number) {
  const { data, isLoading } = useTechCardFittings(techCardId);
  const bySample = useMemo(() => {
    const m = new Map<number, common_Fitting[]>();
    for (const f of data ?? []) {
      const sampleId = f.fitting?.sampleId;
      if (!sampleId) continue;
      const existing = m.get(sampleId);
      if (existing) existing.push(f);
      else m.set(sampleId, [f]);
    }
    return m;
  }, [data]);
  return { bySample, isLoading };
}

// One sample with its composed cost (materials issued + manual dev-expenses). costing:read strips
// the money.
export function useSample(id: number, enabled: boolean) {
  return useQuery({
    queryKey: sampleKeys.detail(id),
    queryFn: () => adminService.GetSample({ id }),
    enabled,
  });
}

// Resolves to the sample's id (server-assigned on create) so callers can open the fresh
// sample's editor — its sub-panels (movements / dev expenses / fittings) need a saved id.
// expectedLockVersion is the sample.lock_version the editor last read (S25); a stale value is
// rejected with Aborted (409) — the caller shows a reload prompt.
export function useSaveSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      sample,
      expectedLockVersion,
    }: {
      id: number;
      sample: common_SampleInsert;
      expectedLockVersion: number;
    }) => {
      if (id) {
        await adminService.UpdateSample({ id, sample, expectedLockVersion });
        return id;
      }
      const res = await adminService.AddSample({ sample });
      return res.id ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sampleKeys.all }),
  });
}

// Optimistic-lock rejection (Aborted → 409) reads clearly: someone else saved the sample.
export function saveSampleErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'This sample was changed by someone else — reload and re-apply your edits.';
  return e instanceof Error ? e.message : 'Failed to save sample';
}

// Sample substitutions (§2.7): dev-time BOM deviations, documentation only (never COGS, Q2).
export const substitutionKeys = {
  list: (sampleId: number) => ['sampleSubstitutions', sampleId] as const,
};

export function useSampleSubstitutions(sampleId?: number) {
  return useQuery({
    queryKey: substitutionKeys.list(sampleId ?? 0),
    queryFn: () => adminService.ListSampleSubstitutions({ sampleId: sampleId ?? 0 }),
    enabled: !!sampleId,
  });
}

export function useAddSampleSubstitution(sampleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (substitution: common_SampleSubstitutionInsert) =>
      adminService.AddSampleSubstitution({ substitution }),
    onSuccess: () => qc.invalidateQueries({ queryKey: substitutionKeys.list(sampleId) }),
  });
}

export function useDeleteSampleSubstitution(sampleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteSampleSubstitution({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: substitutionKeys.list(sampleId) }),
  });
}

// Named immutable releases (Rev.N) of a tech card — used as the sample's spec_release picker (§2.7).
export function useTechCardReleases(techCardId?: number) {
  return useQuery({
    queryKey: ['techCardReleases', techCardId ?? 0],
    queryFn: () => adminService.ListTechCardReleases({ techCardId: techCardId ?? 0 }),
    enabled: !!techCardId,
  });
}

export function useDeleteSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteSample({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sampleKeys.all }),
  });
}

// Friendly copy for the delete guard: the backend rejects deleting a sample that has material
// movements (FailedPrecondition → 400) or one that's gone (404).
export function deleteSampleErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 404) return 'Sample not found';
  if (status === 400 || status === 412)
    return 'This sample has material movements — reverse them before deleting';
  return e instanceof Error ? e.message : 'Failed to delete sample';
}
