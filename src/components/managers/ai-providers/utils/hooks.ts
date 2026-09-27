import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { adminService } from 'api/api';
import type { AiRouteCandidate, GetAiProvidersConfigResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { extractFieldViolations, fieldErrorSummary, violationReason } from 'utils/field-errors';

// admin → AI providers. Every RPC behind these hooks is SuperOnly on the server; the page asks
// only once the account is known to be super (see page.tsx), the server refuses everyone else.
//
// ONE READ, AND EVERY WRITE ANSWERS WITH IT. GetAiProvidersConfig is the whole panel; each write
// returns the same config, which goes straight into the cache, so the next control is drawn — and
// the next write is checked — against what the server just said, not against a refetch in flight.
export const aiKeys = {
  all: ['ai-providers'] as const,
  config: () => [...aiKeys.all, 'config'] as const,
  spend: (from: string, to: string) => [...aiKeys.all, 'spend', from, to] as const,
};

// ---- Reads ----

export function useAiConfig(enabled = true) {
  return useQuery({
    queryKey: aiKeys.config(),
    queryFn: () => adminService.GetAiProvidersConfig({}),
    // Breakers and fault badges move on their own; a config read older than this is re-asked.
    staleTime: 30_000,
    enabled,
  });
}

// `from` / `to` are calendar days YYYY-MM-DD, inclusive, in the org timezone (the server checks
// from ≤ to and a span of at most 366 days). A new period starts BLANK: no previous report is kept
// as a placeholder, because last month's numbers under this month's label are a wrong answer, not
// a smooth one — the tables say "loading…" until this period's report is in.
export function useAiSpend(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: aiKeys.spend(from, to),
    queryFn: () => adminService.GetAiSpendReport({ fromDay: from, toDay: to }),
    staleTime: 60_000,
    enabled: enabled && Boolean(from) && Boolean(to),
  });
}

// ---- Errors ----

export const STALE_CONFIG_MESSAGE = 'reload — the config changed';

// The optimistic lock (ai_settings.config_version) refuses a write made against an older config
// with FailedPrecondition "the page is stale — reload" (HTTP 400 through the gateway; 409 if it is
// ever moved to Aborted like the tech-card lock). 400 alone is not enough — InvalidArgument and the
// other FailedPrecondition ("AI_KEYS_MASTER_KEY is not set") share it — so the word decides.
export function isStaleConfigError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status } = error as Error & { status?: number };
  return (status === 400 || status === 409) && /\bstale\b/i.test(error.message);
}

// What a refused write says, normalised for the line under the control that made it: the stale
// sentence for the optimistic lock; for a field-tagged refusal (google.rpc.BadRequest, description
// "reason[; how to fix]") the human tail, with the field and the reason code kept so a view can pin
// the line on the right control; otherwise the server's message, or the fallback.
export type AiWriteFailure = { text: string; field: string | null; reason: string | null };

export function aiWriteFailure(error: unknown, fallback: string): AiWriteFailure | null {
  if (!error) return null;
  if (isStaleConfigError(error)) return { text: STALE_CONFIG_MESSAGE, field: null, reason: null };
  const [v] = extractFieldViolations(error);
  if (v) {
    const cut = v.description.indexOf(';');
    const tail = cut >= 0 ? v.description.slice(cut + 1).trim() : '';
    return {
      text: tail || v.description,
      field: v.field || null,
      reason: violationReason(v.description) || null,
    };
  }
  const message = error instanceof Error ? error.message.trim() : '';
  return { text: message || fallback, field: null, reason: null };
}

// ---- Writes ----

// Every AI write runs in this one queue. A write is checked against the config_version it read,
// and each accepted write bumps it: two autosaves fired together (two switches flipped in a row)
// would otherwise both carry the same version and the second would come back "stale" for the
// operator's own first change. Queued, the second starts after the first has put its answer (and
// the new version) into the cache.
const WRITE_SCOPE = { id: 'ai-providers-config' };

// The version the screen is drawn from — what a versioned write is checked against. Read when the
// write actually runs (after any queued write before it), never captured by the view.
function expectedVersion(qc: QueryClient): number {
  const version = qc.getQueryData<GetAiProvidersConfigResponse>(aiKeys.config())?.configVersion;
  // uint64 arrives as a JSON string ("42"); it goes back exactly as it came. Only absence is an
  // error: no config in hand means there is nothing the write could be checked against.
  if (version === undefined || version === null) {
    throw new Error('the AI config has not loaded yet; reload the page');
  }
  return version;
}

// ONE ANNOUNCEMENT PER REFUSAL. The control that made a write draws its refusal under itself
// (WriteError, role=alert), and that line IS the announcement: a snackbar saying it again would
// interrupt a screen reader twice for one answer. So a refusal goes to the snackbar only when its
// owner is gone — the panel closed or the view switched before the answer came — and there is no
// line left to stand in. The reads (config, spend) keep their own callouts.
function useAiWrite(failed: string) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const ownerOnScreen = useRef(false);
  useEffect(() => {
    ownerOnScreen.current = true;
    return () => {
      ownerOnScreen.current = false;
    };
  }, []);
  return {
    qc,
    done: (config: GetAiProvidersConfigResponse | undefined, message: string) => {
      if (config) qc.setQueryData(aiKeys.config(), config);
      showMessage(message, 'success');
    },
    onError: (error: unknown) => {
      if (ownerOnScreen.current) return;
      // Said away from its control, the sentence names the write it answers.
      showMessage(
        isStaleConfigError(error)
          ? STALE_CONFIG_MESSAGE
          : `${failed}: ${fieldErrorSummary(error, failed)}`,
        'error',
      );
    },
    // Success or not, the screen is re-read: a refused autosave must snap its control back to what
    // the server holds. Returned, so the next queued write waits for the fresh config.
    onSettled: () => qc.invalidateQueries({ queryKey: aiKeys.all }),
  };
}

// Each write hook hands the view its own normalised refusal (`failure`) beside the mutation: the
// line under the control that failed reads it; it goes away when that control writes again.
function withFailure<M extends { error: unknown }>(
  mutation: M,
  fallback: string,
): M & { failure: AiWriteFailure | null } {
  return { ...mutation, failure: aiWriteFailure(mutation.error, fallback) };
}

// Common to every write: a refusal is shown at once — a stale version or a validation error is
// the same answer the second time, and a retried key write would probe the provider twice.
const WRITE_OPTIONS = { retry: false, scope: WRITE_SCOPE } as const;

export type UpdateAiProviderVars = { providerKey: string; enabled: boolean };

// The provider's switch. Off stops new calls through it; its routes stay and skip it.
export function useUpdateAiProvider() {
  const w = useAiWrite("couldn't switch the provider");
  const m = useMutation({
    ...WRITE_OPTIONS,
    mutationFn: (vars: UpdateAiProviderVars) =>
      adminService.UpdateAiProvider({
        providerKey: vars.providerKey,
        enabled: vars.enabled,
        expectedVersion: expectedVersion(w.qc),
      }),
    onSuccess: (resp, vars) =>
      w.done(resp.config, `${vars.providerKey} switched ${vars.enabled ? 'on' : 'off'}`),
    onError: w.onError,
    onSettled: w.onSettled,
  });
  return withFailure(m, "couldn't switch the provider");
}

// api = the key calls are made with; admin = the reconciliation key a cost API needs (openai,
// anthropic, fal only).
export type AiKeyKind = 'api' | 'admin';

export type SetAiProviderKeyVars = { providerKey: string; kind: AiKeyKind; value: string };

// Stores (value) or clears ("") one key slot. The answer carries the probe of the just-saved key
// (`probe`, unset after a clear) for the row to show; the toast says only that it was stored.
// The value is write-only: it is never put in a message, and the finished mutation — whose
// variables hold it — is dropped from the cache at once instead of lingering for five minutes.
export function useSetAiProviderKey() {
  const w = useAiWrite("couldn't save the key");
  const m = useMutation({
    ...WRITE_OPTIONS,
    gcTime: 0,
    mutationFn: (vars: SetAiProviderKeyVars) =>
      adminService.SetAiProviderKey({
        providerKey: vars.providerKey,
        kind: vars.kind,
        value: vars.value,
      }),
    onSuccess: (resp, vars) => {
      const slot = vars.kind === 'admin' ? 'reconciliation key' : 'key';
      w.done(resp.config, `${vars.providerKey} ${slot} ${vars.value ? 'saved' : 'cleared'}`);
    },
    onError: w.onError,
    // THE SECRET IS BLANKED THE MOMENT THE WRITE SETTLES, in the mutation's own variables — the
    // very object the cache holds — before the re-read is awaited. The view's per-call reset()
    // still detaches the observer, and gcTime 0 still drops the mutation, but both come later
    // (after the re-read, on a timer); until then the cache must hold nothing worth reading.
    onSettled: (_data, _error, vars) => {
      vars.value = '';
      return w.onSettled();
    },
  });
  // The key slot keeps its own copy of the refusal: it resets this mutation the moment the write
  // settles (the key must not stay in `variables`), and a reset clears `error` with it.
  return withFailure(m, "couldn't save the key");
}

// Both defaults go every time; "" leaves that one unchanged.
export type SetAiDefaultsVars = { chatProviderKey: string; imageProviderKey: string };

export function useSetAiDefaults() {
  const w = useAiWrite("couldn't save the defaults");
  const m = useMutation({
    ...WRITE_OPTIONS,
    mutationFn: (vars: SetAiDefaultsVars) =>
      adminService.SetAiDefaults({
        chatProviderKey: vars.chatProviderKey,
        imageProviderKey: vars.imageProviderKey,
        expectedVersion: expectedVersion(w.qc),
      }),
    onSuccess: (resp) => w.done(resp.config, 'defaults saved'),
    onError: w.onError,
    onSettled: w.onSettled,
  });
  return withFailure(m, "couldn't save the defaults");
}

// One purpose's whole route: the primary (required) and the fallback (absent = none) go together
// every time, so a change to either never leaves the other to a server default.
export type SetAiRouteVars = {
  purpose: string;
  primary: AiRouteCandidate;
  fallback?: AiRouteCandidate;
};

export function useSetAiRoute() {
  const w = useAiWrite("couldn't save the route");
  const m = useMutation({
    ...WRITE_OPTIONS,
    mutationFn: (vars: SetAiRouteVars) =>
      adminService.SetAiRoute({
        purpose: vars.purpose,
        primary: vars.primary,
        fallback: vars.fallback,
        expectedVersion: expectedVersion(w.qc),
      }),
    onSuccess: (resp) => w.done(resp.config, 'route saved'),
    onError: w.onError,
    onSettled: w.onSettled,
  });
  return withFailure(m, "couldn't save the route");
}
