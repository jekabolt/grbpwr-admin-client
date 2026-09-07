import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_Colorway,
  common_TechCardRoleAssignment,
} from 'api/proto-http/admin';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import {
  techCardAuxSubtypeFormOptions,
  techCardGenderOptions,
  techCardPurposeFormOptions,
} from 'constants/filter';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { fieldErrorSummary, revealField } from 'utils/field-errors';

import { CollectionField } from '../collection-field';
import { BaseModelFields, CategoryBrowser } from '../header-meta-fields';
import { RolesField } from '../roles-field';
import type { TechCardFormData } from '../schema';
import { SeasonField } from '../season-field';
import { parseSeasonToSku } from '../season-util';
import { useRoleAssignments } from '../useRoles';
import { Counter, EmptyState, GROUP_GAP, GROUP_SEAM } from './core';
import { LockBar } from './render/generate-row';

/**
 * ═══ STEP 0 · CARD DETAILS — ONE BLOCK, FIVE GROUPS (`design-band-flow/_step-card.js`) ═══════════
 *
 * The header of the card as the prototype draws it: ONE `Section` titled «card details · who and
 * what this card is», a `N of 10 fields` counter in its rule, and inside it the groups as
 * `GroupLabel` rules — IDENTIFICATION, CLASSIFICATION, BASE MODEL & SAMPLE SIZE, and the two-column
 * row RESPONSIBLE ROLES | LINKED PRODUCTS. Not four separate blocks: the owner saw those and said
 * «не как в референсе». A block never contains a block (DESIGN.md), so the groups are rules, not
 * borders.
 *
 * ONE SIX-TRACK GRID FOR EVERY FIELD ROW. 3+3 and 2+2+2 both fill six tracks without a remainder,
 * so every group shares one left edge, one right edge and one row height — no lone half-width field
 * beside a hole. Below `sm` the grid is one column and reads top to bottom in the same order.
 *
 * THE LOGIC IS THE PRODUCT'S. Every field is the same RHF field it was (`name`, `styleNumber`,
 * `collection`, `season`, `brand`, `categoryId`, `purpose`, `targetGender`, `baseModelId`,
 * `baseSampleSizeId`); the organs that already existed are reused by import (season picker,
 * collection select, category cascade, base model pair). Roles keep writing through their own RPCs
 * the instant they change, outside the card's draft. `StyleFactsField` — the one writer of brand /
 * collection / season / targetGender — is NOT here: it stays mounted unconditionally in
 * `index.tsx`, because this screen is mounted only while step 0 is open.
 *
 * WHAT THE PROTOTYPE HAS AND THE WIRE DOES NOT — named, not faked:
 *   · the collection picker's «+ create» (the product picks from the COLLECTIONS dictionary);
 *   · a `#PRD-…` product id under a colourway (the product prints the colourway id);
 *   · the `season ›` door under a disabled SUGGEST leads to the season FIELD (`revealField`), not
 *     straight into the picker — the picker's open state is the season organ's own.
 */

/** The ten META fields the header counter reads — the prototype's `metaFill()`. */
const META_FIELDS = [
  'name',
  'styleNumber',
  'collection',
  'season',
  'brand',
  'categoryId',
  'purpose',
  'targetGender',
  'baseModelId',
  'baseSampleSizeId',
] as const;

const UNSET_GENDER = 'GENDER_ENUM_UNKNOWN';

/** Filled = non-blank string / positive id / an enum that is not its «unset» sentinel. */
function filledMeta(values: unknown[]): number {
  return META_FIELDS.reduce((n, key, i) => {
    const v = values[i];
    if (key === 'categoryId' || key === 'baseModelId' || key === 'baseSampleSizeId') {
      return n + (typeof v === 'number' && v > 0 ? 1 : 0);
    }
    if (key === 'targetGender') return n + (v && v !== UNSET_GENDER ? 1 : 0);
    if (key === 'purpose') return n + (typeof v === 'string' && !/UNKNOWN|UNSET/.test(v) ? 1 : 0);
    return n + (typeof v === 'string' && v.trim() ? 1 : 0);
  }, 0);
}

/**
 * Six tracks, 16px between columns, 10px between rows — the prototype's `.cardgrid`.
 *
 * `[&_label]:min-h-[19px]` is the prototype's «rowline:first-child{min-height:19px}» — ОДНА высота
 * строки подписи на весь блок, чтобы два поля одного ряда начинались на одной линии независимо от
 * того, что стоит в подписи (у части полей это не голый текст, а подпись с органом справа). Правило
 * висит на сетке, а не на каждом поле, потому что половина полей рисует подпись внутри примитива
 * (`FormLabel`), которым этот файл не владеет.
 */
const GRID =
  'grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-6 [&_label]:flex [&_label]:min-h-[19px] [&_label]:items-center';
const W3 = 'min-w-0 sm:col-span-3';
const W2 = 'min-w-0 sm:col-span-2';

const GENERATED = 'STYLE_NUMBER_SOURCE_GENERATED';
const MANUAL = 'STYLE_NUMBER_SOURCE_MANUAL';

/**
 * STYLE NUMBER — the field, SUGGEST to its right, and the reason SUGGEST is dead under both.
 *
 * `{SEASON}-{SEQ}` and nothing else; the server names the next free number (SuggestStyleNumber)
 * and guards uniqueness. Typing flips the source to MANUAL — the ONE place the number becomes
 * «by hand» — and SUGGEST writes GENERATED past that path.
 *
 * ПРОВЕНАНС НЕ ПОКАЗЫВАЕТСЯ (владелец, r3 п.1: «STYLE NUMBER * в рамке (SUGGESTED) не надо
 * показывать»). `styleNumberSource` живёт дальше — он идёт на провод и решает, чем считать
 * номер, — но пилюли `suggested` / `by hand` на подписи больше нет: человек и так знает, набрал
 * он номер сам или нажал SUGGEST секунду назад, а пилюля добавляла второй орган в ряд подписи.
 *
 * Without a season the button is disabled and the cause stands as a VISIBLE `LockBar` with a door
 * to the season field — never as a `title` on a dead control (the prototype's rule, kept).
 */
function StyleNumberCell({ isIdea }: { isIdea: boolean }) {
  const { control, setValue, clearErrors } = useFormContext<TechCardFormData>();
  const season = useWatch({ control, name: 'season' }) as string | undefined;
  const source = useWatch({ control, name: 'styleNumberSource' }) as string | undefined;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const sku = parseSeasonToSku(season);

  const suggest = async () => {
    if (!sku) return;
    setSuggesting(true);
    setSuggestError('');
    try {
      const res = await adminService.SuggestStyleNumber({ skuSeason: sku });
      const proposed = res.styleNumber?.trim();
      if (proposed) {
        setValue('styleNumber', proposed, { shouldDirty: true, shouldValidate: true });
        setValue('styleNumberSource', GENERATED, { shouldDirty: true });
        clearErrors('styleNumber');
      } else {
        setSuggestError('server returned no suggestion');
      }
    } catch (e) {
      setSuggestError(fieldErrorSummary(e, 'could not suggest a style number'));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <FormField
      control={control}
      name='styleNumber'
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? '';
        return (
          <FormItem data-card-style-number=''>
            <FormLabel>{isIdea ? 'style number' : 'style number *'}</FormLabel>
            <div className='flex items-start gap-1.5'>
              <div className='min-w-0 flex-1'>
                <FormControl>
                  <Input
                    {...field}
                    value={value}
                    placeholder={isIdea ? 'optional — set before PROTO' : 'SS26-000'}
                    aria-label='style number'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      field.onChange(e);
                      if (source !== MANUAL)
                        setValue('styleNumberSource', MANUAL, { shouldDirty: true });
                      clearErrors('styleNumber');
                    }}
                  />
                </FormControl>
              </div>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='shrink-0 whitespace-nowrap'
                loading={suggesting}
                disabled={suggesting || !sku}
                aria-label='suggest the next free style number'
                onClick={suggest}
              >
                suggest
              </Button>
            </div>
            {/* Spelled as the rail spells its own strip (`chain-rail.tsx`): the word LOCKED, the
                reason, the door — one grammar for every lock on this screen. */}
            {!sku && (
              <LockBar>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='label'
                  component='span'
                  className='font-bold'
                >
                  locked
                </Text>
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='min-w-0 flex-1 normal-case'
                >
                  pick a season to enable suggest
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  className='shrink-0 whitespace-nowrap'
                  onClick={() => revealField('season')}
                >
                  season ›
                </Button>
              </LockBar>
            )}
            {suggestError && (
              <Text size='micro' className='text-error'>
                {suggestError}
              </Text>
            )}
            {isIdea && (
              <Text variant='inactive' size='micro'>
                optional while this is an idea — a real style number is required before the card
                can advance to PROTO
              </Text>
            )}
            {/* server field-tagged errors (BadRequest.FieldViolation on style_number) land here */}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/** `techCard.colorways` → the ids the tiles are drawn for (unset ids are not a colourway). */
function colorwayIds(colorways: common_AdminColorwayRef[]): number[] {
  return colorways
    .map((c) => c.colorwayId)
    .filter((id): id is number => id != null && id > 0);
}

function productName(product?: common_Colorway): string {
  return product?.display?.translations?.[0]?.name ?? '';
}

/** The same thumbnail path every product tile in this admin reads — one path, one failure shape. */
function productThumb(product?: common_Colorway): string {
  return product?.display?.thumbnail?.media?.thumbnail?.mediaUrl ?? '';
}

const ARCHIVED = 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';

const PRODUCT_NOTE =
  'every colourway of this style is a product · this list is read-only. Add, remove or archive colourways from the colourways tab.';

/**
 * LINKED PRODUCTS — large READ-ONLY tiles: a colourway is a product, and it is not made here.
 *
 * `Tiles min={148}` is the prototype's `auto-fill/minmax(148px)`; the frame is the 3/4 product
 * portrait. Colour is NOT painted (the name is the colour); archived is shown twice with one
 * meaning — a corner label and a dimmed tile — because it explains why that colourway is no good
 * for ON MODEL. There is no action on a tile: adding, removing and archiving live on the
 * colourways tab, which the door in the group rule opens.
 *
 * ⚠ ЭТОТ ОРГАН НЕ РИСУЕТ НИ ОДНОЙ ДВЕРИ, И ЭТО ПРАВИЛО, А НЕ ПРОПУСК (r3b, M-2). Пустое состояние
 * держало ВТОРУЮ кнопку `go to colourways ›` — ту же самую, что стоит в линейке группы сорока
 * пикселями выше. Две одинаковые двери на одном экране читаются как две РАЗНЫЕ («может, эта ведёт
 * куда-то ещё?»), и человек тратит взгляд на различение того, что не различается. Дверь одна, и
 * она в линейке — там, где стоит и счётчик колорвеев, то есть рядом с предметом; строка под ней
 * только называет пустоту. Поэтому `onGoColourways` сюда БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ: проп, оставленный
 * «на всякий случай», вернул бы кнопку первым же правщиком пустого состояния.
 */
function LinkedProducts({
  techCardId,
  colorways,
}: {
  techCardId?: number;
  colorways: common_AdminColorwayRef[];
}) {
  const ids = colorwayIds(colorways);
  const productMap = useProductsByIds(ids);

  if (!techCardId) {
    return (
      <Text size='micro' variant='label' data-linked-products='unsaved'>
        save this tech card first — linked products are its colourways, created from the
        colourways tab.
      </Text>
    );
  }
  if (ids.length === 0) {
    /* Тихий текст без двери — дверь одна и она в линейке группы (см. шапку органа). */
    return <EmptyState>no colourways yet</EmptyState>;
  }
  return (
    <div className='min-w-0'>
      <Text size='micro' variant='label' className='mb-2'>
        {PRODUCT_NOTE}
      </Text>
      <Tiles min={148} className='cw-grid'>
        {colorways.map((c) => {
          const id = c.colorwayId ?? 0;
          if (!(id > 0)) return null;
          const product = productMap.get(id);
          const name = productName(product) || `#${id}`;
          const url = productThumb(product);
          const archived = c.status === ARCHIVED;
          return (
            /* The wrapper is the grid item (`Tiles` puts `min-w-0` on its children) and carries
               the dim: the tile inside stretches `h-full`. */
            <div
              key={id}
              data-linked-product={id}
              data-archived={archived ? '' : undefined}
              className={cn(archived && 'opacity-45 focus-within:opacity-100 hover:opacity-100')}
            >
              <Tile
                title={`${name} · #${id}${archived ? ' · archived' : ''}`}
                name={name}
                /* The id line is dropped while the product has not resolved: `name` is then
                   already `#id`, and a second `#id` under it reads as a broken tile. */
                sub={product ? `#${id}` : undefined}
                media={
                  <div className='relative'>
                    {url ? (
                      <Media src={url} alt={name} aspectRatio='3/4' fit='cover' />
                    ) : (
                      <Placeholder aspect='3/4' />
                    )}
                    {archived && (
                      <div className='pointer-events-none absolute left-1 top-1 z-20'>
                        <span className='inline-block bg-textColor px-1.5 py-0.5'>
                          <Text
                            size='nano'
                            variant='uppercase'
                            tracking='label'
                            component='span'
                            className='!text-bgColor'
                          >
                            archived
                          </Text>
                        </span>
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          );
        })}
      </Tiles>
    </div>
  );
}

export function CardDetails({
  techCardId,
  isIdea,
  isAux,
  canEdit,
  outputMaterialId,
  roleAssignments,
  colorways,
  seasonPickHint,
  onGoColourways,
}: {
  /** The SAVED card's id — undefined on a card that does not exist yet. */
  techCardId?: number;
  isIdea: boolean;
  isAux: boolean;
  /** `canWrite(techCards) && !frozen` — gates the role writes, which bypass the form. */
  canEdit: boolean;
  /** The form's `outputMaterialId`, for the «saving as sellable clears it» warning. */
  outputMaterialId: number;
  /** The card read's own `roleAssignments` — seeds the roles cache so mount costs no RPC. */
  roleAssignments?: common_TechCardRoleAssignment[];
  colorways?: common_AdminColorwayRef[];
  /** The consequence of changing the season, spoken on `pick` (undefined on a new card). */
  seasonPickHint?: string;
  /** The one door out of LINKED PRODUCTS: the colourways tab (`navTo`, owned by index.tsx). */
  onGoColourways: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const meta = useWatch({ control, name: [...META_FIELDS] }) as unknown[];
  const filled = filledMeta(meta);
  const auxSubtype = (useWatch({ control, name: 'auxSubtype' }) as string | undefined) ?? '';

  // ONE read feeds the counter in the group rule AND the rows: react-query serves both from the
  // cache the card read seeded, so the count cannot disagree with the chips beneath it.
  const { data: rolesData } = useRoleAssignments(techCardId, roleAssignments);
  const assignments = rolesData?.assignments ?? [];
  const ways = colorways ?? [];

  return (
    <Section
      title='card details'
      question='— who and what this card is'
      action={<Counter n={filled} noun='field' total={META_FIELDS.length} />}
      id='card-details'
      className={cn('min-w-0', GROUP_SEAM)}
    >
      {/* ── IDENTIFICATION — 3+3, then 2+2+2 ─────────────────────────────────────────────── */}
      <div className='min-w-0' data-card-group='identification'>
        <GroupLabel flush className={GROUP_GAP}>
          identification
        </GroupLabel>
        <div className={GRID}>
          <div className={W3}>
            <InputField name='name' label='name *' placeholder='what this style is called' />
          </div>
          <div className={W3}>
            <StyleNumberCell isIdea={isIdea} />
          </div>
          <div className={W2}>
            <CollectionField />
          </div>
          <div className={W2}>
            <SeasonField pickHint={seasonPickHint} />
          </div>
          {/* brand sits inline with the rest of the card's identity: pre-filled with GRBPWR
              (techCardDefaultData) and almost never changed, but hidden it looked absent rather
              than defaulted. */}
          <div className={W2}>
            <InputField name='brand' label='brand' placeholder='GRBPWR' />
          </div>
        </div>
      </div>

      {/* ── CLASSIFICATION — 2+2+2 ───────────────────────────────────────────────────────── */}
      <div className='min-w-0' data-card-group='classification'>
        <GroupLabel flush className={GROUP_GAP}>
          classification
        </GroupLabel>
        <div className={GRID}>
          {/* The category cascade — three columns in one popover over a single stored leaf.
              Its trigger stretches to the whole cell like the selects beside it. */}
          <div className={W2}>
            <CategoryBrowser />
          </div>
          <div className={W2}>
            <SelectField name='purpose' label='purpose' items={techCardPurposeFormOptions} />
            {/* Purpose is mutually exclusive with the output material and the save is a full
                replace — flag the destruction BEFORE it happens. The server's other refusals (live
                colourways, registered colour variants) name themselves; no lock strip stands here,
                on the owner's word. */}
            {!isAux && outputMaterialId > 0 && (
              <Text variant='errorLabel' size='micro'>
                ! saving as sellable clears the output material
              </Text>
            )}
          </div>
          <div className={W2}>
            <SelectField
              name='targetGender'
              label='target gender'
              items={techCardGenderOptions}
            />
          </div>
          {/* WS7: what KIND of auxiliary item this card makes — auxiliary-only, the dto rejects it
              on a sellable card and the save mapper clears it on a purpose flip. A product field
              the prototype has no cell for; it takes the next two tracks. */}
          {isAux && (
            <div className={W2}>
              <SelectField
                name='auxSubtype'
                label='auxiliary type'
                items={techCardAuxSubtypeFormOptions}
              />
              {auxSubtype === 'TECH_CARD_AUX_SUBTYPE_UNKNOWN' && (
                <Text size='micro' variant='label'>
                  unclassified — the assembly bill and the labels/packaging pickers file this
                  card under «unknown» until a type is set
                </Text>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BASE MODEL & SAMPLE SIZE — 3+3 ───────────────────────────────────────────────── */}
      <div className='min-w-0' data-card-group='base'>
        <GroupLabel flush className={GROUP_GAP}>
          base model &amp; sample size
        </GroupLabel>
        <div className='[&_label]:flex [&_label]:min-h-[19px] [&_label]:items-center'>
          <BaseModelFields />
        </div>
      </div>

      {/* ── RESPONSIBLE ROLES | LINKED PRODUCTS — the prototype's `.brow.even` ───────────────
          Two columns from `lg` up, stacked below. `items-stretch` is load-bearing: the four role
          rows share the LEFT column's height equally, and that column is stretched to the height of
          the tiles on the right — so the rows space out to the tiles, and never squeeze. */}
      <div className='flex min-w-0 flex-col gap-gutter lg:flex-row lg:items-stretch'>
        <div
          className={cn(
            'flex min-w-0 flex-col',
            isAux ? 'flex-1' : 'lg:w-[420px] lg:shrink-0',
          )}
          data-card-group='roles'
        >
          {/* БЕЗ СЧЁТЧИКА. Владелец (r3 п.2): «RESPONSIBLE ROLES „2 OF 4 ROLES“ не нужно, и так
              видно». Четыре ряда стоят прямо под линейкой, каждый со своими чипами или пилюлей
              `none` — счётчик пересказывал то, что читается с одного взгляда. */}
          <GroupLabel flush className={GROUP_GAP}>
            responsible roles
          </GroupLabel>
          <RolesField techCardId={techCardId} canEdit={canEdit} assignments={assignments} />
        </div>
        {/* An auxiliary card links no products (it produces a material, not a colourway), so the
            column is not drawn and the roles take the width. */}
        {!isAux && (
          <div className='flex min-w-0 flex-1 flex-col' data-card-group='products'>
            <GroupLabel
              flush
              className={GROUP_GAP}
              action={
                /* two organs on one line: the count, then the one door out — `Button` is a block,
                   so without the row the door would drop under the pill */
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Counter n={colorwayIds(ways).length} noun='colourway' />
                  {techCardId ? (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      className='whitespace-nowrap'
                      onClick={onGoColourways}
                    >
                      go to colourways ›
                    </Button>
                  ) : null}
                </div>
              }
            >
              linked products
            </GroupLabel>
            <LinkedProducts techCardId={techCardId} colorways={ways} />
          </div>
        )}
      </div>
    </Section>
  );
}
