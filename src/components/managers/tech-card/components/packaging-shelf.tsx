import type {
  common_AdminColorwayRef,
  common_Material,
  common_MediaFull,
  common_TechCardListItem,
  common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMaterialStock } from 'components/managers/materials/components/useWarehouse';
import { labelMediaOf } from 'components/managers/tech-card/care-labels/label-media';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState, type ChangeEvent, type JSX, type ReactNode } from 'react';
import {
  useFormContext,
  useWatch,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form';
import {
  AddDoor,
  Button,
  Chip,
  ChipRow,
  Close,
  EmptyCell,
  GroupLabel,
  Input,
  Media,
  Pill,
  Placeholder,
  Row,
  Select,
  Text,
  UndoRow,
  addDoorClass,
} from 'ui';
import { decimalToInput } from 'utils/decimal';

import { packagingItemKind } from './bom-kind';
import { upsertPackagingItem } from './form-writers';
import {
  dropPackagingRowLine,
  packagingLineForPick,
  removePackagingItemWithLine,
} from './label-bom';
import {
  StockPickerModal,
  Thumb,
  auxCardThumbUrl,
  auxOutputStock,
  auxSubtypeLabel,
  type StockPickerOption,
  useAuxTechCards,
} from './labels-pkg-shared';
import type { FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { kindLabel, packagingItemKinds } from './tech-card-options';
import { useOpenRunPlanned } from './use-label-stock';
import { wireInt } from './wire-int';

type Pick =
  | {
      type: 'material';
      id: number;
      name: string;
      image?: common_MediaFull;
      material: common_Material;
    }
  | { type: 'aux'; id: number; name: string; url?: string; card: common_TechCardListItem };

type PickerMode = 'pack' | 'hanger' | 'box';

type RemovedItem = {
  name: string;
  items: FormPackagingItem[];
  bomItems: NonNullable<TechCardFormData['bomItems']>;
};

type RemovedPhoto = {
  id: number;
  index: number;
};

const ON_HANGER = 'on a hanger';
const FOLDED = 'folded';
const FOLDS = [
  { value: 'folded in half', label: 'in half' },
  { value: 'folded in three', label: 'in thirds' },
  { value: 'tri-fold, sleeves in', label: 'tri-fold' },
  { value: 'rolled', label: 'rolled' },
];
const perOrderKinds = new Set(['box', 'mailer', 'tote_bag']);
const notPackagingAux = new Set([
  'TECH_CARD_AUX_SUBTYPE_BRAND_LABEL',
  'TECH_CARD_AUX_SUBTYPE_CARE_LABEL',
  'TECH_CARD_AUX_SUBTYPE_SIZE_LABEL',
  'TECH_CARD_AUX_SUBTYPE_HANGTAG',
]);

const sameKind = (item: FormPackagingItem, kind: string) =>
  (item.key ?? '').trim().toLowerCase() === kind;

const picked = (item?: FormPackagingItem) =>
  !!item && (wireInt(item.materialId) > 0 || wireInt(item.auxTechCardId) > 0);

const pickKey = (pick: Pick): string => `${pick.type}:${pick.id}`;

const kindWord = (key?: string): string => kindLabel(packagingItemKinds, key).replaceAll('_', ' ');

const mediaUrl = (media?: common_MediaFull): string =>
  media?.media?.thumbnail?.mediaUrl ||
  media?.media?.compressed?.mediaUrl ||
  media?.media?.fullSize?.mediaUrl ||
  '';

const mediaFromUrl = (url?: string): common_MediaFull | undefined =>
  url
    ? ({
        id: undefined,
        createdAt: undefined,
        contentHash: undefined,
        media: { thumbnail: { mediaUrl: url } },
      } as common_MediaFull)
    : undefined;

const packedPhotoIds = (ids?: readonly number[]): number[] =>
  (ids ?? []).map(wireInt).filter((id) => id > 0);

function writePackedPhotoIds(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  ids: readonly number[],
) {
  const packedMediaIds = packedPhotoIds(ids);
  setValue(
    'packaging',
    {
      ...getValues('packaging'),
      packedMediaId: packedMediaIds[0] ?? 0,
      packedMediaIds,
    },
    { shouldDirty: true },
  );
}

const dimensionParts = (value?: string): [string, string] => {
  const parts = value?.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [parts[0]?.replace(',', '.') ?? '', parts[1]?.replace(',', '.') ?? ''];
};

const joinedDimensions = (width: string, height: string): string =>
  width || height ? `${width} × ${height}` : '';

export function packagingIssues(
  folding: string,
  packedSize: string,
  items: readonly FormPackagingItem[],
  unitsPerBox: number,
): string[] {
  const hanger = items.find((item) => sameKind(item, 'hanger'));
  const box = items.find((item) => sameKind(item, 'box'));
  const [width, height] = dimensionParts(packedSize);
  const issues: string[] = [];
  if (!folding) issues.push('pick shipping');
  if (folding === ON_HANGER && !picked(hanger)) issues.push('pick hanger');
  if (folding && folding !== ON_HANGER && (!(Number(width) > 0) || !(Number(height) > 0)))
    issues.push('add folded size');
  if (!picked(box)) issues.push('pick box');
  else if (!(unitsPerBox > 0)) issues.push('add per box');
  return issues;
}

/** `! N` of the block header: what the shelf still needs before it is a complete pack. */
export function packagingGaps(
  folding: string,
  items: readonly FormPackagingItem[],
  unitsPerBox: number,
  packedSize = '',
): number {
  return packagingIssues(folding, packedSize, items, unitsPerBox).length;
}

function ShelfRow({
  label,
  children,
  top = false,
}: {
  label: string;
  children: ReactNode;
  top?: boolean;
}) {
  return (
    <Row
      label={
        <Text
          size='control'
          variant='label'
          tracking='label'
          component='span'
          className='uppercase'
        >
          {label}
        </Text>
      }
      value={children}
      className={cn(
        'min-h-11 flex-col items-stretch py-2 sm:flex-row sm:items-center',
        'sm:[&>span:first-child]:w-30 sm:[&>span:first-child]:shrink-0',
        '[&>span:last-child]:min-w-0 [&>span:last-child]:flex-1 [&>span:last-child]:shrink',
        top && 'sm:items-start sm:[&>span:first-child]:pt-1',
      )}
    />
  );
}

function ItemMedia({
  item,
  resolvedMedia,
}: {
  item: FormPackagingItem;
  resolvedMedia?: readonly common_TechCardMediaFull[];
}) {
  const library = useMediaMap();
  const url =
    mediaUrl(item.pickedThumbnail) ||
    mediaUrl(labelMediaOf(wireInt(item.mediaIds?.[0]), resolvedMedia, library));
  return url ? (
    <Media
      src={url}
      alt={item.pickedName || item.key || 'packaging item'}
      aspectRatio='1/1'
      fit='contain'
    />
  ) : (
    <Placeholder label='item' className='h-full w-full border-0' />
  );
}

function PickMedia({ pick }: { pick: Pick }) {
  if (pick.type === 'material') {
    const url = materialImageUrl(pick.material);
    return url ? (
      <Media src={url} alt={pick.name} aspectRatio='1/1' fit='contain' />
    ) : (
      <Placeholder label='item' className='aspect-square w-full' />
    );
  }
  return <Thumb url={pick.url} alt={pick.name} className='aspect-square w-full border-0' />;
}

function StockValue({ value, need }: { value?: string; need?: number }) {
  if (value == null || value === '') return <EmptyCell />;
  const short = Number(value) <= 0 || (need != null && Number(value) < need);
  return (
    <Text
      size='micro'
      variant={short ? 'errorLabel' : 'label'}
      component='span'
      className='whitespace-nowrap'
    >
      {short ? '! ' : ''}
      {value} in stock
    </Text>
  );
}

function PickField({
  item,
  label,
  detail,
  resolvedMedia,
  canEdit,
  onPick,
  onClear,
}: {
  item?: FormPackagingItem;
  label: string;
  detail?: string;
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!picked(item)) {
    return (
      <Button
        type='button'
        variant='default'
        className='h-7 min-w-28 p-0'
        disabled={!canEdit}
        onClick={onPick}
      >
        <Placeholder dashed tone='error' label={`+ ${label}`} className='h-7 w-full px-2' />
      </Button>
    );
  }
  return (
    <span className='flex min-w-0 max-w-90 items-center gap-1.5'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        className='h-7 min-w-0 flex-1 gap-2 p-0 pr-2 text-left'
        disabled={!canEdit}
        onClick={onPick}
      >
        <span className='size-5.5 shrink-0 bg-pageBg'>
          <ItemMedia item={item!} resolvedMedia={resolvedMedia} />
        </span>
        <Text component='span' className='min-w-0 flex-1 truncate'>
          {item?.pickedName || label}
        </Text>
        {detail ? (
          <Text
            size='control'
            variant='label'
            component='span'
            className='max-w-28 shrink truncate'
          >
            {detail}
          </Text>
        ) : null}
      </Button>
      {canEdit ? (
        <Close
          size='sm'
          className='size-7 border border-borderColor'
          aria-label={`unpick ${label}`}
          onClick={onClear}
        />
      ) : null}
    </span>
  );
}

function PackedPhotos({
  resolvedMedia,
  disabled,
  onRemove,
}: {
  resolvedMedia?: readonly common_TechCardMediaFull[];
  disabled: boolean;
  onRemove: (id: number, index: number) => void;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const packedMediaIds = packedPhotoIds(
    useWatch<TechCardFormData>({ name: 'packaging.packedMediaIds' }) as number[] | undefined,
  );
  const library = useMediaMap();
  const currentIds = () => packedPhotoIds(getValues('packaging.packedMediaIds'));
  const append = (selected: common_MediaFull[]) => {
    const next = currentIds();
    for (const media of selected) {
      const id = wireInt(media.id);
      if (id > 0 && !next.includes(id)) next.push(id);
    }
    writePackedPhotoIds(getValues, setValue, next);
  };
  const replace = (index: number) => (selected: common_MediaFull[]) => {
    const id = wireInt(selected[0]?.id);
    if (!(id > 0)) return;
    const next = currentIds();
    if (index >= next.length) return;
    next[index] = id;
    writePackedPhotoIds(getValues, setValue, next);
  };
  const intake = useMediaIntake({
    enabled: !disabled,
    accept: 'image',
    purpose: 'packed photos',
    onMedia: append,
  });

  return (
    <div {...intake.regionHandlers} className='flex min-w-0 flex-wrap items-start gap-2.5'>
      {packedMediaIds.map((id, index) => {
        const url = mediaUrl(labelMediaOf(id, resolvedMedia, library));
        const picture = url ? (
          <Media src={url} alt={`packed photo ${index + 1}`} aspectRatio='auto' fit='cover' />
        ) : (
          <Placeholder label='photo' className='h-full w-full border-0' />
        );
        return (
          <div
            key={`${id}-${index}`}
            className='flex w-28 flex-col border border-borderColor max-sm:w-24'
          >
            {disabled ? (
              <div className='h-35 w-full bg-pageBg max-sm:h-30'>{picture}</div>
            ) : (
              <MediaSelector
                label='replace photo'
                purpose='packed photo'
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                saveSelectedMedia={replace(index)}
                trigger={
                  <Button
                    type='button'
                    variant='default'
                    className='h-35 w-full overflow-hidden p-0 max-sm:h-30'
                    aria-label={`replace photo ${index + 1}`}
                  >
                    {picture}
                  </Button>
                }
              />
            )}
            <div className='flex h-7 shrink-0 items-center border-t border-borderColor pl-2'>
              <Text size='micro' variant='label' tracking='label' className='flex-1 uppercase'>
                {index === 0 ? 'cover' : index + 1}
              </Text>
              {!disabled ? (
                <Close
                  size='sm'
                  className='size-7 border-l border-borderColor'
                  aria-label={`remove photo ${index + 1}`}
                  onClick={() => onRemove(id, index)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {!disabled ? (
        <MediaSelector
          label='add photo'
          purpose='packed photo'
          aspectRatio={['Custom']}
          allowMultiple
          showVideos={false}
          saveSelectedMedia={append}
          trigger={
            <Button
              type='button'
              variant='default'
              className={cn(
                addDoorClass({ shape: 'tile' }),
                'h-42.5 w-28 max-sm:h-37.5 max-sm:w-24',
              )}
            >
              + {intake.dragging ? 'drop photo' : 'photo'}
            </Button>
          }
        />
      ) : null}
      {intake.dialog}
    </div>
  );
}

function PackagingPicker({
  mode,
  onClose,
  items,
  bomItems,
  stock,
  onTake,
  onUnpick,
}: {
  mode: PickerMode | null;
  onClose: () => void;
  items: FormPackagingItem[];
  bomItems: NonNullable<TechCardFormData['bomItems']>;
  stock: Map<number, string>;
  onTake: (mode: PickerMode, kind: string, pick: Pick) => void;
  onUnpick: (mode: Exclude<PickerMode, 'pack'>) => void;
}) {
  const open = mode != null;
  const materials = useMaterials('TECH_CARD_BOM_SECTION_PACKAGING', false, open);
  const aux = useAuxTechCards();

  const picks = useMemo<Pick[]>(() => {
    const materialPicks = (materials.data?.materials ?? [])
      .filter((material) => material.materialClass === 'MATERIAL_CLASS_PACKAGING')
      .map((material) => ({
        type: 'material' as const,
        id: wireInt(material.id),
        name: material.name || material.code || 'material',
        image: material.image,
        material,
      }));
    const auxPicks = (aux.data?.techCards ?? [])
      .filter((card) => !notPackagingAux.has(card.auxSubtype ?? ''))
      .map((card) => ({
        type: 'aux' as const,
        id: wireInt(card.id),
        name: card.name || card.styleNumber || 'aux card',
        url: auxCardThumbUrl(card),
        card,
      }));
    return [...materialPicks, ...auxPicks].filter((pick) => pick.id > 0);
  }, [aux.data?.techCards, materials.data?.materials]);

  const kindOf = (pick: Pick): string => {
    if (pick.type === 'aux')
      return packagingItemKind(undefined, `${pick.name} ${auxSubtypeLabel(pick.card.auxSubtype)}`);
    const bomKind = bomItems.find((line) => wireInt(line.materialId) === pick.id)?.kind;
    return packagingItemKind(bomKind, pick.name);
  };

  const fixedKind = mode === 'hanger' ? 'hanger' : mode === 'box' ? 'box' : '';
  const shown = picks.filter((pick) => {
    const kind = kindOf(pick);
    return fixedKind ? !kind || kind === fixedKind : kind !== 'hanger' && kind !== 'box';
  });
  const current = fixedKind ? items.find((item) => sameKind(item, fixedKind)) : undefined;
  const currentKey = current
    ? wireInt(current.materialId)
      ? `material:${wireInt(current.materialId)}`
      : wireInt(current.auxTechCardId)
        ? `aux:${wireInt(current.auxTechCardId)}`
        : ''
    : '';
  const added = new Set(
    items
      .filter((item) => !sameKind(item, 'hanger') && !sameKind(item, 'box'))
      .map((item) =>
        wireInt(item.materialId)
          ? `material:${wireInt(item.materialId)}`
          : `aux:${wireInt(item.auxTechCardId)}`,
      ),
  );

  const options = shown.map<StockPickerOption>((pick) => {
    const kind = kindOf(pick) || 'packaging_item';
    const output = pick.type === 'aux' ? auxOutputStock(pick.card) : undefined;
    const onHand =
      pick.type === 'material'
        ? stock.get(pick.id) ?? '0'
        : output && 'onHand' in output
          ? output.onHand
          : undefined;
    const noOutput = output?.state === 'none';
    const alreadyAdded = mode === 'pack' && added.has(pickKey(pick));
    return {
      key: pickKey(pick),
      name: pick.name,
      tab: kind,
      media: <PickMedia pick={pick} />,
      sub: kindWord(kind) || 'item',
      disabled: alreadyAdded,
      status: (
        <div className='flex min-w-0 flex-col gap-1'>
          {alreadyAdded ? (
            <Text size='micro' variant='label'>
              in pack
            </Text>
          ) : onHand != null ? (
            <StockValue value={onHand} />
          ) : null}
          {noOutput ? <Pill tone='warn'>no output material</Pill> : null}
        </div>
      ),
    };
  });

  const tabs = fixedKind
    ? [{ value: fixedKind, label: kindWord(fixedKind) }]
    : packagingItemKinds
        .filter((option) => option.key !== 'hanger' && option.key !== 'box')
        .map((option) => ({ value: option.key, label: option.label }));

  return (
    <StockPickerModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={mode === 'hanger' ? 'pick hanger' : mode === 'box' ? 'pick box' : 'add item'}
      options={options}
      tabs={tabs}
      selectedKeys={currentKey ? [currentKey] : []}
      multiple={mode === 'pack'}
      onConfirm={(keys) => {
        if (!mode) return;
        if (mode !== 'pack' && keys.length === 0) {
          onUnpick(mode);
          onClose();
          return;
        }
        for (const key of keys) {
          const pick = picks.find((candidate) => pickKey(candidate) === key);
          if (!pick || (mode === 'pack' && added.has(key))) continue;
          const kind = fixedKind || kindOf(pick) || 'packaging_item';
          onTake(mode, kind, pick);
        }
        onClose();
      }}
    />
  );
}

export function PackagingShelf({
  techCardId,
  resolvedMedia,
  canEdit,
}: {
  techCardId?: number;
  colorwayRefs?: readonly common_AdminColorwayRef[];
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit: boolean;
}): JSX.Element {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const items = (useWatch<TechCardFormData>({ name: 'packagingItems' }) ??
    []) as FormPackagingItem[];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const folding = (useWatch<TechCardFormData>({ name: 'packaging.foldingMethod' }) ?? '') as string;
  const packedSize = (useWatch<TechCardFormData>({ name: 'packaging.packedSize' }) ?? '') as string;
  const units = wireInt(useWatch<TechCardFormData>({ name: 'packaging.unitsPerBox' }));
  const gross = wireInt(useWatch<TechCardFormData>({ name: 'packaging.weightGrossGrams' }));
  const planned = useOpenRunPlanned(wireInt(techCardId));
  const auxCards = useAuxTechCards();
  const stockQuery = useMaterialStock({ section: 'TECH_CARD_BOM_SECTION_PACKAGING' });
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null);
  const [removedPhoto, setRemovedPhoto] = useState<RemovedPhoto | null>(null);
  const [foldedMethod, setFoldedMethod] = useState(
    folding && folding !== ON_HANGER ? folding : FOLDED,
  );

  useEffect(() => {
    if (folding && folding !== ON_HANGER) setFoldedMethod(folding);
  }, [folding]);

  const stock = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of stockQuery.data?.rows ?? [])
      map.set(wireInt(row.material?.id), decimalToInput(row.onHand) || '0');
    return map;
  }, [stockQuery.data?.rows]);

  const shipsOnHanger = folding === ON_HANGER;
  const shipsFolded = !!folding && !shipsOnHanger;
  const hangerIndex = items.findIndex((item) => sameKind(item, 'hanger'));
  const boxIndex = items.findIndex((item) => sameKind(item, 'box'));
  const hanger = hangerIndex >= 0 ? items[hangerIndex] : undefined;
  const box = boxIndex >= 0 ? items[boxIndex] : undefined;
  const packItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== hangerIndex && index !== boxIndex);
  const [foldWidth, foldHeight] = dimensionParts(packedSize);

  const onHandOf = (item?: FormPackagingItem): string | undefined => {
    if (!item) return undefined;
    const materialId = wireInt(item.materialId);
    if (materialId) return stock.get(materialId) ?? '0';
    const card = auxCards.data?.techCards?.find(
      (entry) => wireInt(entry.id) === wireInt(item.auxTechCardId),
    );
    const output = card && auxOutputStock(card);
    return output && 'onHand' in output ? output.onHand : undefined;
  };

  const setShips = (next: 'hanger' | 'folded') => {
    if (next === 'hanger') {
      setValue('packaging.foldingMethod', shipsOnHanger ? '' : ON_HANGER, { shouldDirty: true });
      return;
    }
    setValue('packaging.foldingMethod', shipsFolded ? '' : foldedMethod || FOLDED, {
      shouldDirty: true,
    });
  };

  const take = (mode: PickerMode, kind: string, pick: Pick) => {
    const currentItems = (getValues('packagingItems') ?? []) as FormPackagingItem[];
    const rowIndex = mode === 'pack' ? -1 : currentItems.findIndex((item) => sameKind(item, kind));
    const row = rowIndex >= 0 ? rowIndex : undefined;
    let bomLineKey = '';
    if (pick.type === 'material') {
      bomLineKey = packagingLineForPick(getValues, setValue, pick.material, row);
    } else if (row != null) {
      dropPackagingRowLine(getValues, setValue, row);
    }
    const value: Partial<Omit<FormPackagingItem, 'key'>> = {
      bomLineKey,
      bomItemId: 0,
      materialId: pick.type === 'material' ? pick.id : 0,
      auxTechCardId: pick.type === 'aux' ? pick.id : 0,
      pickedName: pick.name,
      pickedThumbnail: pick.type === 'material' ? pick.image : mediaFromUrl(pick.url),
    };
    if (mode === 'pack') {
      upsertPackagingItem(
        getValues,
        setValue,
        kind,
        { ...value, perOrder: perOrderKinds.has(kind), qtyPerGarment: 1, colorwayIds: [] },
        { forceNew: true, keepBare: true },
      );
      return;
    }
    upsertPackagingItem(
      getValues,
      setValue,
      kind,
      { ...value, perOrder: mode === 'box', qtyPerGarment: 1 },
      { keepBare: true },
    );
    if (mode === 'box' && pick.type === 'material' && pick.material.packagingAttrs?.dimensions)
      setValue('packaging.boxDimensions', pick.material.packagingAttrs.dimensions, {
        shouldDirty: true,
      });
  };

  const unpick = (mode: 'hanger' | 'box') => {
    const index = items.findIndex((item) => sameKind(item, mode));
    if (index < 0) return;
    removePackagingItemWithLine(getValues, setValue, items[index].key || mode, index);
  };

  const removePackItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    setRemovedItem({
      name: item.pickedName || kindWord(item.key) || 'item',
      items: items.slice(),
      bomItems: bomItems.slice(),
    });
    removePackagingItemWithLine(getValues, setValue, item.key || '', index);
  };

  const fullBox = units > 0 && gross > 0 ? `${((units * gross) / 1000).toFixed(2)} kg` : '';
  const foldItems =
    folding &&
    folding !== FOLDED &&
    folding !== ON_HANGER &&
    !FOLDS.some((item) => item.value === folding)
      ? [...FOLDS, { value: folding, label: folding }]
      : FOLDS;

  return (
    <>
      <div>
        <ShelfRow label='ships'>
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
            <ChipRow>
              <Chip
                className='h-7'
                selected={shipsFolded}
                pressed={shipsFolded}
                disabled={!canEdit}
                onClick={() => setShips('folded')}
              >
                folded
              </Chip>
              <Chip
                className='h-7'
                selected={shipsOnHanger}
                pressed={shipsOnHanger}
                disabled={!canEdit}
                onClick={() => setShips('hanger')}
              >
                on hanger
              </Chip>
            </ChipRow>
            {shipsFolded ? (
              <>
                <Select
                  name='packaging.foldingMethod'
                  className='h-7 w-full whitespace-nowrap sm:w-32.5'
                  value={folding === FOLDED ? '' : folding}
                  placeholder='pick fold'
                  readOnly={!canEdit}
                  items={foldItems}
                  onValueChange={(value: string | undefined) =>
                    setValue('packaging.foldingMethod', value || FOLDED, { shouldDirty: true })
                  }
                />
                <span className='grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:max-w-52.5'>
                  <Input
                    type='number'
                    min={1}
                    inputMode='numeric'
                    value={foldWidth}
                    disabled={!canEdit}
                    aria-label='folded width cm'
                    className='h-7 min-w-0'
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setValue(
                        'packaging.packedSize',
                        joinedDimensions(event.target.value, foldHeight),
                        { shouldDirty: true },
                      )
                    }
                  />
                  <Text variant='label'>×</Text>
                  <Input
                    type='number'
                    min={1}
                    inputMode='numeric'
                    value={foldHeight}
                    disabled={!canEdit}
                    aria-label='folded height cm'
                    className='h-7 min-w-0'
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setValue(
                        'packaging.packedSize',
                        joinedDimensions(foldWidth, event.target.value),
                        { shouldDirty: true },
                      )
                    }
                  />
                  <Text size='micro' variant='label'>
                    cm
                  </Text>
                </span>
              </>
            ) : null}
            {shipsOnHanger ? (
              <PickField
                item={hanger}
                label='hanger'
                detail={onHandOf(hanger) != null ? `${onHandOf(hanger)} in stock` : undefined}
                resolvedMedia={resolvedMedia}
                canEdit={canEdit}
                onPick={() => setPicker('hanger')}
                onClear={() => unpick('hanger')}
              />
            ) : null}
          </div>
        </ShelfRow>
        <ShelfRow label='photos' top>
          <PackedPhotos
            resolvedMedia={resolvedMedia}
            disabled={!canEdit}
            onRemove={(id, index) => {
              const current = packedPhotoIds(getValues('packaging.packedMediaIds'));
              if (current[index] !== id) return;
              setRemovedPhoto({ id, index });
              writePackedPhotoIds(
                getValues,
                setValue,
                current.filter((_, photoIndex) => photoIndex !== index),
              );
            }}
          />
        </ShelfRow>
        {removedPhoto ? (
          <UndoRow
            name='photo'
            onUndo={() => {
              const current = packedPhotoIds(getValues('packaging.packedMediaIds'));
              const index = Math.min(removedPhoto.index, current.length);
              writePackedPhotoIds(getValues, setValue, [
                ...current.slice(0, index),
                removedPhoto.id,
                ...current.slice(index),
              ]);
              setRemovedPhoto(null);
            }}
            onCommit={() => setRemovedPhoto(null)}
          />
        ) : null}
      </div>

      <GroupLabel
        action={
          <Text size='micro' variant='label'>
            {packItems.length}
          </Text>
        }
      >
        in the pack
      </GroupLabel>
      <div>
        {packItems.length ? (
          <div className='hidden grid-cols-[3.5rem_minmax(0,.7fr)_minmax(0,1.6fr)_5rem_minmax(0,.7fr)_1.75rem] items-center gap-3 border-b border-borderColor py-1 sm:grid'>
            <span />
            {['role', 'item', 'per', 'on hand', ''].map((label, index) => (
              <Text
                key={`${label}-${index}`}
                size='control'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                {label}
              </Text>
            ))}
          </div>
        ) : null}
        <div className='divide-y divide-hairline'>
          {packItems.map(({ item, index }) => {
            const onHand = onHandOf(item);
            const need =
              item.perOrder || planned == null
                ? undefined
                : planned * Math.max(1, item.qtyPerGarment ?? 1);
            return (
              <div
                key={`${index}-${item.key}-${item.materialId ?? 0}-${item.auxTechCardId ?? 0}`}
                className='grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_4rem_1.75rem] items-center gap-3 py-1.5 sm:grid-cols-[3.5rem_minmax(0,.7fr)_minmax(0,1.6fr)_5rem_minmax(0,.7fr)_1.75rem]'
              >
                <span className='size-14 bg-pageBg'>
                  <ItemMedia item={item} resolvedMedia={resolvedMedia} />
                </span>
                <Text
                  size='control'
                  variant='label'
                  tracking='label'
                  component='span'
                  className='hidden truncate uppercase sm:block'
                >
                  {kindWord(item.key) || 'item'}
                </Text>
                <span className='min-w-0'>
                  <Text className='truncate'>
                    {item.pickedName || kindWord(item.key) || 'item'}
                  </Text>
                  <Text
                    size='micro'
                    variant='label'
                    tracking='label'
                    className='truncate uppercase sm:hidden'
                  >
                    {kindWord(item.key) || 'item'}
                  </Text>
                </span>
                <Input
                  type='number'
                  min={1}
                  inputMode='numeric'
                  value={item.qtyPerGarment ?? 1}
                  disabled={!canEdit}
                  aria-label='per garment'
                  className='h-7 min-w-0'
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    upsertPackagingItem(
                      getValues,
                      setValue,
                      item.key || 'packaging_item',
                      { qtyPerGarment: Math.max(1, Number(event.target.value) || 1) },
                      { index, keepBare: true },
                    )
                  }
                />
                <span className='hidden sm:block'>
                  <StockValue value={onHand} need={need} />
                </span>
                {canEdit ? (
                  <Close
                    size='sm'
                    className='size-7 border border-borderColor'
                    aria-label={`remove ${item.pickedName || 'item'}`}
                    onClick={() => removePackItem(index)}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
        {canEdit ? (
          <AddDoor afterRows={packItems.length > 0} onClick={() => setPicker('pack')}>
            item
          </AddDoor>
        ) : null}
        {removedItem ? (
          <UndoRow
            name={removedItem.name}
            onUndo={() => {
              setValue('packagingItems', removedItem.items as never, { shouldDirty: true });
              setValue('bomItems', removedItem.bomItems as never, { shouldDirty: true });
              setRemovedItem(null);
            }}
            onCommit={() => setRemovedItem(null)}
          />
        ) : null}
      </div>

      <GroupLabel>shipping box</GroupLabel>
      <div>
        <ShelfRow label='box'>
          <PickField
            item={box}
            label='box'
            detail={
              [onHandOf(box) != null ? `${onHandOf(box)} in stock` : '', gross ? `${gross} g` : '']
                .filter(Boolean)
                .join(' · ') || undefined
            }
            resolvedMedia={resolvedMedia}
            canEdit={canEdit}
            onPick={() => setPicker('box')}
            onClear={() => unpick('box')}
          />
        </ShelfRow>
        <ShelfRow label='per box'>
          <Input
            type='number'
            min={1}
            inputMode='numeric'
            value={units || ''}
            disabled={!canEdit || !picked(box)}
            aria-label='per box'
            className='h-7 w-20'
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setValue('packaging.unitsPerBox', Math.max(0, Number(event.target.value) || 0), {
                shouldDirty: true,
              })
            }
          />
        </ShelfRow>
        <ShelfRow label='weight'>{fullBox ? <Text>{fullBox}</Text> : <EmptyCell />}</ShelfRow>
      </div>

      <PackagingPicker
        mode={picker}
        onClose={() => setPicker(null)}
        items={items}
        bomItems={bomItems}
        stock={stock}
        onTake={take}
        onUnpick={unpick}
      />
    </>
  );
}
