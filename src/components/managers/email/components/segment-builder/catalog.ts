// Segment field catalog — MIRRORS the backend segment registry EXACTLY.
//
// The predicate builder may only offer these 15 fields, and per-field only the
// operators listed here; anything else errors on the backend at Compile time.
// Field names, enum member values and operator tokens are the raw STRINGS the
// backend parses (they land verbatim in SegmentNode.field / .operator / .values).
// Keep this in lockstep with the Go registry — this is a contract, not cosmetics.

// Value-input kind — drives which control renders for a leaf's value(s).
export type ValueKind = 'bool' | 'enum' | 'int' | 'decimal' | 'date' | 'string';

// The operator token set (raw strings sent to the backend).
export type Operator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'not_in'
  | 'between'
  | 'is_set'
  | 'is_not_set'
  | 'in_last_days'
  | 'older_than_days';

export type FieldGroup = 'profile' | 'behavioral';

export type EnumOption = { value: string; label: string };

export type FieldDef = {
  // Raw field token sent to the backend (SegmentNode.field).
  field: string;
  // Human label shown in the picker.
  label: string;
  group: FieldGroup;
  kind: ValueKind;
  // Allowed operators for this field, in menu order.
  operators: Operator[];
  // Present only for kind === 'enum'.
  options?: EnumOption[];
  // Numeric bounds (int/decimal) used as input min/max hints.
  min?: number;
  max?: number;
};

// Value arity a given operator expects.
//  0     → no value inputs (is_set / is_not_set)
//  1     → exactly one value
//  2     → exactly two values (between: lo, hi)
// 'multi'→ a list of values (in / not_in)
export type Arity = 0 | 1 | 2 | 'multi';

// ── the 15 fields ─────────────────────────────────────────────────────────────

export const FIELDS: FieldDef[] = [
  // Profile
  {
    field: 'subscribe_newsletter',
    label: 'newsletter subscriber',
    group: 'profile',
    kind: 'bool',
    operators: ['eq'],
  },
  {
    field: 'subscribe_new_arrivals',
    label: 'new-arrivals subscriber',
    group: 'profile',
    kind: 'bool',
    operators: ['eq'],
  },
  {
    field: 'subscribe_events',
    label: 'events subscriber',
    group: 'profile',
    kind: 'bool',
    operators: ['eq'],
  },
  {
    field: 'account_tier',
    label: 'account tier',
    group: 'profile',
    kind: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    options: [
      { value: 'member', label: 'member' },
      { value: 'plus', label: 'plus' },
      { value: 'plus_plus', label: 'plus plus' },
      { value: 'hacker', label: 'hacker' },
    ],
  },
  {
    field: 'default_country',
    label: 'country',
    group: 'profile',
    kind: 'string',
    operators: ['eq', 'neq', 'in', 'not_in', 'is_set', 'is_not_set'],
  },
  {
    field: 'default_language',
    label: 'language',
    group: 'profile',
    kind: 'string',
    operators: ['eq', 'neq', 'in', 'not_in', 'is_set', 'is_not_set'],
  },
  {
    field: 'shopping_preference',
    label: 'shopping preference',
    group: 'profile',
    kind: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    options: [
      { value: 'male', label: 'male' },
      { value: 'female', label: 'female' },
      { value: 'all', label: 'all' },
    ],
  },
  {
    field: 'status',
    label: 'account status',
    group: 'profile',
    kind: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    options: [
      { value: 'active', label: 'active' },
      { value: 'frozen', label: 'frozen' },
      { value: 'deleted', label: 'deleted' },
      { value: 'erased', label: 'erased' },
    ],
  },
  {
    field: 'age',
    label: 'age',
    group: 'profile',
    kind: 'int',
    operators: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'is_set', 'is_not_set'],
    min: 0,
    max: 150,
  },
  {
    field: 'birth_month',
    label: 'birth month',
    group: 'profile',
    kind: 'int',
    operators: ['eq', 'neq', 'in', 'not_in', 'is_set', 'is_not_set'],
    min: 1,
    max: 12,
  },
  {
    field: 'registered_at',
    label: 'registered at',
    group: 'profile',
    kind: 'date',
    operators: ['lt', 'lte', 'gt', 'gte', 'between', 'in_last_days', 'older_than_days'],
  },
  // Behavioral
  {
    field: 'total_spend_eur',
    label: 'total spend €',
    group: 'behavioral',
    kind: 'decimal',
    operators: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between'],
    min: 0,
  },
  {
    field: 'order_count',
    label: 'order count',
    group: 'behavioral',
    kind: 'int',
    operators: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between'],
    min: 0,
  },
  {
    field: 'first_order_at',
    label: 'first order at',
    group: 'behavioral',
    kind: 'date',
    operators: [
      'lt',
      'lte',
      'gt',
      'gte',
      'between',
      'in_last_days',
      'older_than_days',
      'is_set',
      'is_not_set',
    ],
  },
  {
    field: 'last_order_at',
    label: 'last order at',
    group: 'behavioral',
    kind: 'date',
    operators: [
      'lt',
      'lte',
      'gt',
      'gte',
      'between',
      'in_last_days',
      'older_than_days',
      'is_set',
      'is_not_set',
    ],
  },
];

export const FIELD_MAP: Record<string, FieldDef> = FIELDS.reduce<Record<string, FieldDef>>(
  (acc, f) => {
    acc[f.field] = f;
    return acc;
  },
  {},
);

export const GROUP_LABELS: Record<FieldGroup, string> = {
  profile: 'profile',
  behavioral: 'behavioral',
};

// ── helpers ───────────────────────────────────────────────────────────────────

export function fieldsByGroup(): Record<FieldGroup, FieldDef[]> {
  return {
    profile: FIELDS.filter((f) => f.group === 'profile'),
    behavioral: FIELDS.filter((f) => f.group === 'behavioral'),
  };
}

export function getFieldDef(field: string | undefined): FieldDef | undefined {
  return field ? FIELD_MAP[field] : undefined;
}

export function operatorsForField(field: string | undefined): Operator[] {
  return getFieldDef(field)?.operators ?? [];
}

export function valueKindForField(field: string | undefined): ValueKind {
  return getFieldDef(field)?.kind ?? 'string';
}

export function arityForOperator(op: Operator | string | undefined): Arity {
  switch (op) {
    case 'is_set':
    case 'is_not_set':
      return 0;
    case 'in':
    case 'not_in':
      return 'multi';
    case 'between':
      return 2;
    default:
      // eq, neq, lt, lte, gt, gte, in_last_days, older_than_days
      return 1;
  }
}

// The N-days operators always take a non-negative integer (a day count), even
// though the underlying field is a date. Callers use this to override the value
// input kind for those operators.
export function isDaysOperator(op: Operator | string | undefined): boolean {
  return op === 'in_last_days' || op === 'older_than_days';
}

// Effective value-input kind for a (field, operator) pair. Same as the field's
// kind, except the N-days operators force a non-negative integer.
export function effectiveValueKind(field: string | undefined, op: Operator | string | undefined): ValueKind {
  if (isDaysOperator(op)) return 'int';
  return valueKindForField(field);
}

// Human operator label, sensible per value kind (date vs number vs the rest).
export function operatorLabel(op: Operator | string, kind: ValueKind): string {
  const isDate = kind === 'date';
  switch (op) {
    case 'eq':
      return isDate ? 'on' : 'is';
    case 'neq':
      return isDate ? 'not on' : 'is not';
    case 'lt':
      return isDate ? 'before' : 'less than';
    case 'lte':
      return isDate ? 'on or before' : 'at most';
    case 'gt':
      return isDate ? 'after' : 'more than';
    case 'gte':
      return isDate ? 'on or after' : 'at least';
    case 'in':
      return 'is any of';
    case 'not_in':
      return 'is none of';
    case 'between':
      return 'between';
    case 'is_set':
      return 'is set';
    case 'is_not_set':
      return 'is not set';
    case 'in_last_days':
      return 'in the last N days';
    case 'older_than_days':
      return 'older than N days';
    default:
      return String(op);
  }
}

// Default operator to seed a freshly-picked field (first allowed operator).
export function defaultOperatorForField(field: string): Operator {
  const ops = operatorsForField(field);
  return ops[0] ?? 'eq';
}
