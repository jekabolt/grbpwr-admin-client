import { useQueryClient } from '@tanstack/react-query';
import {
  common_Material,
  common_MaterialMovement,
  common_MaterialStockRow,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { notifyFailure } from 'components/managers/production-runs/components/feedback';
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Chip,
  DataTable,
  EmptyCell,
  GroupLabel,
  Input,
  Row,
  Section,
  SkeletonRows,
  Text,
} from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { materialSpec } from './material-code';
import { MaterialThumb } from './material-thumb';
import { IssueStockModal, MovementTarget } from './movement-modals';
import { useMaterials, useSaveMaterial } from './useMaterials';
import {
  useMaterialMovements,
  useMaterialStock,
  useReceiveMaterialStock,
  warehouseKeys,
} from './useWarehouse';
import { movementDelta, movementKind } from './warehouse-options';

const sectionOrder = new Map(
  techCardBomSectionOptions.map((option, index) => [option.value as string, index]),
);

const sectionLabel = (section?: string): string =>
  techCardBomSectionOptions.find((option) => option.value === section)?.label ?? 'other';

const todayISO = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
};

const quantity = (value?: Parameters<typeof decimalToInput>[0]): string => {
  const raw = decimalToInput(value);
  if (!raw) return '0';
  const number = Number(raw);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(number)
    : raw;
};

const movementDay = (at?: string): string => {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
    .format(date)
    .toLowerCase();
};

const movementQuantity = (movement: common_MaterialMovement): string => {
  const delta = movementDelta(movement.onHandBefore?.value, movement.onHandAfter?.value);
  if (delta) return delta.replace(/^-/, '−');
  const amount = decimalToInput(movement.quantity);
  if (!amount) return '';
  const subtracts =
    movement.movementType === 'MATERIAL_MOVEMENT_TYPE_ISSUE_PRODUCTION' ||
    movement.movementType === 'MATERIAL_MOVEMENT_TYPE_ISSUE_SAMPLE' ||
    movement.movementType === 'MATERIAL_MOVEMENT_TYPE_WRITEOFF';
  return `${subtracts ? '−' : '+'}${amount}`;
};

const targetOf = (row: common_MaterialStockRow): MovementTarget => {
  const material = row.material;
  return {
    materialId: Number(material?.id) || 0,
    materialLabel: `${material?.code ? `${material.code} · ` : ''}${
      material?.name ?? `#${material?.id}`
    }`,
    unit: material?.unit ?? '',
    onHand: decimalToInput(row.onHand) || '0',
  };
};

type MinEdit = {
  materialId: number;
  draft: string;
  place: 'cell' | 'expanded';
};

function MaterialIdentity({ material }: { material?: common_Material }) {
  if (!material) return <EmptyCell />;
  const spec = materialSpec(material);
  return (
    <div className='flex min-w-0 items-center gap-3'>
      <MaterialThumb material={material} size='sm' />
      <span className='min-w-0 flex-1'>
        <Text component='span' className='block min-w-0 break-words leading-normal'>
          {material.name || <EmptyCell />}
        </Text>
        {spec ? (
          <Text
            component='span'
            size='micro'
            variant='label'
            className='block min-w-0 break-words leading-normal'
          >
            {spec}
          </Text>
        ) : null}
      </span>
    </div>
  );
}

function MinInput({
  material,
  draft,
  compact = false,
  saving,
  onDraft,
  onSave,
  onCancel,
}: {
  material: common_Material;
  draft: string;
  compact?: boolean;
  saving: boolean;
  onDraft: (value: string) => void;
  onSave: () => Promise<boolean>;
  onCancel: () => void;
}) {
  const submitting = useRef(false);
  const save = () => {
    if (submitting.current || saving) return;
    submitting.current = true;
    void onSave().then((saved) => {
      if (!saved) submitting.current = false;
    });
  };
  return (
    <Input
      autoFocus
      type='text'
      inputMode='decimal'
      value={draft}
      aria-label={`min ${material.name ?? ''}`}
      className={compact ? 'w-12 text-right' : 'ml-auto w-16 text-right'}
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        submitting.current = false;
        onDraft(sanitizeDecimal(event.target.value));
      }}
      onBlur={save}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          submitting.current = true;
          onCancel();
        }
      }}
    />
  );
}

function MovementRows({ materialId, unit }: { materialId: number; unit: string }) {
  const movementsQuery = useMaterialMovements({ materialId }, 3);
  const movements = movementsQuery.data?.pages.flatMap((page) => page.movements).slice(0, 3) ?? [];

  if (movementsQuery.isLoading) {
    return (
      <Text size='micro' variant='label'>
        loading…
      </Text>
    );
  }
  if (movementsQuery.isError) {
    return (
      <span className='flex items-baseline gap-2.5'>
        <Text component='span'>movements unavailable</Text>
        <Button size='xs' variant='underline' onClick={() => movementsQuery.refetch()}>
          retry
        </Button>
      </span>
    );
  }
  if (movements.length === 0) {
    return (
      <Text size='micro' variant='label'>
        no movements
      </Text>
    );
  }

  return (
    <div data-testid='movement-list'>
      {movements.map((movement) => {
        const day = movementDay(movement.occurredAt);
        const kind = movementKind(movement.movementType) || 'movement';
        const delta = movementQuantity(movement);
        return (
          <Row
            key={movement.id}
            label={day ? `${day} · ${kind}` : kind}
            value={delta ? `${delta} ${unit}` : <EmptyCell />}
          />
        );
      })}
    </div>
  );
}

function ExpandedDetails({
  row,
  amount,
  canEdit,
  fullMaterial,
  minEdit,
  minSaving,
  onAmount,
  onStartMin,
  onMinDraft,
  onSaveMin,
  onCancelMin,
  onIssue,
}: {
  row: common_MaterialStockRow;
  amount: string;
  canEdit: boolean;
  fullMaterial?: common_Material;
  minEdit: MinEdit | null;
  minSaving: boolean;
  onAmount: (value: string) => void;
  onStartMin: () => void;
  onMinDraft: (value: string) => void;
  onSaveMin: () => Promise<boolean>;
  onCancelMin: () => void;
  onIssue: () => void;
}) {
  const material = row.material;
  const materialId = Number(material?.id) || 0;
  const unit = material?.unit ?? '';
  const quantityInput = useRef<HTMLInputElement>(null);
  const receive = useReceiveMaterialStock();

  const focusIfEmpty = (): boolean => {
    const parsed = parseDecimalNumber(amount);
    if (Number.isFinite(parsed) && parsed > 0) return false;
    quantityInput.current?.focus();
    return true;
  };

  const applyReceive = async () => {
    if (focusIfEmpty() || !materialId || receive.isPending) return;
    try {
      await receive.mutateAsync({
        materialId,
        quantity: inputToDecimal(amount),
        unitCost: undefined,
        currency: '',
        lot: '',
        supplierDoc: '',
        occurredAt: todayISO(),
        comment: '',
        inputVatAmount: undefined,
        inputVatRegime: undefined,
        supplierId: undefined,
        expectedAt: '',
        measuredWidthCm: undefined,
        shadeCode: undefined,
      });
      onAmount('');
    } catch (error) {
      notifyFailure((material?.name || 'MATERIAL').toUpperCase(), 'not received', error);
    }
  };

  const applyIssue = () => {
    if (focusIfEmpty()) return;
    onIssue();
  };

  const expandedEditing = minEdit?.materialId === materialId && minEdit.place === 'expanded';
  const minValue = decimalToInput(row.minStock);

  return (
    <div className='ml-11 min-w-0 py-3' data-testid={`expanded-${materialId}`}>
      {canEdit ? (
        <div className='flex w-full items-stretch gap-1 md:gap-1.5'>
          <div className='relative min-w-0 flex-1 md:w-40 md:flex-none'>
            <Input
              ref={quantityInput}
              type='text'
              inputMode='decimal'
              value={amount}
              aria-label='quantity'
              data-testid='movement-quantity'
              className='h-11 min-h-11 pr-7 text-right md:h-9 md:min-h-9'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onAmount(sanitizeDecimal(event.target.value))
              }
            />
            <Text
              component='span'
              size='micro'
              variant='label'
              className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2'
            >
              {unit}
            </Text>
          </div>
          <Button
            size='xs'
            variant='secondary'
            loading={receive.isPending}
            className='flex h-11 min-h-11 shrink-0 items-center justify-center md:h-9 md:min-h-9'
            onClick={applyReceive}
          >
            in
          </Button>
          <Button
            size='xs'
            variant='secondary'
            className='flex h-11 min-h-11 shrink-0 items-center justify-center md:h-9 md:min-h-9'
            onClick={applyIssue}
          >
            out
          </Button>
        </div>
      ) : null}

      <GroupLabel
        className={canEdit ? 'mt-3 min-w-0' : 'mt-0 min-w-0'}
        action={
          expandedEditing && fullMaterial && material ? (
            <span className='inline-flex items-baseline gap-1'>
              <Text component='label' size='micro' variant='label'>
                min
              </Text>
              <MinInput
                material={material}
                draft={minEdit.draft}
                compact
                saving={minSaving}
                onDraft={onMinDraft}
                onSave={onSaveMin}
                onCancel={onCancelMin}
              />
              <Text component='span' size='micro' variant='label'>
                {unit}
              </Text>
            </span>
          ) : canEdit && fullMaterial ? (
            <button
              type='button'
              aria-label={`edit min ${material?.name ?? ''}`}
              className='relative text-micro hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-3.5'
              onClick={onStartMin}
            >
              min {minValue ? quantity(row.minStock) : <EmptyCell />} {unit}
            </button>
          ) : (
            <Text component='span' size='micro' variant='label'>
              min {minValue ? quantity(row.minStock) : <EmptyCell />} {unit}
            </Text>
          )
        }
      >
        last movements
      </GroupLabel>

      <MovementRows materialId={materialId} unit={unit} />

      {material?.code ? (
        <Text
          component='span'
          size='micro'
          variant='label'
          className='mt-1 block max-w-full break-words text-left'
        >
          {material.code}
        </Text>
      ) : null}
    </div>
  );
}

export function StockTab() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const phone = useMediaQuery(PHONE_QUERY);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const belowOnly = params.get('belowMin') === '1';

  const stockQuery = useMaterialStock({});
  const materialsQuery = useMaterials('', true, canEdit);
  const saveMaterial = useSaveMaterial();
  const rows = useMemo(
    () => (stockQuery.data?.rows ?? []).filter((row) => Number(row.material?.id) > 0),
    [stockQuery.data],
  );
  const fullMaterials = useMemo(() => {
    const byId = new Map<number, common_Material>();
    (materialsQuery.data?.materials ?? []).forEach((material) => {
      const id = Number(material.id) || 0;
      if (id) byId.set(id, material);
    });
    return byId;
  }, [materialsQuery.data]);

  const patchFilters = (patch: { q?: string; belowMin?: boolean }) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (patch.q !== undefined) {
          if (patch.q) next.set('q', patch.q);
          else next.delete('q');
        }
        if (patch.belowMin !== undefined) {
          if (patch.belowMin) next.set('belowMin', '1');
          else next.delete('belowMin');
        }
        return next;
      },
      { replace: true },
    );
  };

  const matchingRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (belowOnly && !row.belowMinStock) return false;
      if (!needle) return true;
      const material = row.material;
      return `${material?.name ?? ''} ${material?.code ?? ''} ${
        material ? materialSpec(material) : ''
      }`
        .toLowerCase()
        .includes(needle);
    });
  }, [belowOnly, query, rows]);

  const groups = useMemo(() => {
    const grouped = new Map<string, common_MaterialStockRow[]>();
    matchingRows.forEach((row) => {
      const section = row.material?.section ?? '';
      const current = grouped.get(section) ?? [];
      current.push(row);
      grouped.set(section, current);
    });
    return [...grouped.entries()]
      .sort(([left], [right]) => {
        const leftOrder = sectionOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = sectionOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || sectionLabel(left).localeCompare(sectionLabel(right));
      })
      .map(([section, groupRows]) => ({
        section,
        label: sectionLabel(section),
        rows: groupRows.sort((left, right) => {
          const below = Number(Boolean(right.belowMinStock)) - Number(Boolean(left.belowMinStock));
          return (
            below ||
            (left.material?.name ?? '').localeCompare(right.material?.name ?? '', undefined, {
              sensitivity: 'base',
            })
          );
        }),
      }));
  }, [matchingRows]);

  const belowCount = rows.filter((row) => row.belowMinStock).length;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [movementAmount, setMovementAmount] = useState('');
  const [minEdit, setMinEdit] = useState<MinEdit | null>(null);
  const [savingMinId, setSavingMinId] = useState<number | null>(null);
  const [issue, setIssue] = useState<{ target: MovementTarget; quantity: string } | null>(null);

  useEffect(() => {
    if (!expandedId) return;
    const collapse = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setExpandedId(null);
      setMovementAmount('');
      setMinEdit(null);
    };
    window.addEventListener('keydown', collapse);
    return () => window.removeEventListener('keydown', collapse);
  }, [expandedId]);

  const toggleExpanded = (id: number) => {
    setMinEdit(null);
    setMovementAmount('');
    setExpandedId((current) => (current === id ? null : id));
  };

  const startMin = (row: common_MaterialStockRow, place: MinEdit['place']) => {
    const id = Number(row.material?.id) || 0;
    if (!canEdit || !fullMaterials.has(id)) return;
    setMinEdit({ materialId: id, draft: decimalToInput(row.minStock), place });
  };

  const saveMin = async (): Promise<boolean> => {
    if (!minEdit || savingMinId !== null) return false;
    const fullMaterial = fullMaterials.get(minEdit.materialId);
    if (!fullMaterial) return false;
    const parsed = parseDecimalNumber(minEdit.draft);
    if (minEdit.draft.trim() && (!Number.isFinite(parsed) || parsed < 0)) return false;
    setSavingMinId(minEdit.materialId);
    try {
      await saveMaterial.mutateAsync({
        ...fullMaterial,
        minStock: inputToDecimal(minEdit.draft),
      });
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      setMinEdit(null);
      return true;
    } catch (error) {
      notifyFailure((fullMaterial.name || 'MATERIAL').toUpperCase(), 'min not saved', error);
      return false;
    } finally {
      setSavingMinId(null);
    }
  };

  const clearFilters = () => patchFilters({ q: '', belowMin: false });
  const headerControls = (
    <div className='flex items-center gap-1.5'>
      <Input
        value={query}
        placeholder='search'
        aria-label='search'
        data-testid='search'
        className='w-40 sm:w-52'
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          patchFilters({ q: event.target.value })
        }
      />
      <Chip
        selected={belowOnly}
        tone={belowCount > 0 ? 'error' : 'default'}
        pressed={belowOnly}
        title='below min'
        data-testid='below-counter'
        onClick={() => patchFilters({ belowMin: !belowOnly })}
      >
        ! {belowCount}
      </Chip>
    </div>
  );

  let content: React.ReactNode;
  if (stockQuery.isLoading) {
    content = (
      <DataTable className='max-w-3xl table-auto md:table-fixed'>
        <thead>
          <tr>
            <th data-align='left'>material</th>
            <th>on hand</th>
            <th>min</th>
          </tr>
        </thead>
        <tbody>
          <SkeletonRows rows={6} widths={['75%', '55%', '45%']} />
        </tbody>
      </DataTable>
    );
  } else if (stockQuery.isError) {
    content = (
      <span className='flex items-baseline gap-2.5'>
        <Text component='span'>stock unavailable</Text>
        <Button size='xs' variant='underline' onClick={() => stockQuery.refetch()}>
          retry
        </Button>
      </span>
    );
  } else if (rows.length === 0) {
    content = <Text>no stock</Text>;
  } else if (matchingRows.length === 0) {
    content = (
      <span className='flex items-baseline gap-2.5'>
        <Text component='span'>no matches</Text>
        <Button size='xs' variant='underline' onClick={clearFilters}>
          clear
        </Button>
      </span>
    );
  } else {
    content = (
      <DataTable
        hoverRows
        className='max-w-3xl table-auto md:table-fixed [&_tbody>tr:has(+tr[data-group])>td]:border-b-0 [&_td]:px-2.5 [&_td]:py-2 [&_th]:px-2.5 max-md:[&_td:first-child]:pr-1 max-md:[&_th:first-child]:pr-1 max-md:[&_td:nth-child(2)]:w-[1%] max-md:[&_td:nth-child(2)]:whitespace-nowrap max-md:[&_td:nth-child(2)]:px-1 max-md:[&_td:nth-child(3)]:w-[1%] max-md:[&_td:nth-child(3)]:whitespace-nowrap max-md:[&_td:nth-child(3)]:px-1 max-md:[&_th:nth-child(2)]:w-[1%] max-md:[&_th:nth-child(2)]:whitespace-nowrap max-md:[&_th:nth-child(2)]:px-1 max-md:[&_th:nth-child(3)]:w-[1%] max-md:[&_th:nth-child(3)]:whitespace-nowrap max-md:[&_th:nth-child(3)]:px-1'
      >
        <colgroup>
          <col className='w-auto md:w-[56%]' />
          <col className='w-[1%] md:w-[27%]' />
          <col className='w-[1%] md:w-[17%]' />
        </colgroup>
        <thead>
          <tr>
            <th data-align='left'>material</th>
            <th>on hand</th>
            <th>min</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIndex) => (
            <Fragment key={group.section || 'other'}>
              <tr data-group={group.section || 'other'}>
                <td
                  colSpan={3}
                  data-align='left'
                  className={
                    groupIndex === 0
                      ? '!border-b-0 !px-0 !pb-0 !pt-2'
                      : '!border-b-0 !px-0 !pb-0 !pt-5'
                  }
                >
                  <GroupLabel flush className='mb-0 px-2.5'>
                    {group.label}
                  </GroupLabel>
                </td>
              </tr>
              {group.rows.map((row) => {
                const material = row.material;
                const id = Number(material?.id) || 0;
                const expanded = expandedId === id;
                const fullMaterial = fullMaterials.get(id);
                const cellEditing = minEdit?.materialId === id && minEdit.place === 'cell';
                return (
                  <Fragment key={id}>
                    <tr
                      aria-expanded={expanded}
                      tabIndex={0}
                      data-material-id={id}
                      data-testid={`row-${id}`}
                      className={
                        expanded
                          ? 'cursor-pointer bg-pageBg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                          : 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                      }
                      onClick={() => toggleExpanded(id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        toggleExpanded(id);
                      }}
                    >
                      <td data-align='left'>
                        <MaterialIdentity material={material} />
                      </td>
                      <td className={row.belowMinStock ? '!font-normal text-error' : undefined}>
                        {quantity(row.onHand)} {material?.unit}
                      </td>
                      <td
                        className='text-labelColor'
                        onClick={phone ? undefined : (event) => event.stopPropagation()}
                      >
                        <span className='md:hidden'>
                          {decimalToInput(row.minStock) ? quantity(row.minStock) : <EmptyCell />}
                        </span>
                        <span className='hidden md:block'>
                          {cellEditing && material && fullMaterial ? (
                            <MinInput
                              material={material}
                              draft={minEdit.draft}
                              saving={savingMinId === id}
                              onDraft={(draft) => setMinEdit({ ...minEdit, draft })}
                              onSave={saveMin}
                              onCancel={() => setMinEdit(null)}
                            />
                          ) : canEdit && fullMaterial ? (
                            <button
                              type='button'
                              className='w-full cursor-text text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                              aria-label={`edit min ${material?.name ?? ''}`}
                              data-testid={`min-cell-${id}`}
                              onClick={() => startMin(row, 'cell')}
                            >
                              {decimalToInput(row.minStock) ? (
                                quantity(row.minStock)
                              ) : (
                                <EmptyCell />
                              )}
                            </button>
                          ) : decimalToInput(row.minStock) ? (
                            quantity(row.minStock)
                          ) : (
                            <EmptyCell />
                          )}
                        </span>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className='bg-pageBg' data-group='detail' data-expanded-for={id}>
                        <td colSpan={3} data-align='left' className='!py-0 align-top'>
                          <ExpandedDetails
                            row={row}
                            amount={movementAmount}
                            canEdit={canEdit}
                            fullMaterial={fullMaterial}
                            minEdit={minEdit}
                            minSaving={savingMinId === id}
                            onAmount={setMovementAmount}
                            onStartMin={() => startMin(row, 'expanded')}
                            onMinDraft={(draft) =>
                              setMinEdit({ materialId: id, draft, place: 'expanded' })
                            }
                            onSaveMin={saveMin}
                            onCancelMin={() => setMinEdit(null)}
                            onIssue={() =>
                              setIssue({ target: targetOf(row), quantity: movementAmount })
                            }
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </DataTable>
    );
  }

  return (
    <>
      <Section title='stock' action={headerControls} headerClassName='max-w-3xl'>
        {content}
      </Section>

      {issue ? (
        <IssueStockModal
          open
          target={issue.target}
          defaultQty={issue.quantity}
          onOpenChange={(open) => {
            if (open) return;
            setIssue(null);
            setMovementAmount('');
          }}
        />
      ) : null}
    </>
  );
}
