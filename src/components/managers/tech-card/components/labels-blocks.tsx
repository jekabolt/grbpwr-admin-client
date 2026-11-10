import type {
  common_AdminColorwayRef,
  common_Material,
  common_TechCard,
  common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  AddDoor,
  Button,
  ConfirmationModal,
  HeaderWarnings,
  Input,
  Placeholder,
  Select,
  Section,
  Text,
  UndoRow,
} from 'ui';

import { pickLabelMaterial, removeLabelWithLine, takeLabelMaterialOff } from './label-bom';
import { labelKindOfMaterial } from './label-material-kind';
import { upsertGarmentLabel } from './form-writers';
import { type FormGarmentLabel, type FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { PackagingShelf, packagingIssues } from './packaging-shelf';
import { COMPOSITION_LABEL_KEY, isCompositionLabel, labelBomLine } from './sewn-label-model';
import { bornLabelFacts, labelIssue, madeIntent, SewnLabelRow } from './sewn-label-row';
import { StockPickerModal, type StockPickerOption } from './labels-pkg-shared';
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
  selectedMaterialId,
  onUnpick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: readonly common_Material[];
  stock: StockMap;
  stockKnown: boolean;
  onPick: (material: common_Material, kind: string) => void;
  onMake?: () => void;
  selectedMaterialId?: number;
  onUnpick?: () => void;
}) {
  const filtered = useMemo(() => materials.filter((material) => !material.archived), [materials]);

  const options = useMemo<StockPickerOption[]>(() => {
    const stockOptions = filtered.map((material) => {
      const id = wireInt(material.id);
      const materialKind = labelKindOfMaterial(material);
      const onHand = stock.get(id) ?? (stockKnown ? '0' : undefined);
      return {
        key: String(id),
        name: material.name || material.code || `material ${id}`,
        tab: materialKind || 'other',
        media: (
          <MaterialThumb material={material} size='lg' className='aspect-square h-auto w-full' />
        ),
        sub: kindLabel(labelStockKinds, materialKind),
        status:
          onHand == null ? null : (
            <Text
              size='micro'
              variant={Number(onHand) > 0 ? 'label' : 'errorLabel'}
              component='span'
            >
              {onHand} in stock
            </Text>
          ),
      };
    });
    if (!onMake) return stockOptions;
    return [
      ...stockOptions,
      {
        key: 'artwork',
        name: 'new artwork',
        tab: 'artwork',
        media: <Placeholder label='artwork' className='aspect-square w-full' />,
        sub: 'artwork',
      },
    ];
  }, [filtered, onMake, stock, stockKnown]);

  return (
    <StockPickerModal
      open={open}
      onOpenChange={onOpenChange}
      title={onMake ? 'add label' : 'stock item'}
      options={options}
      tabs={[
        ...labelStockKinds.map((option) => ({ value: option.key, label: option.label })),
        ...(onMake ? [{ value: 'artwork', label: 'artwork' }] : []),
      ]}
      selectedKeys={selectedMaterialId ? [String(selectedMaterialId)] : []}
      onConfirm={(keys) => {
        const key = keys[0];
        if (!key) {
          onUnpick?.();
          onOpenChange(false);
          return;
        }
        if (key === 'artwork') {
          onOpenChange(false);
          onMake?.();
          return;
        }
        const material = materials.find((candidate) => wireInt(candidate.id) === Number(key));
        if (material) onPick(material, labelKindOfMaterial(material));
        onOpenChange(false);
      }}
    />
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
      hideActions
      footerActions={
        <>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='h-7'
            onClick={() => onOpenChange(false)}
          >
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='sm'
            className='h-7'
            disabled={!name.trim() || !kind}
            onClick={() => onAdd(name.trim(), kind)}
          >
            add
          </Button>
        </>
      }
    >
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            name
          </Text>
          <Input
            value={name}
            autoFocus
            className='h-7'
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
            className='h-7'
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
  if (isCompositionLabel(key)) return kindLabel(garmentLabelKindNames, key) || key;
  const legacy = !row.source && !madeIntent(row);
  return legacy ? kindLabel(garmentLabelKindNames, key) || key : key;
};

type RemovedLabel = {
  name: string;
  labels: FormGarmentLabel[];
  bomItems: NonNullable<TechCardFormData['bomItems']>;
  operations: NonNullable<TechCardFormData['operations']>;
};

/** LABELS: stock-aware rows, expanded in place. */
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
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as NonNullable<
    TechCardFormData['operations']
  >;
  const rows = useMemo(() => all.filter((row) => !isCompositionLabel(row.key)), [all]);
  const composition = all.find((row) => isCompositionLabel(row.key));
  const compositionLine = composition ? labelBomLine(composition, bomItems) : undefined;
  const { materials, materialById, stock, stockKnown, onHandOf } = useLabelStock(techCard);

  const [adding, setAdding] = useState(false);
  const [making, setMaking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [materialTarget, setMaterialTarget] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RemovedLabel | null>(null);

  const keys = rows.map((row) => row.key ?? '');
  const targetRow = all.find((row) => row.key === materialTarget);
  const selectedLine = targetRow ? labelBomLine(targetRow, bomItems) : undefined;
  const warnings = all
    .map((row, index) => {
      const issue = labelIssue(row, bomItems, false, operations);
      if (!issue) return null;
      const key = row.key?.trim() || `label ${index + 1}`;
      return {
        text: `${displayLabelName(row)}: ${issue}`,
        error: true,
        action: { label: 'open label', onClick: () => setExpanded(key) },
      };
    })
    .filter(Boolean);

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
      <Section title='labels' action={<HeaderWarnings items={warnings} />}>
        <div>
          {composition && compositionLine ? (
            <SewnLabelRow
              labelKey={COMPOSITION_LABEL_KEY}
              title='composition label'
              material={materialById.get(wireInt(compositionLine.materialId))}
              onHand={onHandOf(materialById.get(wireInt(compositionLine.materialId)))}
              canEdit={canEdit}
              open={expanded === COMPOSITION_LABEL_KEY}
              onOpenChange={(open) => setExpanded(open ? COMPOSITION_LABEL_KEY : null)}
              onPickMaterial={() => setMaterialTarget(COMPOSITION_LABEL_KEY)}
              removable={false}
              generated={{
                hideMissing: true,
                action: (
                  <Button
                    type='button'
                    variant='underline'
                    size='xs'
                    onClick={() =>
                      document
                        .querySelector('[data-composition-label]')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    artwork
                  </Button>
                ),
              }}
              last={rows.length === 0 && !canEdit}
            />
          ) : null}
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
                canEdit={canEdit}
                open={expanded === key}
                onOpenChange={(open) => setExpanded(open ? key : null)}
                onPickMaterial={() => setMaterialTarget(key)}
                onRemove={() => {
                  setRemoved({
                    name: displayLabelName(row),
                    labels: ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice(),
                    bomItems: (
                      (getValues('bomItems') ?? []) as NonNullable<TechCardFormData['bomItems']>
                    ).slice(),
                    operations: (
                      (getValues('operations') ?? []) as NonNullable<TechCardFormData['operations']>
                    ).slice(),
                  });
                  removeLabelWithLine(getValues, setValue, key);
                  setExpanded(null);
                }}
                last={index === rows.length - 1}
              />
            );
          })}
          {canEdit ? (
            <AddDoor
              shape='row'
              afterRows={rows.length > 0 || !!compositionLine}
              onClick={() => setAdding(true)}
            >
              label
            </AddDoor>
          ) : null}
        </div>
        {removed ? (
          <UndoRow
            name={removed.name}
            onUndo={() => {
              setValue('garmentLabels', removed.labels as never, { shouldDirty: true });
              setValue('bomItems', removed.bomItems as never, { shouldDirty: true });
              setValue('operations', removed.operations as never, { shouldDirty: true });
              setRemoved(null);
            }}
            onCommit={() => setRemoved(null)}
          />
        ) : null}
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
        selectedMaterialId={wireInt(selectedLine?.materialId)}
        onUnpick={
          materialTarget
            ? () => {
                takeLabelMaterialOff(getValues, setValue, materialTarget);
                const current = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice();
                const index = current.findIndex(
                  (row) =>
                    (row.key ?? '').trim().toLowerCase() === materialTarget.trim().toLowerCase(),
                );
                if (index >= 0)
                  setValue(`garmentLabels.${index}.source`, 'stock', { shouldDirty: true });
              }
            : undefined
        }
        onPick={(material, kind) => {
          if (materialTarget) {
            pickLabelMaterial(getValues, setValue, materialTarget, material, {
              source: 'stock',
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
          upsertGarmentLabel(
            getValues,
            setValue,
            key,
            { ...bornLabelFacts(kind), source: 'make' },
            { keepBare: true },
          );
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
  const packedSize = useWatch({ control, name: 'packaging.packedSize' }) ?? '';
  const units = Number(useWatch({ control, name: 'packaging.unitsPerBox' })) || 0;
  const issues = packagingIssues(folding, packedSize, items, units);
  return (
    <Section
      title='packaging'
      action={<HeaderWarnings items={issues.map((text) => ({ text, error: true }))} />}
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
