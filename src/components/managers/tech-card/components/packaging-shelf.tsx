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
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMaterialStock } from 'components/managers/materials/components/useWarehouse';
import { useCareLabelSource } from 'components/managers/tech-card/care-labels/adapter';
import { labelMediaOf } from 'components/managers/tech-card/care-labels/label-media';
import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Button,
  Chip,
  ChipRow,
  Close,
  ConfirmationModal,
  GroupLabel,
  Input,
  InputField,
  Media,
  Pill,
  Placeholder,
  Select,
  Text,
  Tile,
  Tiles,
} from 'ui';

import { packagingItemKind } from './bom-kind';
import {
  movePackagingItem,
  removePackagingItem,
  upsertPackagingItem,
  type PackagingItemOpts,
} from './form-writers';
import {
  auxCardThumbUrl,
  auxOutputStock,
  auxSubtypeLabel,
  Thumb,
  useAuxTechCards,
  Field,
} from './labels-pkg-shared';
import type { FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { kindLabel, packagingItemKinds } from './tech-card-options';
import { decimalToInput } from 'utils/decimal';
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

type Colourway = { id: number; name: string };

const perOrderKinds = new Set(['box', 'mailer', 'tote_bag']);
const notPackagingAux = new Set([
  'TECH_CARD_AUX_SUBTYPE_BRAND_LABEL',
  'TECH_CARD_AUX_SUBTYPE_CARE_LABEL',
  'TECH_CARD_AUX_SUBTYPE_SIZE_LABEL',
  'TECH_CARD_AUX_SUBTYPE_HANGTAG',
]);
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
        media: {
          thumbnail: { mediaUrl: url },
        },
      } as common_MediaFull)
    : undefined;

const kindWord = (key?: string): string => kindLabel(packagingItemKinds, key).replaceAll('_', ' ');

const ON_HANGER = 'on a hanger';
const FOLDED = 'folded';
const FOLDS = [
  { value: 'folded in half', label: 'in half' },
  { value: 'folded in three', label: 'in thirds' },
  { value: 'tri-fold, sleeves in', label: 'tri-fold, sleeves in' },
  { value: 'rolled', label: 'rolled' },
];

type PickerMode = 'pack' | 'hanger' | 'box';

const sameKind = (item: FormPackagingItem, kind: string) =>
  (item.key ?? '').trim().toLowerCase() === kind;

/** `! N` of the block header: what the shelf still needs before it is a complete pack. */
export function packagingGaps(
  folding: string,
  items: readonly FormPackagingItem[],
  unitsPerBox: number,
): number {
  const hanger = items.find((item) => sameKind(item, 'hanger'));
  const box = items.find((item) => sameKind(item, 'box'));
  const picked = (item?: FormPackagingItem) =>
    !!item && (wireInt(item.materialId) > 0 || wireInt(item.auxTechCardId) > 0);
  let gaps = 0;
  if (!folding) gaps += 1;
  if (folding === ON_HANGER && !picked(hanger)) gaps += 1;
  if (folding === FOLDED) gaps += 1;
  if (!picked(box)) gaps += 1;
  else if (!unitsPerBox) gaps += 1;
  return gaps;
}

function PackedPhoto({
  resolvedMedia,
  disabled,
}: {
  resolvedMedia?: readonly common_TechCardMediaFull[];
  disabled: boolean;
}) {
  const { setValue } = useFormContext<TechCardFormData>();
  const packedMediaId = wireInt(useWatch<TechCardFormData>({ name: 'packaging.packedMediaId' }));
  const library = useMediaMap();
  const media = labelMediaOf(packedMediaId, resolvedMedia, library);
  const url = mediaUrl(media);
  const save = (picked: common_MediaFull[]) => {
    const id = wireInt(picked[0]?.id);
    if (id) setValue('packaging.packedMediaId', id, { shouldDirty: true });
  };
  const intake = useMediaIntake({
    enabled: !disabled,
    accept: 'image',
    limit: 1,
    purpose: 'packed photo',
    onMedia: save,
  });
  const thumb = <Thumb url={url} alt='packed photo' className='size-6.5' />;

  if (disabled) return url ? thumb : null;
  return (
    <div {...intake.regionHandlers} className='flex items-center gap-1'>
      <MediaSelector
        label='+ photo'
        purpose='packed photo'
        aspectRatio={['Custom']}
        allowMultiple={false}
        showVideos={false}
        saveSelectedMedia={save}
        trigger={
          url ? (
            <Button type='button' variant='default' className='p-0' aria-label='packed photo'>
              {thumb}
            </Button>
          ) : (
            <Button type='button' variant='underline' size='xs'>
              {intake.dragging ? 'drop photo' : '+ photo'}
            </Button>
          )
        }
      />
      {!!packedMediaId && (
        <Close
          size='sm'
          aria-label='remove packed photo'
          onClick={() => setValue('packaging.packedMediaId', 0, { shouldDirty: true })}
        />
      )}
      {intake.dialog}
    </div>
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
    <Placeholder label='—' className='aspect-square w-full' />
  );
}

/** The stock figure of a tile: a number, or a red `0 on hand`. Unknown stays silent. */
function OnHand({ value }: { value?: string }) {
  if (value == null || value === '') return null;
  return Number(value) > 0 ? (
    <>{value}</>
  ) : (
    <Text size='micro' variant='errorLabel' component='span'>
      0 on hand
    </Text>
  );
}

function ItemDetail({
  index,
  item,
  colourways,
  disabled,
  canMoveEarlier,
  canMoveLater,
  onMove,
  onRemove,
  onPatch,
}: {
  index: number;
  item: FormPackagingItem;
  colourways: Colourway[];
  disabled: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (patch: Partial<Omit<FormPackagingItem, 'key'>>, opts?: PackagingItemOpts) => void;
}) {
  const colour = item.colorwayIds?.[0];
  return (
    <div className='mt-4 border-t border-hairline pt-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Field label='quantity'>
          <Input
            type='number'
            min={1}
            value={item.qtyPerGarment ?? 1}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onPatch(
                { qtyPerGarment: Math.max(1, Number(event.target.value) || 1) },
                { index, keepBare: true },
              )
            }
          />
        </Field>
        {colourways.length > 1 && (
          <Field label='colours'>
            <Select
              name={`packagingItems.${index}.colour`}
              value={colour ? String(colour) : 'all'}
              disabled={disabled}
              items={[
                { value: 'all', label: 'all colours' },
                ...colourways.map((colourway) => ({
                  value: String(colourway.id),
                  label: colourway.name,
                })),
              ]}
              onValueChange={(value: string | undefined) =>
                onPatch(
                  { colorwayIds: !value || value === 'all' ? [] : [Number(value)] },
                  { index, keepBare: true },
                )
              }
            />
          </Field>
        )}
      </div>
      {!disabled && (
        <div className='mt-3 flex justify-end gap-3'>
          <Button
            type='button'
            variant='underline'
            size='xs'
            disabled={!canMoveEarlier}
            onClick={() => onMove(-1)}
          >
            earlier
          </Button>
          <Button
            type='button'
            variant='underline'
            size='xs'
            disabled={!canMoveLater}
            onClick={() => onMove(1)}
          >
            later
          </Button>
          <Button type='button' variant='underline' size='xs' onClick={onRemove}>
            remove
          </Button>
        </div>
      )}
    </div>
  );
}

function PickMedia({ pick }: { pick: Pick }) {
  if (pick.type === 'material') {
    const url = materialImageUrl(pick.material);
    return url ? (
      <Media src={url} alt={pick.name} aspectRatio='1/1' fit='contain' />
    ) : (
      <Placeholder label='—' className='aspect-square w-full' />
    );
  }
  return <Thumb url={pick.url} alt={pick.name} className='aspect-square w-full border-0' />;
}

function PackagingPicker({
  mode,
  onClose,
  items,
  bomItems,
  stock,
  onTake,
}: {
  mode: PickerMode | null;
  onClose: () => void;
  items: FormPackagingItem[];
  bomItems: NonNullable<TechCardFormData['bomItems']>;
  stock: Map<number, string>;
  onTake: (mode: PickerMode, kind: string, pick: Pick) => void;
}) {
  const open = mode != null;
  const materials = useMaterials('TECH_CARD_BOM_SECTION_PACKAGING', false, open);
  const aux = useAuxTechCards();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setKind('all');
  }, [open]);

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
  }, [materials.data, aux.data]);

  const kindOf = (pick: Pick): string => {
    if (pick.type === 'aux')
      return packagingItemKind(undefined, `${pick.name} ${auxSubtypeLabel(pick.card.auxSubtype)}`);
    const bomKind = bomItems.find((line) => wireInt(line.materialId) === pick.id)?.kind;
    return packagingItemKind(bomKind, pick.name);
  };
  const fixedKind = mode === 'hanger' ? 'hanger' : mode === 'box' ? 'box' : '';
  const filtered = picks.filter((pick) => {
    const words = `${pick.name} ${pick.type}`.toLowerCase();
    const picked = kindOf(pick);
    const kindFits = fixedKind
      ? !picked || picked === fixedKind
      : picked !== 'hanger' && picked !== 'box' && (kind === 'all' || !picked || picked === kind);
    return (!query.trim() || words.includes(query.trim().toLowerCase())) && kindFits;
  });
  const isAdded = (pick: Pick) =>
    mode === 'pack' &&
    items.some(
      (item) =>
        (pick.type === 'material'
          ? wireInt(item.materialId) === pick.id
          : wireInt(item.auxTechCardId) === pick.id) && (item.colorwayIds?.length ?? 0) === 0,
    );
  const take = (pick: Pick) => {
    if (!mode) return;
    onTake(mode, fixedKind || (kind === 'all' ? kindOf(pick) : kind) || 'packaging_item', pick);
    onClose();
  };

  return (
    <>
      <ConfirmationModal
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        onConfirm={onClose}
        title={mode === 'hanger' ? 'pick hanger' : mode === 'box' ? 'pick box' : 'add item'}
        hideActions
        width='lg'
      >
        <div className='flex flex-col gap-3'>
          <div className='flex gap-2'>
            <Input
              className='min-w-0 flex-1'
              value={query}
              placeholder='search stock'
              aria-label='search stock'
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            />
            {mode === 'pack' && (
              <Select
                name='packaging-picker-kind'
                className='w-auto whitespace-nowrap'
                value={kind}
                items={[
                  { value: 'all', label: 'all types' },
                  ...packagingItemKinds
                    .filter((option) => option.key !== 'hanger' && option.key !== 'box')
                    .map((option) => ({ value: option.key, label: option.label })),
                ]}
                onValueChange={(value: string | undefined) => setKind(value || 'all')}
              />
            )}
          </div>
          {!!filtered.length && (
            <Tiles min={132}>
              {filtered.map((pick) => {
                const added = isAdded(pick);
                const noOutput = pick.type === 'aux' && auxOutputStock(pick.card).state === 'none';
                const auxStock = pick.type === 'aux' ? auxOutputStock(pick.card) : undefined;
                const onHand =
                  pick.type === 'material'
                    ? stock.get(pick.id) ?? '0'
                    : auxStock && 'onHand' in auxStock
                      ? auxStock.onHand
                      : undefined;
                return (
                  <Tile
                    key={`${pick.type}-${pick.id}`}
                    media={<PickMedia pick={pick} />}
                    name={pick.name}
                    sub={
                      pick.type === 'material'
                        ? pick.material.packagingAttrs?.dimensions ||
                          kindLabel(packagingItemKinds, kindOf(pick))
                        : kindLabel(packagingItemKinds, kindOf(pick)) || pick.type
                    }
                    onClick={added ? undefined : () => take(pick)}
                    className={added ? 'opacity-50' : undefined}
                    title={pick.name}
                  >
                    <Text size='micro' variant='label' component='span'>
                      <OnHand value={onHand} />
                      {onHand != null && Number(onHand) > 0 ? ' on hand' : ''}
                    </Text>
                    {noOutput && (
                      <div className='mt-1'>
                        <Pill tone='warn' className='h-auto whitespace-normal'>
                          no output material
                        </Pill>
                      </div>
                    )}
                  </Tile>
                );
              })}
            </Tiles>
          )}
          {!filtered.length && (
            <div className='flex items-center gap-2 py-6'>
              <Text size='small' variant='label'>
                nothing in stock
              </Text>
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => setCreateOpen(true)}
              >
                + new
              </Button>
            </div>
          )}
        </div>
      </ConfirmationModal>
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSection='TECH_CARD_BOM_SECTION_PACKAGING'
        onCreated={(_id, material) => {
          setCreateOpen(false);
          take({
            type: 'material',
            id: wireInt(material.id),
            name: material.name || material.code || 'material',
            image: material.image,
            material,
          });
        }}
      />
    </>
  );
}

export function PackagingShelf({
  techCardId,
  colorwayRefs,
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
  const units = wireInt(useWatch<TechCardFormData>({ name: 'packaging.unitsPerBox' }));
  const gross = wireInt(useWatch<TechCardFormData>({ name: 'packaging.weightGrossGrams' }));
  const marking = (useWatch<TechCardFormData>({ name: 'packaging.boxMarking' }) ?? '') as string;
  const boxNote = (useWatch<TechCardFormData>({ name: 'packaging.notes' }) ?? '') as string;
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  const care = useCareLabelSource(techCardId);
  const auxCards = useAuxTechCards();
  const stockQuery = useMaterialStock({ section: 'TECH_CARD_BOM_SECTION_PACKAGING' });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const stock = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of stockQuery.data?.rows ?? []) {
      map.set(wireInt(row.material?.id), decimalToInput(row.onHand) || '0');
    }
    return map;
  }, [stockQuery.data]);

  const colourways = useMemo<Colourway[]>(
    () =>
      (care.data?.colorways ?? []).map((colourway) => {
        const ref = colorwayRefs?.find((entry) => wireInt(entry.colorwayId) === colourway.id);
        return {
          id: colourway.id,
          name: colourway.colourName || ref?.devName || ref?.colorCode || 'colour',
        };
      }),
    [care.data?.colorways, colorwayRefs],
  );

  const shipsOnHanger = folding === ON_HANGER;
  const shipsFolded = !!folding && !shipsOnHanger;
  const hangerIndex = shipsOnHanger ? items.findIndex((item) => sameKind(item, 'hanger')) : -1;
  const boxIndex = items.findIndex((item) => sameKind(item, 'box'));
  const hanger = hangerIndex >= 0 ? items[hangerIndex] : undefined;
  const box = boxIndex >= 0 ? items[boxIndex] : undefined;
  const tiles = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== hangerIndex && index !== boxIndex);

  const onHandOf = (item: FormPackagingItem): string | undefined => {
    const material = wireInt(item.materialId);
    if (material) return stock.get(material) ?? '0';
    const card = auxCards.data?.techCards?.find(
      (entry) => wireInt(entry.id) === wireInt(item.auxTechCardId),
    );
    const output = card && auxOutputStock(card);
    return output && 'onHand' in output ? output.onHand : undefined;
  };

  const setShips = (next: 'hanger' | 'folded') => {
    if (next === 'hanger') {
      setValue('packaging.foldingMethod', ON_HANGER, { shouldDirty: true });
      return;
    }
    if (!shipsFolded) setValue('packaging.foldingMethod', FOLDED, { shouldDirty: true });
    setValue(
      'packagingItems',
      ((getValues('packagingItems') ?? []) as FormPackagingItem[]).filter(
        (item) => !sameKind(item, 'hanger'),
      ) as never,
      { shouldDirty: true },
    );
    setSelectedIndex(null);
  };

  const take = (mode: PickerMode, kind: string, pick: Pick) => {
    const value: Partial<Omit<FormPackagingItem, 'key'>> = {
      materialId: pick.type === 'material' ? pick.id : 0,
      auxTechCardId: pick.type === 'aux' ? pick.id : 0,
      pickedName: pick.name,
      pickedThumbnail: pick.type === 'material' ? pick.image : mediaFromUrl(pick.url),
    };
    if (mode === 'pack') {
      const index = upsertPackagingItem(
        getValues,
        setValue,
        kind,
        { ...value, perOrder: perOrderKinds.has(kind), qtyPerGarment: 1, colorwayIds: [] },
        { forceNew: true, keepBare: true },
      );
      setSelectedIndex(index);
      return;
    }
    upsertPackagingItem(
      getValues,
      setValue,
      kind,
      { ...value, perOrder: mode === 'box', qtyPerGarment: 1 },
      { keepBare: true },
    );
    const dimensions = pick.type === 'material' ? pick.material.packagingAttrs?.dimensions : '';
    if (mode === 'box' && dimensions)
      setValue('packaging.boxDimensions', dimensions, { shouldDirty: true });
  };

  const selectedTile = tiles.findIndex(({ index }) => index === selectedIndex);
  const move = (direction: -1 | 1) => {
    const target = tiles[selectedTile + direction];
    if (selectedIndex == null || !target) return;
    movePackagingItem(getValues, setValue, selectedIndex, target.index);
    setSelectedIndex(target.index);
  };

  const fullBox = units > 0 && gross > 0 ? `${((units * gross) / 1000).toFixed(1)} kg` : '';
  const shownMarking = marking || (units > 0 ? `${styleNumber} · ${units} PCS`.trim() : '');
  const foldItems =
    folding && folding !== FOLDED && !FOLDS.some((option) => option.value === folding)
      ? [...FOLDS, { value: folding, label: folding }]
      : FOLDS;

  return (
    <>
      <GroupLabel flush action={<PackedPhoto resolvedMedia={resolvedMedia} disabled={!canEdit} />}>
        pack
      </GroupLabel>
      <div className='mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Field label='ships'>
          <ChipRow>
            <Chip
              className='h-6.5'
              selected={shipsFolded}
              pressed={shipsFolded}
              disabled={!canEdit}
              onClick={() => setShips('folded')}
            >
              folded
            </Chip>
            <Chip
              className='h-6.5'
              selected={shipsOnHanger}
              pressed={shipsOnHanger}
              disabled={!canEdit}
              onClick={() => setShips('hanger')}
            >
              on hanger
            </Chip>
          </ChipRow>
        </Field>
        {shipsFolded && (
          <Field label='fold'>
            <Select
              name='packaging.foldingMethod'
              className='whitespace-nowrap'
              value={folding === FOLDED ? '' : folding}
              placeholder='how it is folded'
              disabled={!canEdit}
              items={foldItems}
              onValueChange={(value: string | undefined) =>
                setValue('packaging.foldingMethod', value || FOLDED, { shouldDirty: true })
              }
            />
          </Field>
        )}
        {shipsFolded && (
          <InputField
            name='packaging.packedSize'
            label='folded size, cm'
            placeholder='width × height'
            disabled={!canEdit}
          />
        )}
      </div>

      <div className='pt-6'>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label'>
              {tiles.length + (hanger ? 1 : 0)}
            </Text>
          }
        >
          in the pack
        </GroupLabel>
        <Tiles min={140} className='mt-3'>
          {shipsOnHanger &&
            (hanger && (wireInt(hanger.materialId) || wireInt(hanger.auxTechCardId)) ? (
              <Tile
                media={<ItemMedia item={hanger} resolvedMedia={resolvedMedia} />}
                name={hanger.pickedName || 'hanger'}
                onClick={canEdit ? () => setPicker('hanger') : undefined}
                title={hanger.pickedName || 'hanger'}
              >
                <Text size='micro' variant='label' component='span'>
                  1 / pc · <OnHand value={onHandOf(hanger)} />
                </Text>
              </Tile>
            ) : (
              <Tile
                dashed
                tone='error'
                name='pick hanger'
                onClick={canEdit ? () => setPicker('hanger') : undefined}
                className='min-h-24 items-center justify-center'
              />
            ))}
          {tiles.map(({ item, index }) => {
            const auxCard = auxCards.data?.techCards?.find(
              (card) => wireInt(card.id) === wireInt(item.auxTechCardId),
            );
            const noOutput = !!auxCard && auxOutputStock(auxCard).state === 'none';
            const onHand = onHandOf(item);
            return (
              <Tile
                key={`${index}-${item.key}-${item.materialId ?? 0}-${item.auxTechCardId ?? 0}`}
                media={<ItemMedia item={item} resolvedMedia={resolvedMedia} />}
                name={item.pickedName || kindWord(item.key) || 'item'}
                selected={selectedIndex === index}
                onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
                title={item.pickedName || kindWord(item.key)}
              >
                <Text size='micro' variant='label' component='span'>
                  {item.qtyPerGarment ?? 1} / {item.perOrder ? 'order' : 'pc'}
                  {onHand != null && ' · '}
                  <OnHand value={onHand} />
                </Text>
                {noOutput && (
                  <div className='mt-1'>
                    <Pill tone='warn' className='h-auto whitespace-normal'>
                      no output material
                    </Pill>
                  </div>
                )}
              </Tile>
            );
          })}
          {canEdit && (
            <Tile
              dashed
              name='+ item'
              onClick={() => setPicker('pack')}
              className='min-h-24 items-center justify-center'
            />
          )}
        </Tiles>
        {selectedIndex != null && selectedTile >= 0 && (
          <ItemDetail
            index={selectedIndex}
            item={items[selectedIndex]}
            colourways={colourways}
            disabled={!canEdit}
            canMoveEarlier={selectedTile > 0}
            canMoveLater={selectedTile < tiles.length - 1}
            onMove={move}
            onRemove={() => {
              removePackagingItem(
                getValues,
                setValue,
                items[selectedIndex].key || '',
                selectedIndex,
              );
              setSelectedIndex(null);
            }}
            onPatch={(value, opts) =>
              upsertPackagingItem(getValues, setValue, items[selectedIndex].key || '', value, {
                ...opts,
                index: selectedIndex,
              })
            }
          />
        )}
      </div>

      <div className='pt-6'>
        <GroupLabel flush>shipping box</GroupLabel>
        <div className='mt-3 flex flex-col gap-4'>
          <Tiles min={140}>
            {box && (wireInt(box.materialId) || wireInt(box.auxTechCardId)) ? (
              <Tile
                media={<ItemMedia item={box} resolvedMedia={resolvedMedia} />}
                name={box.pickedName || 'box'}
                onClick={canEdit ? () => setPicker('box') : undefined}
                title={box.pickedName || 'box'}
              >
                <Text size='micro' variant='label' component='span'>
                  <OnHand value={onHandOf(box)} />
                </Text>
              </Tile>
            ) : (
              <Tile
                dashed
                tone='error'
                name='pick box'
                onClick={canEdit ? () => setPicker('box') : undefined}
                className='min-h-24 items-center justify-center'
              />
            )}
          </Tiles>
          {box && (wireInt(box.materialId) || wireInt(box.auxTechCardId)) ? (
            <>
              <div className='grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4'>
                <InputField
                  name='packaging.unitsPerBox'
                  label='pieces in box'
                  placeholder='how many'
                  type='number'
                  valueAsNumber
                  keyboardRestriction={/[0-9]/}
                  disabled={!canEdit}
                />
                <InputField
                  name='packaging.weightGrossGrams'
                  label='packed piece, g'
                  placeholder='with packaging'
                  type='number'
                  valueAsNumber
                  keyboardRestriction={/[0-9]/}
                  disabled={!canEdit}
                />
                {fullBox && (
                  <Field label='full box'>
                    <Text size='small'>{fullBox}</Text>
                  </Field>
                )}
                {shownMarking && (
                  <Field label='marking'>
                    <Text size='small'>{shownMarking}</Text>
                  </Field>
                )}
              </div>
              {noteOpen || boxNote ? (
                <InputField
                  name='packaging.notes'
                  label='note'
                  placeholder='for the factory'
                  disabled={!canEdit}
                />
              ) : (
                canEdit && (
                  <div className='flex justify-end'>
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      onClick={() => setNoteOpen(true)}
                    >
                      + note
                    </Button>
                  </div>
                )
              )}
            </>
          ) : null}
        </div>
      </div>
      <PackagingPicker
        mode={picker}
        onClose={() => setPicker(null)}
        items={items}
        bomItems={bomItems}
        stock={stock}
        onTake={take}
      />
    </>
  );
}
