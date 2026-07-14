import { common_MaterialMovementType } from 'api/proto-http/admin';

// Human labels for the movement ledger. The arrow encodes direction so the type reads at a glance
// (issue → out to a run/sample, return ← back into stock).
export const movementTypeLabel = (t?: common_MaterialMovementType | string): string => {
  switch (t) {
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT':
      return 'receipt';
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT_PRODUCTION':
      return 'receipt (production)';
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION':
      return 'issue → production';
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE':
      return 'issue → sample';
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_PRODUCTION':
      return 'return ← production';
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE':
      return 'return ← sample';
    case 'MATERIAL_MOVEMENT_TYPE_ADJUSTMENT':
      return 'adjustment';
    case 'MATERIAL_MOVEMENT_TYPE_WRITEOFF':
      return 'write-off';
    default:
      return '—';
  }
};

// Movement-type filter options for the ledger (UNKNOWN = any).
export const movementTypeFilterOptions: { value: common_MaterialMovementType; label: string }[] = [
  { value: 'MATERIAL_MOVEMENT_TYPE_UNKNOWN', label: 'all types' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RECEIPT', label: 'receipt' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RECEIPT_PRODUCTION', label: 'receipt (production)' },
  { value: 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION', label: 'issue → production' },
  { value: 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE', label: 'issue → sample' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RETURN_PRODUCTION', label: 'return ← production' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE', label: 'return ← sample' },
  { value: 'MATERIAL_MOVEMENT_TYPE_ADJUSTMENT', label: 'adjustment' },
  { value: 'MATERIAL_MOVEMENT_TYPE_WRITEOFF', label: 'write-off' },
];

// Signed balance delta of a movement, straight from the ledger (after − before). Returns the
// formatted string with an explicit sign, or '' when the balances are missing. Direction is a
// fact of the row, not inferred from the type — so ADJUSTMENT (which can go either way) is right.
export const movementDelta = (before?: string, after?: string): string => {
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return '';
  const d = a - b;
  const rounded = Number(d.toFixed(3));
  return `${rounded > 0 ? '+' : ''}${rounded}`;
};
