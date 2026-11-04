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
import { useCareLabelSource } from 'components/managers/tech-card/care-labels/adapter';
import { labelMediaOf } from 'components/managers/tech-card/care-labels/label-media';
import { Swatch as TechpackSwatch } from 'components/managers/tech-card/techpack/pages/bits';
import { useMemo, useState, type ChangeEvent, type JSX } from 'react';
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
  Textarea,
  Tile,
  Tiles,
} from 'ui';

import { packagingItemKind } from './bom-kind';
import { removePackagingItem, upsertPackagingItem, type PackagingItemOpts } from './form-writers';
import {
  auxCardThumbUrl,
  auxOutputStock,
  Thumb,
  useAuxTechCards,
  Field,
} from './labels-pkg-shared';
import type { FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import {
  foldingMethodOptions,
  kindLabel,
  packagingItemKinds,
  packagingPackingOptions,
} from './tech-card-options';
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

type Colourway = { id: number; name: string; hex: string };

const perOrderKinds = new Set(['box', 'mailer', 'tote_bag']);
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

const colourHex = (ref?: common_AdminColorwayRef): string =>
  ref?.devHex || ref?.colours?.[0]?.hex || '';

function Swatch({ hex }: { hex: string }) {
  return hex ? (
    <TechpackSwatch colour={hex} size={10} />
  ) : (
    <span aria-hidden='true' className='size-2.5 shrink-0 border border-borderColor bg-pageBg' />
  );
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

  if (disabled)
    return (
      <Field label='packed photo'>
        {url ? (
          thumb
        ) : (
          <Text size='micro' variant='label'>
            —
          </Text>
        )}
      </Field>
    );
  return (
    <Field label='packed photo'>
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
              <Chip dashed className='h-6.5'>
                {intake.dragging ? 'drop photo' : '+ photo'}
              </Chip>
            )
          }
        />
        {!!packedMediaId && (
          <Close
            size='sm'
            aria-label='remove packed photo'
            onClick={() =>
              setValue('packaging.packedMediaId', 0, {
                shouldDirty: true,
              })
            }
          />
        )}
        {intake.dialog}
      </div>
    </Field>
  );
}

function ItemMedia({ item }: { item: FormPackagingItem }) {
  const url = mediaUrl(item.pickedThumbnail);
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

function ItemDetail({
  index,
  item,
  colourways,
  disabled,
  onClose,
  onRemove,
  onPatch,
}: {
  index: number;
  item: FormPackagingItem;
  colourways: Colourway[];
  disabled: boolean;
  onClose: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<Omit<FormPackagingItem, 'key'>>, opts?: PackagingItemOpts) => void;
}) {
  const ids = item.colorwayIds ?? [];
  const toggleColour = (id: number) => {
    const next = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
    onPatch({ colorwayIds: next }, { index, keepBare: true });
  };
  return (
    <div className='mt-4 border-t border-hairline pt-4'>
      <div className='flex items-center gap-2'>
        <Text size='control' tracking='label' className='truncate uppercase'>
          {item.pickedName || kindLabel(packagingItemKinds, item.key) || 'item'}
        </Text>
        <Close
          className='ml-auto'
          size='sm'
          aria-label={disabled ? 'close item' : 'remove item'}
          onClick={disabled ? onClose : onRemove}
        />
      </div>
      <div className='mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Field label='quantity'>
          <div className='flex min-w-0 gap-1'>
            <Input
              className='h-7 min-h-7 w-20'
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
            <Chip
              className='h-7'
              selected={!item.perOrder}
              pressed={!item.perOrder}
              disabled={disabled}
              onClick={() => onPatch({ perOrder: false }, { index, keepBare: true })}
            >
              garment
            </Chip>
            <Chip
              className='h-7'
              selected={!!item.perOrder}
              pressed={!!item.perOrder}
              disabled={disabled}
              onClick={() => onPatch({ perOrder: true }, { index, keepBare: true })}
            >
              order
            </Chip>
          </div>
        </Field>
        <Field label='size'>
          <Input
            value={item.size ?? ''}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onPatch({ size: event.target.value }, { index, keepBare: true })
            }
          />
        </Field>
        <Field label='how'>
          <Input
            list={`packaging-how-${index}`}
            value={item.packing ?? ''}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onPatch({ packing: event.target.value }, { index, keepBare: true })
            }
          />
          <datalist id={`packaging-how-${index}`}>
            {packagingPackingOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </Field>
        <Field label='note' className='sm:col-span-2'>
          <Textarea
            name={`packagingItems.${index}.note`}
            value={item.note ?? ''}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onPatch({ note: event.target.value }, { index, keepBare: true })
            }
          />
        </Field>
        {colourways.length > 1 && (
          <Field label='colourways' className='sm:col-span-2 lg:col-span-3'>
            <ChipRow>
              <Chip
                selected={ids.length === 0}
                pressed={ids.length === 0}
                disabled={disabled}
                onClick={() => onPatch({ colorwayIds: [] }, { index, keepBare: true })}
              >
                all
              </Chip>
              {colourways.map((colourway) => (
                <Chip
                  key={colourway.id}
                  selected={ids.includes(colourway.id)}
                  pressed={ids.includes(colourway.id)}
                  disabled={disabled}
                  onClick={() => toggleColour(colourway.id)}
                >
                  <Swatch hex={colourway.hex} />
                  {colourway.name}
                </Chip>
              ))}
            </ChipRow>
          </Field>
        )}
      </div>
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
  open,
  onOpenChange,
  items,
  activeColourway,
  bomItems,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FormPackagingItem[];
  activeColourway: number | 'all';
  bomItems: NonNullable<TechCardFormData['bomItems']>;
  onAdd: (key: string, patch: Partial<Omit<FormPackagingItem, 'key'>>) => void;
}) {
  const materials = useMaterials('TECH_CARD_BOM_SECTION_PACKAGING', false, open);
  const aux = useAuxTechCards();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<Pick | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
    const auxPicks = (aux.data?.techCards ?? []).map((card) => ({
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
      return packagingItemKind(undefined, `${pick.name} ${pick.card.auxSubtype ?? ''}`);
    const bomKind = bomItems.find((line) => wireInt(line.materialId) === pick.id)?.kind;
    return packagingItemKind(bomKind, pick.name);
  };
  const filtered = picks.filter((pick) => {
    const words = `${pick.name} ${pick.type}`.toLowerCase();
    return (
      (!query.trim() || words.includes(query.trim().toLowerCase())) &&
      (kind === 'all' || kindOf(pick) === kind)
    );
  });
  const isAdded = (pick: Pick) =>
    items.some(
      (item) =>
        (pick.type === 'material'
          ? wireInt(item.materialId) === pick.id
          : wireInt(item.auxTechCardId) === pick.id) && (item.colorwayIds?.length ?? 0) === 0,
    );
  const usePick = (pick: Pick) => {
    const guessed = kind === 'all' ? kindOf(pick) : kind;
    const key = guessed || 'packaging_item';
    onAdd(key, {
      materialId: pick.type === 'material' ? pick.id : 0,
      auxTechCardId: pick.type === 'aux' ? pick.id : 0,
      perOrder: perOrderKinds.has(key),
      qtyPerGarment: 1,
      pickedName: pick.name,
      pickedThumbnail: pick.type === 'material' ? pick.image : mediaFromUrl(pick.url),
      colorwayIds: activeColourway === 'all' ? [] : [activeColourway],
    });
    setSelected(null);
    onOpenChange(false);
  };

  return (
    <>
      <ConfirmationModal
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setSelected(null);
        }}
        onConfirm={() => selected && usePick(selected)}
        title='add packaging'
        confirmLabel='use item'
        confirmDisabled={!selected}
        width='lg'
      >
        <div className='flex flex-col gap-3'>
          <Input
            value={query}
            placeholder='search'
            aria-label='search'
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          <ChipRow>
            <Chip selected={kind === 'all'} pressed={kind === 'all'} onClick={() => setKind('all')}>
              all
            </Chip>
            {packagingItemKinds.map((option) => (
              <Chip
                key={option.key}
                selected={kind === option.key}
                pressed={kind === option.key}
                onClick={() => setKind(option.key)}
              >
                {option.label}
              </Chip>
            ))}
          </ChipRow>
          {filtered.length ? (
            <Tiles min={132}>
              {filtered.map((pick) => {
                const added = isAdded(pick);
                const noOutput = pick.type === 'aux' && auxOutputStock(pick.card).state === 'none';
                return (
                  <Tile
                    key={`${pick.type}-${pick.id}`}
                    media={<PickMedia pick={pick} />}
                    name={pick.name}
                    sub={kindLabel(packagingItemKinds, kindOf(pick)) || pick.type}
                    selected={selected?.type === pick.type && selected.id === pick.id}
                    onClick={added ? undefined : () => setSelected(pick)}
                    className={added ? 'opacity-50' : undefined}
                    title={pick.name}
                  >
                    {(added || noOutput) && (
                      <div className='mt-1'>
                        <Pill tone={noOutput ? 'warn' : 'mut'}>
                          {noOutput ? 'no output material' : 'added'}
                        </Pill>
                      </div>
                    )}
                  </Tile>
                );
              })}
            </Tiles>
          ) : (
            <div className='flex items-center gap-2 py-6'>
              <Text size='small' variant='label'>
                nothing in the catalog
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
          usePick({
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
  const folding = useWatch<TechCardFormData>({ name: 'packaging.foldingMethod' }) ?? '';
  const care = useCareLabelSource(techCardId);
  const auxCards = useAuxTechCards();
  const [activeColourway, setActiveColourway] = useState<number | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const colourways = useMemo<Colourway[]>(
    () =>
      (care.data?.colorways ?? []).map((colourway) => {
        const ref = colorwayRefs?.find((entry) => wireInt(entry.colorwayId) === colourway.id);
        return {
          id: colourway.id,
          name: colourway.colourName || ref?.devName || ref?.colorCode || 'colour',
          hex: colourHex(ref),
        };
      }),
    [care.data?.colorways, colorwayRefs],
  );
  const visible = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      activeColourway === 'all'
        ? true
        : (item.colorwayIds?.length ?? 0) === 0 || item.colorwayIds?.includes(activeColourway),
    );
  const patch = (
    index: number,
    item: FormPackagingItem,
    value: Partial<Omit<FormPackagingItem, 'key'>>,
    opts?: PackagingItemOpts,
  ) => upsertPackagingItem(getValues, setValue, item.key || '', value, { ...opts, index });
  const shipsOnHanger = folding === 'on a hanger';
  const setShips = (hanger: boolean) =>
    setValue('packaging.foldingMethod', hanger ? 'on a hanger' : 'folded in half', {
      shouldDirty: true,
    });

  return (
    <>
      <GroupLabel flush>packed</GroupLabel>
      <div className='mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Field label='ships'>
          <ChipRow>
            <Chip
              className='h-6.5'
              selected={shipsOnHanger}
              pressed={shipsOnHanger}
              disabled={!canEdit}
              onClick={() => setShips(true)}
            >
              on hanger
            </Chip>
            <Chip
              className='h-6.5'
              selected={!shipsOnHanger}
              pressed={!shipsOnHanger}
              disabled={!canEdit}
              onClick={() => setShips(false)}
            >
              folded
            </Chip>
          </ChipRow>
        </Field>
        {!shipsOnHanger && (
          <Field label='fold'>
            <Select
              name='packaging.foldingMethod'
              className='whitespace-nowrap'
              value={folding || 'folded in half'}
              disabled={!canEdit}
              items={foldingMethodOptions
                .filter((option) => option !== 'on a hanger')
                .map((option) => ({ value: option, label: option }))}
              onValueChange={(value: string | undefined) =>
                setValue('packaging.foldingMethod', value ?? '', { shouldDirty: true })
              }
            />
          </Field>
        )}
        <InputField name='packaging.packedSize' label='packed size' disabled={!canEdit} />
        <InputField
          name='packaging.weightNetGrams'
          label='net weight (g)'
          type='number'
          valueAsNumber
          keyboardRestriction={/[0-9]/}
          disabled={!canEdit}
        />
        <InputField
          name='packaging.weightGrossGrams'
          label='gross weight (g)'
          type='number'
          valueAsNumber
          keyboardRestriction={/[0-9]/}
          disabled={!canEdit}
        />
        <PackedPhoto resolvedMedia={resolvedMedia} disabled={!canEdit} />
      </div>

      <div className='pt-6'>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label'>
              {items.length}
            </Text>
          }
        >
          items
        </GroupLabel>
        {colourways.length > 1 && (
          <ChipRow className='mt-3'>
            <Chip
              selected={activeColourway === 'all'}
              pressed={activeColourway === 'all'}
              onClick={() => setActiveColourway('all')}
            >
              all
            </Chip>
            {colourways.map((colourway) => (
              <Chip
                key={colourway.id}
                selected={activeColourway === colourway.id}
                pressed={activeColourway === colourway.id}
                onClick={() => setActiveColourway(colourway.id)}
              >
                <Swatch hex={colourway.hex} />
                {colourway.name}
              </Chip>
            ))}
          </ChipRow>
        )}
        <Tiles min={140} className='mt-3'>
          {visible.map(({ item, index }) => {
            const limited = (item.colorwayIds ?? [])
              .map((id) => colourways.find((colourway) => colourway.id === id)?.name)
              .filter(Boolean)
              .join(', ');
            const auxCard = auxCards.data?.techCards?.find(
              (card) => wireInt(card.id) === wireInt(item.auxTechCardId),
            );
            const noOutput = !!auxCard && auxOutputStock(auxCard).state === 'none';
            return (
              <Tile
                key={`${index}-${item.key}-${item.materialId ?? 0}-${item.auxTechCardId ?? 0}`}
                media={<ItemMedia item={item} />}
                name={item.pickedName || kindLabel(packagingItemKinds, item.key) || 'item'}
                sub={`${kindLabel(packagingItemKinds, item.key) || item.key || 'item'} · ${item.qtyPerGarment ?? 1}/${item.perOrder ? 'order' : 'garment'}`}
                selected={selectedIndex === index}
                onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
                title={item.pickedName || item.key}
              >
                {limited && (
                  <Text size='micro' variant='label' className='mt-1 truncate'>
                    {limited}
                  </Text>
                )}
                {noOutput && (
                  <div className='mt-1'>
                    <Pill tone='warn'>no output material</Pill>
                  </div>
                )}
              </Tile>
            );
          })}
          {canEdit && (
            <Tile
              dashed
              name='+ item'
              onClick={() => setPickerOpen(true)}
              className='min-h-24 justify-center'
            />
          )}
        </Tiles>
        {selectedIndex != null && items[selectedIndex] && (
          <ItemDetail
            index={selectedIndex}
            item={items[selectedIndex]}
            colourways={colourways}
            disabled={!canEdit}
            onClose={() => setSelectedIndex(null)}
            onRemove={() => {
              removePackagingItem(
                getValues,
                setValue,
                items[selectedIndex].key || '',
                selectedIndex,
              );
              setSelectedIndex(null);
            }}
            onPatch={(value, opts) => patch(selectedIndex, items[selectedIndex], value, opts)}
          />
        )}
      </div>
      <PackagingPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        items={items}
        activeColourway={activeColourway}
        bomItems={bomItems}
        onAdd={(key, value) => {
          const index = upsertPackagingItem(getValues, setValue, key, value, {
            forceNew: true,
            keepBare: true,
          });
          setSelectedIndex(index);
        }}
      />
    </>
  );
}
