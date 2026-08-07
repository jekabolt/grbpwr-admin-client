import {
  common_ProductionRun,
  common_ProductionRunActuals,
  common_ProductionRunStatus,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import { activeVariantCount } from 'components/managers/tech-card/components/output-variants-field';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { AuxRunPlan } from './components/aux-run-plan';
import { LayPlan } from './components/lay-plan';
import { LinesGrid } from './components/lines-grid';
import { MaterialPlan } from './components/material-plan';
import {
  isRunLocked,
  isRunReceivable,
  overdueDays,
  runDate,
  runStatusLabel,
  runStatusTone,
} from './components/options';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { RunCosts } from './components/run-costs';
import {
  deleteRunErrorMessage,
  reversalErrorMessage,
  useDeleteProductionRun,
  useProductionRun,
  useReverseRunReceipt,
} from './components/useProductionRuns';

export function ProductionRunDetail() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id) || 0;
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const { canWrite, canReadCosting, canWriteCosting } = usePermissions();
  const canEdit = canWrite(SECTION.production);
  const { dictionary } = useDictionary();

  const { data, isLoading, isError } = useProductionRun(runId, runId > 0);
  const del = useDeleteProductionRun();
  const run = data?.run;
  const ins = run?.run;
  const actuals = run?.actuals;

  const { data: techCard } = useTechCard(ins?.techCardId ? ins.techCardId : undefined);
  const tcName = techCard?.techCard?.styleNumber || techCard?.techCard?.name || '';

  // NF-07 / B-3: an auxiliary card produces a MATERIAL, not products. Its run is a single
  // product-less quantity received into output_material_id, so it swaps the colour-model grid for
  // a plain quantity plan and the receive posts into the material warehouse.
  const isAux = techCard?.techCard?.purpose === 'TECH_CARD_PURPOSE_AUXILIARY';
  const outputMaterialId = techCard?.techCard?.outputMaterialId ?? 0;
  // 0252: an aux card may instead produce one bucket PER COLOUR. Then the run is planned and
  // received per colour and the single output material is not the destination at all.
  // Memoised: the plan editor keys a useMemo (and through it its dirty-guard effect) on this array,
  // and a fresh `?? []` every render would re-seed the inputs on any parent re-render.
  const outputVariants = useMemo(() => techCard?.outputVariants ?? [], [techCard?.outputVariants]);
  const liveVariants = activeVariantCount(outputVariants);
  const { data: materialsData } = useMaterials('', true, isAux);
  const outputMaterial = useMemo(
    () => (materialsData?.materials ?? []).find((m) => m.id === outputMaterialId),
    [materialsData, outputMaterialId],
  );

  // The run's colourways (products), for real names/codes in the per-colourway cost table below —
  // R1: a colourway is a product; techCardId === styleId. useTechCard already reads the live
  // AdminColorwayRef[], the same source lines-grid.tsx uses; name resolves from dictionary.colors.
  const colorways: ColorwayLabelRef[] = useMemo(
    () =>
      (techCard?.colorways ?? []).map((cw) => {
        const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
        return {
          productId: cw.colorwayId ?? 0,
          code: cw.colorCode ?? '',
          name: dc?.name ?? cw.colorCode ?? '',
        };
      }),
    [techCard?.colorways, dictionary?.colors],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Phase 6: reversing a receipt needs a mandatory reason — the dialog carries it. null = closed.
  const [reverseTarget, setReverseTarget] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const reverse = useReverseRunReceipt();
  // The server demands production:write + products:write + costing:write (it moves stock and
  // rolls back cost_price); the client gates on the two it can see.
  const canReverse = canEdit && canWriteCosting;

  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);
  const late = overdueDays(ins?.promisedAt, ins?.status);
  // Lines planned but not yet tied to a product can't be booked on receive (NF-06) — hint it.
  // Auxiliary lines legitimately carry no product (they book into a material), so never flag them.
  const unassignedPlanned = isAux
    ? 0
    : (ins?.lines ?? []).filter((l) => (l.plannedQty ?? 0) > 0 && !l.productId).length;
  // An aux run can't be received until it has somewhere to book its output. Three ways to have one:
  // the card's single output material, at least one live colour variant (each owns its own bucket),
  // or — for a run planned before its colours were retired — the colour lines it already carries,
  // which the server grandfathers and still receipts into their own buckets. Only a run with NONE
  // of the three is stuck, and claiming otherwise would put a warning banner on a receivable run.
  const auxRunHasVariantLines = (ins?.lines ?? []).some((l) => (l.outputVariantId ?? 0) > 0);
  const auxNoMaterial = isAux && !outputMaterialId && liveVariants === 0 && !auxRunHasVariantLines;

  // Plan vs fact quantities, summed straight from the run's own lines rather than the
  // costing-gated `actuals` — "how many did we make" isn't money, so it should be visible to
  // anyone who can open the run, same as the lines grid itself further down the page.
  const lines = ins?.lines ?? [];
  const plannedQtyTotal = lines.reduce((s, l) => s + (l.plannedQty ?? 0), 0);
  const hasReceivedAny = lines.some((l) => l.receivedQty != null);
  const receivedQtyTotal = lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0);
  const defectQtyTotal = lines.reduce((s, l) => s + (l.defectQty ?? 0), 0);
  // #9 — ONE defect formula. This page used to divide defect by received, the run LIST renders the
  // server's `defect_pct_actual`, and the server computes defect / (received + defect): three
  // screens, three percentages for one run. `received_qty` is the count of GOOD units (it is what
  // gets posted to stock); the defective ones are a separate count, so the denominator is what came
  // off the line, not what passed. The server's figure is authoritative and survives the costing
  // strip (stripProductionRunActualsCosting keeps the quantity totals and defect_pct_actual), so it
  // is available to every account that can open the run. The local fallback below exists only for a
  // payload with no actuals at all — and it uses the SERVER's formula, not the old one.
  const producedQtyTotal = receivedQtyTotal + defectQtyTotal;
  const serverDefectPct = actuals?.defectPctActual?.value
    ? Number(actuals.defectPctActual.value)
    : NaN;
  const defectPct = Number.isFinite(serverDefectPct)
    ? serverDefectPct
    : producedQtyTotal > 0
      ? (defectQtyTotal / producedQtyTotal) * 100
      : 0;

  // A one-line answer to "what IS this run", for the header: an auxiliary run banks a material
  // into the warehouse; a normal run is a set of colour-models that become sellable products.
  const colourModelCount =
    new Set(lines.map((l) => l.productId ?? 0).filter((pid) => pid > 0)).size ||
    (techCard?.colorways?.length ?? 0);
  // How many colours THIS run actually plans, which is the honest number for its header — a card
  // may have five registered variants and this run produce two of them.
  const runColourCount = new Set(lines.map((l) => l.outputVariantId ?? 0).filter((id) => id > 0))
    .size;
  const runTypeLabel = isAux
    ? runColourCount > 0 || liveVariants > 0
      ? `auxiliary run · produces ${runColourCount || liveVariants} colour${
          (runColourCount || liveVariants) === 1 ? '' : 's'
        } of a material for warehouse stock, each into its own bucket`
      : 'auxiliary run · produces a material for warehouse stock, not a sellable product'
    : colourModelCount > 0
      ? `produces ${colourModelCount} colour-model${colourModelCount === 1 ? '' : 's'} as sellable product${colourModelCount === 1 ? '' : 's'}`
      : 'no colour-models planned yet';

  const guidance = nextStepGuidance({
    status: ins?.status,
    auxNoMaterial,
    unassignedPlanned,
    techCardId: ins?.techCardId,
  });

  const confirmDelete = () =>
    del.mutate(runId, {
      onSuccess: () => {
        showMessage('Run deleted', 'success');
        navigate(ROUTES.productionRuns);
      },
      onError: (e) => showMessage(deleteRunErrorMessage(e), 'error'),
    });

  if (isLoading) return <Text size='small'>loading…</Text>;
  if (isError || !run)
    return (
      <div className='flex flex-col gap-3 pb-16'>
        <Link to={ROUTES.productionRuns} className='underline'>
          ← production runs
        </Link>
        <Text size='small'>Run not found.</Text>
      </div>
    );

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <Link to={ROUTES.productionRuns} className='text-textInactiveColor underline'>
        ← production runs
      </Link>

      {/* Identity — what this run is, at a glance: id + lifecycle status, its tech card, and a
          one-line description of what it produces. Actions live beside it, not buried below. */}
      <div className='-mx-2.5 flex flex-wrap items-start justify-between gap-3 border-b border-borderColor bg-bgColor px-2.5 py-3'>
        <div className='flex flex-col gap-1.5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text variant='uppercase' size='large'>
              PR-{run.id}
            </Text>
            <span
              className={`inline-block border px-1.5 py-0.5 text-textBaseSize uppercase ${runStatusTone(ins?.status)}`}
            >
              {runStatusLabel(ins?.status)}
            </span>
          </div>
          <Text variant='inactive' size='small'>
            <Link to={`${ROUTES.techCards}/${ins?.techCardId}`} className='underline'>
              TC-{ins?.techCardId}
              {tcName ? ` · ${tcName}` : ''}
            </Link>
            {ins?.releaseId ? ` · rel ${ins.releaseId}` : ''}
            {ins?.startedAt ? ` · started ${ins.startedAt.slice(0, 10)}` : ''}
          </Text>
          {/* The planning window beside the identity: an operator asking "is this batch late" should
              not have to open the edit modal to find the date it was promised for. */}
          <Text variant='inactive' size='small'>
            план {runDate(ins?.plannedStartAt) || '—'} → обещано {runDate(ins?.promisedAt) || '—'}
            {late > 0 ? (
              <span className='ml-2 uppercase text-error'>опаздывает {late} дн</span>
            ) : null}
          </Text>
          <Text size='small'>{runTypeLabel}</Text>
        </div>
        {canEdit && (
          <div className='flex items-center gap-2'>
            {receivable && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                title={
                  auxNoMaterial
                    ? 'set an output material or register a colour variant on the tech card before receiving'
                    : unassignedPlanned
                      ? `${unassignedPlanned} line(s) have no product — publish them or zero their received qty`
                      : undefined
                }
                onClick={() => setReceiveOpen(true)}
              >
                receive
              </Button>
            )}
            {/* A received/closed run rejects every update before the payload is examined
                (ErrProductionRunReceivedImmutable), so the edit modal on it can only fail. */}
            {!locked && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setEditOpen(true)}
              >
                edit
              </Button>
            )}
            {!locked && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setDeleteOpen(true)}
              >
                delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* What to do next — the single sentence the rest of the page exists to support. Visible
          text, not a hover-only tooltip, so a blocked receive is obvious before it's clicked. */}
      {guidance ? (
        <div className={`border p-3 ${GUIDANCE_BOX[guidance.tone]}`}>
          <Text size='small' className={GUIDANCE_TEXT[guidance.tone]}>
            {guidance.text}
            {guidance.href ? (
              <>
                {' '}
                <Link to={guidance.href} className='underline'>
                  {guidance.linkLabel}
                </Link>
              </>
            ) : null}
          </Text>
        </div>
      ) : null}

      {/* Quantity is not money — shown to anyone who can open the run, matching the lines grid
          below (which is likewise never costing-gated). */}
      <StatGrid>
        <Stat label='planned qty' value={String(plannedQtyTotal)} />
        {/* received = GOOD units — the count that is posted to stock. Defective units are a
            separate count that never reaches the warehouse, so they are not inside this number and
            the defect rate below is measured against received + defect, the way the server does. */}
        <Stat
          label='received (good)'
          value={hasReceivedAny ? String(receivedQtyTotal) : '—'}
          sub={
            hasReceivedAny && plannedQtyTotal > 0
              ? `${Math.round((receivedQtyTotal / plannedQtyTotal) * 100)}% of plan`
              : undefined
          }
        />
        <Stat
          label='defect (not stocked)'
          value={hasReceivedAny ? String(defectQtyTotal) : '—'}
          sub={
            hasReceivedAny && defectQtyTotal > 0
              ? `${defectPct.toFixed(1)}% of ${producedQtyTotal} produced`
              : undefined
          }
          tone={defectQtyTotal > 0 ? 'down' : undefined}
        />
      </StatGrid>

      {canReadCosting ? <CostSummary run={run} actuals={actuals} /> : null}

      {canReadCosting &&
      actuals &&
      ((actuals.byColorway?.length ?? 0) > 0 || actuals.unattributedMaterialsBase?.value) ? (
        <ColorwayCostBlock actuals={actuals} colorways={colorways} />
      ) : null}

      {/* The run's own three-step workflow: plan quantities, cover the materials they need, then
          log what it actually cost. Numbered so "what do I do next" has one obvious answer. */}
      <Section
        title='step 1 · what to produce'
        question='Plan how many of each colour-model × size this run makes.'
      >
        {isAux ? (
          <AuxRunPlan
            run={run}
            canEdit={canEdit}
            locked={locked}
            outputMaterialId={outputMaterialId}
            outputMaterial={outputMaterial}
            outputVariants={outputVariants}
          />
        ) : (
          <LinesGrid run={run} canEdit={canEdit} locked={locked} />
        )}
      </Section>

      <Section
        title='step 2 · materials needed'
        question="Estimated requirement against warehouse stock, from the tech card's material norms."
      >
        {/* `locked` is not decoration: a material issue needs an OPEN run (checkRunOpen), so on a
            received/closed run the issue button could only ever produce a rejection. */}
        <MaterialPlan run={run} canEdit={canEdit} locked={locked} />
      </Section>

      {/* Шаг 3 — план настилов (Ф4.3). Блок рисует себя САМ, вместе со своей `Section`: у него есть
          состояние «не применимо» (aux-карточка), при котором пустая рамка с заголовком была бы
          приглашением построить то, чего у этого прогона не бывает. Клиентский гейт `!isAux` —
          та же машинерия, что у требований релиза: сервер отдаёт applicable = false с причиной,
          клиент не рендерит блок. */}
      {!isAux ? <LayPlan run={run} canEdit={canEdit} locked={locked} /> : null}

      {canReadCosting ? (
        <Section title='step 4 · actual costs' question='Log the real costs incurred once known.'>
          {/* Same reason: UpdateProductionRun refuses a received/closed run, and cost articles are
              written through it. The editor stays readable, the save is gone. */}
          <RunCosts run={run} canEdit={canEdit} canReadCosting={canReadCosting} locked={locked} />
        </Section>
      ) : null}

      {/* Receiving history (Phase 5): every booked delivery of this run, oldest first — what
          arrived when, whether it closed the series, and whether accounting has posted it. Renders
          only once something was received; money on receipts is server-stripped without
          costing:read, so the list is safe for every reader. */}
      {(run.receipts?.length ?? 0) > 0 ? (
        <Section
          title='приёмки'
          question='Каждая поставка — отдельная квитанция; финальная закрывает серию.'
        >
          <div className='flex flex-col'>
            {(run.receipts ?? []).map((rc) => {
              const good = (rc.lines ?? []).reduce(
                (s: number, l: { goodQty?: number }) => s + (l.goodQty ?? 0),
                0,
              );
              const defect = (rc.lines ?? []).reduce(
                (s: number, l: { defectQty?: number }) => s + (l.defectQty ?? 0),
                0,
              );
              // Phase 7: how many of the defects were recovered as B-grade seconds.
              const seconds = (rc.lines ?? []).reduce(
                (s: number, l: { defectQty?: number; defectDisposition?: string }) =>
                  s + (l.defectDisposition === 'seconds' ? l.defectQty ?? 0 : 0),
                0,
              );
              // Phase 6: a reversal row documents the undo of another receipt; a reversed receipt
              // stays in the history greyed out — its units and money left every rollup.
              const isReversalRow = (rc.reversalOf ?? 0) > 0;
              const isReversed = (rc.reversedBy ?? 0) > 0;
              return (
                <div
                  key={rc.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0 ${isReversed ? 'opacity-50' : ''}`}
                >
                  <Text size='small'>#{rc.id}</Text>
                  <Text size='small'>{runDate(rc.receivedAt) || '—'}</Text>
                  {isReversalRow ? (
                    <span className='inline-block border border-textInactiveColor px-1.5 py-0.5 text-textBaseSize uppercase text-textInactiveColor'>
                      реверс квитанции #{rc.reversalOf}
                    </span>
                  ) : (
                    <>
                      <Text size='small'>
                        {good} годных
                        {defect > 0
                          ? ` · ${defect} брак${seconds > 0 ? ` (${seconds} → B-сток)` : ''}`
                          : ''}
                      </Text>
                      {rc.final ? (
                        <span className='inline-block border border-textColor px-1.5 py-0.5 text-textBaseSize uppercase'>
                          финальная
                        </span>
                      ) : (
                        <span className='inline-block border border-textInactiveColor px-1.5 py-0.5 text-textBaseSize uppercase text-textInactiveColor'>
                          частичная
                        </span>
                      )}
                    </>
                  )}
                  {isReversed ? (
                    <span className='inline-block border border-textInactiveColor px-1.5 py-0.5 text-textBaseSize uppercase text-textInactiveColor'>
                      реверснута · #{rc.reversedBy}
                    </span>
                  ) : null}
                  {!isReversalRow ? (
                    <Text
                      size='small'
                      variant='inactive'
                      title='статус проводки в бухгалтерии; pending — воркер ещё не запостил'
                    >
                      {rc.postingStatus === 'posted'
                        ? 'проведена'
                        : rc.postingStatus === 'dead_letter'
                          ? 'постинг завис — см. бухгалтерию'
                          : 'ждёт постинга'}
                    </Text>
                  ) : null}
                  {canReadCosting && rc.hasBase && rc.unitCostBase?.value ? (
                    <Text size='small' variant='inactive'>
                      unit cost {decimalToInput(rc.unitCostBase)} {rc.baseCurrency || ''}
                    </Text>
                  ) : null}
                  {rc.note ? (
                    <Text size='small' variant='inactive'>
                      {rc.note}
                    </Text>
                  ) : null}
                  {canReverse &&
                  !isReversalRow &&
                  !isReversed &&
                  ins?.status !== 'PRODUCTION_RUN_STATUS_CLOSED' ? (
                    <Button
                      type='button'
                      size='xs'
                      variant='simpleReverseWithBorder'
                      className='ml-auto'
                      onClick={() => {
                        setReverseReason('');
                        setReverseTarget(rc.id ?? 0);
                      }}
                    >
                      отменить
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* Phase 6: the reversal dialog. The reason is MANDATORY server-side (it lands on the
          reversal row, every stock-journal decrement and the run event), so the confirm stays
          disabled until one is typed. closeOnConfirm=false — a refusal (units already sold, closed
          period) must keep the dialog and its reason on screen. */}
      <ConfirmationModal
        open={reverseTarget != null}
        onOpenChange={(o) => {
          if (!o) setReverseTarget(null);
        }}
        title={`отменить квитанцию #${reverseTarget ?? ''}`}
        confirmLabel={reverse.isPending ? 'отмена…' : 'реверсировать'}
        confirmDisabled={reverse.isPending || reverseReason.trim() === ''}
        closeOnConfirm={false}
        onConfirm={() => {
          if (reverseTarget == null) return;
          reverse.mutate(
            {
              runId,
              receiptId: reverseTarget,
              reason: reverseReason.trim(),
              expectedLockVersion: run?.lockVersion ?? 0,
            },
            {
              onSuccess: () => {
                setReverseTarget(null);
                showMessage(
                  'Квитанция реверсирована: сток снят, деньги возвращены в WIP',
                  'success',
                );
              },
              onError: (e) => showMessage(reversalErrorMessage(e), 'error'),
            },
          );
        }}
      >
        <div className='flex flex-col gap-2'>
          <Text size='small' variant='inactive'>
            Годные единицы этой квитанции снимутся со склада (нехватка из-за продаж заблокирует
            реверс), FG-часть проводки вернётся в WIP, cost_price откатится к оценке тех-карты.
            Выданные материалы НЕ возвращаются автоматически.
          </Text>
          <textarea
            className='w-full border border-borderColor bg-bgColor p-2 text-textBaseSize outline-none'
            rows={3}
            placeholder='причина реверса (обязательно)'
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
          />
        </div>
      </ConfirmationModal>

      {/* Сверка «ожидаемое vs проведённое» (Phase 8): три server-side чека — квитанции против
          сток-журнала, posted-квитанции против живых проводок, статьи затрат против
          капитализированных клеймов. Рендерится только когда что-то расходится ИЛИ есть
          квитанции — пустой зелёный блок на плановом ране был бы шумом. */}
      {(run.recon ?? []).some((c) => !c.ok) || (run.receipts?.length ?? 0) > 0 ? (
        <Section
          title='сверка'
          question='Каждая цифра рана обязана сходиться с журналами; расхождение — сигнал, не косметика.'
        >
          <div className='flex flex-col'>
            {(run.recon ?? []).map((c) => (
              <div
                key={c.key}
                className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0'
              >
                <Text size='small' className={c.ok ? '' : 'font-bold text-error'}>
                  {c.ok ? '✓' : '✗'}{' '}
                  {c.key === 'units_receipts_vs_stock_journal'
                    ? 'единицы: квитанции ↔ сток-журнал'
                    : c.key === 'money_posted_vs_entries'
                      ? 'проводки: posted-квитанции ↔ живые записи'
                      : 'затраты: начислено ↔ капитализировано'}
                </Text>
                <Text size='small' variant='inactive' className='tabular-nums'>
                  {c.expected} ↔ {c.actual}
                </Text>
                {!c.ok && c.detail ? (
                  <Text size='small' variant='inactive' className='w-full'>
                    {c.detail}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Журнал жизни рана (Phase 8): кто и когда создал/запустил/принял/реверснул/закрыл.
          Append-only; receipt-события ссылаются на квитанции, не дублируют их. */}
      {(run.events?.length ?? 0) > 0 ? (
        <Section title='журнал рана' collapsible defaultOpen={false}>
          <div className='flex flex-col'>
            {(run.events ?? []).map((e) => (
              <div
                key={e.id}
                className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0'
              >
                <Text size='small' variant='inactive'>
                  {runDate(e.createdAt) || '—'}
                </Text>
                <Text size='small'>{e.eventType}</Text>
                {e.actor ? (
                  <Text size='small' variant='inactive'>
                    {e.actor}
                  </Text>
                ) : null}
                {e.reason ? (
                  <Text size='small' variant='inactive'>
                    {e.reason}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Audit trail, not a planning step — collapsed by default (memory: collapse rarely-used
          content), same pattern as the tech card's packaging spec / provenance. */}
      <Section title='material movements' collapsible defaultOpen={false}>
        <MovementsList filter={{ productionRunId: run.id }} />
      </Section>

      {/* Продуктовый сток-журнал рана (Phase 8): все движения его reference-семейства — приёмки
          (production_run:<id>) и реверсы (receipt:<id>). Дополняет материальные движения выше:
          там — ткань, тут — готовые изделия. */}
      {(run.receipts?.length ?? 0) > 0 ? (
        <Section title='движения готовых изделий' collapsible defaultOpen={false}>
          <RunStockChanges runId={run.id ?? 0} createdAt={run.createdAt} />
        </Section>
      ) : null}

      <ProductionRunModal open={editOpen} onOpenChange={setEditOpen} run={run} />
      <ReceiveModal
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        run={run}
        isAux={isAux}
        outputMaterialId={outputMaterialId}
        outputMaterial={outputMaterial}
        outputVariants={outputVariants}
      />
      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        title={`delete PR-${run.id}?`}
        confirmLabel='delete'
      >
        <Text size='small'>Delete this production run? This action is irreversible.</Text>
      </ConfirmationModal>
    </div>
  );
}

// Status- (and blocker-) driven guidance banner. Folds the receive button's hover-only `title`
// blockers (auxNoMaterial / unassignedPlanned — previously invisible until you happened to hover
// a button) and the run's lifecycle into the one sentence a confused operator actually needs.
type GuidanceTone = 'neutral' | 'warning' | 'success' | 'error';
type Guidance = { tone: GuidanceTone; text: string; href?: string; linkLabel?: string };

const GUIDANCE_BOX: Record<GuidanceTone, string> = {
  neutral: 'border-borderColor',
  warning: 'border-warning bg-warning/10',
  success: 'border-success bg-success/10',
  error: 'border-error bg-error/10',
};
const GUIDANCE_TEXT: Record<GuidanceTone, string> = {
  neutral: '',
  warning: 'text-warning',
  success: 'text-success',
  error: 'text-error',
};

function nextStepGuidance({
  status,
  auxNoMaterial,
  unassignedPlanned,
  techCardId,
}: {
  status?: common_ProductionRunStatus;
  auxNoMaterial: boolean;
  unassignedPlanned: number;
  techCardId?: number;
}): Guidance | null {
  if (status === 'PRODUCTION_RUN_STATUS_CANCELLED') {
    return { tone: 'error', text: 'Cancelled — this run will not be received.' };
  }
  if (status === 'PRODUCTION_RUN_STATUS_CLOSED') {
    return {
      tone: 'neutral',
      text: 'Closed — this is the final record of this run. Nothing on it can be edited any more.',
    };
  }
  if (status === 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED') {
    return {
      tone: 'warning',
      text: 'Частично принята: поставки бронируются на склад, серия открыта. Следующая поставка — той же кнопкой receive; финальная приёмка (галочка в модалке) закроет партию, остаток объявится непришедшим.',
    };
  }
  if (status === 'PRODUCTION_RUN_STATUS_RECEIVED') {
    // This used to promise that "costs and materials can still be adjusted". They cannot:
    // UpdateProductionRun refuses a received/closed run outright (ErrProductionRunReceivedImmutable)
    // and material issues require an OPEN run (checkRunOpen). The page rendered a cost-save and an
    // issue button the backend was guaranteed to reject, which is the worst kind of affordance —
    // it teaches the operator that the app is broken rather than that the run is finished.
    return {
      tone: 'success',
      text: 'Received — stock has been posted. The run is now a closed record: quantities, costs and material issues are all locked. Book a correction as a new run.',
    };
  }
  if (auxNoMaterial) {
    return {
      tone: 'warning',
      text: 'This auxiliary run has nowhere to book its output — set an output material or register colour variants on its tech card before it can be received.',
      href: `${ROUTES.techCards}/${techCardId}`,
      linkLabel: 'open tech card ↗',
    };
  }
  if (unassignedPlanned > 0) {
    return {
      tone: 'warning',
      text: `${unassignedPlanned} line(s) in step 1 below have no product yet — publish them as products or set their received quantity to 0 before receiving.`,
    };
  }
  if (status === 'PRODUCTION_RUN_STATUS_IN_PROGRESS') {
    return {
      tone: 'neutral',
      text: 'In progress — receive it once the goods arrive at the warehouse.',
    };
  }
  // PLANNED, or status unset on a brand-new run.
  return {
    tone: 'neutral',
    text: 'Planned — fill in quantities below, then receive once the goods arrive.',
  };
}

// A numbered card around one step of the run's workflow: a title, a one-line "why", then the
// existing editor (LinesGrid / AuxRunPlan / MaterialPlan / RunCosts) unchanged inside.
// Cost variance is actual − plan: spending MORE than planned is bad (red), LESS is good (green) —
// the inverse of a revenue/KPI delta, where up is good. Kept as one helper so both cost tiles
// (unit and total) agree on the sign convention.
function varianceTone(d?: googletype_Decimal): 'up' | 'down' | undefined {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n) || n === 0) return undefined;
  return n > 0 ? 'down' : 'up';
}
function varianceSub(d?: googletype_Decimal): string | undefined {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n) || n === 0) return undefined;
  return `Δ ${n > 0 ? '+' : ''}${decimalToInput(d)}`;
}

// Plan-vs-actual cost, in tiles: unit cost (feeds cost_price) AND total cost (the actual budget
// question an owner asks first) — total was computed by the backend already (actuals.plannedTotalBase
// / actualTotalBase / totalVariance) but had no reader anywhere in this module until now. Hidden
// entirely without costing:read, same as RunCosts below (money is confidential; quantity is not).
function CostSummary({
  run,
  actuals,
}: {
  run: common_ProductionRun;
  actuals?: common_ProductionRunActuals;
}) {
  const cur = actuals?.baseCurrency || run.plannedCurrency || '';
  const warnings: string[] = [];
  if (actuals?.mixedMaterialsSources) {
    warnings.push('a manual materials cost AND stock issues both exist — check for a double count');
  }
  if (actuals?.hasUncostedIssues) {
    warnings.push('some stock issues had no average cost — materials from stock is understated');
  }
  if (actuals && actuals.hasBase === false) {
    warnings.push(
      'some cost article could not be folded to the base currency — totals are partial',
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <StatGrid>
        <Stat
          label='unit cost · plan'
          value={
            run.plannedUnitCost?.value
              ? `${decimalToInput(run.plannedUnitCost)} ${run.plannedCurrency || ''}`
              : '—'
          }
        />
        <Stat
          label='unit cost · actual'
          value={
            actuals?.actualUnitCost?.value
              ? `${decimalToInput(actuals.actualUnitCost)} ${cur}`
              : '— until received'
          }
          sub={varianceSub(actuals?.unitCostVariance)}
          tone={varianceTone(actuals?.unitCostVariance)}
        />
        <Stat
          label='total cost · plan'
          value={
            actuals?.plannedTotalBase?.value
              ? `${decimalToInput(actuals.plannedTotalBase)} ${cur}`
              : '—'
          }
        />
        <Stat
          label='total cost · actual'
          value={
            actuals?.actualTotalBase?.value
              ? `${decimalToInput(actuals.actualTotalBase)} ${cur}`
              : '— until received'
          }
          sub={varianceSub(actuals?.totalVariance)}
          tone={varianceTone(actuals?.totalVariance)}
        />
      </StatGrid>

      {(() => {
        // Phase 7 explicitness: the actual unit cost divides the run's whole cost by the GOOD
        // units, so scrapped units silently raise it — say so instead of looking like an error.
        // Count only (the exact absorbed money is the ledger's split at posting; recomputing it
        // client-side in floats is exactly the class of bug the audit banned).
        const absorbed = actuals?.defectQtyTotal ?? 0;
        return absorbed > 0 && actuals?.actualUnitCost?.value ? (
          <Text variant='inactive' size='small'>
            unit cost поглощает {absorbed} бракованных единиц (нормальная потеря капитализируется в
            годные; сверхнормативная списывается учётом при закрытии серии)
          </Text>
        ) : null;
      })()}

      {actuals?.materialsFromStockBase?.value ? (
        <Text variant='inactive' size='small'>
          includes {decimalToInput(actuals.materialsFromStockBase)} {cur} of materials issued from
          stock
        </Text>
      ) : null}

      {warnings.length > 0 ? (
        <div className='flex flex-col gap-1 border border-warning bg-warning/10 p-2'>
          {warnings.map((w, i) => (
            <Text key={i} size='small' className='text-warning'>
              ! {w}
            </Text>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Per-colourway material cost (gap-07 v2 C): stock issues grouped by the product_id they were cut
// for. Only materials-from-stock is split — manual cost articles stay run-level — and issues booked
// without a colourway fall into "unattributed". Read-only; costing-gated by the caller.
const cwCell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
// Colourway identity for the label lookup below (R1: a colourway is a product) — sourced from the
// run's tech card (techCard?.colorways) by the caller, the same as lines-grid.tsx.
type ColorwayLabelRef = { productId?: number; code?: string; name?: string };
function ColorwayCostBlock({
  actuals,
  colorways,
}: {
  actuals: common_ProductionRunActuals;
  colorways: ColorwayLabelRef[];
}) {
  const cur = actuals.baseCurrency || '';
  const label = (productId?: number) => {
    const c = colorways.find((x) => (x.productId ?? 0) === productId && (productId ?? 0) > 0);
    if (c) return `${c.code ? `${c.code} · ` : ''}${c.name ?? `#${productId}`}`;
    return productId ? `#${productId}` : '(unattributed)';
  };
  const rows = actuals.byColorway ?? [];
  const unattributed = actuals.unattributedMaterialsBase;

  return (
    <Section
      title='materials by colourway'
      question='only stock-issued materials are split here; manual cost articles stay run-level — attribute an issue to a colourway from its “issue…” action to move it out of unattributed.'
    >
      <div className='overflow-x-auto'>
        <table className='border-collapse'>
          <thead>
            <tr>
              <th className={`${cwCell} text-left uppercase`}>colourway</th>
              <th className={`${cwCell} text-right uppercase`}>received</th>
              <th className={`${cwCell} text-right uppercase`}>materials (stock)</th>
              <th className={`${cwCell} text-right uppercase`}>/ unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className={cwCell}>
                  {label(r.productId)}
                  {r.hasUncosted ? (
                    <Text variant='inactive' size='small'>
                      ! some issues uncosted — understated
                    </Text>
                  ) : null}
                </td>
                <td className={`${cwCell} text-right`}>{r.receivedQty ?? 0}</td>
                <td className={`${cwCell} text-right`}>
                  {r.materialsFromStockBase?.value ? decimalToInput(r.materialsFromStockBase) : '—'}{' '}
                  {r.materialsFromStockBase?.value ? cur : ''}
                </td>
                <td className={`${cwCell} text-right`}>
                  {r.materialsUnitCost?.value ? decimalToInput(r.materialsUnitCost) : '—'}
                </td>
              </tr>
            ))}
            {unattributed?.value && Number(unattributed.value) !== 0 ? (
              <tr>
                <td className={cwCell}>(unattributed)</td>
                <td className={`${cwCell} text-right`}>—</td>
                <td className={`${cwCell} text-right`}>
                  {decimalToInput(unattributed)} {cur}
                </td>
                <td className={`${cwCell} text-right`}>—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// RunStockChanges renders the run's slice of the product-stock journal (Phase 8): the server
// filters by the run's whole reference family, the window spans the run's life.
function RunStockChanges({ runId, createdAt }: { runId: number; createdAt?: string }) {
  const query = useQuery({
    queryKey: ['run-stock-changes', runId],
    enabled: runId > 0,
    queryFn: () =>
      adminService.ListStockChanges({
        from: createdAt ?? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
        to: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        productionRunId: runId,
        limit: 200,
        offset: 0,
        colorwayId: undefined,
        sizeId: undefined,
        source: undefined,
        orderFactor: undefined,
        sortByDirection: undefined,
      }),
  });
  const rows = query.data?.changes ?? [];
  if (query.isLoading) return <Text size='small'>загрузка…</Text>;
  if (!rows.length) return <Text size='small'>движений нет</Text>;
  return (
    <div className='flex flex-col'>
      {rows.map((r, i) => (
        <div
          key={i}
          className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0'
        >
          <Text size='small' variant='inactive'>
            {runDate(r.date) || '—'}
          </Text>
          <Text size='small'>{r.sku || '—'}</Text>
          <Text size='small' className='tabular-nums'>
            {r.amountChanged?.value ?? ''}
          </Text>
          <Text size='small' variant='inactive'>
            {r.source}
          </Text>
          <Text size='small' variant='inactive'>
            {r.reference}
          </Text>
        </div>
      ))}
    </div>
  );
}
