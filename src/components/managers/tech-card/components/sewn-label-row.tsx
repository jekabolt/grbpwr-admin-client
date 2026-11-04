import type { common_Material, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
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
  EmptyCell,
  FoldCaret,
  Input,
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

const printedBy = (madeBy?: string): boolean =>
  ['printed', 'heat transfer'].includes(madeBy?.trim() ?? '');

/** The mockup's block warning count for one row. */
export function labelMiss(
  row: FormGarmentLabel,
  bomItems: readonly { id?: number; lineKey?: string | null; unit?: string }[],
): number {
  const line = labelBomLine(row, bomItems);
  const lengthGoods = !!line && ['m', 'cm'].includes(bomUnitKind(line.unit) ?? '');
  let missing = 0;
  if (!row.placement?.trim()) missing += 1;
  if (!row.attachment?.trim()) missing += 1;
  if (!row.folding?.trim()) missing += 1;
  if (lengthGoods && !(Number(row.lengthCm) > 0)) missing += 1;
  if (madeIntent(row)) {
    if (!row.madeBy?.trim()) missing += 1;
    if (!line) missing += 1;
    if (!row.size?.trim()) missing += 1;
    if (printedBy(row.madeBy) && !row.printMethod?.trim()) missing += 1;
    if (!(row.files ?? []).some((file) => file.publicUrl?.trim())) missing += 1;
  }
  return missing;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
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
