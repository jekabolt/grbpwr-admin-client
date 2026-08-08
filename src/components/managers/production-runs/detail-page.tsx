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
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { AuxRunPlan, materialLabel } from './components/aux-run-plan';
import { CutReceipts } from './components/cut-receipts';
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
import {
  RunConveyor,
  RunStepId,
  StepGlyph,
  UnsavedBadge,
  buildRunSteps,
} from './components/run-conveyor';
import { RunCosts } from './components/run-costs';
import { RunReceiptTable } from './components/run-receipt-table';
import { allLayChecks, layVerdict, useRunLays, worstVerdict } from './components/useLays';
import {
  deleteRunErrorMessage,
  reversalErrorMessage,
  useDeleteProductionRun,
  useMaterialPlan,
  useProductionRun,
  useReverseRunReceipt,
} from './components/useProductionRuns';

// A run walks through six phases — план → материалы → раскрой → приёмка → затраты → закрытие — and
// the page shows the ONE it is in: the conveyor band names them all with a line of fact each, the
// current phase's panel is open below it, and the rest collapse to a row apiece that can be
// expanded in place. Sixteen stacked blocks used to make the page a scroll-hunt for "what do I do
// next" — the answer is now the ink-filled step and the callout under it. Nothing about the phases'
// CONTENT changed: each panel is the same editor as before, with the same RPCs, the same permission
// gates and the same refusal messages.
//
// Ф4's «шаг 3 · как раскроить» (lay-plan.tsx) is a phase in its own right here, between materials
// and receiving: it cannot start before the fabric is issued and nothing can be received before it
// is done. It owns its own Section, its own numbering in its own title, and its own applicability
// gate — the band only decides WHEN it is the phase the operator is standing in.
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

  // Which steps the operator has EXPANDED by hand. `true` = expanded, `false`/absent = collapsed.
  // Visibility only — what keeps a panel alive is `mountedRef` below, not this map.
  const [openSteps, setOpenSteps] = useState<Partial<Record<RunStepId, boolean>>>({});
  // Expanding scrolls the panel into view: it renders above the step list, so a click that only
  // flipped state could visibly do nothing at all. Set on expand, consumed by the effect below —
  // the panel has to be visible before it can be scrolled to.
  const [scrollToStep, setScrollToStep] = useState<RunStepId | null>(null);
  const toggleStep = (step: RunStepId) => {
    const opening = !openSteps[step];
    setOpenSteps((prev) => ({ ...prev, [step]: !prev[step] }));
    if (opening) setScrollToStep(step);
  };
  useEffect(() => {
    if (scrollToStep == null) return;
    const node = document.getElementById(stepDomId(scrollToStep));
    node?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    setScrollToStep(null);
  }, [scrollToStep]);

  // The "· unsaved" flags used to live inside each panel's own heading, one per save button, which
  // is precisely where nobody looking for them was. They report up here now and render as one badge
  // on the conveyor step that owns them. The callbacks must be STABLE — the editors fire them from
  // an effect keyed on the callback identity.
  const [unsavedPlan, setUnsavedPlan] = useState(false);
  const [unsavedCosts, setUnsavedCosts] = useState(false);
  const onPlanDirty = useCallback((d: boolean) => setUnsavedPlan(d), []);
  const onCostsDirty = useCallback((d: boolean) => setUnsavedCosts(d), []);
  // Steps whose panel is mounted (see mountedPanels below, after the phases are known).
  const mountedRef = useRef<Set<RunStepId>>(new Set());

  // The material plan, for the conveyor's step-2 line. Same query key as the step-2 panel's own
  // hook, so React Query serves both from one request and the band can never quote a figure the
  // panel disagrees with — and it is not an extra call: the panel was mounted unconditionally on
  // every open of this page before, so the plan was always fetched here anyway.
  const materialPlan = useMaterialPlan(runId, runId > 0);
  const mpRows = materialPlan.data?.rows ?? [];
  const materialsFact = materialPlan.data
    ? {
        positions: mpRows.length,
        // POSITIONS covered, never a sum of quantities: the rows carry metres, pieces and kilos,
        // and adding those together yields a number that means nothing.
        issued: mpRows.filter((r) => decNum(r.issued) >= decNum(r.required)).length,
        short: mpRows.filter((r) => decNum(r.shortage) > 0).length,
        blockers: (materialPlan.data.blockers ?? []).length,
      }
    : undefined;

  // WHERE an in-progress run stands is decided ONCE, from the first successful read of the plan,
  // and then held for the rest of the visit.
  //
  // Live, it moved under the operator's hands: issuing the last missing material invalidates the
  // run's query key, the plan re-reads with full coverage, and the phase would step from 2 to 3 —
  // replacing the materials panel someone was mid-issue in with the receipt table. Same for the
  // panel's own "refresh". A phase is a place to stand, not a live gauge; the SUMMARY line on the
  // band stays live, so the freshly issued metre is still visible where it belongs.
  //
  // Keyed by run id: this component survives a route param change, and a frozen verdict from the
  // previously viewed run would decide the phase of the next one.
  const frozenCoverage = useRef<{ runId: number; unissued?: boolean }>({ runId });
  if (frozenCoverage.current.runId !== runId) frozenCoverage.current = { runId };
  if (frozenCoverage.current.unissued === undefined && materialsFact) {
    frozenCoverage.current.unissued = materialsFact.issued < materialsFact.positions;
  }

  // Настилы (Ф4), для строки шага «раскрой» на ленте. Тот же ключ, что читает сам блок
  // (`useRunLays` под detail(runId)) — React Query отдаёт оба чтения из одного запроса, поэтому
  // лишнего вызова нет: до конвейера блок настилов монтировался на каждой открытой странице, то
  // есть этот запрос уходил всё равно. Выключен на aux-прогоне: там плана настилов не бывает, и
  // блок для такого прогона тоже не рендерится.
  const layPlan = useRunLays(runId, runId > 0 && !isAux);
  const laysFact = layPlan.data
    ? {
        lays: (layPlan.data.lays ?? []).length,
        sections: (layPlan.data.lays ?? []).reduce((s, l) => s + (l.sections?.length ?? 0), 0),
        // «Не годен» — вердикт САМОГО сервера, тот же, что печатает пилл карточки настила.
        //
        // ПРОВЕРКИ БЕРУТСЯ ЦЕЛИКОМ, ВМЕСТЕ С СЕКЦИОННЫМИ. Четыре из одиннадцати живут на СЕКЦИИ, а
        // не на настиле — среди них `lay_lot_width` («маркер шире рулона, с которого стелют») и
        // `lay_marker_width`. Считая только `l.checks`, конвейер объявлял годным настил, который не
        // режется физически, и объявлял это ровно на том экране, ради которого гейт существует.
        unfit: (layPlan.data.lays ?? []).filter((l) => worstVerdict(allLayChecks(l)) === 'blocker')
          .length,
        stale: (layPlan.data.lays ?? []).filter((l) => l.quantitiesStale === true).length,
        shortCells: (layPlan.data.coverage ?? []).filter((c) => layVerdict(c.status) === 'blocker')
          .length,
      }
    : undefined;
  // Есть ли у прогона фаза раскроя вообще. `!isAux` — клиентский гейт блока (его собственный,
  // дословно), `applicable === false` — серверный вердикт того же факта: если сервер сказал «не
  // применимо», блок вернёт null, и шаг в ленте вёл бы в пустоту.
  const hasLayStep = !isAux && layPlan.data?.applicable !== false;

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

  const receipts = run.receipts ?? [];

  // The band. Every figure on it is read from the same field the panel below reads.
  const steps = buildRunSteps({
    status: ins?.status,
    canReadCosting,
    hasLayStep,
    plannedQty: plannedQtyTotal,
    colourCount: isAux ? runColourCount || liveVariants : colourModelCount,
    planProblem: auxNoMaterial
      ? 'некуда приходовать выпуск'
      : unassignedPlanned > 0
        ? `строки без продукта: ${unassignedPlanned}`
        : undefined,
    materials: materialsFact,
    hasUnissuedMaterials: frozenCoverage.current.unissued,
    materialsUnavailable: materialPlan.isError,
    lays: laysFact,
    laysUnavailable: layPlan.isError,
    receivedQty: receivedQtyTotal,
    postingStuck: receipts.some((rc) => rc.postingStatus === 'dead_letter'),
    accrued: actuals?.actualTotalBase?.value
      ? `${decimalToInput(actuals.actualTotalBase)} ${actuals.baseCurrency || run.plannedCurrency || ''}`.trim()
      : undefined,
    costTotalsPartial: !!actuals && actuals.hasBase === false,
    recon: (run.recon ?? []).map((c) => ({ ok: !!c.ok, label: reconShort(c.key) })),
    unsaved: {
      1: unsavedPlan ? [isAux ? 'план партии' : 'строки партии'] : undefined,
      // Настил (шаг 3) правится в модальном редакторе с собственным состоянием — черновика на
      // странице он не оставляет, поэтому и метки «не сохранено» у него нет.
      5: unsavedCosts ? ['статьи затрат'] : undefined,
    },
  });
  const currentStep = steps.find((s) => s.current)?.id ?? null;
  const otherSteps = steps.filter((s) => s.id !== currentStep);

  // Every step that has been on screen at least once. The panels live in ONE keyed list and only
  // their VISIBILITY moves, because a panel that changes place in the tree unmounts — and an
  // unmounted editor takes its typed draft with it. That is not hypothetical: setting a planned run
  // to in-progress moves the current phase 1→2, so a lines grid rendered in a separate "current"
  // slot would die exactly when the operator had quantities in it. Accumulated in a ref during
  // render (adding to a set is idempotent, so a StrictMode double render is harmless); an effect
  // would leave the current phase's panel unrendered for a frame.
  if (currentStep != null) mountedRef.current.add(currentStep);
  for (const key of Object.keys(openSteps)) mountedRef.current.add(Number(key) as RunStepId);
  // Current phase first — it is what the page is about — then the rest in conveyor order.
  const mountedPanels = [
    ...steps.filter((s) => s.id === currentStep),
    ...steps.filter((s) => s.id !== currentStep && mountedRef.current.has(s.id)),
  ];

  const colorwayLabel = (productId: number) => {
    const c = colorways.find((x) => (x.productId ?? 0) === productId && productId > 0);
    if (c) return `${c.code ? `${c.code} · ` : ''}${c.name ?? `#${productId}`}`;
    return productId > 0 ? `#${productId}` : '(unassigned)';
  };
  // An aux row is a colour bucket; a legacy single-output run's one row is the output material.
  const auxOutputLabel = (variantId: number) => {
    const v = outputVariants.find((x) => (x.id ?? 0) === variantId);
    if (v)
      return `${v.colorCode ? `${v.colorCode} · ` : ''}${v.colorName || v.materialName || `#${variantId}`}`;
    if (variantId > 0) return `#${variantId}`;
    return materialLabel(outputMaterial, outputMaterialId) || 'выпуск';
  };

  // The receive blocker text is the button's own hover title, verbatim — the guidance callout says
  // the same thing in a sentence, and the two must not drift apart.
  const receiveBlockedTitle = auxNoMaterial
    ? 'set an output material or register a colour variant on the tech card before receiving'
    : unassignedPlanned
      ? `${unassignedPlanned} line(s) have no product — publish them or zero their received qty`
      : undefined;
  // Receiving lives in the page header AND in the step-3 panel: it is the action of that phase, and
  // the phase is where an operator looking at the counts already is. Same handler, same modal.
  // The page header carries the ink-filled page action; inside a panel a control is `secondary`.
  const receiveButton = (size: 'lg' | 'sm', variant: 'main' | 'secondary') =>
    canEdit && receivable ? (
      <Button
        type='button'
        variant={variant}
        size={size}
        className='uppercase'
        title={receiveBlockedTitle}
        onClick={() => setReceiveOpen(true)}
      >
        receive
      </Button>
    ) : null;

  // One phase's panel: the SAME components as before, only re-parented. A step whose region is
  // several blocks (closure) returns them as siblings — the caller wraps every region in a
  // SectionStack, so the 24px gutter between blocks is the divider, as everywhere else.
  //
  // The FIRST block of every region carries the step's number and the region's DOM id: it is what
  // the collapsed row's «раскрыть» points `aria-controls` at and what the scroll lands on, so the
  // row and the panel it opened can be tied together by eye and by screen reader.
  const stepPanel = (step: RunStepId) => {
    switch (step) {
      case 1:
        return (
          <Section
            id={stepDomId(1)}
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
                onDirtyChange={onPlanDirty}
              />
            ) : (
              <LinesGrid run={run} canEdit={canEdit} locked={locked} onDirtyChange={onPlanDirty} />
            )}
          </Section>
        );
      case 2:
        return (
          <Section
            id={stepDomId(2)}
            title='step 2 · materials needed'
            question="Estimated requirement against warehouse stock, from the tech card's material norms."
          >
            {/* `locked` is not decoration: a material issue needs an OPEN run (checkRunOpen), so on a
                received/closed run the issue button could only ever produce a rejection. */}
            <MaterialPlan run={run} canEdit={canEdit} locked={locked} />
          </Section>
        );
      case 3:
        // Ф4.3 «как раскроить» — фаза между материалами и приёмкой: настелить нечего, пока ткань не
        // выдана, и принимать нечего, пока не раскроено. Комментарий и гейт — авторские:
        //
        // Блок рисует себя САМ, вместе со своей `Section`: у него есть состояние «не применимо»
        // (aux-карточка), при котором пустая рамка с заголовком была бы приглашением построить то,
        // чего у этого прогона не бывает. Клиентский гейт `!isAux` — та же машинерия, что у
        // требований релиза: сервер отдаёт applicable = false с причиной, клиент не рендерит блок.
        //
        // Гейт живёт теперь ОДИН РАЗ — в `hasLayStep`: он же убирает шаг 3 из ленты, так что
        // строка «раскрыть» не может привести к панели, которая ничего не рисует. Сам `id` нужен
        // якорю: блок владеет своей Section, поэтому номер шага в заголовке — его, а не наш.
        //
        // ПРИЁМКА КРОЯ (Ф5б.5) — ВТОРОЙ блок того же шага, а не седьмая фаза ленты. Она называет
        // ФАКТ раскроя (выкроено → принято в пошив), то есть то, чем шаг «раскрой» заканчивается;
        // «шаг 4 · приёмка» рядом — про другое событие, про сдачу ГОТОВЫХ изделий на склад, и
        // сводить их в один шаг значило бы называть одним словом крой и пошив. Своей фазы она не
        // получает ещё и потому, что лента сознательно НЕ перенумеровывается (run-conveyor.tsx:12-19):
        // «закрытие» обязано у всех читателей называться шестым. Якорь региона остаётся у первого
        // блока — плана настилов, поэтому `id` здесь не дублируется.
        return (
          <>
            <LayPlan run={run} canEdit={canEdit} locked={locked} id={stepDomId(3)} />
            <CutReceipts run={run} canEdit={canEdit} locked={locked} />
          </>
        );
      case 4:
        return (
          <Section
            id={stepDomId(4)}
            title='шаг 4 · приёмка'
            question='В клетке «принято/план» по размеру. Каждая поставка — отдельная квитанция; финальная закрывает серию.'
            action={receiveButton('sm', 'secondary')}
          >
            <RunReceiptTable
              lines={lines}
              sizeOrder={techCard?.techCard?.sizeIds ?? []}
              sizeLabel={(s) => String(findInDictionary(dictionary, s, 'size') || s)}
              rowHeader={isAux ? 'выпуск' : 'колор-модель'}
              rowLabel={isAux ? auxOutputLabel : colorwayLabel}
              groupBy={isAux ? 'variant' : 'product'}
            />

            {/* Receiving history (Phase 5): every booked delivery of this run, oldest first — what
                arrived when, whether it closed the series, and whether accounting has posted it.
                Renders only once something was received; money on receipts is server-stripped
                without costing:read, so the list is safe for every reader. */}
            {receipts.length > 0 ? (
              <>
                <GroupLabel>квитанции</GroupLabel>
                <div className='flex flex-col'>
                  {receipts.map((rc) => {
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
                    // Phase 6: a reversal row documents the undo of another receipt; a reversed
                    // receipt stays in the history greyed out — its units and money left every
                    // rollup.
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
              </>
            ) : null}
          </Section>
        );
      case 5:
        // Money is confidential: without costing:read this step is not on the band at all, so it
        // is never asked for — the guard is here because a panel that can render nothing must say
        // so at its own boundary. The plan-vs-actual STRIP is not here: it summarises the whole
        // batch, like the quantity stats, and lives under the band at every status.
        return canReadCosting ? (
          <>
            <Section
              id={stepDomId(5)}
              title='step 5 · actual costs'
              question='Log the real costs incurred once known.'
            >
              {/* UpdateProductionRun refuses a received/closed run, and cost articles are written
                  through it. The editor stays readable, the save is gone. */}
              <RunCosts
                run={run}
                canEdit={canEdit}
                canReadCosting={canReadCosting}
                locked={locked}
                onDirtyChange={onCostsDirty}
              />
            </Section>
            {actuals &&
            ((actuals.byColorway?.length ?? 0) > 0 || actuals.unattributedMaterialsBase?.value) ? (
              <ColorwayCostBlock actuals={actuals} colorways={colorways} />
            ) : null}
          </>
        ) : null;
      case 6:
        return (
          <>
            {/* Сверка «ожидаемое vs проведённое» (Phase 8): три server-side чека — квитанции против
                сток-журнала, posted-квитанции против живых проводок, статьи затрат против
                капитализированных клеймов.
                Раньше блок скрывался на партии без квитанций, чтобы не шуметь пустотой на странице.
                Теперь весь шаг 5 и так лежит за «раскрыть» — а первый блок панели обязан называть
                номер шага, иначе раскрытая строка ведёт в блок «material movements», где слова
                «шаг 5» нет. Так что блок рендерится всегда и честно говорит, что сверять нечего. */}
            <Section
              id={stepDomId(6)}
              title='шаг 6 · сверка'
              question='Каждая цифра рана обязана сходиться с журналами; расхождение — сигнал, не косметика.'
            >
              {(run.recon ?? []).length === 0 ? (
                <Text variant='inactive' size='small'>
                  сверять нечего — партия ещё ничего не приняла
                </Text>
              ) : null}
              <div className='flex flex-col'>
                {(run.recon ?? []).map((c) => (
                  <div
                    key={c.key}
                    className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0'
                  >
                    <Text size='small' className={c.ok ? '' : 'font-bold text-error'}>
                      {c.ok ? '✓' : '✗'} {reconLabel(c.key)}
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

            {/* Продуктовый сток-журнал рана (Phase 8): все движения его reference-семейства —
                приёмки (production_run:<id>) и реверсы (receipt:<id>). Дополняет материальные
                движения выше: там — ткань, тут — готовые изделия. */}
            {receipts.length > 0 ? (
              <Section title='движения готовых изделий' collapsible defaultOpen={false}>
                <RunStockChanges runId={run.id ?? 0} createdAt={run.createdAt} />
              </Section>
            ) : null}
          </>
        );
    }
  };

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
            {receiveButton('lg', 'main')}
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

      {/* The conveyor: five phases, the current one filled with ink. Read-only by design — it
          reports where the run is, the panels below it act. */}
      <RunConveyor steps={steps} />

      {/* What to do next — the single sentence the rest of the page exists to support. Visible
          text, not a hover-only tooltip, so a blocked receive is obvious before it's clicked. */}
      {guidance ? (
        <CalloutBox tone={GUIDANCE_TONE[guidance.tone]}>
          <Text size='small'>
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
        </CalloutBox>
      ) : null}

      {/* Quantity is not money — shown to anyone who can open the run, matching the lines grid
          below (which is likewise never costing-gated). This is the whole batch, not one phase,
          so it stays under the band whatever step the run is in. */}
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

      {/* Plan-vs-actual cost: a summary of the WHOLE batch, exactly like the quantity strip above,
          so it sits under the band at every status rather than behind step 4 — an owner asking
          "what is this batch costing" must not have to expand a phase to find out. Costing-gated;
          the editor and the per-colourway split stay in step 4. */}
      {canReadCosting ? <CostSummary run={run} actuals={actuals} /> : null}

      {/* The phases' panels: ONE keyed list, current phase first, everything else hidden until it
          is expanded. See mountedPanels — the list is what keeps a draft alive across a phase
          change, so nothing here may move a panel to another place in the tree. */}
      {mountedPanels.map((s) => (
        <SectionStack key={s.id} hidden={!(s.id === currentStep || openSteps[s.id])}>
          {stepPanel(s.id)}
        </SectionStack>
      ))}

      {otherSteps.length > 0 ? (
        <Section
          title={currentStep ? 'остальные шаги' : 'шаги партии'}
          question={
            currentStep
              ? 'Фазы вне текущей — раскрой любую, если нужно вернуться к ней; она откроется выше.'
              : 'Партия отменена: активной фазы нет.'
          }
        >
          <div className='flex flex-col'>
            {otherSteps.map((s) => (
              <Row
                key={s.id}
                label={
                  <span className='flex flex-wrap items-center gap-2'>
                    <StepGlyph state={s.state} />
                    <Text size='small' variant='uppercase' component='span'>
                      {s.title}
                    </Text>
                    <Text
                      size='small'
                      component='span'
                      className={s.state === 'problem' ? 'text-error' : 'text-labelColor'}
                    >
                      {s.summary}
                    </Text>
                    {/* Also on the row, not only on the band: this is where the decision to expand
                        is taken, and a waiting draft is the strongest reason to take it. */}
                    {s.unsaved?.length ? <UnsavedBadge what={s.unsaved} /> : null}
                  </span>
                }
                value={
                  <Button
                    type='button'
                    size='xs'
                    variant='secondary'
                    aria-expanded={!!openSteps[s.id]}
                    aria-controls={stepDomId(s.id)}
                    onClick={() => toggleStep(s.id)}
                  >
                    {openSteps[s.id] ? 'свернуть' : 'раскрыть'}
                  </Button>
                }
              />
            ))}
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

// A wire decimal as a number, 0 when unset — for counting plan rows, never for money arithmetic.
const decNum = (d?: googletype_Decimal) => Number(d?.value ?? '') || 0;

// The anchor of a phase's panel: it lands on the FIRST block of that panel, which is also the block
// whose title carries the step number. Used by the collapsed row's `aria-controls` and by the
// scroll-on-expand, so both point at the same thing.
const stepDomId = (step: RunStepId) => `run-step-${step}`;

// The three server-side reconciliation checks, named. `reconLabel` is the sentence the сверка block
// has always printed; `reconShort` is the same check in one word, for the conveyor's summary line
// («сверка не сходится: единицы; затраты»). Unknown keys fall through to the costs check, exactly
// as the block's original ternary did.
const RECON_LABEL: Record<string, string> = {
  units_receipts_vs_stock_journal: 'единицы: квитанции ↔ сток-журнал',
  money_posted_vs_entries: 'проводки: posted-квитанции ↔ живые записи',
};
const RECON_SHORT: Record<string, string> = {
  units_receipts_vs_stock_journal: 'единицы',
  money_posted_vs_entries: 'проводки',
};
const reconLabel = (key?: string) =>
  RECON_LABEL[key ?? ''] ?? 'затраты: начислено ↔ капитализировано';
const reconShort = (key?: string) => RECON_SHORT[key ?? ''] ?? 'затраты';

// Status- (and blocker-) driven guidance banner. Folds the receive button's hover-only `title`
// blockers (auxNoMaterial / unassignedPlanned — previously invisible until you happened to hover
// a button) and the run's lifecycle into the one sentence a confused operator actually needs.
type GuidanceTone = 'neutral' | 'warning' | 'success' | 'error';
type Guidance = { tone: GuidanceTone; text: string; href?: string; linkLabel?: string };

// CalloutBox carries three tones and no green one: "done" in this system is the green status badge
// in the header and the ✓ glyphs on the band, both of which are already on screen when the success
// sentence shows. A received run therefore reads as a neutral note rather than inventing a fourth
// callout tone in a screen.
const GUIDANCE_TONE: Record<GuidanceTone, 'note' | 'warning' | 'error'> = {
  neutral: 'note',
  warning: 'warning',
  success: 'note',
  error: 'error',
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

// A decimal as a NUMBER, with "absent" kept distinct from zero: null means there is no number at
// all, and null is NOT 0. (`decNum` above deliberately coerces to 0 for arithmetic — that
// coercion is exactly what must not happen here, where the whole point is telling "no snapshot"
// apart from "a snapshot of zero".)
//
// Ф6.7 needs this because a google.type.Decimal is a STRING on the wire ({value: "1.5"}) and
// "1.5" vs "1.5000" is one number written two ways: comparing the strings would announce "the
// card moved" on a run where nothing moved. Today both sides happen to be rendered from the same
// 2-dp value in trimmed canonical form, so the strings usually agree too — usually is not a
// contract, and the scale of either column can widen without anyone touching this file.
function planCostNumber(d?: googletype_Decimal): number | null {
  const n = parseDecimalNumber(d?.value);
  return Number.isFinite(n) ? n : null;
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
  // Ф6.7. `plannedUnitCost` is a snapshot taken ONCE, when the run was created, and deliberately
  // never recomputed; `plannedUnitCostToday` is the same formula over TODAY's card. The two drift
  // legally — re-shooting a norm moves the card's price and not the run's — and the drift cannot
  // be caught by a date: neither saving a marker nor writing a recipe touches tech_card.updated_at,
  // so the timestamp is silent in precisely the case this badge exists for. The only honest signal
  // is that the two NUMBERS disagree. Both sides may independently be absent, and absent is a third
  // thing — neither zero nor "they agree" — hence four states, three of which are not a badge.
  const planSnapshot = planCostNumber(run.plannedUnitCost);
  const planToday = planCostNumber(run.plannedUnitCostToday);
  const snapshotDate = runDate(run.createdAt) || '—';
  // The today-price is computed in the BASE currency by construction (the server returns nothing
  // when the costing is not in base), so `cur` — base first — is its true unit.
  const planTodayText = run.plannedUnitCostToday?.value
    ? `${decimalToInput(run.plannedUnitCostToday)} ${cur}`.trim()
    : '';
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
        // Ф6.7, in the order the four states have to be told apart. Blue (`attention`) is this
        // system's "changed / stale, a human should look"; grey is "no number to compare". Red
        // stays reserved for loss and blockers — a plan price that moved is neither.
        if (planSnapshot === null) {
          // The snapshot was never taken: the server writes NULL on purpose when the run's costing
          // is not in the base currency. Today's number may still exist and may be shown — but it
          // cannot be called a divergence, because there is nothing for it to diverge from.
          return (
            <div className='flex flex-wrap items-center gap-2'>
              <Pill tone='mut'>snapshot not taken</Pill>
              <Text variant='inactive' size='small'>
                плановая цена при создании прогона не снималась (костинг не в базовой валюте)
                {planTodayText ? ` — сегодня та же формула даёт ${planTodayText}` : ''}
              </Text>
            </div>
          );
        }
        if (planToday === null) {
          // Snapshot yes, today no: the card was deleted, or its costing is no longer in base.
          // Empty must read as empty — this is not "they agree" and not a reason to say nothing.
          return (
            <div className='flex flex-wrap items-center gap-2'>
              <Pill tone='mut'>today not computed</Pill>
              <Text variant='inactive' size='small'>
                плановая цена — снапшот от {snapshotDate}; по сегодняшней карточке цену посчитать не
                удалось (карточки нет или её костинг не в базовой валюте) — расхождение неизвестно
              </Text>
            </div>
          );
        }
        // Both numbers exist and agree — nothing has moved the price since the snapshot. Nothing
        // to say, so nothing is said.
        if (planToday === planSnapshot) return null;
        // ПРИЧИНУ НЕ НАЗЫВАЕМ. Соблазн написать «карточка изменилась» велик, и в распространённом
        // случае это ложь: в ту же формулу входит actual_wastage_percent САМОГО ПРОГОНА, который
        // правится на этом же экране. Оператор, поменявший процент раскроя, получил бы обвинение
        // карточки, где никто ничего не трогал, и ушёл бы искать несуществующую правку. Говорим
        // факт и называем обе двери, в которые стоит заглянуть.
        return (
          <div className='flex flex-wrap items-start gap-2'>
            <Pill tone='attention'>plan drifted</Pill>
            <Text variant='inactive' size='small'>
              плановая цена — снапшот от {snapshotDate}; сегодня та же формула даёт {planTodayText} —{' '}
              {planToday > planSnapshot ? 'дороже' : 'дешевле'} снапшота. Разойтись могли двое:
              карточка (пересъёмка нормы, правка рецепта или цен) и процент раскроя этого прогона —
              он тоже входит в расчёт.
            </Text>
          </div>
        );
      })()}

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
        <CalloutBox tone='warning' className='flex flex-col gap-1'>
          {warnings.map((w, i) => (
            <Text key={i} size='small'>
              ! {w}
            </Text>
          ))}
        </CalloutBox>
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
