import { useQueryClient } from '@tanstack/react-query';
import {
  MaterialPlanBlocker,
  MaterialPlanContribution,
  MaterialPlanRow,
  common_ProductionRun,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  IssueStockModal,
  MovementTarget,
} from 'components/managers/materials/components/movement-modals';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { productionRunKeys, useMaterialPlan } from './useProductionRuns';

const num = (d?: googletype_Decimal) => decimalToInput(d) || '0';
const isShort = (r: MaterialPlanRow) => Number(r.shortage?.value) > 0;
// issued_variance (gap-04): signed issued − required. Blank until anything is issued; a material
// issued exactly per plan shows an explicit "0" — '—' would read as "untouched".
const variance = (d?: googletype_Decimal, issued?: googletype_Decimal) => {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n)) return '—';
  if (n === 0) return Number(issued?.value) > 0 ? '0' : '—';
  return `${n > 0 ? '+' : ''}${Number(n.toFixed(3))}`;
};

// One slot's contributions, grouped for the breakdown. Keys pass through wireInt — the generated
// types say number but grpc-gateway serializes int64 as a JSON string.
type SlotGroup = {
  key: string;
  slotName: string;
  section: string;
  rows: MaterialPlanContribution[];
};

const sectionLabel = (s?: string) =>
  (s ?? '').replace('TECH_CARD_BOM_SECTION_', '').toLowerCase().replace('unknown', '');

// Estimated material requirement of the run against warehouse stock (NF-06). Two layers with
// distinct jobs (mirroring the response): the ARTICLES table is the only carrier of stock figures
// (an article shared by two slots has ONE pile of stock, counted once); the BY-SLOT breakdown is
// the factory spec — which role, which colourway, which article, how much — with no stock columns.
// Blockers (slot × colourway the plan could NOT count) surface first: a plan that silently drops a
// slot reads as "no shortage" and the run sews the wrong zip.
export function MaterialPlan({ run, canEdit }: { run: common_ProductionRun; canEdit: boolean }) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  // Issuing stock is a warehouse write — gate on the same section the warehouse module uses,
  // or a production-only account gets a button that 403s at submit.
  const { canWrite } = usePermissions();
  const canIssue = canEdit && canWrite(SECTION.techCards);
  const runId = run.id ?? 0;
  const { data, isLoading, isError, refetch, isFetching } = useMaterialPlan(runId, runId > 0);
  const rows = data?.rows ?? [];
  const caveats = data?.caveats ?? [];
  const blockers: MaterialPlanBlocker[] = data?.blockers ?? [];
  const contributions: MaterialPlanContribution[] = data?.contributions ?? [];

  const slotGroups = useMemo<SlotGroup[]>(() => {
    const bySlot = new Map<string, SlotGroup>();
    for (const c of contributions) {
      const key = String(wireInt(c.bomItemId)) + ':' + (c.slotName ?? '');
      let g = bySlot.get(key);
      if (!g) {
        g = { key, slotName: c.slotName || '—', section: sectionLabel(c.section), rows: [] };
        bySlot.set(key, g);
      }
      g.rows.push(c);
    }
    return [...bySlot.values()];
  }, [contributions]);

  // The run's colourways (products) so an issue can be attributed to the one it was cut for
  // (gap-07 v2 C). R1: a colourway is a product; useTechCard's live AdminColorwayRef[] is the
  // same source lines-grid.tsx uses — name resolves from dictionary.colors by colour code.
  const techCardId = run.run?.techCardId ?? 0;
  const { data: techCard } = useTechCard(techCardId ? techCardId : undefined);
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? [])
        .filter((cw) => (cw.colorwayId ?? 0) > 0)
        .map((cw) => {
          const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
          const name = dc?.name ?? cw.colorCode ?? `#${cw.colorwayId}`;
          return {
            productId: cw.colorwayId ?? 0,
            label: `${cw.colorCode ? `${cw.colorCode} · ` : ''}${name}`,
          };
        }),
    [techCard?.colorways, dictionary?.colors],
  );

  const [issue, setIssue] = useState<{ target: MovementTarget; qty: string } | undefined>();

  const copyShortage = async () => {
    const text = rows
      .filter(isShort)
      .map((r) => `${r.materialName} — ${num(r.shortage)} ${r.unit ?? ''}`.trim())
      .join('; ');
    if (!text) {
      showMessage('No shortage to copy', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showMessage('Shortage copied', 'success');
    } catch {
      showMessage('Could not copy to clipboard', 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          material plan
        </Text>
        <div className='flex items-center gap-2'>
          {rows.some(isShort) ? (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={copyShortage}
            >
              copy shortage
            </Button>
          ) : null}
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            disabled={isFetching}
            onClick={() => refetch()}
          >
            {isFetching ? 'refreshing…' : 'refresh'}
          </Button>
        </div>
      </div>

      {blockers.length > 0 ? (
        <CalloutBox tone='warning' className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' component='span' className='font-bold uppercase'>
            not counted — the plan is incomplete
          </Text>
          {blockers.map((b, i) => (
            <Text key={i} size='small'>
              {b.slotName || 'slot'} · {b.colorwayName || `#${b.colorwayId}`} — {b.plannedQty} pcs:{' '}
              {b.reason}
            </Text>
          ))}
          <Text variant='inactive' size='small'>
            fix the recipe on the{' '}
            <Link to={`${ROUTES.techCards}/${techCardId}`} className='underline'>
              tech card ↗
            </Link>
          </Text>
        </CalloutBox>
      ) : null}

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>Material plan is unavailable.</Text>
      ) : rows.length === 0 && blockers.length === 0 ? (
        <Text variant='inactive' size='small'>
          no material requirement — the card's colourways have no linked materials with norms ·{' '}
          <Link to={`${ROUTES.techCards}/${techCardId}`} className='underline'>
            open tech card ↗
          </Link>
        </Text>
      ) : rows.length === 0 ? null : (
        <DataTable>
          <thead>
            <tr>
              <th>material</th>
              <th>required</th>
              <th>on hand</th>
              <th>issued</th>
              <th>Δ vs plan</th>
              <th>shortage</th>
              {canIssue ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={wireInt(r.materialId)}>
                <td>
                  {r.materialName}
                  {r.hasSizeNorms === false ? (
                    <Text variant='inactive' size='small'>
                      per-garment norm (rough)
                    </Text>
                  ) : null}
                </td>
                <td>
                  {num(r.required)} {r.unit}
                </td>
                <td>{num(r.onHand)}</td>
                <td>{num(r.issued)}</td>
                <td title='issued − required: >0 over-issued (scrap/overuse), <0 leftover'>
                  {variance(r.issuedVariance, r.issued)}
                </td>
                <td className={isShort(r) ? 'font-bold' : ''}>
                  {isShort(r) ? '! ' : ''}
                  {num(r.shortage)}
                </td>
                {canIssue ? (
                  <td>
                    <Button
                      type='button'
                      variant='secondary'
                      className='uppercase'
                      onClick={() =>
                        setIssue({
                          target: {
                            materialId: wireInt(r.materialId),
                            materialLabel: r.materialName ?? `#${r.materialId}`,
                            unit: r.unit ?? '',
                            onHand: decimalToInput(r.onHand) || '0',
                          },
                          qty: isShort(r) ? num(r.shortage) : '',
                        })
                      }
                    >
                      issue…
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {slotGroups.length > 0 ? (
        <div className='flex flex-col'>
          <GroupLabel>by slot — the factory spec (no stock figures here)</GroupLabel>
          {slotGroups.map((g) => (
            <div key={g.key} className='mb-1'>
              <Text size='small' className='font-bold'>
                {g.slotName}
                {g.section ? (
                  <Text variant='inactive' size='micro' component='span' className='uppercase'>
                    {' '}
                    · {g.section}
                  </Text>
                ) : null}
              </Text>
              <DataTable>
                <tbody>
                  {g.rows.map((c, i) => (
                    <tr key={`${wireInt(c.colorwayId)}-${wireInt(c.materialId)}-${i}`}>
                      <td className='w-1/3'>{c.colorwayName || `#${c.colorwayId}`}</td>
                      <td className='text-left'>
                        {c.materialName || <EmptyCell />}
                        {c.pinned ? (
                          ''
                        ) : (
                          <Text variant='inactive' size='micro' component='span'>
                            {' '}
                            (default)
                          </Text>
                        )}
                      </td>
                      <td>
                        {num(c.required)} {c.unit}
                        {c.hasSizeNorms === false ? ' ~' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ))}
        </div>
      ) : null}

      {caveats.length > 0 ? (
        <div className='flex flex-col gap-0.5'>
          {caveats.map((c, i) => (
            <Text key={i} variant='inactive' size='small'>
              · {c}
            </Text>
          ))}
        </div>
      ) : null}

      {issue ? (
        <IssueStockModal
          open
          onOpenChange={(v) => {
            if (!v) {
              setIssue(undefined);
              // Refresh the plan's issued/shortage and the run's actuals after a booking.
              qc.invalidateQueries({ queryKey: productionRunKeys.detail(runId) });
            }
          }}
          target={issue.target}
          defaultTarget={{ productionRunId: runId }}
          defaultQty={issue.qty}
          lockTarget
          colorways={colorways}
        />
      ) : null}
    </div>
  );
}
