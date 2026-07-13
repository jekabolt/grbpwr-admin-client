import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_Material, common_MaterialPrice } from 'api/proto-http/admin';

const materialKeys = {
  all: ['materials'] as const,
  list: (section: string, includeArchived: boolean) =>
    [...materialKeys.all, 'list', section, includeArchived] as const,
  prices: (materialId: number) => [...materialKeys.all, 'prices', materialId] as const,
};

export function useMaterials(section: string, includeArchived: boolean) {
  return useQuery({
    queryKey: materialKeys.list(section, includeArchived),
    queryFn: () => adminService.ListMaterials({ section, includeArchived }),
  });
}

// Material doubles as the create/update payload (id = 0 → create).
export function useSaveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (material: common_Material) =>
      material.id
        ? adminService.UpdateMaterial({ material })
        : adminService.CreateMaterial({ material }),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKeys.all }),
  });
}

export function useArchiveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      adminService.ArchiveMaterial({ id, archived }),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKeys.all }),
  });
}

export function useMaterialPrices(materialId: number, enabled: boolean) {
  return useQuery({
    queryKey: materialKeys.prices(materialId),
    queryFn: () => adminService.ListMaterialPrices({ materialId }),
    enabled,
  });
}

export function useAddMaterialPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (price: common_MaterialPrice) => adminService.AddMaterialPrice({ price }),
    // invalidate both the price history and the list (latest_price on each material).
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKeys.all }),
  });
}
