import type {
  common_AdminColorwayRef,
  common_Material,
  common_TechCard,
  common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { AddDoor, ConfirmationModal, Input, Select, Section, Text, Tile, Tiles } from 'ui';

import { pickLabelMaterial } from './label-bom';
import { labelKindOfMaterial } from './label-material-kind';
import { upsertGarmentLabel } from './form-writers';
import { type FormGarmentLabel, type FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { PackagingShelf, packagingGaps } from './packaging-shelf';
import { isCompositionLabel, labelBomLine } from './sewn-label-model';
import {
  bornLabelFacts,
  labelMiss,
  LabelRowsHead,
  madeIntent,
  SewnLabelRow,
} from './sewn-label-row';
import {
  garmentLabelKindNames,
  garmentLabelKinds,
  kindLabel,
  labelStockKinds,
} from './tech-card-options';
import { useLabelStock } from './use-label-stock';
import { wireInt } from './wire-int';

/** A label key is the material or typed name; duplicates get a stable numeric suffix. */
function freeLabelKey(raw: string, taken: readonly string[]): string {
  const key = raw.trim() || 'label';
  const used = new Set(taken.map((value) => value.trim().toLowerCase()));
  if (!used.has(key.toLowerCase())) return key;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${key} ${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

type StockMap = Map<number, string>;

function LabelStockPicker({
  open,
  onOpenChange,
  materials,
  stock,
  stockKnown,
  onPick,
  onMake,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: readonly common_Material[];
  stock: StockMap;
  stockKnown: boolean;
  onPick: (material: common_Material, kind: string) => void;
  onMake?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setKind('all');
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials.filter((material) => {
      if (material.archived) return false;
      if (kind !== 'all' && labelKindOfMaterial(material) !== kind) return false;
      if (!query) return true;
      return `${material.name ?? ''} ${material.code ?? ''}`.toLowerCase().includes(query);
    });
  }, [kind, materials, search]);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      title={onMake ? 'add label' : 'pick material'}
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-3'>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Input
            className='min-w-0 flex-1'
            value={search}
            placeholder='search stock'
            aria-label='search stock'
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
          />
          <Select
            name='label-stock-kind'
            className='w-full whitespace-nowrap sm:w-auto'
            value={kind}
            items={[
              { value: 'all', label: 'all types' },
              ...labelStockKinds.map((option) => ({
                value: option.key,
                label: option.label,
              })),
            ]}
            onValueChange={(value: string | undefined) => setKind(value || 'all')}
          />
        </div>
        <Tiles min={132}>
          {filtered.map((material) => {
            const id = wireInt(material.id);
            const materialKind = labelKindOfMaterial(material);
            const onHand = stock.get(id) ?? (stockKnown ? '0' : undefined);
            return (
              <Tile
                key={id}
                media={
                  <MaterialThumb
                    material={material}
                    size='lg'
                    className='aspect-square h-auto w-full'
                  />
                }
                name={material.name || material.code || `material ${id}`}
                sub={kindLabel(labelStockKinds, materialKind)}
                title={material.name || material.code || undefined}
                onClick={() => {
                  onPick(material, materialKind);
                  onOpenChange(false);
                }}
              >
                {onHand == null ? null : (
                  <Text
                    size='micro'
                    variant={Number(onHand) > 0 ? 'label' : 'errorLabel'}
                    component='span'
                  >
                    {onHand} on hand
                  </Text>
                )}
              </Tile>
            );
          })}
          {onMake ? (
            <Tile
              dashed
              name='+ make new'
              className='min-h-24 items-center justify-center'
              onClick={() => {
                onOpenChange(false);
                onMake();
              }}
            />
          ) : null}
        </Tiles>
        {filtered.length === 0 && !onMake ? (
          <Text size='micro' variant='label'>
            nothing in stock
          </Text>
        ) : null}
      </div>
    </ConfirmationModal>
  );
}

function MakeLabelDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, kind: string) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setKind('');
  }, [open]);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => {
        if (!name.trim() || !kind) return;
        onAdd(name.trim(), kind);
      }}
      title='new label'
      confirmLabel='add'
      confirmDisabled={!name.trim() || !kind}
    >
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            name
          </Text>
          <Input
            value={name}
            autoFocus
            onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          />
        </div>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            type
          </Text>
          <Select
            name='made-label-kind'
            value={kind}
            placeholder='pick type'
            items={garmentLabelKinds.map((option) => ({
              value: option.key,
              label: option.label,
            }))}
            onValueChange={(value: string | undefined) => setKind(value || '')}
          />
        </div>
      </div>
    </ConfirmationModal>
  );
}

const displayLabelName = (row: FormGarmentLabel): string => {
  const key = row.key?.trim() || 'label';
  const legacy = !row.source && !madeIntent(row);
  return legacy ? kindLabel(garmentLabelKindNames, key) || key : key;
};

/** LABELS: compact stock-aware rows. The composition label remains in its dedicated block. */
export function LabelsBlock({
  techCard,
  canEdit = true,
}: {
  techCard?: common_TechCard;
  canEdit?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const all = (useWatch({ control, name: 'garmentLabels' }) ?? []) as FormGarmentLabel[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const rows = all.filter((row) => !isCompositionLabel(row.key));
  const { materials, materialById, stock, stockKnown, plannedQty, onHandOf } =
    useLabelStock(techCard);

  const [adding, setAdding] = useState(false);
  const [making, setMaking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [materialTarget, setMaterialTarget] = useState<string | null>(null);

  const issues = rows.reduce((total, row) => total + labelMiss(row, bomItems), 0);
  const keys = rows.map((row) => row.key ?? '');
  const targetRow = rows.find((row) => row.key === materialTarget);

  const addStock = (material: common_Material, kind: string) => {
    const baseName = material.name?.trim() || material.code?.trim() || `material ${material.id}`;
    const key = freeLabelKey(baseName, keys);
    upsertGarmentLabel(getValues, setValue, key, bornLabelFacts(kind), { keepBare: true });
    pickLabelMaterial(getValues, setValue, key, material, { source: 'stock', kind });
    setExpanded(key);
    setAdding(false);
  };

  return (
    <>
      <Section
        title='labels'
        action={
          issues > 0 ? (
            <Text size='micro' variant='errorLabel' component='span'>
              ! {issues}
            </Text>
          ) : undefined
        }
      >
        <div data-labels-rows=''>
          {rows.length > 0 ? <LabelRowsHead /> : null}
          {rows.map((row, index) => {
            const key = row.key?.trim() || `label ${index + 1}`;
            const line = labelBomLine(row, bomItems);
            const material = materialById.get(wireInt(line?.materialId));
            const onHand = onHandOf(material);
            return (
              <SewnLabelRow
                key={`${key.toLowerCase()}-${index}`}
                labelKey={key}
                title={displayLabelName(row)}
                material={material}
                onHand={onHand}
                plannedQty={plannedQty}
                open={expanded === key}
                onOpenChange={(next) => setExpanded(next ? key : null)}
                onPickMaterial={() => setMaterialTarget(key)}
                canEdit={canEdit}
                last={index === rows.length - 1}
              />
            );
          })}
          {canEdit ? (
            <AddDoor afterRows={rows.length > 0} onClick={() => setAdding(true)}>
              label
            </AddDoor>
          ) : null}
        </div>
      </Section>

      <LabelStockPicker
        open={adding || !!materialTarget}
        onOpenChange={(next) => {
          if (!next) {
            setAdding(false);
            setMaterialTarget(null);
          }
        }}
        materials={materials}
        stock={stock}
        stockKnown={stockKnown}
        onPick={(material, kind) => {
          if (materialTarget) {
            pickLabelMaterial(getValues, setValue, materialTarget, material, {
              source: 'make',
              kind: targetRow?.kind?.trim() || kind,
            });
            setMaterialTarget(null);
          } else {
            addStock(material, kind);
          }
        }}
        onMake={
          materialTarget
            ? undefined
            : () => {
                setAdding(false);
                setMaking(true);
              }
        }
      />
      <MakeLabelDialog
        open={making}
        onOpenChange={setMaking}
        onAdd={(name, kind) => {
          const key = freeLabelKey(name, keys);
          upsertGarmentLabel(getValues, setValue, key, bornLabelFacts(kind), { keepBare: true });
          setMaking(false);
          setExpanded(key);
        }}
      />
    </>
  );
}

/** PACKAGING: pack, its items, and the shipping box. */
export function PackagingBlock({
  techCardId,
  colorwayRefs,
  resolvedMedia,
  canEdit = true,
}: {
  techCardId?: number;
  colorwayRefs?: readonly common_AdminColorwayRef[];
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit?: boolean;
}): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const items = (useWatch({ control, name: 'packagingItems' }) ?? []) as FormPackagingItem[];
  const folding = useWatch({ control, name: 'packaging.foldingMethod' }) ?? '';
  const units = Number(useWatch({ control, name: 'packaging.unitsPerBox' })) || 0;
  const gaps = packagingGaps(folding, items, units);
  return (
    <Section
      title='packaging'
      action={
        gaps > 0 ? (
          <Text size='micro' variant='errorLabel' component='span'>
            ! {gaps}
          </Text>
        ) : undefined
      }
    >
      <div id='packaging-spec'>
        <PackagingShelf
          techCardId={techCardId}
          colorwayRefs={colorwayRefs}
          resolvedMedia={resolvedMedia}
          canEdit={canEdit}
        />
      </div>
    </Section>
  );
}
