import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';

const DAY = 86_400_000;
const ageDays = (ts?: string) => (ts ? (Date.now() - new Date(ts).getTime()) / DAY : 0);
const NON_TERMINAL = new Set(['planned', 'in_progress']);

// "What needs attention" across the flow, surfaced where the styles live (R-6): materials below
// their min stock, production runs sitting too long, and fittings due this week. Each fragment is a
// deep link and only shows when its count is > 0; the whole strip disappears when all clear. Every
// fragment is gated on the account's read access to its section (and its query only fires then).
export function AttentionStrip() {
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

  const alerts = useQuery({
    queryKey: ['attention', 'alertSettings'],
    queryFn: () => adminService.GetAlertSettings({}),
    enabled: canRuns,
  });
  const staleDays = alerts.data?.settings?.productionRunStaleDays || 14;

  // Fetch status-filtered pages (one per non-terminal status) so the 200-row cap applies to the
  // relevant subset: unfiltered newest-first paging dropped exactly the OLD planned/in-progress
  // runs — the ones most likely stale — silently undercounting (potentially to 0).
  const plannedRuns = useQuery({
    queryKey: ['attention', 'runs', 'planned'],
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: undefined,
        status: 'planned',
        limit: 200,
        offset: 0,
      }),
    enabled: canRuns,
  });
  const inProgressRuns = useQuery({
    queryKey: ['attention', 'runs', 'in_progress'],
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: undefined,
        status: 'in_progress',
        limit: 200,
        offset: 0,
      }),
    enabled: canRuns,
  });
  const staleRuns = [
    ...(plannedRuns.data?.runs ?? []),
    ...(inProgressRuns.data?.runs ?? []),
  ].filter((r) => {
    if (
      !NON_TERMINAL.has(
        r.run?.status ? r.run.status.replace('PRODUCTION_RUN_STATUS_', '').toLowerCase() : '',
      )
    )
      return false;
    return ageDays(r.run?.startedAt ?? r.createdAt) >= staleDays;
  }).length;

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
    // d < 1 (not <= 0): a fitting planned for this morning must not drop off the strip
    // mid-day just because its timestamp is now a few hours in the past.
    return d < 1 && d > -7;
  }).length;

  const fragments: { key: string; label: string; to: string }[] = [];
  if (belowMinCount > 0)
    fragments.push({
      key: 'belowMin',
      label: `${belowMinCount} material${belowMinCount > 1 ? 's' : ''} below min`,
      to: `${ROUTES.materials}?tab=stock&belowMin=1`,
    });
  if (staleRuns > 0)
    fragments.push({
      key: 'runs',
      label: `${staleRuns} run${staleRuns > 1 ? 's' : ''} stale ${staleDays}d+`,
      // ?stale=<days> — the runs list applies the same client-side staleness filter, so the
      // link shows exactly the counted runs instead of the full unfiltered list.
      to: `${ROUTES.productionRuns}?stale=${staleDays}`,
    });
  if (fittingsThisWeek > 0)
    fragments.push({
      key: 'fittings',
      label: `${fittingsThisWeek} fitting${fittingsThisWeek > 1 ? 's' : ''} this week`,
      to: ROUTES.fittings,
    });

  if (fragments.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 border border-textInactiveColor px-3 py-2'>
      <Text size='small'>!</Text>
      {fragments.map((f, i) => (
        <span key={f.key} className='flex items-center gap-2'>
          {i > 0 ? <span className='text-textInactiveColor'>·</span> : null}
          <Link to={f.to} className='underline'>
            <Text size='small'>{f.label}</Text>
          </Link>
        </span>
      ))}
    </div>
  );
}
