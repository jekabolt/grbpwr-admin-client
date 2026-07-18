import { common_MaterialPurpose } from 'api/proto-http/admin';

// purpose (#40): sample vs production vs both. A legacy/never-set material reads UNKNOWN — treat
// it as BOTH everywhere in the UI, mirroring the backend's own write-side default (see the
// field's proto comment: "Defaults to BOTH on write when UNKNOWN").
export const resolveMaterialPurpose = (p?: common_MaterialPurpose): common_MaterialPurpose =>
  p && p !== 'MATERIAL_PURPOSE_UNKNOWN' ? p : 'MATERIAL_PURPOSE_BOTH';

export const materialPurposeLabel = (p?: common_MaterialPurpose): string => {
  switch (resolveMaterialPurpose(p)) {
    case 'MATERIAL_PURPOSE_SAMPLE':
      return 'sample';
    case 'MATERIAL_PURPOSE_PRODUCTION':
      return 'production';
    default:
      return 'both';
  }
};

// The three real choices offered by the modal's segmented control. UNKNOWN is not offered —
// resolveMaterialPurpose already folds it (and any legacy/absent value) into BOTH.
export const materialPurposeOptions: Array<{ value: common_MaterialPurpose; label: string }> = [
  { value: 'MATERIAL_PURPOSE_SAMPLE', label: 'sample' },
  { value: 'MATERIAL_PURPOSE_PRODUCTION', label: 'production' },
  { value: 'MATERIAL_PURPOSE_BOTH', label: 'both' },
];

// The list/filter control adds a 4th choice, "all" (UNKNOWN sent = server applies no filter).
export const materialPurposeFilterOptions: Array<{ value: common_MaterialPurpose; label: string }> =
  [{ value: 'MATERIAL_PURPOSE_UNKNOWN', label: 'all' }, ...materialPurposeOptions];
