import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AcctJournalLineInput } from 'api/proto-http/admin';
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
  ledger: (code: string, f: LedgerFilter) => [...acctKeys.all, 'ledger', code, f] as const,
  reconciliation: (from: string, to: string) => [...acctKeys.all, 'recon', from, to] as const,
  vatReturn: (month: string) => [...acctKeys.all, 'vat-return', month] as const,
  ossReturn: (q: string) => [...acctKeys.all, 'oss-return', q] as const,
  eventsReview: () => [...acctKeys.all, 'events-review'] as const,
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
    }) => adminService.CreateJournalEntry(vars),
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
