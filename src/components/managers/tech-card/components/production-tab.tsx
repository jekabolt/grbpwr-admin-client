import { common_ProductionRun, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  daysPast,
  isRunOpen,
  runDate,
} from 'components/managers/production-runs/components/options';
import { RunTable, runQty } from 'components/managers/production-runs/components/run-rows';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { ROUTES, SECTION } from 'constants/routes';
import { Controller, useFormContext } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Row } from 'ui/components/row';
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
//
// TWO blocks, in the order the questions are asked: the DATE this style owes, then the batches
// promising against it. The tab used to open with seven equally-weighted stat cells mixing units,
// money and defect rates — «опаздывает 0» printed as large as «план 1 040 шт» — while the one
// relation the block is named after (do the batches land before the drop?) was left for the reader
// to work out from two dates in different places. `slack` computes it.
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

  // THE ONE DERIVED FACT THIS TAB OWES ITS READER: will the batches be there by the drop?
  //
  // Measured against the LAST promise still outstanding — a closed batch's promise is history and
  // a cancelled one was never going to arrive. Both sides are reduced to "days from today" by the
  // same helper before subtracting, so the difference is exact whatever the timezone.
  const openPromises = runs
    .filter((r) => isRunOpen(r.run?.status) && runDate(r.run?.promisedAt))
    .map((r) => ({
      id: r.id,
      promisedAt: r.run?.promisedAt,
      past: daysPast(r.run?.promisedAt) ?? 0,
    }))
    // The LATEST promise is the one with the fewest days past (i.e. furthest into the future).
    .sort((a, b) => a.past - b.past);
  const lastPromise = openPromises[0];
  const slack = lastPromise != null && dropIn != null ? lastPromise.past - dropIn : undefined;
  const openRunCount = runs.filter((r) => isRunOpen(r.run?.status)).length;
  // A promise the factory has ALREADY missed cannot cover a future drop, however much calendar
  // sits between the two dates. Without this, a batch promised ten days ago and never delivered
  // reported «+30 дн запаса» in green while the goods do not exist.
  const promiseMissed = lastPromise != null && lastPromise.past > 0;
  const dropPassedWithOpenRuns = dropIn != null && dropIn > 0 && openRunCount > 0;

  return (
    <SectionStack>
      <Section
        title='дата дропа'
        question='— когда стиль обязан быть на складе, и успевают ли партии к этой дате'
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
          {/* Rows, not a second StatGrid: a StatGrid is its own surface and must not be nested in a
              block (DESIGN.md), and three dates comparing to each other read as a ledger anyway. */}
          <div className='min-w-[280px] flex-1'>
            <Row
              label='дроп'
              // A past drop date on a shipped style is history, not an alarm — «просрочен» forever
              // on every old card would train people to ignore the one place it matters (open
              // batches).
              tone={dropPassedWithOpenRuns ? 'error' : undefined}
              value={
                !dropDate || dropIn == null
                  ? '—'
                  : dropIn > 0
                    ? `прошёл ${dropIn} дн назад${dropPassedWithOpenRuns ? ' · партии ещё открыты' : ''}`
                    : dropIn === 0
                      ? 'сегодня'
                      : `через ${-dropIn} дн`
              }
            />
            <Row
              label='последняя обещанная'
              value={
                lastPromise
                  ? `${runDate(lastPromise.promisedAt)} · PR-${lastPromise.id}`
                  : openRunCount > 0
                    ? 'открытые партии без обещанной даты'
                    : 'открытых партий нет'
              }
            />
            <Row
              label='запас до дропа'
              tone={slack != null && (slack < 0 || promiseMissed) ? 'error' : undefined}
              value={
                slack == null ? (
                  <span className='text-labelColor'>нужны дата дропа и открытая партия</span>
                ) : promiseMissed ? (
                  // The arithmetic is still shown — it is just not a reassurance any more.
                  `${slack > 0 ? '+' : ''}${slack} дн · обещание уже просрочено`
                ) : slack < 0 ? (
                  `${slack} дн · партия обещана позже дропа`
                ) : (
                  <span className='text-success'>{`+${slack} дн · партии укладываются в дату`}</span>
                )
              }
            />
          </div>
        </div>
        {frozen ? (
          <Text variant='label' size='micro'>
            карта released и заморожена — дату дропа можно менять только после возврата в draft
          </Text>
        ) : null}
        {!dropDate ? (
          <Text variant='label' size='micro'>
            дата дропа не задана — партиям не с чем сверяться
          </Text>
        ) : null}
      </Section>

      {/* Four cells, not seven, and a block of its own: a StatGrid is already a surface, so it sits
          ON the ground beside the batch list rather than inside it. «партий» is in the block title
          below, «опаздывает» is a red badge on the row of the batch that is actually late — a zero
          counter earns no cell. Money only for a costing role, and only when plan and fact are
          comparable (see the note on summarise). */}
      <StatGrid>
        <Stat
          label='план, шт'
          value={summary.plannedQty > 0 ? String(summary.plannedQty) : '—'}
          sub={summary.cancelled > 0 ? `без ${summary.cancelled} отменённых` : undefined}
        />
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
            label='unit план → факт'
            value={
              summary.planUnit != null
                ? `${summary.planUnit.toFixed(2)}${
                    summary.factUnit != null ? ` → ${summary.factUnit.toFixed(2)}` : ''
                  }`
                : '—'
            }
            sub={
              summary.planUnit != null && summary.factUnit != null
                ? `Δ ${(summary.factUnit - summary.planUnit).toFixed(2)} ${summary.baseCurrency}`
                : summary.comparableRuns > 0
                  ? summary.baseCurrency
                  : 'нет сопоставимых партий'
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
      </StatGrid>

      <Section
        title={`партии стиля (${runs.length})`}
        question='— что они обещают этой дате'
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
        {/* The batches themselves, one row each — the same table the runs manager draws, so a
            batch looks the same wherever it is read. No action column: editing, receiving and
            deleting a run own modals that live on the run's own page, which the row links to. */}
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
          <RunTable runs={runs} canReadCosting={canReadCosting} />
        )}
      </Section>
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
  let cancelled = 0;
  let comparableRuns = 0;
  let planTotal = 0;
  let factTotal = 0;
  let comparableQty = 0;
  let baseCurrency = '';

  for (const r of runs) {
    const a = r.actuals;
    const q = runQty(r);
    // A cancelled batch is not unmet demand: counting its plan made «принято N% плана» read as a
    // production shortfall on styles where nothing was short. Its received/defect stay counted —
    // goods that DID arrive before a cancel are real.
    if (r.run?.status !== 'PRODUCTION_RUN_STATUS_CANCELLED') {
      plannedQty += q.planned;
    } else {
      cancelled += 1;
    }
    receivedQty += q.received;
    defectQty += q.defect;
    if (q.received > 0 || q.defect > 0) anyReceived = true;

    // plannedTotalBase is emitted only when planned_unit_cost is in the base currency AND the run
    // received something; hasBase false means some article could not be folded, so the actual total
    // understates. Either one disqualifies the run from the comparison.
    const planned = a?.plannedTotalBase?.value;
    const actual = a?.actualTotalBase?.value;
    if (planned && actual && a?.hasBase && q.received > 0) {
      comparableRuns += 1;
      comparableQty += q.received;
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
    cancelled,
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
