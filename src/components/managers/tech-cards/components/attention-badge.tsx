import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Chip } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';
import { Row } from 'ui/components/row';

const DAY = 86_400_000;
const ageDays = (ts?: string) => (ts ? (Date.now() - new Date(ts).getTime()) / DAY : 0);

// "What needs attention" across the flow, surfaced where the styles live (R-6): materials below
// their min stock, production runs sitting too long, and fittings due this week. Each fragment is a
// deep link and only shows when its count is > 0; the badge disappears entirely when all clear.
// Every fragment is gated on the account's read access to its section (and its query only fires
// then).
//
// 6.3 — nothing sits above the list any more. The counter rides in the page title row and opens a
// popover with the detail, so the room you enter first opens on the styles themselves.
export function AttentionBadge() {
  const { canRead } = usePermissions();
  const canStock = canRead(SECTION.techCards);
  const canRuns = canRead(SECTION.production);
  const canFittings = canRead(SECTION.fittings);

  const belowMin = useQuery({
    queryKey: ['attention', 'belowMin'],
    queryFn: () =>
      adminService.ListMaterialStock({
        section: '',
        q: '',
        withStockOnly: false,
        belowMinOnly: true,
      }),
    enabled: canStock,
  });
  const belowMinCount = belowMin.data?.rows?.length ?? 0;

  const alertSettings = useQuery({
    queryKey: ['attention', 'alertSettings'],
    queryFn: () => adminService.GetAlertSettings({}),
    enabled: canRuns,
  });
  const staleDays = alertSettings.data?.settings?.productionRunStaleDays || 14;

  // #10: one server-side stale query — stale_days returns only the non-terminal runs sitting at
  // least that long, so the 200-row cap no longer drops exactly the old runs we're counting. Wait
  // for the alert settings (success OR error → 14 fallback) so the threshold is resolved before the
  // query fires, and re-run if the setting changes (staleDays is in the key).
  const staleRunsQuery = useQuery({
    queryKey: ['attention', 'runs', 'stale', staleDays],
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: undefined,
        status: undefined,
        limit: 200,
        offset: 0,
        staleDays,
        overdueOnly: undefined,
      }),
    enabled: canRuns && !alertSettings.isLoading,
  });
  const staleRuns = staleRunsQuery.data?.total ?? staleRunsQuery.data?.runs?.length ?? 0;

  const fittings = useQuery({
    queryKey: ['attention', 'fittings'],
    queryFn: () =>
      adminService.ListFittings({
        limit: 100,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        productId: 0,
        modelId: 0,
        techCardId: 0,
      }),
    enabled: canFittings,
  });
  const fittingsThisWeek = (fittings.data?.fittings ?? []).filter((f) => {
    if (f.fitting?.status !== 'FITTING_STATUS_PLANNED') return false;
    const d = ageDays(f.fitting?.fittingDate); // negative = in the future
    // d < 1 (not <= 0): a fitting planned for this morning must not drop off the badge
    // mid-day just because its timestamp is now a few hours in the past.
    return d < 1 && d > -7;
  }).length;

  const alerts: { key: string; label: string; count: number; to: string }[] = [];
  if (belowMinCount > 0)
    alerts.push({
      key: 'belowMin',
      label: 'materials below min',
      count: belowMinCount,
      to: `${ROUTES.materials}?tab=stock&belowMin=1`,
    });
  if (staleRuns > 0)
    alerts.push({
      key: 'runs',
      label: `runs stale ${staleDays}d+`,
      count: staleRuns,
      // ?stale=<days> — the runs list runs the same server-side stale_days query, so the link
      // shows exactly the counted runs instead of the full unfiltered list.
      to: `${ROUTES.productionRuns}?stale=${staleDays}`,
    });
  if (fittingsThisWeek > 0)
    alerts.push({
      key: 'fittings',
      label: 'fittings this week',
      count: fittingsThisWeek,
      to: ROUTES.fittings,
    });

  if (alerts.length === 0) return null;

  const total = alerts.reduce((sum, a) => sum + a.count, 0);

  return (
    <GenericPopover
      title='needs attention'
      className='w-[270px]'
      triggerProps={{ 'aria-label': `${total} things need attention` }}
      openElement={<Chip tone='error'>⚠ {total}</Chip>}
    >
      {alerts.map((a) => (
        <Link key={a.key} to={a.to} className='block hover:text-textColor'>
          <Row label={a.label} value={a.count} />
        </Link>
      ))}
    </GenericPopover>
  );
}
