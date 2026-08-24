// Entry point of the CONSTRUCTION AUDIT probe: the REAL `ConstructionAudit` from the repo, mounted
// with exactly the context the construction tab gives it and nothing else — form context (the same
// `zodResolver(techCardSchema)` the card uses), a query client, and a `<fieldset disabled>` around
// it. Not one line of the component under test is re-implemented here.
//
// WHY THE FIELDSET IS PART OF THE STAND AND NOT A DETAIL. The construction tab renders inside
// `<fieldset disabled={frozen}>` on a RELEASED card. That is the whole reason the two controls in
// the panel are built differently — the ref anchor is a `Chip nonForm` (a span) so it survives, the
// «file as issue» control is a real `<button>` so the fieldset kills it. A stand that mounts the
// panel bare could never tell those two apart: both would just work.
//
// THE ISSUE IS READ OUT OF THE FORM, NOT OUT OF THE DOM. `fileAsIssue` writes with `setValue`
// precisely because a second `useFieldArray` would not see it; the probe therefore has to ask the
// form what it holds, which is the same organ the issues tab reads.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

import { ConstructionAudit } from 'components/managers/tech-card/components/construction-audit';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { useSnackBarStore } from 'lib/stores/store';

type MountOpts = {
  /** No id = the unsaved-card branch. Also the gate on the query itself. */
  techCardId?: number;
  /** The construction tab is open right now. `false` must keep the request from ever leaving. */
  active?: boolean;
  /** RELEASED card: the panel lives under `<fieldset disabled>`. */
  frozen?: boolean;
  /** No navigation handler at all — every anchor must degrade to plain text. */
  noGoTab?: boolean;
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
};

declare global {
  interface Window {
    __audit: AuditProbe;
    /** Read by the stubbed network layer at call time, so one bundle serves every case. */
    __auditStub: { mode: 'ok' | 'error' | 'hang'; response?: unknown };
    /** Every method name the stubbed service was asked for. Empty = the query never fired. */
    __auditNetCalls: string[];
  }
}

const gone: GoCall[] = [];
const probe = {} as AuditProbe;
window.__audit = probe;
probe.gone = () => gone;
probe.alerts = () => useSnackBarStore.getState().alerts.map((a) => a.message);

function Harness({
  techCardId,
  active,
  frozen,
  noGoTab,
}: {
  techCardId?: number;
  active: boolean;
  frozen: boolean;
  noGoTab: boolean;
}) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: { ...techCardDefaultData },
  });
  probe.issues = () => (methods.getValues('issues') ?? []) as unknown as Record<string, unknown>[];
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
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <Harness
      techCardId={opts.techCardId}
      active={opts.active ?? true}
      frozen={!!opts.frozen}
      noGoTab={!!opts.noGoTab}
    />,
  );
};
