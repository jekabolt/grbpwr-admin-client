import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  PackagingBomItem,
  common_Material,
  common_MaterialPrice,
  common_MaterialPurpose,
} from 'api/proto-http/admin';

const materialKeys = {
  all: ['materials'] as const,
  list: (section: string, includeArchived: boolean, purpose: common_MaterialPurpose) =>
    [...materialKeys.all, 'list', section, includeArchived, purpose] as const,
  prices: (materialId: number) => [...materialKeys.all, 'prices', materialId] as const,
};

// ListMaterials.section is a plain string, not the TechCardBomSection enum — mirroring the
// production-run status filter, the backend expects the DB short name (`fabric`, `lining`, …),
// not the enum constant. Inferred (no explicit proto note as there is for run status); if the
// backend actually matches the enum constant, drop this transform.
export const bomSectionToDbFilter = (section: string): string | undefined =>
  section ? section.replace('TECH_CARD_BOM_SECTION_', '').toLowerCase() : undefined;

// purpose defaults to UNKNOWN — the server reads that as "no purpose filter" (all materials),
// same as every other call site here that doesn't care about sample/production/both.
export function useMaterials(
  section: string,
  includeArchived: boolean,
  enabled = true,
  purpose: common_MaterialPurpose = 'MATERIAL_PURPOSE_UNKNOWN',
) {
  return useQuery({
    queryKey: materialKeys.list(section, includeArchived, purpose),
    queryFn: () =>
      adminService.ListMaterials({
        section: bomSectionToDbFilter(section),
        includeArchived,
        purpose,
      }),
    enabled,
  });
}

// Material doubles as the create/update payload (id = 0 → create).
export function useSaveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (material: common_Material) =>
      material.id
        ? adminService.UpdateMaterial({ material, expectedLockVersion: material.lockVersion ?? 0 })
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

// Packaging BOM (gap-07 v2 B): ONE global recipe — the materials consumed per order (qty_per_order,
// e.g. a shipping box) and per item (qty_per_item, e.g. a polybag), booked as OPEX/COGS on ship.
// UpsertPackagingBom is a FULL REPLACE of the whole list (submit every row at once, not per-row);
// material_name / material_unit are output-only (the server fills them from the material).
export const packagingBomKey = ['packagingBom'] as const;

export function usePackagingBom() {
  return useQuery({
    queryKey: packagingBomKey,
    queryFn: () => adminService.ListPackagingBom({}),
  });
}

export function useUpsertPackagingBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: PackagingBomItem[]) => adminService.UpsertPackagingBom({ items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingBomKey }),
  });
}
