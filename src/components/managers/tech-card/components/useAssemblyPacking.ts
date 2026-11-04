import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { StyleAssemblyItem } from 'api/proto-http/admin';

// Assembly + order packing-spec (WS7/WS2, PLM rework §2.8):
// - StyleAssembly: a garment style's on-body auxiliary bill (labels/tags), one style at a time.
// - OrderPackingSpec: read-only packer/QC-facing composition of one order.

const assemblyKeys = {
  all: ['styleAssembly'] as const,
  list: (styleId: number) => [...assemblyKeys.all, 'list', styleId] as const,
};

export function useStyleAssembly(styleId: number, enabled = true) {
  return useQuery({
    queryKey: assemblyKeys.list(styleId),
    queryFn: () => adminService.ListStyleAssembly({ styleId }),
    enabled: enabled && styleId > 0,
  });
}

// UpsertStyleAssembly is a full replace of one style's assembly bill — callers submit every line
// at once (see AssemblyField), not per-row. Empty items clears it.
export function useUpsertStyleAssembly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ styleId, items }: { styleId: number; items: StyleAssemblyItem[] }) =>
      adminService.UpsertStyleAssembly({ styleId, items }),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: assemblyKeys.list(variables.styleId) }),
  });
}

const orderPackingSpecKeys = {
  all: ['orderPackingSpec'] as const,
  detail: (orderUuid: string) => [...orderPackingSpecKeys.all, orderUuid] as const,
};

// Read-only; the packer/QC view of one order. `enabled` lets callers defer the fetch until the
// section is actually opened (GetOrderPackingSpec is its own RPC — no reason to fire it on every
// order-page load, see OrderPackingSpec).
export function useOrderPackingSpec(orderUuid: string, enabled = true) {
  return useQuery({
    queryKey: orderPackingSpecKeys.detail(orderUuid),
    queryFn: () => adminService.GetOrderPackingSpec({ orderUuid }),
    enabled: enabled && !!orderUuid,
  });
}
