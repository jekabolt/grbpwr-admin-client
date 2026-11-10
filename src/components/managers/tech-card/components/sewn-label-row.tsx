import type {
  common_Material,
  common_TechCard,
  common_TechCardGarmentZone,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  useFormContext,
  useWatch,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
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
} from 'ui';

import { LabelIcon, type LabelKind as PictogramKind } from './design/hardware-icons';
import { upsertGarmentLabel } from './form-writers';
import {
  LABEL_BOM_SECTION,
  pickLabelMaterial,
  removeLabelWithLine,
  takeLabelMaterialOff,
} from './label-bom';
import { LabelShapeIcon } from './label-shape-icon';
import { LabelFilePicker } from './label-file-picker';
import type { FormGarmentLabel } from './labels-schema';
import { labelPlacementIssue } from './label-placement';
import { FabricPieceEditor } from './fabric-piece-editor';
import { LabelPrintsEditor } from './label-prints-editor';
import type { TechCardFormData } from './schema';
import { confirmCompositionLabel } from './label-bom';
import { useBuiltRibbons } from './composition-label/built-ribbons-context';
import {
  isCompositionLabel,
  isOwnArtworkFile,
  labelBomLine,
  type LabelAxes,
} from './sewn-label-model';
import {
  kindLabel,
  labelAttachmentOptions,
  labelDefaults,
  labelMadeByOptions,
  labelPrintMethodOptions,
  labelStockKinds,
} from './tech-card-options';
import { bomUnitKind } from './nesting/marker-io';
import { isRollGoodsSection } from './bom-purpose';
import { wireInt } from './wire-int';
import { garmentLabelMark } from './garment-label-pieces';
import { LabelFoldEditor } from './label-fold-editor';
import { ulid } from 'utils/ulid';
import { zoneLabel } from './operation-options';
import { pieceRefKey } from './piece-block-refs';
import { PieceSilhouette, SILHOUETTE_INK } from './piece-silhouette';
import { usePieceShapes } from './use-piece-shapes';

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
    fold: (defaults?.folding ?? '') as FormGarmentLabel['fold'],
    foldAxis: '',
    pages: 1,
    qtyPerGarment: 1,
  };
}

const virtualRow = (key: string): FormGarmentLabel => ({
  key,
  lineKey: '',
  source: '',
  kind: '',
  madeBy: '',
  printMethod: '',
  lengthCm: '',
  placement: '',
  attachment: '',
  folding: '',
  size: '',
  widthMm: '',
  heightMm: '',
  fold: '',
  foldLinesMm: '',
  stitchLinesMm: '',
  foldAxis: '',
  pages: 1,
  qtyPerGarment: 1,
  bomItemId: 0,
  bomLineKey: '',
  note: '',
  mediaIds: [],
  calloutNumber: 0,
  artworkPerSize: false,
  artworkPerColorway: false,
  files: [],
  pieceBomItemId: 0,
  pieceWidthMm: '',
  pieceHeightMm: '',
  pieceSeamMm: '',
  labelXMm: '',
  labelYMm: '',
  labelOnPiece: '',
  prints: [],
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
  bomItems: readonly {
    id?: number;
    lineKey?: string | null;
    unit?: string;
    section?: string;
  }[],
  compositionMissingCountry = false,
  operations?: readonly { labelKeys?: string[] }[],
): string | null {
  const built = (row.key ?? '').trim().toLowerCase() === 'composition';
  if (built && compositionMissingCountry) return 'no country';
  const lineKey = row.lineKey?.trim();
  const linked = lineKey
    ? operations?.some((operation) => (operation.labelKeys ?? []).includes(lineKey))
    : false;
  if (operations ? !linked : !row.placement?.trim()) return 'no location';
  if (!row.attachment?.trim()) return 'no attachment';
  if (!row.widthMm?.trim() || !row.heightMm?.trim()) return 'no size';
  if (row.attachment === 'on_fabric_piece') {
    const pieceId = wireInt(row.pieceBomItemId);
    if (
      pieceId > 0 &&
      !bomItems.some((line) => wireInt(line.id) === pieceId && isRollGoodsSection(line.section))
    )
      return 'pick piece fabric';
  }
  const placementIssue = labelPlacementIssue(row);
  if (placementIssue) return placementIssue;
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
  return values.map((option) => ({
    value: option,
    label: option === 'on_fabric_piece' ? 'on fabric piece' : option,
  }));
}

const attachmentWord = (value?: string): string =>
  value === 'on_fabric_piece' ? 'on fabric piece' : value?.trim() || '';

function attachmentChange(row: FormGarmentLabel, value?: string): Partial<FormGarmentLabel> {
  const attachment = value || '';
  if (attachment !== 'on_fabric_piece') return { attachment };
  const labelWidth = Number(row.widthMm) || 30;
  const labelHeight = Number(row.heightMm) || 50;
  const seam = row.pieceSeamMm || '8';
  return {
    attachment,
    labelOnPiece: row.labelOnPiece || '4_sides',
    pieceWidthMm: row.pieceWidthMm || String(Math.max(40, labelWidth + 10)),
    pieceHeightMm: row.pieceHeightMm || String(Math.max(70, labelHeight + 20)),
    pieceSeamMm: seam,
    labelXMm: row.labelXMm || '5',
    labelYMm: row.labelYMm || String(Math.max(Number(seam), 12)),
  };
}

export function labelPictogram(kind?: string): PictogramKind {
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

const decimalText = (value: number): string =>
  String(Math.round(value * 100) / 100).replace(/\.0+$/, '');

export function labelMaterialSize(material?: common_Material): [string, string] {
  if (!material) return ['', ''];
  const dimensions =
    material.hardwareAttrs?.dimensions?.trim() || material.packagingAttrs?.dimensions?.trim() || '';
  const values = dimensions.match(/\d+(?:[.,]\d+)?/g)?.slice(0, 2) ?? [];
  if (values.length) {
    const scale = /\bcm\b/i.test(dimensions) && !/\bmm\b/i.test(dimensions) ? 10 : 1;
    const parsed = values.map((value) => decimalText(Number(value.replace(',', '.')) * scale));
    return [parsed[0] ?? '', parsed[1] ?? ''];
  }
  if (material.labelType === 'MATERIAL_LABEL_TYPE_TAPE') {
    const widthCm = Number(
      (material.fabricAttrs?.widthCm?.value || material.fabricWidth?.value || '').replace(',', '.'),
    );
    if (Number.isFinite(widthCm) && widthCm > 0) return [decimalText(widthCm * 10), ''];
  }
  return ['', ''];
}

const cleanMillimetres = (value: string): string | null => {
  const next = value.replace(',', '.');
  return /^\d*(?:\.\d{0,2})?$/.test(next) ? next : null;
};

function LabelSizeFields({
  row,
  material,
  canEdit,
  patch,
}: {
  row: FormGarmentLabel;
  material?: common_Material;
  canEdit: boolean;
  patch: (value: Partial<Omit<FormGarmentLabel, 'key'>>) => void;
}) {
  const stock = labelMaterialSize(material);
  const edited =
    (!!row.widthMm || !!row.heightMm) &&
    (!!stock[0] || !!stock[1]) &&
    (row.widthMm !== stock[0] || row.heightMm !== stock[1]);
  return (
    <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
      <Input
        inputMode='decimal'
        value={row.widthMm ?? ''}
        disabled={!canEdit}
        aria-label='width mm'
        className='w-20'
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const value = cleanMillimetres(event.target.value);
          if (value != null) patch({ widthMm: value });
        }}
      />
      <Text variant='label'>×</Text>
      <Input
        inputMode='decimal'
        value={row.heightMm ?? ''}
        disabled={!canEdit}
        aria-label='height mm'
        className='w-20'
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const value = cleanMillimetres(event.target.value);
          if (value != null) patch({ heightMm: value });
        }}
      />
      <Text size='micro' variant='label'>
        mm
      </Text>
      {canEdit && edited ? (
        <Button
          type='button'
          variant='underline'
          size='xs'
          onClick={() => patch({ widthMm: stock[0], heightMm: stock[1] })}
        >
          reset
        </Button>
      ) : null}
    </span>
  );
}

function useLabelSizeAutofill(
  row: FormGarmentLabel,
  material: common_Material | undefined,
  labelKey: string,
) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const [stockWidth, stockHeight] = labelMaterialSize(material);
  useEffect(() => {
    if (row.source !== 'stock' || (!stockWidth && !stockHeight)) return;
    if (row.widthMm && row.heightMm) return;
    const current = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice();
    const index = current.findIndex((candidate) => sameKey(candidate.key, labelKey));
    if (index < 0) return;
    const next = {
      ...current[index],
      widthMm: current[index].widthMm || stockWidth,
      heightMm: current[index].heightMm || stockHeight,
    };
    if (next.widthMm === current[index].widthMm && next.heightMm === current[index].heightMm)
      return;
    setValue(`garmentLabels.${index}`, next as never, { shouldDirty: true });
  }, [
    getValues,
    labelKey,
    row.heightMm,
    row.source,
    row.widthMm,
    setValue,
    stockHeight,
    stockWidth,
  ]);
}

export const labelSizeText = (row: Pick<FormGarmentLabel, 'widthMm' | 'heightMm'>): string =>
  row.widthMm || row.heightMm ? `${row.widthMm || '—'} × ${row.heightMm || '—'}` : '';

const LABEL_STEP_WORKS = new Set(['attach_label', 'hang_tag']);
const NEW_STEP = '__new_step';

type LabelOperation = NonNullable<TechCardFormData['operations']>[number];

const linkedStepIndex = (operations: readonly LabelOperation[], lineKey?: string): number => {
  const key = lineKey?.trim() ?? '';
  return key ? operations.findIndex((operation) => (operation.labelKeys ?? []).includes(key)) : -1;
};

/** The label's step key; a row without one (generated, or saved before 0454) gets it on first use. */
export function ensureLabelLineKey(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  labelKey: string,
): string {
  // A composition label put on a step without its size is confirmed first: size + BOM line,
  // otherwise the step picker has no label to place.
  const born = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).find((row) =>
    sameKey(row.key, labelKey),
  );
  if (isCompositionLabel(labelKey) && !(Number(born?.widthMm) > 0 && Number(born?.heightMm) > 0))
    confirmCompositionLabel(getValues, setValue);
  const rows = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const index = rows.findIndex((row) => sameKey(row.key, labelKey));
  const current = index >= 0 ? rows[index]?.lineKey?.trim() : '';
  if (current) return current;
  const lineKey = ulid();
  if (index >= 0)
    setValue(`garmentLabels.${index}.lineKey`, lineKey as never, { shouldDirty: true });
  else
    upsertGarmentLabel(
      getValues,
      setValue,
      labelKey,
      { ...bornLabelFacts(labelKey), lineKey },
      { keepBare: true },
    );
  return lineKey;
}

const stepName = (work: string): string =>
  work === 'attach_label'
    ? 'attach label'
    : work === 'hang_tag'
      ? 'hang tag'
      : work.replaceAll('_', ' ') || 'step';

function LabelStepLink({
  labelKey,
  lineKey,
  canEdit,
  openRequest = 0,
}: {
  labelKey: string;
  lineKey?: string;
  canEdit: boolean;
  openRequest?: number;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const operations = useWatch({ control, name: 'operations' }) ?? [];
  const pieces = useWatch({ control, name: 'pieces' }) ?? [];
  const shapes = usePieceShapes(true).shapeByKey;
  const [, setParams] = useSearchParams();
  const trigger = useRef<HTMLSpanElement>(null);
  const index = linkedStepIndex(operations, lineKey);
  const steps = operations
    .map((operation, at) => ({ operation, at }))
    .filter(
      ({ operation, at }) => at === index || LABEL_STEP_WORKS.has((operation.work ?? '').trim()),
    );
  const openSteps = (at = index, operation = operations[at]) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('tab', 'construction');
        if (operation?.operationNumber) next.set('op', String(operation.operationNumber));
        else if (at >= 0) next.set('opi', String(at));
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    if (!openRequest || index >= 0 || !canEdit) return;
    const frame = requestAnimationFrame(() => trigger.current?.querySelector('button')?.click());
    return () => cancelAnimationFrame(frame);
  }, [canEdit, index, openRequest]);

  const choose = async (value: string | undefined) => {
    const key = ensureLabelLineKey(getValues, setValue, labelKey);
    if (value === NEW_STEP) {
      const current = getValues('operations') ?? [];
      const { newOperationRow } = await import('./operations-field');
      const next = newOperationRow({ work: 'attach_label', labelKeys: [key] });
      setValue('operations', [...current, next] as never, { shouldDirty: true });
      openSteps(current.length, next);
      return;
    }
    const target = value ? Number(value) : -1;
    const current = getValues('operations') ?? [];
    current.forEach((operation, at) => {
      const keys = (operation.labelKeys ?? []).filter(Boolean);
      const has = keys.includes(key);
      if (at === target && !has)
        setValue(`operations.${at}.labelKeys`, [...keys, key], { shouldDirty: true });
      else if (at !== target && has)
        setValue(
          `operations.${at}.labelKeys`,
          keys.filter((candidate) => candidate !== key),
          { shouldDirty: true },
        );
    });
  };
  const linked = index >= 0 ? operations[index] : undefined;
  const number = linked?.operationNumber || (index + 1) * 10;
  const zone = zoneLabel(linked?.zone as common_TechCardGarmentZone);
  const summary = linked
    ? [number, stepName((linked.work ?? '').trim())].filter(Boolean).join(' ') +
      (zone ? ` · ${zone}` : '')
    : '';
  const pieceKey = linked?.inputKeys?.find((candidate) => !!candidate?.trim())?.trim() ?? '';
  const pieceName = pieces.find((piece) => piece.lineKey === pieceKey)?.name?.trim() || '';
  const shape = pieceKey ? shapes?.get(pieceRefKey(pieceKey)) ?? null : null;
  const items = [
    ...steps.map(({ operation, at }) => {
      const optionZone = zoneLabel(operation.zone as common_TechCardGarmentZone);
      return {
        value: String(at),
        label: `${operation.operationNumber || (at + 1) * 10} ${stepName((operation.work ?? '').trim())}${optionZone ? ` · ${optionZone}` : ''}`,
      };
    }),
    { value: NEW_STEP, label: 'new step' },
  ];
  return linked ? (
    <Button
      type='button'
      variant='default'
      className='flex min-h-5.5 w-full min-w-0 items-center justify-start gap-1.5 border border-borderColor bg-bgColor px-1.75 py-0.75 text-left hover:border-textColor press:!bg-bgColor press:!text-textColor'
      title={pieceName || summary}
      onClick={() => openSteps()}
    >
      <PieceSilhouette
        found={shape}
        boxClassName={`m-0 size-4 ${SILHOUETTE_INK}`}
        boxPx={{ w: 16, h: 16 }}
      />
      <span className='min-w-0 truncate'>{summary}</span>
    </Button>
  ) : (
    <span ref={trigger} data-placement-select=''>
      <Select
        name={`${labelKey}-step`}
        value=''
        placeholder='no location'
        readOnly={!canEdit}
        invalid
        fullWidth
        className='min-w-0 text-error'
        items={items}
        onValueChange={(value: string | undefined) => void choose(value)}
      />
    </span>
  );
}

function LabelFold({
  row,
  disabled,
  onChange,
  artworkAction,
}: {
  row: FormGarmentLabel;
  disabled: boolean;
  onChange: (value: Partial<Omit<FormGarmentLabel, 'key'>>) => void;
  artworkAction?: ReactNode;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const [selectedPrintIndex, setSelectedPrintIndex] = useState(0);
  const shape = garmentLabelMark(row);
  const composition = isCompositionLabel(row.key);
  const ribbons = useBuiltRibbons();
  const built = composition && !(row.files ?? []).some(isOwnArtworkFile);
  const prints = row.prints ?? [];
  const patchPrint = (index: number, value: Partial<(typeof prints)[number]>) =>
    onChange({
      prints: prints.map((print, at) => (at === index ? { ...print, ...value } : { ...print })),
    });
  return (
    <>
      {row.attachment === 'on_fabric_piece' ? (
        <FabricPieceEditor
          row={row}
          fabricLines={bomItems.filter((line) => isRollGoodsSection(line.section))}
          artworkAction={artworkAction}
          selectedPrintIndex={selectedPrintIndex}
          disabled={disabled}
          onSelectPrint={setSelectedPrintIndex}
          onChange={onChange}
        />
      ) : (
        <LabelFoldEditor
          widthMm={shape?.widthMm ?? 30}
          heightMm={shape?.heightMm ?? 100}
          widthValue={row.widthMm}
          heightValue={row.heightMm}
          fold={row.fold}
          foldLinesMm={row.foldLinesMm}
          stitchLinesMm={row.stitchLinesMm}
          foldAxis={row.foldAxis}
          pages={row.pages}
          composition={composition}
          artworkAction={artworkAction}
          libraryFileId={row.files?.[0]?.libraryFileId}
          ribbons={built ? ribbons : undefined}
          prints={prints}
          selectedPrintIndex={selectedPrintIndex}
          disabled={disabled}
          onSelectPrint={setSelectedPrintIndex}
          onPrintChange={patchPrint}
          onChange={onChange}
        />
      )}
      <LabelPrintsEditor
        prints={prints}
        labelWidthMm={row.widthMm}
        labelHeightMm={row.heightMm}
        selectedIndex={selectedPrintIndex}
        disabled={disabled}
        onSelect={setSelectedPrintIndex}
        onChange={(next) => onChange({ prints: next })}
      />
    </>
  );
}

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
      sub={[source, madeBy, labelSizeText(row) ? `${labelSizeText(row)} mm` : '']
        .filter(Boolean)
        .join(' · ')}
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
  useLabelSizeAutofill(row, material, labelKey);
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
            <LabelSizeFields
              row={row}
              material={material}
              canEdit={canEdit && !built}
              patch={patch}
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
              onValueChange={(value: string | undefined) => patch(attachmentChange(row, value))}
            />
          </Field>
          <Field label='placed'>
            <LabelStepLink labelKey={labelKey} lineKey={row.lineKey} canEdit={canEdit} />
          </Field>
          <Field label='fold' className='sm:col-span-2'>
            <LabelFold row={row} disabled={!canEdit} onChange={patch} />
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
  'grid w-full items-center gap-x-3 grid-cols-[48px_minmax(0,1fr)_16px] sm:grid-cols-[48px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,.9fr)_74px_110px_16px]';

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
  onRemove,
  canEdit,
  last,
  removable = true,
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
  onRemove?: () => void;
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
  const operations = useWatch({ control, name: 'operations' }) ?? [];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const row = rows.find((candidate) => sameKey(candidate.key, labelKey)) ?? virtualRow(labelKey);
  useLabelSizeAutofill(row, material, labelKey);
  const line = labelBomLine(row, bomItems);
  const unit = material?.unit?.trim() || line?.unit?.trim() || '';
  const quantities = quantityFacts(row, unit, material ? onHand : undefined, plannedQty);
  const made = !generated && madeIntent(row);
  const legacyFiles = !generated && !made && row.source === '' && (row.files?.length ?? 0) > 0;
  const kind = row.kind?.trim() || row.key?.trim() || '';
  const kindWord = kindLabel(labelStockKinds, kind);

  const [noteOpen, setNoteOpen] = useState(false);
  const [filePicker, setFilePicker] = useState(false);
  const [internalOpen, setInternalOpen] = useState(true);
  const [materialPicker, setMaterialPicker] = useState(false);
  const [placementRequest, setPlacementRequest] = useState(0);

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
  const stepIndex = linkedStepIndex(operations, row.lineKey);
  const step = stepIndex >= 0 ? operations[stepIndex] : undefined;
  const stepZone = zoneLabel(step?.zone as common_TechCardGarmentZone);
  const location = stepZone || placement;
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

  const openPlaced = (event?: { preventDefault: () => void; stopPropagation: () => void }) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!expanded) setExpanded(true);
    setPlacementRequest((request) => request + 1);
  };

  const locationValue = location ? (
    location
  ) : (
    <span
      role='button'
      tabIndex={0}
      className='cursor-pointer text-error underline underline-offset-2'
      onClick={openPlaced}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        openPlaced(event);
      }}
    >
      no location
    </span>
  );

  const artworkAction =
    generated?.action ??
    (made ? (
      <Button type='button' variant='underline' size='xs' disabled={!canEdit} onClick={openFiles}>
        artwork
      </Button>
    ) : legacyFiles && fileUrl ? (
      <Button asChild variant='underline' size='xs'>
        <a href={fileUrl} target='_blank' rel='noopener noreferrer'>
          artwork
        </a>
      </Button>
    ) : undefined);

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
        className={`${ROW_GRID} px-0 py-2 text-left press:!bg-transparent press:!text-textColor`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {material ? (
          <MaterialThumb material={material} size='sm' className='size-12' />
        ) : (
          <span className='flex size-12 items-center justify-center border border-borderColor bg-pageBg'>
            <LabelShapeIcon label={row} size={40} />
          </span>
        )}
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
            <span className='sm:hidden'>
              {' '}
              {' · '}
              {locationValue}
            </span>
          </Text>
          {generated?.pills}
        </span>
        <Text component='span' className='hidden min-w-0 truncate sm:block'>
          {locationValue}
        </Text>
        <Text component='span' className='hidden min-w-0 truncate sm:block'>
          {attachmentWord(attachment) || <EmptyCell />}
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
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4'>
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
            <Field label='attachment'>
              <Select
                name={`${uid}-attachment`}
                value={attachment}
                readOnly={!canEdit}
                placeholder='pick'
                className='min-w-0 whitespace-nowrap [&>span:first-child]:min-w-0 [&>span:first-child]:truncate'
                items={withStored(labelAttachmentOptions, attachment)}
                onValueChange={(value: string | undefined) => patch(attachmentChange(row, value))}
              />
            </Field>
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
            <Field label='placed'>
              <LabelStepLink
                labelKey={labelKey}
                lineKey={row.lineKey}
                canEdit={canEdit}
                openRequest={placementRequest}
              />
            </Field>
          </div>

          <div className='mt-4' data-label-artwork={labelKey}>
            <LabelFold
              row={row}
              disabled={!canEdit}
              onChange={patch}
              artworkAction={artworkAction}
            />
          </div>

          {made ? (
            <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <Field label='made by' className='sm:col-span-2'>
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
                        <Button asChild variant='underline' size='xs' className='min-w-0 truncate'>
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
                onClick={onRemove ?? (() => removeLabelWithLine(getValues, setValue, labelKey))}
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
