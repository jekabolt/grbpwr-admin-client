import { common_MaterialMovementType } from 'api/proto-http/admin';

// The ledger's REASON word. Direction is the row's signed Δ, so the word carries no arrow and both
// returns read `return`; the ref after it (PR-n, #n) says where from.
export const movementKind = (t?: common_MaterialMovementType | string): string => {
  switch (t) {
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT':
      return 'receipt';
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT_PRODUCTION':
      return 'production receipt';
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION':
      return 'production';
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE':
      return 'sample';
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_PRODUCTION':
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE':
      return 'return';
    case 'MATERIAL_MOVEMENT_TYPE_ADJUSTMENT':
      return 'adjustment';
    case 'MATERIAL_MOVEMENT_TYPE_WRITEOFF':
      return 'write-off';
    default:
      return '';
  }
};

// Movement-type filter options for the ledger (UNKNOWN = any).
export const movementTypeFilterOptions: { value: common_MaterialMovementType; label: string }[] = [
  { value: 'MATERIAL_MOVEMENT_TYPE_UNKNOWN', label: 'all types' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RECEIPT', label: 'receipt' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RECEIPT_PRODUCTION', label: 'production receipt' },
  { value: 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION', label: 'production' },
  { value: 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE', label: 'sample' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RETURN_PRODUCTION', label: 'production return' },
  { value: 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE', label: 'sample return' },
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
