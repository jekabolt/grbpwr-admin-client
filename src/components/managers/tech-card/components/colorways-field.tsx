import { common_MediaFull, common_Colorway } from 'api/proto-http/admin';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardBomSectionOptions, techCardLabDipStatusOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { sanitizeDecimal } from 'utils/decimal';
import { TechCardFormData } from './schema';
import { placementOptions } from './tech-card-options';

const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';

// Measured sections cost by a rate (consumption, per metre/gram) and support per-size
// grading; the rest are counted (quantity, per piece).
const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
]);

const sectionLabels: Record<string, string> = Object.fromEntries(
  techCardBomSectionOptions.map((o) => [o.value, o.label]),
);

const labDipLabels: Record<string, string> = Object.fromEntries(
  techCardLabDipStatusOptions.map((o) => [o.value, o.label]),
);

// Normalize a stored hex to the exact `#rrggbb` the native colour input requires (it silently
// falls back to black for 3-digit shorthand or 8-digit alpha hex). Expands `#abc`→`#aabbcc`
// and strips alpha; returns `#000000` when not a hex colour.
function toPickerHex(value: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value.trim());
  if (!m) return '#000000';
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${hex.slice(0, 6)}`;
}

const emptyUsage = {
  bomItemIndex: -1,
  placement: '',
  color: '',
  pantone: '',
  consumption: '',
  quantity: '',
  sizeConsumptions: [],
  pieceIndex: -1,
  lineTotal: '',
  sizeRunTotal: '',
};

const emptyColorway = {
  code: '',
  name: '',
  labDipStatus: 'TECH_CARD_LAB_DIP_STATUS_PENDING',
  productId: 0,
  comment: '',
  pantone: '',
  pantoneSystem: '',
  hex: '',
  swatchMediaId: 0,
  labDipRound: 0,
  labDipSubmittedAt: '',
  labDipDecidedAt: '',
  labDipDecidedBy: '',
  labDipRejectReason: '',
  usages: [],
};

function productName(product?: common_Colorway): string {
  return product?.display?.productBody?.translations?.[0]?.name ?? '';
}

type FormBomItem = {
  name?: string;
  section?: string;
  unit?: string;
  unitPrice?: string;
  currency?: string;
  wastagePercent?: string;
};

// Client-side preview of the whole-run spend for a measured usage (the backend computes the
// authoritative size_run_total): Σ(consumption_size × orderQty_size) × price × (1 + wastage%).
function runTotalPreview(
  sizeIds: number[],
  consumptionBySize: Map<number, string>,
  orderQtyBySize: Map<number, number>,
  unitPrice: string,
  wastagePercent: string,
): string {
  const price = Number(unitPrice);
  if (!unitPrice.trim() || Number.isNaN(price)) return '';
  let units = 0;
  let any = false;
  for (const id of sizeIds) {
    const raw = consumptionBySize.get(id);
    const c = Number(raw);
    if (raw?.trim() && !Number.isNaN(c)) {
      units += c * (orderQtyBySize.get(id) ?? 0);
      any = true;
    }
  }
  // no consumption, or consumption set but the size run is all zeros → nothing to show
  // (the "fill the size run" hint covers that case instead of a misleading "≈ 0")
  if (!any || units === 0) return '';
  const wastage = Number(wastagePercent) || 0;
  const total = units * price * (1 + wastage / 100);
  return Number.isFinite(total) ? String(Number(total.toFixed(2))) : '';
}

// Per-size consumption grading for one measured usage. A toggle switches between «один на
// изделие» (the single consumption) and «по размерам» (one input per declared card size,
// with a live run-cost preview using the referenced article's price/wastage).
function UsagePerSize({ ci, ui, article }: { ci: number; ui: number; article?: FormBomItem }) {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const base = `colorways.${ci}.usages.${ui}` as const;

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    sizeId?: number;
    orderQty?: number;
  }>;
  const sc = (useWatch({ control, name: `${base}.sizeConsumptions` }) ?? []) as Array<{
    sizeId?: number;
    consumption?: string;
  }>;
  const consumption = (useWatch({ control, name: `${base}.consumption` }) as string) || '';
  const sizeRunTotal = (useWatch({ control, name: `${base}.sizeRunTotal` }) as string) || '';

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  // remember the last per-size values so toggling «один → по размерам» restores them
  const lastPerSize = useRef<Array<{ sizeId: number; consumption: string }>>([]);

  const perSize = sc.length > 0;
  const consumptionBySize = new Map<number, string>();
  for (const e of sc) if (e.sizeId != null) consumptionBySize.set(e.sizeId, e.consumption ?? '');
  const orderQtyBySize = new Map<number, number>();
  for (const q of sizeQuantities) if (q.sizeId) orderQtyBySize.set(q.sizeId, q.orderQty ?? 0);

  const setCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const cur = (getValues(`${base}.sizeConsumptions`) ?? []) as Array<{
      sizeId?: number;
      consumption?: string;
    }>;
    const next = [...cur];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    setValue(`${base}.sizeConsumptions`, next as never, { shouldDirty: true });
  };

  const enablePerSize = () => {
    if (perSize) return; // already per-size — don't rebuild (would wipe typed cells)
    const prior = new Map(lastPerSize.current.map((e) => [e.sizeId, e.consumption]));
    setValue(
      `${base}.sizeConsumptions`,
      sizeIds.map((id) => ({
        sizeId: id,
        consumption: prior.get(id) ?? consumption ?? '',
      })) as never,
      { shouldDirty: true },
    );
  };
  const disablePerSize = () => {
    if (!perSize) return; // already per-garment — nothing to stash/clear
    if (sc.length) {
      lastPerSize.current = sc.map((e) => ({
        sizeId: e.sizeId ?? 0,
        consumption: e.consumption ?? '',
      }));
    }
    setValue(`${base}.sizeConsumptions`, [] as never, { shouldDirty: true });
  };

  const preview = runTotalPreview(
    sizeIds,
    consumptionBySize,
    orderQtyBySize,
    article?.unitPrice ?? '',
    article?.wastagePercent ?? '',
  );
  const currency = article?.currency ?? '';
  const unit = article?.unit?.trim() || '';
  const hasOrderQty = sizeIds.some((id) => (orderQtyBySize.get(id) ?? 0) > 0);
  const hasAnyConsumption = sizeIds.some((id) => consumptionBySize.get(id)?.trim());

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          расход{unit ? ` (${unit})` : ''}
        </Text>
        {sizeIds.length > 0 && (
          <div className='flex gap-1'>
            <button
              type='button'
              onClick={disablePerSize}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                !perSize
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textInactiveColor',
              )}
            >
              один на изделие
            </button>
            <button
              type='button'
              onClick={enablePerSize}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                perSize
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textInactiveColor',
              )}
            >
              по размерам
            </button>
          </div>
        )}
      </div>

      {!perSize ? (
        <DecimalField name={`${base}.consumption`} label='consumption (на изделие)' />
      ) : (
        <div className='space-y-2'>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
            {sizeIds.map((id) => (
              <div key={id} className='space-y-1'>
                <Text variant='uppercase' size='small'>
                  {formatSizeName(sizeById.get(id) ?? `#${id}`)}
                </Text>
                <Input
                  type='text'
                  inputMode='decimal'
                  placeholder='0.00'
                  value={consumptionBySize.get(id) ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCell(id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <Text variant='uppercase' size='small'>
              расход на партию ≈ {preview ? `${preview} ${currency}`.trim() : '—'}
            </Text>
            {sizeRunTotal && (
              <Text variant='inactive' size='small'>
                сохранённое: {sizeRunTotal} {currency}
              </Text>
            )}
          </div>
          {hasAnyConsumption && !hasOrderQty && (
            <Text size='small' className='block text-warning'>
              заполните тираж по размерам (вкладка patterns → size run), чтобы посчитать расход на
              партию
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

// One usage = one material on one part in this colourway: pick the catalog article, the
// part (placement), the colour it takes here, and the consumption (per-garment or per-size).
function UsageRow({
  ci,
  ui,
  articleOptions,
  pieceOptions,
  bomItems,
  onRemove,
}: {
  ci: number;
  ui: number;
  articleOptions: Array<{ value: number; label: string }>;
  pieceOptions: Array<{ value: number; label: string }>;
  bomItems: FormBomItem[];
  onRemove: () => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const base = `colorways.${ci}.usages.${ui}` as const;
  const bomItemIndex = useWatch({ control, name: `${base}.bomItemIndex` }) as number | undefined;
  const lineTotal = (useWatch({ control, name: `${base}.lineTotal` }) as string) || '';
  const sizeRunTotal = (useWatch({ control, name: `${base}.sizeRunTotal` }) as string) || '';
  const color = ((useWatch({ control, name: `${base}.color` }) as string) || '').trim();
  const colorIsHex = /^#[0-9a-fA-F]{3,8}$/.test(color);
  const placement = ((useWatch({ control, name: `${base}.placement` }) as string) || '').trim();

  const idx = typeof bomItemIndex === 'number' ? bomItemIndex : -1;
  const outOfRange = idx >= 0 && idx >= bomItems.length;
  const article = idx >= 0 && !outOfRange ? bomItems[idx] : undefined;
  const measured = !article || MEASURED_SECTIONS.has(article.section ?? '');
  const unit = article?.unit?.trim() || '';

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      {/* scannable header: part · material */}
      <div className='flex items-center gap-2 border-b border-textInactiveColor pb-2'>
        <span
          className='size-3 shrink-0 border border-textInactiveColor'
          style={colorIsHex ? { backgroundColor: color } : undefined}
          aria-hidden
        />
        <Text size='small' className='min-w-0 truncate'>
          <span className='font-semibold uppercase'>{placement || 'часть?'}</span>
          {' · '}
          {article?.name?.trim() || '— материал не выбран —'}
        </Text>
      </div>

      <div className='grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_12rem_auto]'>
        <SelectField
          name={`${base}.bomItemIndex`}
          label='материал (артикул)'
          items={articleOptions}
          valueAsNumber
        />
        <ComboField
          name={`${base}.placement`}
          label='часть (placement)'
          options={placementOptions}
          placeholder='outer / lining / collar…'
        />
        <Button type='button' variant='secondary' aria-label='remove usage' onClick={onRemove}>
          ✕
        </Button>
      </div>

      {outOfRange && (
        <Text size='small' className='text-error'>
          артикул был удалён или перемещён — перевыберите материал
        </Text>
      )}

      {/* Optional: which cut-piece this consumption norm is about (informational, NF-05). Only
          shown once the pieces tab has pieces to reference. */}
      {pieceOptions.length > 1 && (
        <div className='sm:w-1/2'>
          <SelectField
            name={`${base}.pieceIndex`}
            label='деталь (норма на деталь, опц.)'
            items={pieceOptions}
            valueAsNumber
          />
        </div>
      )}

      <div className='grid grid-cols-2 gap-2'>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <InputField name={`${base}.color`} label='цвет (в этом колорвее)' />
          </div>
          {/* native colour picker = swatch + picker in one. Picking writes a HEX into the
              colour field (you can still type a name instead). Use defaultValue so the OS
              picker isn't fought by a controlled value mid-drag; the `key` re-seeds it when the
              field changes elsewhere. */}
          <input
            key={toPickerHex(color)}
            type='color'
            defaultValue={toPickerHex(color)}
            onChange={(e) =>
              setValue(`${base}.color`, e.target.value, { shouldDirty: true, shouldTouch: true })
            }
            className='h-9 w-9 shrink-0 cursor-pointer border border-textInactiveColor bg-bgColor p-0'
            aria-label='выбрать цвет'
            title='выбрать цвет (запишет HEX)'
          />
        </div>
        <InputField name={`${base}.pantone`} label='pantone / код' />
      </div>

      {measured ? (
        <UsagePerSize ci={ci} ui={ui} article={article} />
      ) : (
        <DecimalField
          name={`${base}.quantity`}
          label={`quantity (шт. на изделие)${unit ? ` · ${unit}` : ''}`}
        />
      )}

      {(lineTotal || sizeRunTotal) && (
        <Text variant='inactive' size='small'>
          {lineTotal && `на изделие: ${lineTotal}`}
          {lineTotal && sizeRunTotal && ' · '}
          {sizeRunTotal && `на тираж: ${sizeRunTotal}`}
        </Text>
      )}
    </div>
  );
}

// One colourway = one card carrying the colour identity + lab-dip lifecycle (collapsed under
// «детали») and — the key bit — its material recipe (usages): which catalog article goes on
// which part, in what colour, at what consumption. Usages are self-contained per colourway,
// so «копировать колорвей» clones them and you tweak the 1–2 fabrics that differ.
function ColorwayCard({
  index,
  productOptions,
  articleOptions,
  pieceOptions,
  bomItems,
  onRemove,
  onCopy,
}: {
  index: number;
  productOptions: Array<{ value: number; label: string }>;
  articleOptions: Array<{ value: number; label: string }>;
  pieceOptions: Array<{ value: number; label: string }>;
  bomItems: FormBomItem[];
  onRemove: () => void;
  onCopy: () => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const [details, setDetails] = useState(false);
  const [pickedSwatch, setPickedSwatch] = useState<common_MediaFull | undefined>();
  const usages = useFieldArray({ control, name: `colorways.${index}.usages` });

  const status = useWatch({ control, name: `colorways.${index}.labDipStatus` }) as string;
  const hex = (useWatch({ control, name: `colorways.${index}.hex` }) as string) || '';
  const swatchMediaId = useWatch({ control, name: `colorways.${index}.swatchMediaId` }) as number;
  const cwName = ((useWatch({ control, name: `colorways.${index}.name` }) as string) || '').trim();
  const cwCode = ((useWatch({ control, name: `colorways.${index}.code` }) as string) || '').trim();

  const hexValid = /^#?[0-9a-fA-F]{3,8}$/.test(hex.trim());
  const hexCss = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
  // resolve the saved swatch from the media library so it survives a reload (the resolved
  // sketch media carries only moodboard/technical sketches)
  const libraryMap = useMediaMap();
  const swatchFromLib = swatchMediaId ? libraryMap.get(swatchMediaId) : undefined;
  const swatchUrl =
    pickedSwatch?.media?.thumbnail?.mediaUrl ||
    pickedSwatch?.media?.fullSize?.mediaUrl ||
    swatchFromLib?.media?.thumbnail?.mediaUrl ||
    swatchFromLib?.media?.fullSize?.mediaUrl ||
    '';

  function handleSwatch(picked: common_MediaFull[]) {
    const m = picked[0];
    setValue(`colorways.${index}.swatchMediaId`, m?.id ?? 0, { shouldDirty: true });
    setPickedSwatch(m);
  }

  return (
    <div className='space-y-4 border border-textInactiveColor p-4'>
      {/* title bar — colour identity + actions */}
      <div className='flex items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <div
            className='flex size-12 shrink-0 items-center justify-center overflow-hidden border border-textInactiveColor text-textBaseSize text-textInactiveColor'
            style={!swatchUrl && hexValid ? { backgroundColor: hexCss } : undefined}
            aria-label='colour swatch'
          >
            {swatchUrl ? (
              <Media src={swatchUrl} alt='swatch' aspectRatio='1/1' fit='cover' />
            ) : hexValid ? null : (
              (cwCode || '?').slice(0, 3)
            )}
          </div>
          <div className='min-w-0'>
            <Text variant='uppercase' className='truncate'>
              {cwName || cwCode || `колорвей ${index + 1}`}
            </Text>
            <Text variant='inactive' size='small' className='truncate'>
              {[cwCode && `код ${cwCode}`, labDipLabels[status], `${usages.fields.length} матер.`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </div>
        </div>
        <div className='flex shrink-0 gap-2'>
          <Button
            type='button'
            variant='secondary'
            onClick={() => setDetails((d) => !d)}
            className='uppercase'
          >
            {details ? 'lab-dip ▴' : 'lab-dip ▾'}
          </Button>
          <Button
            type='button'
            variant='secondary'
            onClick={onCopy}
            className='uppercase'
            title='клонирует весь рецепт (материалы) в новый колорвей — поменяйте только отличающиеся ткани/цвета'
          >
            копировать
          </Button>
          <Button
            type='button'
            variant='secondary'
            aria-label='remove colourway'
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* identity fields */}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <InputField name={`colorways.${index}.code`} label='code' placeholder='BLK' />
        <InputField name={`colorways.${index}.name`} label='name *' />
        <SelectField
          name={`colorways.${index}.labDipStatus`}
          label='lab dip'
          items={techCardLabDipStatusOptions}
        />
        <SelectField
          name={`colorways.${index}.productId`}
          label='product'
          items={productOptions}
          valueAsNumber
        />
      </div>

      {/* colour identity — always visible (a colourway IS a colour) */}
      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          цвет колорвея
        </Text>
        <div className='grid grid-cols-1 items-end gap-3 lg:grid-cols-4'>
          <InputField name={`colorways.${index}.pantone`} label='pantone' placeholder='19-4005' />
          <InputField
            name={`colorways.${index}.pantoneSystem`}
            label='pantone system'
            placeholder='TCX'
          />
          <div className='flex items-end gap-2'>
            <div className='flex-1'>
              <InputField name={`colorways.${index}.hex`} label='hex' placeholder='#101010' />
            </div>
            <input
              key={toPickerHex(hex)}
              type='color'
              defaultValue={toPickerHex(hex)}
              onChange={(e) =>
                setValue(`colorways.${index}.hex`, e.target.value, { shouldDirty: true })
              }
              className='h-9 w-9 shrink-0 cursor-pointer border border-textInactiveColor bg-bgColor p-0'
              aria-label='выбрать цвет'
              title='выбрать цвет (HEX)'
            />
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' size='small'>
              swatch (фото)
            </Text>
            <div className='flex items-center gap-2'>
              {swatchUrl && (
                <div className='size-10 shrink-0 border border-textInactiveColor'>
                  <Media src={swatchUrl} alt='swatch' aspectRatio='1/1' fit='cover' />
                </div>
              )}
              <MediaSelector
                label='swatch'
                purpose='colour swatch'
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                saveSelectedMedia={handleSwatch}
                triggerClassName='px-2 py-1 uppercase'
              />
            </div>
          </div>
        </div>
      </div>

      {/* material recipe — usages */}
      <div className='space-y-3 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          материалы этого колорвея
        </Text>
        {usages.fields.length > 0 ? (
          <div className='space-y-3'>
            {usages.fields.map((f, ui) => (
              <UsageRow
                key={f.id}
                ci={index}
                ui={ui}
                articleOptions={articleOptions}
                pieceOptions={pieceOptions}
                bomItems={bomItems}
                onRemove={() => usages.remove(ui)}
              />
            ))}
          </div>
        ) : articleOptions.length <= 1 ? (
          <Text variant='inactive' size='small'>
            добавьте артикулы на вкладке BOM — затем выбирайте их здесь для каждой части изделия
          </Text>
        ) : (
          <Text variant='inactive' size='small'>
            нет материалов — добавьте первый
          </Text>
        )}
        {articleOptions.length > 1 && (
          <Button
            type='button'
            className='uppercase'
            onClick={() => usages.append({ ...emptyUsage })}
          >
            + материал
          </Button>
        )}
      </div>

      {/* lab-dip lifecycle — collapsed by default */}
      {details && (
        <div className='space-y-3 border-t border-textInactiveColor pt-3'>
          <Text variant='uppercase' size='small'>
            lab-dip
          </Text>
          <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
            <InputField
              name={`colorways.${index}.labDipRound`}
              type='number'
              valueAsNumber
              label='lab-dip round'
            />
            <InputField
              name={`colorways.${index}.labDipSubmittedAt`}
              type='date'
              label='submitted'
            />
            <InputField name={`colorways.${index}.labDipDecidedAt`} type='date' label='decided' />
            <InputField name={`colorways.${index}.labDipDecidedBy`} label='decided by' />
          </div>

          {status === REJECTED && (
            <TextareaField
              name={`colorways.${index}.labDipRejectReason`}
              label='reject reason'
              rows={2}
              maxLength={1000}
            />
          )}

          <TextareaField
            name={`colorways.${index}.comment`}
            label='comment'
            rows={2}
            maxLength={1000}
          />
        </div>
      )}
    </div>
  );
}

// Colourways = the recipes. Each card chooses which catalog article goes on which part, in
// what colour and at what consumption (usages). Usages are self-contained per colourway, but the
// pieces tab's fabric map references colourways by index, so removing one must renumber those cells.
export function ColorwaysField() {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'colorways' });
  const productIds = (useWatch({ control, name: 'productIds' }) ?? []) as number[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as FormBomItem[];
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as Array<{ name?: string }>;
  const productMap = useProductsByIds(productIds);

  // Optional link from a usage to a cut-piece (usage.pieceIndex, "норма на деталь"). -1 = whole
  // garment. Positional into `pieces`; kept valid by the pieces tab's remove-renumber (nf05-01).
  const pieceOptions = [
    { value: -1, label: '— whole garment —' },
    ...pieces.map((p, pi) => ({ value: pi, label: p.name?.trim() || `piece ${pi + 1}` })),
  ];

  const productOptions = [
    { value: 0, label: '— none —' },
    ...productIds.map((id) => {
      const name = productName(productMap.get(id));
      return { value: id, label: name ? `${name} (#${id})` : `#${id}` };
    }),
  ];

  const articleOptions = [
    { value: -1, label: '— артикул —' },
    ...bomItems.map((b, bi) => ({
      value: bi,
      label: `${b.name?.trim() || `#${bi + 1}`}${
        b.section ? ` · ${sectionLabels[b.section] ?? ''}` : ''
      }`,
    })),
  ];

  // Removing colourway `ci` shifts the fabric map's colorwayIndex on every piece: drop cells for
  // the removed colourway and decrement cells that pointed past it, so a cell never silently maps to
  // the wrong colour (nf05-01). Then remove the colourway itself.
  const removeColorway = (ci: number) => {
    const pieces = (getValues('pieces') ?? []) as TechCardFormData['pieces'];
    (pieces ?? []).forEach((p, pi) => {
      const materials = p.materials ?? [];
      if (!materials.some((m) => (m.colorwayIndex ?? 0) >= ci)) return;
      const next = materials
        .filter((m) => (m.colorwayIndex ?? 0) !== ci)
        .map((m) => {
          const idx = m.colorwayIndex ?? 0;
          return idx > ci ? { ...m, colorwayIndex: idx - 1 } : m;
        });
      setValue(`pieces.${pi}.materials`, next, { shouldDirty: true });
    });
    remove(ci);
  };

  // Clone a colourway's whole recipe into a new card (deep-copy usages so the two cards don't
  // share array references); reset the published-product link + computed totals.
  const copyColorway = (ci: number) => {
    const src = (getValues(`colorways.${ci}`) ?? {}) as NonNullable<
      TechCardFormData['colorways']
    >[number];
    append({
      ...src,
      code: '',
      name: `${(src.name ?? '').trim()} (copy)`.trim(),
      productId: 0,
      swatchMediaId: 0,
      // a copy is a NEW colour: its lab-dip starts fresh — never inherit APPROVED (that would
      // let the copy pass the release gate without its own dip).
      labDipStatus: 'TECH_CARD_LAB_DIP_STATUS_PENDING',
      labDipRound: 0,
      labDipSubmittedAt: '',
      labDipDecidedAt: '',
      labDipDecidedBy: '',
      labDipRejectReason: '',
      usages: (src.usages ?? []).map((u) => ({
        ...u,
        sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({ ...s })),
        lineTotal: '',
        sizeRunTotal: '',
      })),
    });
  };

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no colourways
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <ColorwayCard
              key={f.id}
              index={index}
              productOptions={productOptions}
              articleOptions={articleOptions}
              pieceOptions={pieceOptions}
              bomItems={bomItems}
              onRemove={() => removeColorway(index)}
              onCopy={() => copyColorway(index)}
            />
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyColorway })}
      >
        add colourway
      </Button>
    </div>
  );
}
