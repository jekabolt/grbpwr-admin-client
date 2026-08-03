import { common_ProductionRun, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  daysPast,
  isRunOpen,
  overdueDays,
} from 'components/managers/production-runs/components/options';
import { RunCard } from 'components/managers/production-runs/components/run-card';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { ROUTES, SECTION } from 'constants/routes';
import { Controller, useFormContext } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Section, SectionStack } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';

// The style's production side, in the tech card rather than only in the separate /production-runs
// manager. The runs always existed; the owner of the system did not know they did, because the only
// path to them was a single [plan run] link on the lifecycle strip. That is a discoverability bug,
// and the fix is to put the batches where the style lives.
//
// Deliberately NOT gated on costing:read. The backend's stripProductionRunCosting already redacts
// every money field from a run payload while keeping the quantities and defect_pct_actual, so a
// warehouse role sees a coherent money-blind view: how many were planned, how many came back good,
// how many were defective, and what is late. Hiding the tab from them would hide the receiving work
// itself, which is the one thing that role is for.
export function ProductionTab({
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
  frozen,
}: {
  techCardId: number;
  techCard?: common_TechCard;
  /** tech_cards:write — gates the drop date, which is a TECH-CARD field. */
  canEdit: boolean;
  canReadCosting: boolean;
  /** A RELEASED card is frozen server-side: UpdateTechCard rejects the whole payload. */
  frozen: boolean;
}) {
  const form = useFormContext<TechCardFormData>();
  // Two different permissions meet on this tab and must not be conflated: the drop date is written
  // through UpdateTechCard (tech_cards:write, the `canEdit` prop), while planning a batch is a
  // production write. An account with one and not the other is normal — a designer sets the drop
  // date; the factory coordinator books the runs.
  const { canWrite } = usePermissions();
  const canPlanRuns = canWrite(SECTION.production);
  // enabled only with a real card id: techCardId 0 is sent as undefined and would list EVERY
  // run in the system as this style's batches.
  const { data, isLoading, isError } = useProductionRuns(techCardId, '', 0, false, techCardId > 0);
  const runs: common_ProductionRun[] = data?.runs ?? [];

  const summary = summarise(runs);
  const dropDate = form.watch('targetDropDate');
  const dropIn = daysPast(dropDate ? `${dropDate}T00:00:00Z` : undefined);
  // Planned defect allowance from the costing block. Present only for a costing role — the server
  // nulls the whole costing block otherwise — so the plan side of the comparison simply drops out
  // for everyone else while the actual, a quantity, stays.
  const defectPlan = techCard?.techCard?.costing?.defectPercent?.value;

  return (
    <SectionStack>
      <Section
        title='план дропа'
        question='— the date this style is due, and the batches promising against it'
        action={
          // The existing deep link into the runs manager, which seeds the tech card and opens the
          // create modal. Withheld without production:write — that modal refuses to open for such
          // an account, so the button would go nowhere.
          canPlanRuns ? (
            <Button asChild variant='secondary' size='sm' className='uppercase'>
              <Link to={`${ROUTES.productionRuns}?techCardId=${techCardId}&new=1`}>
                создать партию
              </Link>
            </Button>
          ) : undefined
        }
      >
        <div className='flex flex-wrap items-end gap-4'>
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              target drop date
            </Text>
            <Controller
              control={form.control}
              name='targetDropDate'
              render={({ field }) => (
                <input
                  type='date'
                  className='border border-borderColor bg-bgColor px-2 py-1 text-textBaseSize'
                  // Frozen is checked here rather than by the disabled fieldset the spec tabs sit
                  // in: this tab must stay usable on a released card (that is exactly when batches
                  // get planned), so the freeze is applied to the one control it actually governs.
                  disabled={!canEdit || frozen}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
          </label>
          {/* A past drop date on a shipped style is history, not an alarm — «просрочен» forever on
              every old card would train people to ignore the one place it matters (open batches). */}
          <Text variant='inactive' size='small'>
            {!dropDate
              ? 'дата дропа не задана — партиям не с чем сверяться'
              : dropIn == null
                ? '—'
                : dropIn > 0
                  ? runs.some((r) => isRunOpen(r.run?.status))
                    ? `дроп просрочен на ${dropIn} дн, партии ещё открыты`
                    : `дроп прошёл ${dropIn} дн назад`
                  : dropIn === 0
                    ? 'дроп сегодня'
                    : `до дропа ${-dropIn} дн`}
          </Text>
          {frozen ? (
            <Text variant='inactive' size='small'>
              карта released и заморожена — дату дропа можно менять только после возврата в draft
            </Text>
          ) : null}
        </div>
      </Section>

      {/* Roll-up of every batch of this style. Quantities always; money only for a costing role,
          and only when plan and fact are actually comparable (see comparableUnitCosts). */}
      <StatGrid>
        <Stat label='партий' value={String(runs.length)} />
        <Stat label='план, шт' value={summary.plannedQty > 0 ? String(summary.plannedQty) : '—'} />
        <Stat
          label='принято годных'
          value={summary.anyReceived ? String(summary.receivedQty) : '—'}
          sub={
            summary.anyReceived && summary.plannedQty > 0
              ? `${Math.round((summary.receivedQty / summary.plannedQty) * 100)}% плана`
              : undefined
          }
        />
        {canReadCosting ? (
          <Stat
            label='план / шт'
            value={summary.planUnit != null ? summary.planUnit.toFixed(2) : '—'}
            sub={summary.comparableRuns > 0 ? `${summary.baseCurrency}` : 'нет сопоставимых партий'}
          />
        ) : null}
        {canReadCosting ? (
          <Stat
            label='факт / шт'
            value={summary.factUnit != null ? summary.factUnit.toFixed(2) : '—'}
            sub={
              summary.planUnit != null && summary.factUnit != null
                ? `Δ ${(summary.factUnit - summary.planUnit).toFixed(2)}`
                : undefined
            }
            // Over the frozen plan is money lost; under it is money saved.
            tone={
              summary.planUnit != null && summary.factUnit != null
                ? summary.factUnit > summary.planUnit
                  ? 'down'
                  : 'up'
                : undefined
            }
          />
        ) : null}
        <Stat
          label='брак план / факт'
          value={`${defectPlan ? Number(defectPlan).toFixed(1) : '—'} / ${
            summary.defectPct != null ? summary.defectPct.toFixed(1) : '—'
          }`}
          sub='%'
          tone={
            defectPlan && summary.defectPct != null && summary.defectPct > Number(defectPlan)
              ? 'down'
              : undefined
          }
        />
        <Stat
          label='опаздывает'
          value={String(summary.overdue)}
          tone={summary.overdue > 0 ? 'down' : undefined}
        />
      </StatGrid>

      {/* The batches themselves. RunCards are their own bordered surfaces, so they sit on the
          ground beside the blocks above rather than nested inside one (box-in-box). */}
      <div className='flex flex-col gap-3'>
        {isLoading ? (
          <Text size='small'>loading…</Text>
        ) : isError ? (
          <Text size='small'>Failed to load production runs — refresh to retry.</Text>
        ) : runs.length === 0 ? (
          <Text variant='inactive' size='small'>
            {canPlanRuns
              ? 'партий пока нет — «создать партию» открывает планирование первой'
              : 'партий пока нет'}
          </Text>
        ) : (
          runs.map((r) => (
            // No action callbacks: editing, receiving and deleting a run own modals that live on
            // the runs manager. The card links into the run's own page, which is where they are.
            <RunCard key={r.id} run={r} canEdit={canPlanRuns} canReadCosting={canReadCosting} />
          ))
        )}
      </div>
    </SectionStack>
  );
}

// Style-level roll-up across a card's runs.
//
// Quantities are summed from the runs' own actuals (which survive the costing strip). Money is not
// summed naively: a run's frozen planned unit cost is only comparable to its actual when the server
// judged it to be in the base currency, which it signals by emitting plannedTotalBase at all. So
// plan and fact are both summed over the SAME subset of runs — the ones with a comparable plan and
// a trustworthy base total — or the comparison would silently mix an FX-shifted plan into one side.
function summarise(runs: common_ProductionRun[]) {
  let plannedQty = 0;
  let receivedQty = 0;
  let defectQty = 0;
  let anyReceived = false;
  let overdue = 0;
  let comparableRuns = 0;
  let planTotal = 0;
  let factTotal = 0;
  let comparableQty = 0;
  let baseCurrency = '';

  for (const r of runs) {
    const a = r.actuals;
    // A cancelled batch is not unmet demand: counting its plan made «принято N% плана» read as a
    // production shortfall on styles where nothing was short. Its received/defect stay counted —
    // goods that DID arrive before a cancel are real.
    if (r.run?.status !== 'PRODUCTION_RUN_STATUS_CANCELLED') {
      plannedQty += a?.plannedQtyTotal ?? 0;
    }
    const recv = a?.receivedQtyTotal ?? 0;
    const defect = a?.defectQtyTotal ?? 0;
    receivedQty += recv;
    defectQty += defect;
    if (recv > 0 || defect > 0) anyReceived = true;
    if (overdueDays(r.run?.promisedAt, r.run?.status) > 0) overdue += 1;

    // plannedTotalBase is emitted only when planned_unit_cost is in the base currency AND the run
    // received something; hasBase false means some article could not be folded, so the actual total
    // understates. Either one disqualifies the run from the comparison.
    const planned = a?.plannedTotalBase?.value;
    const actual = a?.actualTotalBase?.value;
    if (planned && actual && a?.hasBase && recv > 0) {
      comparableRuns += 1;
      comparableQty += recv;
      planTotal += Number(planned);
      factTotal += Number(actual);
      // The currency label must come from a run that is actually IN the average above.
      if (a?.baseCurrency) baseCurrency = a.baseCurrency;
    }
  }

  const produced = receivedQty + defectQty;
  return {
    plannedQty,
    receivedQty,
    defectQty,
    anyReceived,
    overdue,
    comparableRuns,
    baseCurrency,
    // Same denominator the server uses for defect_pct_actual: what came off the line, not what
    // passed. Aggregated from the quantities rather than by averaging per-run percentages, which
    // would weight a 3-unit batch the same as a 300-unit one.
    defectPct: produced > 0 ? (defectQty / produced) * 100 : null,
    planUnit: comparableQty > 0 ? planTotal / comparableQty : null,
    factUnit: comparableQty > 0 ? factTotal / comparableQty : null,
  };
}
