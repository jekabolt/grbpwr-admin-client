// Entry point of the CONSTRUCTION AUDIT probe: the REAL `ConstructionAudit` from the repo, mounted
// with exactly the context the construction tab gives it and nothing else — form context (the same
// `zodResolver(techCardSchema)` the card uses), a query client, and a `<fieldset disabled>` around
// it. Not one line of the component under test is re-implemented here.
//
// WHY THE FIELDSET IS PART OF THE STAND AND NOT A DETAIL. The construction tab renders inside
// `<fieldset disabled={frozen}>` on a RELEASED card. That is the whole reason the controls in the
// panel are built the way they are — the ref anchor is a `Chip nonForm` (a span) so it survives,
// and «file as issue» changes SHAPE with `frozen`: a real `<button>` writing into the form on a
// live card, a span calling `AddTechCardIssue` on a released one. A stand that mounted the panel
// bare could never tell those apart: everything would just work.
//
// `frozen` IS PASSED TO BOTH THE FIELDSET AND THE COMPONENT, because in production they come from
// the same predicate (`approvalState === RELEASED`). A stand that disabled the fieldset without
// telling the component would be measuring a state the product cannot be in.
//
// THE ISSUE IS READ OUT OF THE FORM, NOT OUT OF THE DOM. `fileAsIssue` writes with `setValue`
// precisely because a second `useFieldArray` would not see it; the probe therefore has to ask the
// form what it holds, which is the same organ the issues tab reads. The FROZEN path writes nowhere
// near the form, so it is read out of the recorded network calls instead — and the fact that those
// two readings are different organs is the point of the split.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

import { ConstructionAudit } from 'components/managers/tech-card/components/construction-audit';
import {
  assignUids,
  findingUid,
  loadAnalysis,
  sha256Hex,
} from 'components/managers/tech-card/components/analysis-identity';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { ANALYZE_CLIENT_BUDGET_MS } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';

type MountOpts = {
  /** No id = the unsaved-card branch. Also the gate on the query itself. */
  techCardId?: number;
  /** The construction tab is open right now. `false` must keep the request from ever leaving. */
  active?: boolean;
  /** RELEASED card: the panel lives under `<fieldset disabled>` AND is told so. */
  frozen?: boolean;
  /** No navigation handler at all — every anchor must degrade to plain text. */
  noGoTab?: boolean;
  /** Type into the form before rendering, so `formState.isDirty` is true. */
  dirty?: boolean;
  /** Steps on the saved card, for the in-flight line. */
  operationCount?: number;
};

type GoCall = [string, Record<string, string> | undefined];

type AuditProbe = {
  mount: (opts: MountOpts) => void;
  /** Every `onGoTab(tab, extra)` this mount has seen, in order. */
  gone: () => GoCall[];
  /** `issues` AS THE FORM HOLDS IT — the array the issues tab reads. */
  issues: () => Record<string, unknown>[];
  /** Snackbar messages, so «filed» can be told from «silently did nothing». */
  alerts: () => string[];
  /** The identity module, so the probe can check the digest against node's own. */
  sha256: (s: string) => string;
  uid: (category: string, refs: string[], titleSalt?: string) => string;
  uidsOf: (findings: unknown[]) => string[];
  /** What the session mirror holds for a card right now. */
  session: (cardId: number) => unknown;
  /** The client budget the shipped code compiled with. */
  budgetMs: () => number;
};

declare global {
  interface Window {
    __audit: AuditProbe;
    /**
     * Read by the stubbed network layer AT CALL TIME, so one bundle serves every case. One entry
     * per RPC the panel can make: they fail independently in production and must be able to fail
     * independently here.
     */
    __auditStub: {
      audit?: { mode: 'ok' | 'error' | 'hang'; response?: unknown };
      analyze?: { mode: 'ok' | 'error' | 'hang'; response?: unknown };
      addIssue?: { mode: 'ok' | 'error'; response?: unknown };
    };
    /** Every method name the stubbed service was asked for. Empty = the query never fired. */
    __auditNetCalls: string[];
    /** The request payload of every AddTechCardIssue call, in order. */
    __auditIssueCalls: unknown[];
  }
}

const gone: GoCall[] = [];
const probe = {} as AuditProbe;
window.__audit = probe;
probe.gone = () => gone;
probe.alerts = () => useSnackBarStore.getState().alerts.map((a) => a.message);
probe.sha256 = sha256Hex;
probe.uid = findingUid;
probe.uidsOf = (findings) => assignUids(findings as never);
probe.session = (cardId) => loadAnalysis(cardId);
probe.budgetMs = () => ANALYZE_CLIENT_BUDGET_MS;

function Harness({
  techCardId,
  active,
  frozen,
  noGoTab,
  dirty,
  operationCount,
}: {
  techCardId?: number;
  active: boolean;
  frozen: boolean;
  noGoTab: boolean;
  dirty: boolean;
  operationCount?: number;
}) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: { ...techCardDefaultData },
  });
  probe.issues = () => (methods.getValues('issues') ?? []) as unknown as Record<string, unknown>[];
  // A DIRTY FORM IS MADE THE WAY A HUMAN MAKES ONE — a real `setValue` with `shouldDirty`, on a
  // field that has nothing to do with this panel. Setting `formState.isDirty` by hand would test
  // the probe's own lie instead of the panel's reading of RHF.
  if (dirty && !methods.formState.isDirty) {
    methods.setValue('notes', 'edited by the operator, not yet saved', { shouldDirty: true });
  }
  // A fresh client per mount: the audit is cached for five minutes, and a shared one would carry
  // the first case's answer into every case after it.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <FormProvider {...methods}>
        {/* The construction tab's own wrapper, verbatim. */}
        <fieldset disabled={frozen}>
          <form>
            <div data-probe-panel>
              <ConstructionAudit
                techCardId={techCardId}
                active={active}
                frozen={frozen}
                operationCount={operationCount}
                onGoTab={
                  noGoTab
                    ? undefined
                    : (tab, extra) => {
                        gone.push([tab, extra]);
                      }
                }
              />
            </div>
          </form>
        </fieldset>
      </FormProvider>
    </QueryClientProvider>
  );
}

probe.mount = (opts) => {
  gone.length = 0;
  useSnackBarStore.setState({ alerts: [] });
  window.__auditNetCalls = [];
  window.__auditIssueCalls = [];
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <Harness
      techCardId={opts.techCardId}
      active={opts.active ?? true}
      frozen={!!opts.frozen}
      noGoTab={!!opts.noGoTab}
      dirty={!!opts.dirty}
      operationCount={opts.operationCount}
    />,
  );
};
