import {
  common_Material,
  common_MaterialMovement,
  common_MaterialMovementType,
} from 'api/proto-http/admin';
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { format } from 'date-fns';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  DateRangePicker,
  EmptyCell,
  GroupLabel,
  Section,
  Select,
  SkeletonRows,
  Text,
} from 'ui';
import { decimalToInput } from 'utils/decimal';
import { InvoiceMark } from './invoice-drop';
import { MaterialPicker } from './material-picker';
import { MaterialThumb } from './material-thumb';
import { useMaterials } from './useMaterials';
import { MovementFilter, useMaterialMovements } from './useWarehouse';
import { movementDelta, movementKind, movementTypeFilterOptions } from './warehouse-options';

const ANY_TYPE: common_MaterialMovementType = 'MATERIAL_MOVEMENT_TYPE_UNKNOWN';

// Signed, with a true minus so the column reads as one ink figure.
const deltaOf = (m: common_MaterialMovement) =>
  (
    movementDelta(m.onHandBefore?.value, m.onHandAfter?.value) || decimalToInput(m.quantity)
  ).replace(/^-/, '−');

// `02 Oct`, zero-padded so the column lines up; the year only when it is not this one.
function shortDay(at?: string) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'dd MMM' : 'dd MMM yyyy');
}

const runLink = (id: number) => (
  <Link to={`/production-runs/${id}`} className='underline'>
    PR-{id}
  </Link>
);

const sampleRef = (m: common_MaterialMovement) =>
  m.techCardId ? (
    <Link to={`/tech-cards/${m.techCardId}?tab=samples&sample=${m.sampleId}`} className='underline'>
      #{m.sampleId}
    </Link>
  ) : (
    <>#{m.sampleId}</>
  );

// REASON = `kind · ref`. Direction lives in Δ, so no arrows here.
function Reason({ m }: { m: common_MaterialMovement }) {
  const kind = movementKind(m.movementType);
  if (!kind) return <EmptyCell />;
  let ref: React.ReactNode = null;
  switch (m.movementType) {
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION':
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_PRODUCTION':
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT_PRODUCTION':
      ref = m.productionRunId ? runLink(m.productionRunId) : null;
      break;
    case 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE':
    case 'MATERIAL_MOVEMENT_TYPE_RETURN_SAMPLE':
      ref = m.sampleId ? sampleRef(m) : null;
      break;
    case 'MATERIAL_MOVEMENT_TYPE_RECEIPT':
      ref = m.lot || m.supplierDoc || null;
      // ⎘ after the doc (alone when there is none): the invoice attached on receipt.
      if (m.invoiceFileId) {
        const mark = <InvoiceMark fileId={m.invoiceFileId} name={m.invoiceFileName} />;
        ref = ref ? (
          <>
            {ref} {mark}
          </>
        ) : (
          mark
        );
      }
      break;
    case 'MATERIAL_MOVEMENT_TYPE_WRITEOFF':
      ref = m.reason || null;
      break;
    case 'MATERIAL_MOVEMENT_TYPE_ADJUSTMENT':
      ref = m.reason || m.comment || null;
      break;
  }
  return (
    <>
      {kind}
      {ref ? <> · {ref}</> : null}
    </>
  );
}

function GroupRow({
  material,
  id,
  cols,
  first,
}: {
  material?: common_Material;
  id: number;
  cols: number;
  first: boolean;
}) {
  return (
    <tr data-group=''>
      <td colSpan={cols} data-align='left' className='!border-b-0 !p-0'>
        <GroupLabel
          plain
          rule='above'
          swatch={<MaterialThumb material={material} size='sm' className='h-6 w-6' />}
          className={cn('px-1.5 pb-2', first ? 'mt-4' : 'mt-8')}
        >
          {material ? (
            <>
              {material.name || `#${id}`}
              <span className='text-labelColor'>
                {material.unit ? ` · ${material.unit}` : ''}
                {material.code ? ` · ${material.code}` : ''}
              </span>
            </>
          ) : (
            `#${id}`
          )}
        </GroupLabel>
      </td>
    </tr>
  );
}

// The movement ledger for a given filter (query + paging + display). Rendered inside a Section by
// the warehouse movements tab and, with a fixed run/sample filter, by the production-run detail
// page and the tech card's sample screen.
export function MovementsList({
  filter,
  filtered = false,
}: {
  filter: MovementFilter;
  /** Filters were set by the user — an empty result reads `no matches`. */
  filtered?: boolean;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { data: matData } = useMaterials('', true);
  const materials = useMemo(() => {
    const map = new Map<number, common_Material>();
    (matData?.materials ?? []).forEach((m) => {
      if (m.id) map.set(Number(m.id), m);
    });
    return map;
  }, [matData]);

  const q = useMaterialMovements(filter, 50);
  // De-dupe across offset pages: a movement posted between two fetches shifts the newest-first
  // boundary, repeating the last row of page N as the first row of page N+1. Order is the
  // backend's (occurred_at DESC, id DESC).
  const movements = useMemo(() => {
    const seen = new Set<number>();
    return (q.data?.pages ?? [])
      .flatMap((p) => p.movements)
      .filter((m) => {
        const id = Number(m.id) || 0;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }, [q.data]);

  // Grouped by material, groups in order of first appearance in the date-ordered list.
  const groups = useMemo(() => {
    const order: number[] = [];
    const map = new Map<number, common_MaterialMovement[]>();
    movements.forEach((m) => {
      const id = Number(m.materialId) || 0;
      if (!map.has(id)) {
        map.set(id, []);
        order.push(id);
      }
      map.get(id)!.push(m);
    });
    return order.map((id) => ({ id, rows: map.get(id)! }));
  }, [movements]);

  if (q.isLoading)
    return (
      <DataTable>
        <tbody>
          <SkeletonRows rows={6} widths={['100%']} />
        </tbody>
      </DataTable>
    );
  if (q.isError)
    return (
      <div className='flex items-baseline gap-3'>
        <Text size='small' variant='label'>
          unavailable
        </Text>
        <Button type='button' variant='underline' size='xs' onClick={() => q.refetch()}>
          retry
        </Button>
      </div>
    );
  if (movements.length === 0)
    return (
      <Text size='small' variant='label'>
        {filtered ? 'no matches' : 'no movements'}
      </Text>
    );

  const oneMaterial = !!filter.materialId;
  const cols = phone ? 1 : 4;

  return (
    <>
      <DataTable
        stickyHeader
        hoverRows
        className='table-fixed [&>tbody>tr:last-child>td]:!border-b-0'
      >
        {phone ? (
          <thead>
            <tr>
              <th data-align='left'>
                <div className='flex items-baseline gap-3'>
                  <span className='w-12 shrink-0'>date</span>
                  <span className='flex-1'>reason</span>
                  <span>Δ / on hand</span>
                </div>
              </th>
            </tr>
          </thead>
        ) : (
          <>
            <colgroup>
              <col className='w-24' />
              <col />
              <col className='w-20' />
              <col className='w-20' />
            </colgroup>
            <thead>
              <tr>
                <th data-align='left'>date</th>
                <th data-align='left'>reason</th>
                <th>Δ</th>
                <th>on hand</th>
              </tr>
            </thead>
          </>
        )}
        {groups.map((g, gi) => (
          <tbody key={g.id}>
            {oneMaterial ? (
              <tr data-group='' aria-hidden>
                <td colSpan={cols} className='h-2 !border-0 !p-0' />
              </tr>
            ) : (
              <GroupRow material={materials.get(g.id)} id={g.id} cols={cols} first={gi === 0} />
            )}
            {g.rows.map((m) =>
              phone ? (
                <tr key={m.id} className='[&>td]:!py-2'>
                  <td data-align='left' className='w-full'>
                    <div className='flex items-baseline gap-3'>
                      <span className='w-12 shrink-0 text-labelColor'>
                        {shortDay(m.occurredAt)}
                      </span>
                      <span className='min-w-0 flex-1 truncate'>
                        <Reason m={m} />
                      </span>
                      <span className='shrink-0 whitespace-nowrap'>{deltaOf(m)}</span>
                    </div>
                    <div className='text-right text-labelColor'>
                      {decimalToInput(m.onHandAfter) || <EmptyCell />}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className='[&>td]:!py-2.5'>
                  <td data-align='left' className='whitespace-nowrap text-labelColor'>
                    {shortDay(m.occurredAt) || <EmptyCell />}
                  </td>
                  <td data-align='left' className='truncate'>
                    <Reason m={m} />
                  </td>
                  <td className='whitespace-nowrap'>{deltaOf(m)}</td>
                  <td className='whitespace-nowrap text-labelColor'>
                    {decimalToInput(m.onHandAfter) || <EmptyCell />}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        ))}
      </DataTable>
      {q.hasNextPage ? (
        <div>
          <Button
            type='button'
            variant='underline'
            size='xs'
            disabled={q.isFetchingNextPage}
            onClick={() => q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? 'loading…' : 'more'}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// The warehouse /materials movements tab: URL-driven filters over the shared MovementsList.
export function MovementsTab() {
  const phone = useMediaQuery(PHONE_QUERY);
  const [params, setParams] = useSearchParams();

  const materialId = Number(params.get('material')) || 0;
  const type = (params.get('type') as common_MaterialMovementType) || ANY_TYPE;
  const runId = Number(params.get('run')) || 0;
  const sampleId = Number(params.get('sample')) || 0;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const active = !!materialId || type !== ANY_TYPE || !!runId || !!sampleId || !!from || !!to;

  const patch = (next: Record<string, string | number>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => {
          if (!v || v === ANY_TYPE) p.delete(k);
          else p.set(k, String(v));
        });
        return p;
      },
      { replace: true },
    );
  const clear = () => patch({ material: 0, type: 0, run: 0, sample: 0, from: '', to: '' });

  const material = (
    <MaterialPicker
      value={materialId}
      onChange={(id) => patch({ material: id })}
      placeholder='material'
      includeArchived
    />
  );
  const range = (
    <DateRangePicker from={from} to={to} onChange={(f, t) => patch({ from: f, to: t })} />
  );
  const typeSelect = (
    <Select
      name='type'
      items={movementTypeFilterOptions}
      value={type}
      placeholder='type'
      fullWidth
      onValueChange={(v: string) => patch({ type: v })}
    />
  );
  // Run/sample arrive by deep link and have no picker: the scope is a plain word next to `clear`.
  const scopeText = runId ? `PR-${runId}` : sampleId ? `sample #${sampleId}` : '';
  const scope = active ? (
    <div className='flex items-baseline justify-end gap-3 whitespace-nowrap'>
      {scopeText ? <Text component='span'>{scopeText}</Text> : null}
      <Button type='button' variant='underline' size='xs' onClick={clear}>
        clear
      </Button>
    </div>
  ) : null;

  return (
    <Section>
      <div className='border-b border-hairline pb-2.5'>
        {phone ? (
          <div className='flex flex-col gap-1.5'>
            {material}
            {range}
            {typeSelect}
            {scope}
          </div>
        ) : (
          <div className='grid grid-cols-[1fr_1fr_11rem_auto] items-center gap-2'>
            {material}
            {range}
            {typeSelect}
            {scope ?? <span />}
          </div>
        )}
      </div>
      <MovementsList
        filtered={active}
        filter={{
          materialId,
          productionRunId: runId,
          sampleId,
          movementType: type,
          occurredFrom: from,
          occurredTo: to,
        }}
      />
    </Section>
  );
}
