import {
  common_ProductionRun,
  common_ProductionRunActuals,
  common_ProductionRunStatus,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { AuxRunPlan } from './components/aux-run-plan';
import { LinesGrid } from './components/lines-grid';
import { MaterialPlan } from './components/material-plan';
import { isRunLocked, isRunReceivable, runStatusLabel, runStatusTone } from './components/options';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { RunCosts } from './components/run-costs';
import {
  deleteRunErrorMessage,
  useDeleteProductionRun,
  useProductionRun,
} from './components/useProductionRuns';

export function ProductionRunDetail() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id) || 0;
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const { canWrite, canReadCosting } = usePermissions();
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

  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);
  // Lines planned but not yet tied to a product can't be booked on receive (NF-06) — hint it.
  // Auxiliary lines legitimately carry no product (they book into a material), so never flag them.
  const unassignedPlanned = isAux
    ? 0
    : (ins?.lines ?? []).filter((l) => (l.plannedQty ?? 0) > 0 && !l.productId).length;
  // An aux run can't be received until the card names an output material (FailedPrecondition).
  const auxNoMaterial = isAux && !outputMaterialId;

  // Plan vs fact quantities, summed straight from the run's own lines rather than the
  // costing-gated `actuals` — "how many did we make" isn't money, so it should be visible to
  // anyone who can open the run, same as the lines grid itself further down the page.
  const lines = ins?.lines ?? [];
  const plannedQtyTotal = lines.reduce((s, l) => s + (l.plannedQty ?? 0), 0);
  const hasReceivedAny = lines.some((l) => l.receivedQty != null);
  const receivedQtyTotal = lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0);
  const defectQtyTotal = lines.reduce((s, l) => s + (l.defectQty ?? 0), 0);
  const defectPct = receivedQtyTotal > 0 ? (defectQtyTotal / receivedQtyTotal) * 100 : 0;

  // A one-line answer to "what IS this run", for the header: an auxiliary run banks a material
  // into the warehouse; a normal run is a set of colour-models that become sellable products.
  const colourModelCount =
    new Set(lines.map((l) => l.productId ?? 0).filter((pid) => pid > 0)).size ||
    (techCard?.colorways?.length ?? 0);
  const runTypeLabel = isAux
    ? 'auxiliary run · produces a material for warehouse stock, not a sellable product'
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
      <div className='-mx-2.5 flex flex-wrap items-start justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
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
                    ? 'set an output material on the tech card before receiving'
                    : unassignedPlanned
                      ? `${unassignedPlanned} line(s) have no product — publish them or zero their received qty`
                      : undefined
                }
                onClick={() => setReceiveOpen(true)}
              >
                receive
              </Button>
            )}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setEditOpen(true)}
            >
              edit
            </Button>
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
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
        <StatTile label='planned qty' value={String(plannedQtyTotal)} />
        <StatTile
          label='received qty'
          value={hasReceivedAny ? String(receivedQtyTotal) : '—'}
          sub={
            hasReceivedAny && plannedQtyTotal > 0
              ? `${Math.round((receivedQtyTotal / plannedQtyTotal) * 100)}% of plan`
              : undefined
          }
        />
        <StatTile
          label='defect'
          value={hasReceivedAny ? String(defectQtyTotal) : '—'}
          sub={
            hasReceivedAny && defectQtyTotal > 0
              ? `${defectPct.toFixed(1)}% of received`
              : undefined
          }
          subClassName={defectQtyTotal > 0 ? 'text-warning' : undefined}
        />
      </div>

      {canReadCosting ? <CostSummary run={run} actuals={actuals} /> : null}

      {canReadCosting &&
      actuals &&
      ((actuals.byColorway?.length ?? 0) > 0 || actuals.unattributedMaterialsBase?.value) ? (
        <ColorwayCostBlock actuals={actuals} colorways={colorways} />
      ) : null}

      {/* The run's own three-step workflow: plan quantities, cover the materials they need, then
          log what it actually cost. Numbered so "what do I do next" has one obvious answer. */}
      <Section
        step={1}
        title='what to produce'
        hint='Plan how many of each colour-model × size this run makes.'
      >
        {isAux ? (
          <AuxRunPlan
            run={run}
            canEdit={canEdit}
            locked={locked}
            outputMaterialId={outputMaterialId}
            outputMaterial={outputMaterial}
          />
        ) : (
          <LinesGrid run={run} canEdit={canEdit} locked={locked} />
        )}
      </Section>

      <Section
        step={2}
        title='materials needed'
        hint="Estimated requirement against warehouse stock, from the tech card's material norms."
      >
        <MaterialPlan run={run} canEdit={canEdit} />
      </Section>

      {canReadCosting ? (
        <Section step={3} title='actual costs' hint='Log the real costs incurred once known.'>
          <RunCosts run={run} canEdit={canEdit} canReadCosting={canReadCosting} />
        </Section>
      ) : null}

      {/* Audit trail, not a planning step — collapsed by default (memory: collapse rarely-used
          content behind <details>), same pattern as the tech card's packaging spec / provenance. */}
      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none px-3 py-2 text-textBaseSize uppercase hover:bg-highlightColor/5'>
          material movements
        </summary>
        <div className='border-t border-textInactiveColor p-3'>
          <MovementsList filter={{ productionRunId: run.id }} />
        </div>
      </details>

      <ProductionRunModal open={editOpen} onOpenChange={setEditOpen} run={run} />
      <ReceiveModal
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        run={run}
        isAux={isAux}
        outputMaterialId={outputMaterialId}
        outputMaterial={outputMaterial}
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
  neutral: 'border-textInactiveColor',
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
    return { tone: 'neutral', text: 'Closed — this is the final record of this run.' };
  }
  if (status === 'PRODUCTION_RUN_STATUS_RECEIVED') {
    return {
      tone: 'success',
      text: 'Received — stock has been posted. Quantities are now locked; costs and materials can still be adjusted.',
    };
  }
  if (auxNoMaterial) {
    return {
      tone: 'warning',
      text: 'This auxiliary run has no output material set on its tech card — set one before it can be received.',
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

// One number, scannable — label / value / an optional coloured note. Mirrors the KPI-tile idiom
// used on the analytics dashboard (PersistentKpiBar) so a run's headline numbers read the same way
// as the rest of the admin.
function StatTile({
  label,
  value,
  sub,
  subClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  subClassName?: string;
}) {
  return (
    <div className='flex min-w-0 flex-col gap-1 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small' className='text-textInactiveColor'>
        {label}
      </Text>
      <Text size='large' className='font-bold'>
        {value}
      </Text>
      {sub ? (
        <Text variant='uppercase' size='small' className={subClassName}>
          {sub}
        </Text>
      ) : null}
    </div>
  );
}

// A numbered card around one step of the run's workflow: a title, a one-line "why", then the
// existing editor (LinesGrid / AuxRunPlan / MaterialPlan / RunCosts) unchanged inside.
function Section({
  step,
  title,
  hint,
  children,
}: {
  step?: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='border border-textInactiveColor'>
      <div className='flex flex-wrap items-baseline gap-x-2 border-b border-textInactiveColor bg-bgColor px-3 py-2'>
        {step ? (
          <Text variant='uppercase' size='small' className='text-textInactiveColor'>
            step {step}
          </Text>
        ) : null}
        <Text variant='uppercase' size='small'>
          {title}
        </Text>
      </div>
      <div className='flex flex-col gap-2 p-3'>
        {hint ? (
          <Text variant='inactive' size='small'>
            {hint}
          </Text>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// Cost variance is actual − plan: spending MORE than planned is bad (red), LESS is good (green) —
// the inverse of a revenue/KPI delta, where up is good. Kept as one helper so both cost tiles
// (unit and total) agree on the sign convention.
function varianceTone(d?: googletype_Decimal): string | undefined {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n) || n === 0) return undefined;
  return n > 0 ? 'text-error' : 'text-success';
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
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <StatTile
          label='unit cost · plan'
          value={
            run.plannedUnitCost?.value
              ? `${decimalToInput(run.plannedUnitCost)} ${run.plannedCurrency || ''}`
              : '—'
          }
        />
        <StatTile
          label='unit cost · actual'
          value={
            actuals?.actualUnitCost?.value
              ? `${decimalToInput(actuals.actualUnitCost)} ${cur}`
              : '— until received'
          }
          sub={varianceSub(actuals?.unitCostVariance)}
          subClassName={varianceTone(actuals?.unitCostVariance)}
        />
        <StatTile
          label='total cost · plan'
          value={
            actuals?.plannedTotalBase?.value
              ? `${decimalToInput(actuals.plannedTotalBase)} ${cur}`
              : '—'
          }
        />
        <StatTile
          label='total cost · actual'
          value={
            actuals?.actualTotalBase?.value
              ? `${decimalToInput(actuals.actualTotalBase)} ${cur}`
              : '— until received'
          }
          sub={varianceSub(actuals?.totalVariance)}
          subClassName={varianceTone(actuals?.totalVariance)}
        />
      </div>

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
    <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        materials by colourway
      </Text>
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
      <Text variant='inactive' size='small'>
        only stock-issued materials are split here; manual cost articles stay run-level. Attribute
        an issue to a colourway from its “issue…” action to move it out of unattributed.
      </Text>
    </div>
  );
}
