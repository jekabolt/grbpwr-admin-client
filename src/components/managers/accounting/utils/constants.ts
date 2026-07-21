// Literal constants for the accounting section — mirrors backend CHECK constraints and the
// chart-of-accounts codes used by manual-entry presets. Sources: docs/plan-accounting-ui/
// 07-contract-reference.md §7.5 (source types / sections / statements) and grbpwr-manager's
// docs/plan-accounting/04-posting-rules.md §MN (the "typical scenarios" table for manual
// entries) + 01-db-schema.md (account code → name seed data).

export const ACCT_SOURCE_TYPES = [
  { value: 'order_sale', label: 'order sale' },
  { value: 'order_refund', label: 'order refund' },
  { value: 'order_prepayment', label: 'order prepayment' },
  { value: 'order_transit', label: 'order transit' },
  { value: 'order_delivered_sale', label: 'order delivered sale' },
  { value: 'material_receipt', label: 'material receipt' },
  { value: 'material_issue', label: 'material issue' },
  { value: 'material_return', label: 'material return' },
  { value: 'material_writeoff', label: 'material write-off' },
  { value: 'material_adjustment', label: 'material adjustment' },
  { value: 'production_receive', label: 'production receive' },
  { value: 'opex_month', label: 'opex month' },
  { value: 'shipping_actual', label: 'shipping actual' },
  { value: 'dev_expense', label: 'dev expense' },
  { value: 'depreciation', label: 'depreciation' },
  { value: 'corp_tax', label: 'corporation tax' },
  { value: 'order_dispute', label: 'order dispute' },
  { value: 'manual', label: 'manual' },
  { value: 'reversal', label: 'reversal' },
] as const; // = CHECK chk_acct_entry_source_type (19 values)

export type AcctSourceType = (typeof ACCT_SOURCE_TYPES)[number]['value'];

export const ACCT_SECTIONS = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'opex'] as const;
export type AcctSection = (typeof ACCT_SECTIONS)[number];

export const ACCT_STATEMENTS = ['BS', 'PL'] as const;
export type AcctStatement = (typeof ACCT_STATEMENTS)[number];

export const ACCT_PAGE_SIZE = 50;

// One side of a manual-entry preset line. Only the code is hardcoded — the account's display
// name is resolved at render time via useAcctAccounts, never duplicated here.
export type ManualEntryPresetLine = {
  accountCode: string;
  side: 'debit' | 'credit';
};

export type ManualEntryPreset = {
  label: string;
  lines: ManualEntryPresetLine[];
};

// Typical two-line manual postings (backend plan 04-posting-rules.md §MN's "Типовые сценарии"
// table) — a prefill only, every field stays editable after applying one (08-ux-guidelines.md
// §8.4). Account names as of 01-db-schema.md's seed: 1010 Cash – Bank, 1030 Payment Processor
// (Stripe), 1040 Accounts Receivable, 2010 Accounts Payable, 2030 Accrued Expenses, 2070 VAT
// Payable.
export const MANUAL_ENTRY_PRESETS: ManualEntryPreset[] = [
  {
    label: 'Stripe payout',
    lines: [
      { accountCode: '1010', side: 'debit' },
      { accountCode: '1030', side: 'credit' },
    ],
  },
  {
    label: 'Invoice paid',
    lines: [
      { accountCode: '1010', side: 'debit' },
      { accountCode: '1040', side: 'credit' },
    ],
  },
  {
    label: 'Supplier payment',
    lines: [
      { accountCode: '2010', side: 'debit' },
      { accountCode: '1010', side: 'credit' },
    ],
  },
  {
    label: 'OPEX payment',
    lines: [
      { accountCode: '2030', side: 'debit' },
      { accountCode: '1010', side: 'credit' },
    ],
  },
  {
    label: 'VAT remittance',
    lines: [
      { accountCode: '2070', side: 'debit' },
      { accountCode: '1010', side: 'credit' },
    ],
  },
];
