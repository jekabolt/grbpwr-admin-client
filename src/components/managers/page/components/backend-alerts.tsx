import type { AlertSeverity, DashboardAlert } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

// Deep-links by DashboardAlert.code (06-implementation-order.md §Шаг 6b). An unknown/new code
// still renders — just without a link — so this stays forward-compatible with alert codes added
// on the backend before the client catches up.
const ALERT_LINKS: Record<string, string> = {
  acct_posting_lag: `${ROUTES.accountingReports}?tab=recon`,
  acct_manual_entry_required: `${ROUTES.accountingReports}?tab=recon`,
  acct_reconciliation_drift: `${ROUTES.accountingReports}?tab=recon`,
  low_material_stock: ROUTES.materials,
  stale_open_production_run: ROUTES.productionRuns,
};

// Mirrors ExecutiveHealthStrip's ALERT_TITLE_CLASS (high/warning) one-for-one, extended for the
// two extra AlertSeverity values the backend enum carries — 'info' and the unspecified default
// both read as plain body text, i.e. present but not alarming.
const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  ALERT_SEVERITY_CRITICAL: 'text-error',
  ALERT_SEVERITY_WARNING: 'text-warning',
  ALERT_SEVERITY_INFO: 'text-textColor',
  ALERT_SEVERITY_UNSPECIFIED: 'text-textColor',
};

export interface BackendAlertsProps {
  alerts: DashboardAlert[] | undefined;
}

// Bridges GetDashboardResponse.alerts (server-computed: acct_* posting-lag/reconciliation
// alerts, low_material_stock, stale_open_production_run, …) onto the dashboard — until now the
// client fetched this field but never rendered it (06 §Шаг 6b "found on the fly": the only
// alerts visible on the main page were the client-derived ones in ExecutiveHealthStrip /
// executiveAlerts.ts). Styled as a compact list in the same family as the Health-strip's own
// "Act now" block rather than duplicating its card chrome.
export const BackendAlerts: FC<BackendAlertsProps> = ({ alerts }) => {
  const list = alerts ?? [];
  if (list.length === 0) return null;

  return (
    <div className='flex flex-col gap-2 border-2 border-textInactiveColor/15 bg-bgSecondary/20 p-4'>
      <Text variant='uppercase' className='text-textBaseSize font-semibold text-textInactiveColor'>
        Backend alerts
      </Text>
      <ul className='flex flex-col gap-2'>
        {list.map((a, i) => {
          const href = a.code ? ALERT_LINKS[a.code] : undefined;
          const severityClass = (a.severity && SEVERITY_CLASS[a.severity]) || 'text-textColor';
          return (
            <li key={`${a.code ?? 'alert'}-${i}`} className='text-textBaseSize leading-snug'>
              <span className={cn('font-semibold', severityClass)}>
                {a.title || a.code || 'Alert'}
              </span>
              {a.detail && (
                <Text className='mt-0.5 block text-textBaseSize text-textInactiveColor'>
                  {a.detail}
                </Text>
              )}
              {href && (
                <Link
                  to={href}
                  className='mt-0.5 inline-block text-textBaseSize underline underline-offset-2 hover:text-textColor'
                >
                  Open →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
