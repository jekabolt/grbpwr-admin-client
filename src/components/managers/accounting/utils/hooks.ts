import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AcctJournalLineInput } from 'api/proto-http/admin';

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
