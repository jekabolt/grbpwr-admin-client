import type { common_Material, common_MaterialLabelType } from 'api/proto-http/admin';

const ROW_KIND_BY_TYPE: Partial<Record<common_MaterialLabelType, string>> = {
  MATERIAL_LABEL_TYPE_BRAND: 'brand',
  MATERIAL_LABEL_TYPE_SIZE: 'size',
  MATERIAL_LABEL_TYPE_FLAG: 'flag',
  MATERIAL_LABEL_TYPE_PATCH: 'patch',
  MATERIAL_LABEL_TYPE_TAPE: 'neck_tape',
  MATERIAL_LABEL_TYPE_LOOP: 'hanger_loop',
  MATERIAL_LABEL_TYPE_HANGTAG: 'hangtag',
  MATERIAL_LABEL_TYPE_BARCODE: 'barcode',
  MATERIAL_LABEL_TYPE_COMPOSITION: 'composition',
};

/** The row kind of a material in stock: its stored type only, '' when it has none. */
export function labelKindOfMaterial(material: Pick<common_Material, 'labelType'>): string {
  return material.labelType ? ROW_KIND_BY_TYPE[material.labelType] ?? '' : '';
}
