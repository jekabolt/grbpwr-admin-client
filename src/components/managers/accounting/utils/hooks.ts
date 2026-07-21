import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AcctJournalLineInput, googletype_Decimal } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

// Accounting module (backend `feature/accounting-core`; docs/plan-accounting-ui/
// 01-contract-and-api.md §1.3). One query-key domain for the whole section — small enough that
// every mutation invalidates acctKeys.all wholesale instead of tracking point invalidations.
// Snackbars are the calling component's job (pattern: opex's useUpsertOpexLines), not this
// file's.

export type EntriesFilter = {
  from?: string;
  to?: string;
  accountCode?: string;
  sourceType?: string;
  limit: number;
  offset: number;
};

export type LedgerFilter = {
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

export const acctKeys = {
  all: ['accounting'] as const,
  accounts: (includeArchived: boolean) => [...acctKeys.all, 'accounts', includeArchived] as const,
  entries: (f: EntriesFilter) => [...acctKeys.all, 'entries', f] as const,
  entry: (id: number) => [...acctKeys.all, 'entry', id] as const,
  periods: () => [...acctKeys.all, 'periods'] as const,
  trialBalance: (from: string, to: string) => [...acctKeys.all, 'tb', from, to] as const,
  profitLoss: (from: string, to: string) => [...acctKeys.all, 'pl', from, to] as const,
  balanceSheet: (asOf: string) => [...acctKeys.all, 'bs', asOf] as const,
  cashFlow: (from: string, to: string) => [...acctKeys.all, 'cash-flow', from, to] as const,
  financialHealth: (from: string, to: string) =>
    [...acctKeys.all, 'financial-health', from, to] as const,
  ledger: (code: string, f: LedgerFilter) => [...acctKeys.all, 'ledger', code, f] as const,
  reconciliation: (from: string, to: string) => [...acctKeys.all, 'recon', from, to] as const,
  vatReturn: (month: string) => [...acctKeys.all, 'vat-return', month] as const,
  ossReturn: (q: string) => [...acctKeys.all, 'oss-return', q] as const,
  ukVatReturn: (q: string) => [...acctKeys.all, 'uk-vat-return', q] as const,
  frs105: (from: string, to: string) => [...acctKeys.all, 'frs105', from, to] as const,
  fixedAssets: () => [...acctKeys.all, 'fixed-assets'] as const,
  eventsReview: () => [...acctKeys.all, 'events-review'] as const,
  bankTxns: (state: string) => [...acctKeys.all, 'bank-txns', state] as const,
  bankRules: () => [...acctKeys.all, 'bank-rules'] as const,
  suppliers: () => [...acctKeys.all, 'suppliers'] as const,
  payables: () => [...acctKeys.all, 'payables'] as const,
  receivables: () => [...acctKeys.all, 'receivables'] as const,
};

// ---- Chart of accounts ----

export function useAcctAccounts(includeArchived: boolean) {
  return useQuery({
    queryKey: acctKeys.accounts(includeArchived),
    queryFn: () => adminService.ListAcctAccounts({ includeArchived }),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { code: string; name: string; section: string; statement: string }) =>
      adminService.CreateAcctAccount(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// Renames a custom (non-system) account; code and section are immutable (backend comment on
// UpdateAcctAccount), hence only { code, name } here.
export function useUpdateAccountName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { code: string; name: string }) => adminService.UpdateAcctAccount(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { code: string; archived: boolean }) =>
      adminService.ArchiveAcctAccount(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// ---- Journal ----

export function useJournalEntries(filter: EntriesFilter) {
  return useQuery({
    queryKey: acctKeys.entries(filter),
    queryFn: () =>
      adminService.ListJournalEntries({
        from: filter.from || undefined,
        to: filter.to || undefined,
        accountCode: filter.accountCode || undefined,
        sourceType: filter.sourceType || undefined,
        limit: filter.limit,
        offset: filter.offset,
      }),
  });
}

// id is nullable (no row selected yet); `enabled` lets a caller layer its own "is the modal
// open" gate on top of the built-in id!=null guard below (entry-detail-modal.tsx passes
// enabled={!!entryId}, which documents intent even though it's redundant with the guard).
export function useJournalEntry(id: number | null, enabled = true) {
  return useQuery({
    queryKey: acctKeys.entry(id!),
    queryFn: () => adminService.GetJournalEntry({ id: id! }),
    enabled: enabled && id !== null && !Number.isNaN(id),
  });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      occurredAt: string;
      description: string;
      lines: AcctJournalLineInput[];
      supplierId?: number;
    }) =>
      adminService.CreateJournalEntry({
        ...vars,
        supplierId: vars.supplierId, // optional AP-by-supplier tag (phase 2, wave 4)
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function useReverseJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: number; reason: string }) =>
      adminService.ReverseJournalEntry(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// ---- Periods ----

export function useAcctPeriods() {
  return useQuery({
    queryKey: acctKeys.periods(),
    queryFn: () => adminService.ListAcctPeriods({}),
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    // closed=false + notReady is a normal (non-error) response, not a rejection — the caller
    // renders the checklist from the resolved value; invalidating on success is still correct
    // since a genuine close does change server state.
    mutationFn: (vars: { month: string }) => adminService.CloseAcctPeriod(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { month: string }) => adminService.ReopenAcctPeriod(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// ---- Reports ----
// enabled: Boolean(...) guards stop these firing before a screen has picked dates/account
// (01.3) — report endpoints aren't cheap and a bare mount shouldn't fire one with empty dates.

export function useTrialBalance(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.trialBalance(from, to),
    queryFn: () => adminService.GetTrialBalance({ from, to }),
    enabled: Boolean(from && to),
  });
}

export function useProfitLoss(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.profitLoss(from, to),
    queryFn: () => adminService.GetProfitLossStatement({ from, to }),
    enabled: Boolean(from && to),
  });
}

export function useBalanceSheet(asOf: string) {
  return useQuery({
    queryKey: acctKeys.balanceSheet(asOf),
    queryFn: () => adminService.GetBalanceSheet({ asOf }),
    enabled: Boolean(asOf),
  });
}

// Indirect-method cash-flow statement over [from, to) (exclusive). Same range guard as the other
// range reports — closing_cash / check come from the server, never recomputed here (§8.6 #6).
export function useCashFlow(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.cashFlow(from, to),
    queryFn: () => adminService.GetCashFlowStatement({ from, to }),
    enabled: Boolean(from && to),
  });
}

// Financial-health ratio set over [from, to). Each row carries its own value/benchmark/status, so
// this is a straight pass-through — the client only lays the ratios out, it doesn't compute them.
export function useFinancialHealth(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.financialHealth(from, to),
    queryFn: () => adminService.GetFinancialHealth({ from, to }),
    enabled: Boolean(from && to),
  });
}

export function useAccountLedger(code: string, filter: LedgerFilter) {
  return useQuery({
    queryKey: acctKeys.ledger(code, filter),
    queryFn: () =>
      adminService.GetAccountLedger({
        code,
        from: filter.from || undefined,
        to: filter.to || undefined,
        limit: filter.limit,
        offset: filter.offset,
      }),
    enabled: Boolean(code),
  });
}

export function useReconciliation(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.reconciliation(from, to),
    queryFn: () => adminService.GetAcctReconciliation({ from, to }),
    enabled: Boolean(from && to),
  });
}

// JPK_VAT monthly return (phase 2). `month` is any day within the target filing month; the backend
// normalises it to the 1st. The OSS block is filed separately (GetOssReturn), not here.
export function useVatReturnPL(month: string) {
  return useQuery({
    queryKey: acctKeys.vatReturn(month),
    queryFn: () => adminService.GetVatReturnPL({ month }),
    enabled: Boolean(month),
  });
}

// Quarterly OSS return (phase 2). `quarterStart` is any day within the target quarter; the request
// field is `quarter` (backend snaps it to the quarter's first day).
export function useOssReturn(quarterStart: string) {
  return useQuery({
    queryKey: acctKeys.ossReturn(quarterStart),
    queryFn: () => adminService.GetOssReturn({ quarter: quarterStart }),
    enabled: Boolean(quarterStart),
  });
}

// Quarterly UK VAT return (9-box MTD). Same quarter dimension as OSS; a separate UK jurisdiction.
export function useUkVatReturn(quarterStart: string) {
  return useQuery({
    queryKey: acctKeys.ukVatReturn(quarterStart),
    queryFn: () => adminService.GetUkVatReturn({ quarter: quarterStart }),
    enabled: Boolean(quarterStart),
  });
}

// FRS 105 UK micro-entity accounts draft over [from, to). Base-currency (a DRAFT, per the response
// caveats); the Income Statement is the period, the SoFP is as at `to`.
export function useFrs105Accounts(from: string, to: string) {
  return useQuery({
    queryKey: acctKeys.frs105(from, to),
    queryFn: () => adminService.GetFrs105Accounts({ from, to }),
    enabled: Boolean(from && to),
  });
}

// ---- Fixed assets / depreciation / corporation tax (statutory completeness) ----
// The register drives straight-line depreciation (Dr 6370 / Cr 1225) and the CT accrual closes the
// two FRS 105 completeness gaps the response caveats flag. All three mutations invalidate acctKeys.all
// wholesale — a depreciation charge or CT accrual moves the P&L, SoFP, ledger and the FRS 105 view.

export function useFixedAssets() {
  return useQuery({
    queryKey: acctKeys.fixedAssets(),
    queryFn: () => adminService.ListFixedAssets({}),
  });
}

export function useCreateFixedAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      name: string;
      costBase: googletype_Decimal;
      acquiredOn: string;
      usefulLifeMonths: number;
    }) => adminService.CreateFixedAsset(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// Posts every un-posted monthly charge up to `upTo`'s month. Owns its toast (single-click action with
// no hosting modal); a non-zero `skipped` means closed-period months were not posted (surfaced to the
// caller so they can reopen the period or post a manual catch-up).
export function usePostDepreciation() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { upTo: string }) => adminService.PostDepreciation(vars),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: acctKeys.all });
      const posted = res.posted ?? 0;
      const skipped = res.skipped ?? 0;
      const base = posted === 0 ? 'No depreciation due' : `Posted ${posted} depreciation charge(s)`;
      const tail = skipped > 0 ? ` · ${skipped} skipped (closed periods)` : '';
      showMessage(`${base}${tail}`, skipped > 0 ? 'error' : 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to post depreciation', 'error'),
  });
}

export function useAccrueCorporationTax() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { from: string; to: string; ratePct: googletype_Decimal }) =>
      adminService.AccrueCorporationTax(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

// ---- Event review queue (dead-letter) ----
// The posting worker terminally disposes events it can't auto-post (non-EUR/degenerate orders,
// orphan refunds, dead-letters) and flags them needs_review; the accounting month can't close
// until an operator reprocesses (retry after fixing the cause) or resolves (mark handled after a
// manual journal entry). limit is fixed at 100 — the queue is small by design (backend contract).
// Unlike the other mutations in this file, these two own their own success/error toasts: the
// review actions are one-click terminal decisions with no calling modal to host the feedback.

export function useAcctEventsNeedingReview() {
  return useQuery({
    queryKey: acctKeys.eventsReview(),
    queryFn: () => adminService.ListAcctEventsNeedingReview({ limit: 100 }),
  });
}

export function useReprocessAcctEvent() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number }) => adminService.ReprocessAcctEvent(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acctKeys.eventsReview() });
      qc.invalidateQueries({ queryKey: acctKeys.all });
      showMessage('Event queued for reprocessing', 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to reprocess event', 'error'),
  });
}

export function useResolveAcctEvent() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number }) => adminService.ResolveAcctEvent(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acctKeys.eventsReview() });
      qc.invalidateQueries({ queryKey: acctKeys.all });
      showMessage('Event marked resolved', 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to resolve event', 'error'),
  });
}

// ---- Bank inbox (phase 2, wave 4 — docs/plan-accounting-phase2/04-wave4-money.md §4.1) ----
// The Revolut statement inbox: CSV import → parsed lines the worker couldn't auto-book → an
// operator posts each (Dr/Cr by the signed amount against a chosen account, 1010 being the money
// leg) or ignores it (an internal EXCHANGE leg). Import-time substring rules pre-fill the account
// suggestion. Every mutation invalidates acctKeys.all — a posted line becomes a journal entry that
// moves the ledger, and its inbox state flips, so both the txn list and the reports must refresh.

export function useBankTxns(state: string) {
  return useQuery({
    // state '' means "all" — a real filter key, never disabled (the inbox is the screen's point).
    queryKey: acctKeys.bankTxns(state),
    queryFn: () => adminService.ListBankTxns({ state: state || undefined, limit: 200 }),
  });
}

export function useImportBankCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { source: string; csvText: string }) =>
      adminService.ImportBankCsv({ source: vars.source || undefined, csvText: vars.csvText }),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function usePostBankTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; accountCode: string; occurredAt?: string }) =>
      adminService.PostBankTxn({
        id: vars.id,
        accountCode: vars.accountCode,
        occurredAt: vars.occurredAt || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function useIgnoreBankTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; reason?: string }) =>
      adminService.IgnoreBankTxn({ id: vars.id, reason: vars.reason || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.all }),
  });
}

export function useBankRules() {
  return useQuery({
    queryKey: acctKeys.bankRules(),
    queryFn: () => adminService.ListBankRules({}),
  });
}

export function useCreateBankRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { pattern: string; accountCode: string }) =>
      adminService.CreateBankRule(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.bankRules() }),
  });
}

export function useDeleteBankRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number }) => adminService.DeleteBankRule(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.bankRules() }),
  });
}

// ---- Suppliers + AP/AR subledgers (phase 2, wave 4 — §4.4) ----
// Suppliers are the purchase-side catalog that tags a 2010 Accounts-Payable position; Payables
// aggregates the open 2010 balance per supplier (accrued − paid), Receivables the open 1040 balance
// per bank-invoice order (invoiced − received). Creating a supplier only touches the catalog, so it
// invalidates the suppliers key alone; the AP/AR views are pure ledger reads with no mutations here.

export function useSuppliers() {
  return useQuery({
    queryKey: acctKeys.suppliers(),
    queryFn: () => adminService.ListSuppliers({}),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; vatId?: string; notes?: string }) =>
      adminService.CreateSupplier({
        name: vars.name,
        vatId: vars.vatId || undefined,
        notes: vars.notes || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: acctKeys.suppliers() }),
  });
}

export function usePayables() {
  return useQuery({
    queryKey: acctKeys.payables(),
    queryFn: () => adminService.GetPayables({}),
  });
}

export function useReceivables() {
  return useQuery({
    queryKey: acctKeys.receivables(),
    queryFn: () => adminService.GetReceivables({}),
  });
}
