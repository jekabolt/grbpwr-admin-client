import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_SampleInsert } from 'api/proto-http/admin';

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
export function useSaveSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sample }: { id: number; sample: common_SampleInsert }) => {
      if (id) {
        await adminService.UpdateSample({ id, sample, expectedLockVersion: 0 });
        return id;
      }
      const res = await adminService.AddSample({ sample });
      return res.id ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sampleKeys.all }),
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
