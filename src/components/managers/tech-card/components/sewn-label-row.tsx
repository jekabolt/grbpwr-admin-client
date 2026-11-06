import type { common_Material, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import {
  useId,
  useState,
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Button,
  Chip,
  ChipRow,
  Close,
  ConfirmationModal,
  EmptyCell,
  FoldCaret,
  Input,
  Media,
  Placeholder,
  Select,
  Text,
  Tile,
  Tiles,
} from 'ui';

import { LabelIcon, type LabelKind as PictogramKind } from './design/hardware-icons';
import { upsertGarmentLabel } from './form-writers';
import {
  LABEL_BOM_SECTION,
  pickLabelMaterial,
  removeLabelWithLine,
  takeLabelMaterialOff,
} from './label-bom';
import { LabelFilePicker } from './label-file-picker';
import type { FormGarmentLabel } from './labels-schema';
import type { TechCardFormData } from './schema';
import { labelBomLine, type LabelAxes } from './sewn-label-model';
import {
  kindLabel,
  labelAttachmentOptions,
  labelDefaults,
  labelFoldingOptions,
  labelMadeByOptions,
  labelPlacementOptions,
  labelPrintMethodOptions,
  labelStockKinds,
} from './tech-card-options';
import { bomUnitKind } from './nesting/marker-io';
import { wireInt } from './wire-int';

const OTHER = '__other';

const sameKey = (a?: string, b?: string) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Defaults from the label type, applied once when a row is born and editable afterwards. */
export function bornLabelFacts(kind: string): Partial<FormGarmentLabel> {
  const defaults = labelDefaults[kind];
  return {
    source: '',
    kind,
    madeBy: '',
    printMethod: '',
    lengthCm: '',
    attachment: defaults?.attachment ?? '',
    folding: defaults?.folding ?? '',
    qtyPerGarment: 1,
  };
}

const virtualRow = (key: string): FormGarmentLabel => ({
  key,
  source: '',
  kind: '',
  madeBy: '',
  printMethod: '',
  lengthCm: '',
  placement: '',
  attachment: '',
  folding: '',
  size: '',
  qtyPerGarment: 1,
  bomItemId: 0,
  bomLineKey: '',
  note: '',
  mediaIds: [],
  calloutNumber: 0,
  artworkPerSize: false,
  artworkPerColorway: false,
  files: [],
});

/** A row from `+ make new` holds no source until its material is picked, only its type. */
export const madeIntent = (row: FormGarmentLabel): boolean =>
  row.source === 'make' || !!row.madeBy?.trim() || (!row.source && !!row.kind?.trim());

/** Explicit source wins; legacy rows without it keep the old inferred artwork intent. */
export const artworkIntent = (row: FormGarmentLabel): boolean =>
  row.source === 'make' || (!row.source && madeIntent(row));

const printedBy = (madeBy?: string): boolean =>
  ['printed', 'heat transfer'].includes(madeBy?.trim() ?? '');

/** The mockup's block warning count for one row. */
export function labelMiss(
  row: FormGarmentLabel,
  bomItems: readonly { id?: number; lineKey?: string | null; unit?: string }[],
): number {
  return labelIssue(row, bomItems) ? 1 : 0;
}

export function labelIssue(
  row: FormGarmentLabel,
  bomItems: readonly { id?: number; lineKey?: string | null; unit?: string }[],
  compositionMissingCountry = false,
): string | null {
  const built = (row.key ?? '').trim().toLowerCase() === 'composition';
  if (built && compositionMissingCountry) return 'no country';
  if (!row.placement?.trim()) return 'no location';
  if (!row.attachment?.trim()) return 'no attachment';
  if (!row.size?.trim()) return 'no size';
  if (!built && !row.madeBy?.trim()) return 'no maker';
  if (built) return null;
  if (artworkIntent(row))
    return (row.files ?? []).some((file) => file.publicUrl?.trim()) ? null : 'no file';
  return labelBomLine(row, bomItems) ? null : 'pick stock';
}

function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className ?? ''}`}>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </div>
  );
}

function withStored(options: readonly string[], value?: string) {
  const current = value?.trim() ?? '';
  const values = current && !options.includes(current) ? [current, ...options] : [...options];
  return values.map((option) => ({ value: option, label: option }));
}

function typePictogram(kind?: string): PictogramKind {
  switch (kind) {
    case 'size':
      return 'lbl_size';
    case 'flag':
      return 'lbl_flag';
    case 'patch':
      return 'lbl_patch';
    case 'hangtag':
    case 'barcode':
      return 'lbl_hang_tag';
    default:
      return 'lbl_brand';
  }
}

const formatNeed = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');

function quantityFacts(
  row: FormGarmentLabel,
  unit: string,
  onHand: string | undefined,
  plannedQty: number | undefined,
) {
  const unitKind = bomUnitKind(unit);
  const lengthGoods = unitKind === 'm' || unitKind === 'cm';
  const per = lengthGoods ? Number(row.lengthCm) : Number(row.qtyPerGarment ?? 1);
  const need =
    plannedQty == null || !Number.isFinite(per) || per <= 0
      ? undefined
      : lengthGoods
        ? unitKind === 'm'
          ? (plannedQty * per) / 100
          : plannedQty * per
        : plannedQty * per;
  const stock = onHand == null || onHand === '' ? undefined : Number(onHand);
  return {
    lengthGoods,
    per: lengthGoods ? `${row.lengthCm?.trim() || 1} cm / pc` : `${row.qtyPerGarment ?? 1} / pc`,
    onHandText:
      onHand == null || onHand === ''
        ? ''
        : stock === 0
          ? '0 on hand'
          : need != null && stock != null && stock < need
            ? `${onHand} · need ${formatNeed(need)}`
            : `${onHand}${unit ? ` ${unit}` : ''}`,
    short: stock === 0 || (stock != null && need != null && Number.isFinite(stock) && stock < need),
  };
}

const labelSizeParts = (value?: string): [string, string] => {
  const parts = value?.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [parts[0]?.replace(',', '.') ?? '', parts[1]?.replace(',', '.') ?? ''];
};

const joinedLabelSize = (width: string, height: string): string =>
  width || height ? `${width} × ${height}` : '';

function ArtworkThumb({ row, title }: { row: FormGarmentLabel; title: string }) {
  const file = row.files?.[0];
  const fileId = wireInt(file?.libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const preview = fileQuery.data?.file?.previewUrl;
  if (!preview)
    return (
      <Placeholder
        label='no file'
        tone={file ? 'default' : 'error'}
        className='h-30 w-full border-0 border-b border-hairline'
      />
    );
  return (
    <div className='h-30 w-full border-b border-hairline bg-pageBg'>
      <Media src={preview} alt={title} aspectRatio='auto' fit='contain' />
    </div>
  );
}

function CompositionThumb() {
  return (
    <div className='flex h-30 items-center justify-center border-b border-hairline bg-pageBg'>
      <div className='flex h-20 w-10 flex-col items-center justify-center gap-2 border border-labelColor bg-bgColor px-1'>
        <span className='h-px w-full bg-labelColor' />
        <span className='h-px w-full bg-labelColor' />
        <span className='h-px w-3/4 bg-labelColor' />
        <span className='h-px w-full bg-labelColor' />
      </div>
    </div>
  );
}

export function SewnLabelTile({
  row,
  title,
  material,
  onHand,
  compositionMissingCountry = false,
  onOpen,
}: {
  row: FormGarmentLabel;
  title: string;
  material?: common_Material;
  onHand?: string;
  compositionMissingCountry?: boolean;
  onOpen: () => void;
}) {
  const built = !!row.key && row.key.trim().toLowerCase() === 'composition';
  const artwork = artworkIntent(row);
  const source = built ? 'built above' : artwork ? 'artwork' : 'stock';
  const madeBy = row.madeBy?.trim() || kindLabel(labelStockKinds, row.kind);
  const status = built
    ? compositionMissingCountry
      ? '! no country'
      : null
    : artwork
      ? (row.files ?? []).some((file) => file.publicUrl?.trim())
        ? 'file'
        : '! no file'
      : onHand == null || onHand === ''
        ? null
        : Number(onHand) <= 0
          ? '! 0 in stock'
          : `${onHand} in stock`;

  return (
    <Tile
      media={
        built ? (
          <CompositionThumb />
        ) : artwork ? (
          <ArtworkThumb row={row} title={title} />
        ) : material ? (
          <div className='h-30 w-full border-b border-hairline bg-pageBg'>
            <MaterialThumb material={material} size='lg' className='h-full w-full' />
          </div>
        ) : (
          <Placeholder
            label='pick stock'
            tone='error'
            className='h-30 w-full border-0 border-b border-hairline'
          />
        )
      }
      name={title}
      sub={[source, madeBy, row.size ? `${row.size} mm` : ''].filter(Boolean).join(' · ')}
      onClick={onOpen}
      title={title}
      tone={status?.startsWith('!') ? 'error' : 'default'}
      className='min-h-50 p-0 [&>p]:mx-2.5'
    >
      <Text size='micro' variant='label' className='mx-2.5 truncate'>
        {[row.placement, `${row.qtyPerGarment ?? 1} per garment`].filter(Boolean).join(' · ')}
      </Text>
      {status ? (
        <Text
          size='micro'
          variant={status.startsWith('!') ? 'errorLabel' : 'default'}
          className='mx-2.5 mb-2.5 truncate'
        >
          {status}
        </Text>
      ) : null}
    </Tile>
  );
}

export function SewnLabelModal({
  open,
  onOpenChange,
  labelKey,
  title,
  material,
  onHand,
  onPickMaterial,
  onRemove,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelKey: string;
  title: string;
  material?: common_Material;
  onHand?: string;
  onPickMaterial: () => void;
  onRemove: () => void;
  canEdit: boolean;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { canWrite } = usePermissions();
  const rows = (useWatch({ control, name: 'garmentLabels' }) ?? []) as FormGarmentLabel[];
  const row = rows.find((candidate) => sameKey(candidate.key, labelKey)) ?? virtualRow(labelKey);
  const built = labelKey.trim().toLowerCase() === 'composition';
  const artwork = !built && artworkIntent(row);
  const source = built ? 'built' : artwork ? 'artwork' : 'stock';
  const [filePicker, setFilePicker] = useState(false);
  const [width, height] = labelSizeParts(row.size);
  const file = row.files?.[0];
  const fileId = wireInt(file?.libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const fileName = fileQuery.data?.file?.fileName || (fileId ? `file ${fileId}` : 'artwork');
  const preview = fileQuery.data?.file?.previewUrl;

  const patch = (value: Partial<Omit<FormGarmentLabel, 'key'>>) => {
    const current = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice();
    const index = current.findIndex((candidate) => sameKey(candidate.key, labelKey));
    if (index < 0) {
      upsertGarmentLabel(
        getValues,
        setValue,
        labelKey,
        { ...bornLabelFacts(labelKey), ...value },
        { keepBare: true },
      );
      return;
    }
    setValue(`garmentLabels.${index}`, { ...current[index], ...value } as never, {
      shouldDirty: true,
    });
  };

  const openFiles = () => {
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    setFilePicker(true);
  };

  const clearMaterial = () => {
    takeLabelMaterialOff(getValues, setValue, labelKey);
    patch({ source: 'stock' });
  };

  const object = built ? (
    <div className='flex min-h-14.5 items-center gap-2.5 border-b border-hairline pb-2'>
      <div className='flex size-11 shrink-0 items-center justify-center bg-pageBg'>
        <LabelIcon kind='lbl_brand' size={32} />
      </div>
      <Text className='min-w-0 flex-1 truncate'>built above</Text>
    </div>
  ) : source === 'stock' ? (
    material ? (
      <div className='flex min-h-14.5 items-center gap-2.5 border-b border-hairline pb-2'>
        <MaterialThumb material={material} size='sm' className='size-11 shrink-0' />
        <span className='min-w-0 flex-1'>
          <Text className='truncate'>{material.name || material.code || 'stock item'}</Text>
          {onHand != null ? (
            <Text size='micro' variant={Number(onHand) > 0 ? 'label' : 'errorLabel'}>
              {onHand} in stock
            </Text>
          ) : null}
        </span>
        {canEdit ? (
          <>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7'
              onClick={onPickMaterial}
            >
              change
            </Button>
            <Close
              size='sm'
              className='size-7 border border-borderColor'
              aria-label='unpick stock'
              onClick={clearMaterial}
            />
          </>
        ) : null}
      </div>
    ) : (
      <Button type='button' className='w-full p-0' disabled={!canEdit} onClick={onPickMaterial}>
        <Placeholder dashed tone='error' label='+ pick stock' className='h-14.5 w-full' />
      </Button>
    )
  ) : file ? (
    <div className='flex min-h-14.5 items-center gap-2.5 border-b border-hairline pb-2'>
      <div className='size-11 shrink-0 bg-pageBg'>
        {preview ? (
          <Media src={preview} alt='' aspectRatio='1/1' fit='contain' />
        ) : (
          <Placeholder label='file' className='size-11 border-0' />
        )}
      </div>
      <span className='min-w-0 flex-1'>
        <Text className='truncate'>{fileName}</Text>
        <Text size='micro' variant='label'>
          artwork
        </Text>
      </span>
      {canEdit ? (
        <>
          <Button type='button' variant='secondary' size='sm' className='h-7' onClick={openFiles}>
            change
          </Button>
          <Close
            size='sm'
            className='size-7 border border-borderColor'
            aria-label='remove file'
            onClick={() => patch({ files: [] })}
          />
        </>
      ) : null}
    </div>
  ) : (
    <Button type='button' className='w-full p-0' disabled={!canEdit} onClick={openFiles}>
      <Placeholder dashed tone='error' label='+ artwork' className='h-14.5 w-full' />
    </Button>
  );

  return (
    <>
      <ConfirmationModal
        open={open}
        onOpenChange={onOpenChange}
        onConfirm={() => undefined}
        title={title}
        width='md'
        hideActions
        footerActions={
          <>
            {!built && canEdit ? (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='mr-auto h-7'
                onClick={onRemove}
              >
                remove label
              </Button>
            ) : null}
            <Button
              type='button'
              variant='main'
              size='sm'
              className='h-7'
              onClick={() => onOpenChange(false)}
            >
              done
            </Button>
          </>
        }
      >
        <div className='grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2'>
          <Field label='source'>
            {built ? (
              <div className='flex h-7 items-center'>built above</div>
            ) : (
              <ChipRow>
                {[
                  ['stock', 'stock'],
                  ['artwork', 'artwork'],
                ].map(([value, label]) => (
                  <Chip
                    key={value}
                    nonForm
                    selected={source === value}
                    pressed={source === value}
                    disabled={!canEdit}
                    className='h-7'
                    onClick={() => patch({ source: value === 'stock' ? 'stock' : 'make' })}
                  >
                    {label}
                  </Chip>
                ))}
              </ChipRow>
            )}
          </Field>
          <Field
            label={built ? 'label' : source === 'stock' ? 'stock item' : 'artwork file'}
            className='sm:col-span-2'
          >
            {object}
          </Field>
          <Field label='made by'>
            <Select
              name={`${labelKey}-made-by`}
              value={row.madeBy || ''}
              placeholder='pick'
              readOnly={!canEdit || built}
              className='h-7'
              items={withStored(labelMadeByOptions, row.madeBy)}
              onValueChange={(value: string | undefined) => patch({ madeBy: value || '' })}
            />
          </Field>
          <Field label='size, mm'>
            <span className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5'>
              <Input
                type='number'
                min={1}
                inputMode='numeric'
                value={width}
                disabled={!canEdit || built}
                aria-label='width mm'
                className='h-7 min-w-0'
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  patch({ size: joinedLabelSize(event.target.value, height) })
                }
              />
              <Text variant='label'>×</Text>
              <Input
                type='number'
                min={1}
                inputMode='numeric'
                value={height}
                disabled={!canEdit || built}
                aria-label='height mm'
                className='h-7 min-w-0'
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  patch({ size: joinedLabelSize(width, event.target.value) })
                }
              />
              <Text size='micro' variant='label'>
                mm
              </Text>
            </span>
          </Field>
          <Field label='location'>
            <Select
              name={`${labelKey}-location`}
              value={row.placement || ''}
              placeholder='pick'
              readOnly={!canEdit}
              className='h-7'
              items={withStored(labelPlacementOptions, row.placement)}
              onValueChange={(value: string | undefined) => patch({ placement: value || '' })}
            />
          </Field>
          <Field label='attachment'>
            <Select
              name={`${labelKey}-attachment`}
              value={row.attachment || ''}
              placeholder='pick'
              readOnly={!canEdit}
              className='h-7'
              items={withStored(labelAttachmentOptions, row.attachment)}
              onValueChange={(value: string | undefined) => patch({ attachment: value || '' })}
            />
          </Field>
          <Field label='per garment'>
            <Input
              type='number'
              min={1}
              inputMode='numeric'
              value={row.qtyPerGarment ?? 1}
              disabled={!canEdit}
              className='h-7 sm:w-20'
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                patch({ qtyPerGarment: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </Field>
        </div>
      </ConfirmationModal>
      {artwork ? (
        <LabelFilePicker
          open={filePicker}
          onOpenChange={setFilePicker}
          onPick={(picked) =>
            patch({
              files: [
                {
                  colorwayId: 0,
                  sizeId: 0,
                  libraryFileId: picked.libraryFileId,
                  sourceHash: '',
                  publicUrl: picked.publicUrl,
                },
              ],
            })
          }
        />
      ) : null}
    </>
  );
}

const ROW_GRID =
  'grid w-full items-center gap-x-3 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[48px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,.9fr)_74px_110px_16px]';

/** The one header over the label rows. */
export function LabelRowsHead(): JSX.Element {
  return (
    <div className={`${ROW_GRID} hidden border-b border-hairline pb-0.5 pt-2 sm:grid`}>
      {['', '', 'location', 'attachment', 'per pc', 'on hand', ''].map((word, index) => (
        <Text
          key={index}
          size='nano'
          variant='label'
          tracking='label'
          component='span'
          className={`uppercase ${index === 4 || index === 5 ? 'text-right' : ''}`}
        >
          {word}
        </Text>
      ))}
    </div>
  );
}

function Miss({ children }: { children: ReactNode }) {
  return (
    <Text variant='errorLabel' component='span'>
      {children}
    </Text>
  );
}

/** Generated artwork: the composition label draws its own artwork under the row's fields. */
export type GeneratedArtwork = {
  pills?: ReactNode;
  action: ReactNode;
  body?: ReactNode;
  /** The row's own count of empty cells is no use when the label says what is missing itself. */
  hideMissing?: boolean;
};

export function SewnLabelRow({
  labelKey,
  title,
  material,
  onHand,
  plannedQty,
  onPickMaterial,
  open,
  onOpenChange,
  canEdit,
  last,
  removable = true,
  axes,
  generated,
}: {
  labelKey: string;
  title: string;
  material?: common_Material;
  onHand?: string;
  plannedQty?: number;
  onPickMaterial?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  canEdit: boolean;
  last?: boolean;
  removable?: boolean;
  techCard?: common_TechCard;
  axes?: LabelAxes;
  generated?: GeneratedArtwork;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { canWrite } = usePermissions();
  const uid = useId().replace(/:/g, '');
  const rows = (useWatch({ control, name: 'garmentLabels' }) ?? []) as FormGarmentLabel[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const row = rows.find((candidate) => sameKey(candidate.key, labelKey)) ?? virtualRow(labelKey);
  const line = labelBomLine(row, bomItems);
  const unit = material?.unit?.trim() || line?.unit?.trim() || '';
  const quantities = quantityFacts(row, unit, material ? onHand : undefined, plannedQty);
  const made = !generated && madeIntent(row);
  const legacyFiles = !generated && !made && row.source === '' && (row.files?.length ?? 0) > 0;
  const kind = row.kind?.trim() || row.key?.trim() || '';
  const kindWord = kindLabel(labelStockKinds, kind);

  const [placeOther, setPlaceOther] = useState(false);
  const [attachOther, setAttachOther] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [filePicker, setFilePicker] = useState(false);
  const [internalOpen, setInternalOpen] = useState(true);
  const [materialPicker, setMaterialPicker] = useState(false);

  const expanded = open ?? internalOpen;
  const setExpanded = onOpenChange ?? setInternalOpen;
  const chooseMaterial = onPickMaterial ?? (() => setMaterialPicker(true));

  const patch = (value: Partial<Omit<FormGarmentLabel, 'key'>>) => {
    const current = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice();
    const index = current.findIndex((candidate) => sameKey(candidate.key, labelKey));
    if (index < 0) {
      upsertGarmentLabel(
        getValues,
        setValue,
        labelKey,
        { ...bornLabelFacts(kind), ...value },
        { keepBare: true },
      );
      return;
    }
    setValue(`garmentLabels.${index}`, { ...current[index], ...value } as never, {
      shouldDirty: true,
    });
  };

  const placement = row.placement?.trim() ?? '';
  const attachment = row.attachment?.trim() ?? '';
  const customPlace = placeOther || (!!placement && !labelPlacementOptions.includes(placement));
  const customAttach =
    attachOther || (!!attachment && !labelAttachmentOptions.includes(attachment));
  const file = row.files?.[0];
  const fileId = wireInt(file?.libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const fileName = fileQuery.data?.file?.fileName || (fileId ? `file ${fileId}` : '');
  const fileUrl = publicFilePageUrl(file?.publicUrl || '') || file?.publicUrl || '';

  const openFiles = () => {
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    setFilePicker(true);
  };

  return (
    <div
      className={last ? '' : 'border-b border-hairline'}
      data-sewn-label={labelKey}
      data-label-source={row.source || (made ? 'make' : 'legacy')}
    >
      {generated ? <LabelRowsHead /> : null}
      <Button
        type='button'
        variant='default'
        className={`${ROW_GRID} px-0 py-2 text-left`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className='hidden size-12 items-center justify-center border border-borderColor bg-pageBg sm:flex'>
          <LabelIcon kind={typePictogram(kind)} size={36} />
        </span>
        <span className='min-w-0'>
          <Text
            size='control'
            tracking='label'
            component='span'
            className='block truncate uppercase'
          >
            {title}
          </Text>
          <Text size='micro' variant='label' component='span' className='block truncate'>
            {made ? row.madeBy || <Miss>made by</Miss> : kindWord}
            {placement ? null : (
              <span className='sm:hidden'>
                {' · '}
                <Miss>pick location</Miss>
              </span>
            )}
          </Text>
          {generated?.pills}
        </span>
        <Text component='span' className='hidden min-w-0 truncate sm:block'>
          {placement || <Miss>pick location</Miss>}
        </Text>
        <Text component='span' className='hidden min-w-0 truncate sm:block'>
          {attachment || <EmptyCell />}
        </Text>
        <Text
          component='span'
          className='hidden whitespace-nowrap text-right tabular-nums sm:block'
        >
          {quantities.per}
        </Text>
        <Text
          component='span'
          className='hidden whitespace-nowrap text-right tabular-nums sm:block'
        >
          {quantities.short ? (
            <Miss>{quantities.onHandText}</Miss>
          ) : (
            quantities.onHandText || <EmptyCell />
          )}
        </Text>
        <FoldCaret open={expanded} className='ml-0 text-labelColor' />
      </Button>

      {expanded ? (
        <div className='pb-3 pl-0 sm:pl-10'>
          {generated ? (
            <div className='mb-3 max-w-80'>
              <Field label='material'>
                <Input
                  readOnly
                  disabled={!canEdit}
                  value={line?.name || ''}
                  placeholder='pick stock'
                  className='cursor-pointer'
                  aria-label='material'
                  onClick={chooseMaterial}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') chooseMaterial();
                  }}
                />
              </Field>
            </div>
          ) : null}
          {made ? (
            <div className='mb-3 flex flex-col gap-3'>
              <Field label='made by'>
                <ChipRow>
                  {withStored(labelMadeByOptions, row.madeBy).map((option) => (
                    <Chip
                      key={option.value}
                      nonForm
                      selected={row.madeBy === option.value}
                      pressed={row.madeBy === option.value}
                      disabled={!canEdit}
                      onClick={() =>
                        patch({
                          madeBy: option.value,
                          ...(printedBy(option.value) ? {} : { printMethod: '' }),
                        })
                      }
                    >
                      {option.label}
                    </Chip>
                  ))}
                </ChipRow>
              </Field>
            </div>
          ) : legacyFiles ? (
            <div className='mb-3 flex items-center gap-2'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                files
              </Text>
              {(row.files ?? []).map((legacyFile, index) => {
                const url = publicFilePageUrl(legacyFile.publicUrl || '') || legacyFile.publicUrl;
                return url ? (
                  <Button
                    key={`${legacyFile.libraryFileId}-${index}`}
                    asChild
                    variant='underline'
                    size='xs'
                  >
                    <a href={url} target='_blank' rel='noopener noreferrer'>
                      file {index + 1}
                    </a>
                  </Button>
                ) : (
                  <Text
                    key={`${legacyFile.libraryFileId}-${index}`}
                    size='micro'
                    variant='errorLabel'
                  >
                    ! file {index + 1}
                  </Text>
                );
              })}
            </div>
          ) : null}

          {generated ? (
            <div className='mb-3 flex flex-col gap-2' data-label-artwork={labelKey}>
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  artwork
                </Text>
                {generated.action}
              </div>
              {generated.body ?? (
                <Tiles min={96}>
                  {(axes?.colorways ?? []).flatMap((colour) =>
                    (axes?.sizes ?? []).map((size) => {
                      const artwork = (row.files ?? []).find(
                        (candidate) =>
                          wireInt(candidate.colorwayId) === colour.id &&
                          wireInt(candidate.sizeId) === size.id,
                      );
                      const url =
                        publicFilePageUrl(artwork?.publicUrl || '') || artwork?.publicUrl || '';
                      return (
                        <Tile
                          key={`${colour.id}-${size.id}`}
                          name={`${colour.name} · ${size.label}`}
                          sub={url ? 'file' : '! file'}
                          tone={url ? 'default' : 'error'}
                          onClick={url ? () => window.open(url, '_blank', 'noopener') : undefined}
                        />
                      );
                    }),
                  )}
                </Tiles>
              )}
            </div>
          ) : null}

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <Field label='location'>
              <Select
                name={`${uid}-location`}
                value={customPlace ? OTHER : placement}
                readOnly={!canEdit}
                placeholder='pick'
                items={[
                  ...labelPlacementOptions.map((option) => ({ value: option, label: option })),
                  { value: OTHER, label: 'other' },
                ]}
                onValueChange={(value: string | undefined) => {
                  if (value === OTHER) {
                    setPlaceOther(true);
                    if (labelPlacementOptions.includes(placement)) patch({ placement: '' });
                  } else {
                    setPlaceOther(false);
                    patch({ placement: value || '' });
                  }
                }}
              />
            </Field>
            {customPlace ? (
              <Field label='where'>
                <Input
                  value={placement}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patch({ placement: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <Field label='attachment'>
              <Select
                name={`${uid}-attachment`}
                value={customAttach ? OTHER : attachment}
                readOnly={!canEdit}
                placeholder='pick'
                items={[
                  ...labelAttachmentOptions.map((option) => ({ value: option, label: option })),
                  { value: OTHER, label: 'other' },
                ]}
                onValueChange={(value: string | undefined) => {
                  if (value === OTHER) {
                    setAttachOther(true);
                    if (labelAttachmentOptions.includes(attachment)) patch({ attachment: '' });
                  } else {
                    setAttachOther(false);
                    patch({ attachment: value || '' });
                  }
                }}
              />
            </Field>
            {customAttach ? (
              <Field label='how'>
                <Input
                  value={attachment}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patch({ attachment: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <Field label='fold'>
              <Select
                name={`${uid}-fold`}
                value={row.folding || ''}
                readOnly={!canEdit}
                placeholder='pick'
                items={withStored(labelFoldingOptions, row.folding)}
                onValueChange={(value: string | undefined) => patch({ folding: value || '' })}
              />
            </Field>
            {quantities.lengthGoods ? (
              <Field label='cm per garment'>
                <Input
                  inputMode='decimal'
                  min='0.1'
                  value={row.lengthCm ?? ''}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.target.value.replace(',', '.');
                    if (/^\d*(?:\.\d?)?$/.test(value)) patch({ lengthCm: value });
                  }}
                />
              </Field>
            ) : (
              <Field label='per garment'>
                <Input
                  type='number'
                  min={1}
                  value={row.qtyPerGarment ?? 1}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patch({ qtyPerGarment: Math.max(1, Number(event.target.value) || 1) })
                  }
                />
              </Field>
            )}
          </div>

          {made ? (
            <div className='mt-3'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                <Field label='material'>
                  <Input
                    readOnly
                    disabled={!canEdit}
                    value={material?.name || line?.name || ''}
                    placeholder='pick stock'
                    className='cursor-pointer'
                    aria-label='material'
                    onClick={chooseMaterial}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Enter') chooseMaterial();
                    }}
                  />
                </Field>
                <Field label='size, mm'>
                  <Input
                    value={row.size ?? ''}
                    disabled={!canEdit}
                    placeholder='width × height'
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      patch({ size: event.target.value })
                    }
                  />
                </Field>
                {printedBy(row.madeBy) ? (
                  <Field label='print'>
                    <Select
                      name={`${uid}-print`}
                      value={row.printMethod || ''}
                      readOnly={!canEdit}
                      placeholder='pick'
                      items={withStored(labelPrintMethodOptions, row.printMethod)}
                      onValueChange={(value: string | undefined) =>
                        patch({ printMethod: value || '' })
                      }
                    />
                  </Field>
                ) : null}
                <Field label='file'>
                  <span className='flex items-center gap-2'>
                    {file ? (
                      <>
                        {fileUrl ? (
                          <Button
                            asChild
                            variant='underline'
                            size='xs'
                            className='min-w-0 truncate'
                          >
                            <a href={fileUrl} target='_blank' rel='noopener noreferrer'>
                              {fileName || 'file'}
                            </a>
                          </Button>
                        ) : (
                          <Text size='micro' variant='errorLabel' className='min-w-0 truncate'>
                            ! file
                          </Text>
                        )}
                        {canEdit ? (
                          <Close
                            size='sm'
                            aria-label='remove file'
                            onClick={() => patch({ files: [] })}
                          />
                        ) : null}
                      </>
                    ) : canEdit ? (
                      <Button type='button' variant='underline' size='xs' onClick={openFiles}>
                        choose file
                      </Button>
                    ) : (
                      <EmptyCell />
                    )}
                  </span>
                </Field>
              </div>
            </div>
          ) : null}

          {noteOpen || !!row.note?.trim() ? (
            <div className='mt-3'>
              <Field label='note'>
                <Input
                  value={row.note ?? ''}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patch({ note: event.target.value })
                  }
                />
              </Field>
            </div>
          ) : null}

          {canEdit && removable ? (
            <div className='mt-3 flex justify-end gap-3'>
              {!noteOpen && !row.note?.trim() ? (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => setNoteOpen(true)}
                >
                  + note
                </Button>
              ) : null}
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => removeLabelWithLine(getValues, setValue, labelKey)}
              >
                remove
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {made ? (
        <LabelFilePicker
          open={filePicker}
          onOpenChange={setFilePicker}
          onPick={(picked) =>
            patch({
              files: [
                {
                  colorwayId: 0,
                  sizeId: 0,
                  libraryFileId: picked.libraryFileId,
                  sourceHash: '',
                  publicUrl: picked.publicUrl,
                },
              ],
            })
          }
        />
      ) : null}

      {generated ? (
        <MaterialPickerDialog
          open={materialPicker}
          section={LABEL_BOM_SECTION}
          value={wireInt(line?.materialId)}
          includeArchived
          title='material'
          onPick={(picked) => {
            setMaterialPicker(false);
            if (!picked) {
              takeLabelMaterialOff(getValues, setValue, labelKey);
              return;
            }
            // The row may still be virtual: its born facts land first, then the line and the source.
            patch({});
            pickLabelMaterial(getValues, setValue, labelKey, picked, {
              source: 'stock',
              kind,
            });
          }}
          onClose={() => setMaterialPicker(false)}
        />
      ) : null}
    </div>
  );
}
