import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_Colorway,
  common_TechCardRoleAssignment,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import {
  techCardAuxSubtypeFormOptions,
  techCardGenderOptions,
  techCardPurposeFormOptions,
} from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AiEnhance } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Textarea from 'ui/components/text-area';
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
import {
  AGE_GROUP_UNSET,
  ageGroupLabel,
  ageGroupOptions,
  isAgeGroupSet,
} from '../tech-card-options';
import { useRoleAssignments } from '../useRoles';
import { Counter, EmptyState, GROUP_GAP, GROUP_SEAM } from './core';
import { cardFactsContext } from './core/card-facts';
import { DraftedField, DraftedPill } from './core/drafted-field';
import { draftedKey, useDrafted } from './drafted-contract';
import { categoryChain, fitChoicesFor, fitLabel, type FitChoice } from './fit-vocabulary';
import { LockBar } from './render/generate-row';

/**
 * ═══ STEP 0 · CARD DETAILS — ONE BLOCK, SIX GROUPS (`design-band-flow/_step-card.js` + NOTE) ═════
 *
 * The header of the card as the prototype draws it: ONE `Section` titled «card details · who and
 * what this card is», a `N of 12 fields` counter in its rule, and inside it the groups as
 * `GroupLabel` rules — IDENTIFICATION, CLASSIFICATION, BASE MODEL & SAMPLE SIZE, NOTE, and the
 * two-column row RESPONSIBLE ROLES | LINKED PRODUCTS. Not four separate blocks: the owner saw
 * those and said «не как в референсе». A block never contains a block (DESIGN.md), so the groups
 * are rules, not borders.
 *
 * ONE SIX-TRACK GRID FOR EVERY FIELD ROW. 3+3 and 2+2+2 both fill six tracks without a remainder,
 * so every group shares one left edge, one right edge and one row height — no lone half-width field
 * beside a hole. Below `sm` the grid is one column and reads top to bottom in the same order.
 *
 * THE LOGIC IS THE PRODUCT'S. Every field is the same RHF field it was (`name`, `styleNumber`,
 * `collection`, `season`, `brand`, `categoryId`, `fit`, `ageGroup`, `purpose`, `targetGender`,
 * `baseModelId`, `baseSampleSizeId`, `notes`); the organs that already existed are reused by import
 * (season picker, collection select, category cascade, base model pair). Roles keep writing through
 * their own RPCs the instant they change, outside the card's draft. `StyleFactsField` — the one
 * writer of brand / collection / season / targetGender / fit / age group — is NOT here: it stays
 * mounted unconditionally in `index.tsx`, because this screen is mounted only while step 0 is open.
 *
 * WAVE 2026-09-25 (tmp/plans/techcard-ux-0925, zone CL-C) added four things and nothing else:
 *   · FIT moved here from GENERAL INFORMATION (T02, D-03) — CLASSIFICATION, right after the
 *     category it depends on; the list narrows to the garment family (`fit-vocabulary.ts`);
 *   · AGE GROUP (T01, D-01') beside fit — a style fact, written by the same staged UpdateStyle;
 *   · the collection picker's `+ new collection…` (T06, D-06) — the one door, inside the list;
 *   · NOTE (T07, D-05) — the card's existing `notes` field, which had lost its editor.
 *
 * WHAT THE PROTOTYPE HAS AND THE WIRE DOES NOT — named, not faked:
 *   · a `#PRD-…` product id under a colourway (the product prints the colourway id);
 *   · the `season ›` door under a disabled SUGGEST leads to the season FIELD (`revealField`), not
 *     straight into the picker — the picker's open state is the season organ's own.
 */

/**
 * The META fields the header counter reads — the prototype's `metaFill()`, plus FIT (moved here)
 * and AGE GROUP (wave 2026-09-25): twelve. FIT counts only where the field is DRAWN — an auxiliary
 * card and an accessory / shoe / bag / object have no fit, and «11 of 12» on a card that cannot
 * reach 12 would be a gap nobody can close. So the total is the fields on screen, not a constant.
 */
const META_FIELDS = [
  'name',
  'styleNumber',
  'collection',
  'season',
  'brand',
  'categoryId',
  'fit',
  'ageGroup',
  'purpose',
  'targetGender',
  'baseModelId',
  'baseSampleSizeId',
] as const;
type MetaField = (typeof META_FIELDS)[number];

const UNSET_GENDER = 'GENDER_ENUM_UNKNOWN';

/** Filled = non-blank string / positive id / an enum that is not its «unset» sentinel. */
function isFilled(key: MetaField, v: unknown): boolean {
  if (key === 'categoryId' || key === 'baseModelId' || key === 'baseSampleSizeId') {
    return typeof v === 'number' && v > 0;
  }
  if (key === 'targetGender') return !!v && v !== UNSET_GENDER;
  if (key === 'ageGroup') return isAgeGroupSet(v as string | undefined);
  if (key === 'purpose') return typeof v === 'string' && !/UNKNOWN|UNSET/.test(v);
  return typeof v === 'string' && !!v.trim();
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

/**
 * THE SELECT'S VALUES ARE A NAMESPACE OF THEIR OWN (Codex m2). Every fit — listed or legacy — is
 * `fit:<stored string>`, and «— unset —» is the bare word `none`, which no `fit:` value can equal.
 * The old sentinel `__unset__` was a string a legacy record could hold: its item and «unset» would
 * have been one value, and picking it would have cleared the fit.
 *
 * NOT the shared Select's own empty option (a '' item), on purpose: offering '' switches off the
 * primitive's guard against the PHANTOM '' Radix emits when the value and its item arrive in the
 * same render (`select.tsx`, `references-section.tsx`). MEASURED on this cell (`probe-card.mjs`
 * scene L, the card inside a <form> as on the page — only there does Radix mount its native
 * <select>): with a '' item, a re-read moving category + fit together, a re-read to a fit outside
 * the list and a draft writing one ALL came out as '' — a fit cleared that nobody touched. With no
 * '' item the guard stays on and each keeps its value.
 */
const FIT_NONE = 'none';
const FIT_ITEM = 'fit:';
const fitItem = (fit: string) => `${FIT_ITEM}${fit}`;
const fitOfItem = (item: string) => (item.startsWith(FIT_ITEM) ? item.slice(FIT_ITEM.length) : '');

/**
 * FIT — ONE SELECT, BOUND TO THE FORM FIELD `fit` (T02, D-03). It moved here from GENERAL
 * INFORMATION, which now only reads it. The WRITER did not move: fit is a style fact, and the one
 * thing that sends it is the staged `UpdateStyle` in `StyleFactsField` (mounted hidden by
 * index.tsx), exactly as before — this cell edits the form field and nothing else.
 *
 * · ITEMS FOLLOW THE GARMENT. `choices` is the family's list for the card's top category
 *   (`fitsForTopCategory`); with no category yet it is the whole vocabulary, grouped.
 * · A STORED VALUE IS NEVER HIDDEN. A fit outside the family's list (the category changed after, an
 *   older record, a value typed before the list settled) stays as its own `(legacy)` item and stays
 *   selected — a select that cannot show its value lets Radix report a phantom '' and the next save
 *   would wipe a fact nobody touched.
 * · `— unset —` is how a fit is removed; there is no second control for it.
 * · DRAFTED: the construction draft may have written this value; the frame and the word stand until
 *   the value is edited or accepted (`drafted-contract.ts`). The word sits in the label row — a
 *   22px select has no room for a corner pill — and it IS the accept control (`DraftedPill`, as
 *   on every drafted field since CL-B's M3): pressing it accepts the fit's journal entry and
 *   leaves the value alone. A genuine pick is a review too: it accepts the same entry, so going
 *   back to the drafted value later does not bring the mark back — the select's own form of
 *   `useAcceptOnEdit`, which a text field runs on blur.
 * · LOCKED without `products:write`: `UpdateStyle` is authorised by the catalog section, not by
 *   `tech_cards` (Codex M-05), so an edit here would be refused at save. Said in words under the
 *   control, not only in a `title` on a dead select.
 */
function FitCell({
  choices,
  creating,
  locked,
}: {
  choices: FitChoice[];
  creating: boolean;
  locked: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const drafted = useDrafted();
  return (
    <FormField
      control={control}
      name='fit'
      render={({ field }) => {
        // A NEW card by an account that cannot write the style gets no fit at all (UpdateStyle is
        // its only writer — see AgeGroupCell): drawn as the cell will read once the card exists.
        const value = creating && locked ? '' : ((field.value as string | undefined) ?? '').trim();
        const live = drafted.isLive(draftedKey.fit, value);
        const listed = choices.some((c) => c.key === value);
        const items = [
          { value: FIT_NONE, label: '— unset —' },
          ...(value && !listed
            ? [{ value: fitItem(value), label: `${fitLabel(value)} (legacy)` }]
            : []),
          ...choices.map((c) => ({
            value: fitItem(c.key),
            label: fitLabel(c.key),
            group: c.group,
          })),
        ];
        return (
          <FormItem
            data-card-fit={locked ? 'locked' : 'open'}
            title={locked ? 'needs products:write' : undefined}
          >
            <div className='flex items-center justify-between gap-1.5'>
              <FormLabel>fit</FormLabel>
              <DraftedPill live={live} onAccept={() => drafted.acceptKey(draftedKey.fit)} />
            </div>
            <DraftedField live={live} pill={false}>
              <Select
                name='fit'
                placeholder='fit'
                items={items}
                value={value ? fitItem(value) : FIT_NONE}
                disabled={locked}
                // Reads as a dead control, like a disabled `Input` (zebra ground, label ink).
                className={locked ? 'bg-bgZebra text-labelColor' : undefined}
                onValueChange={(v: string) => {
                  const next = fitOfItem(v);
                  field.onChange(next);
                  if (next !== value) drafted.acceptKey(draftedKey.fit);
                }}
                onBlur={field.onBlur}
              />
            </DraftedField>
            {locked && (
              <Text size='micro' variant='label'>
                needs products:write
              </Text>
            )}
          </FormItem>
        );
      }}
    />
  );
}

/**
 * AGE GROUP (T01, D-01') — the style's target age group, a style fact beside target gender. Bound
 * to the form field `ageGroup`; written, like FIT, only by the staged `UpdateStyle` in
 * `StyleFactsField` (mask path `ageGroup`), never by the card's own save.
 *
 * · «— unset —» is offered only where it is TRUE: on a card being created and on a card whose
 *   stored age group is not set. Once a style has one, the server refuses UNKNOWN under the mask,
 *   so an «unset» picked there would fall out of the save without a word — the item is left out
 *   rather than drawn as a lie. A value that is unset right now is always drawn.
 * · A new card proposes adult (`techCardDefaultData`); an existing card shows what it holds.
 * · Locked exactly like FIT, for the same reason: UpdateStyle is `products:write`. A NEW card made
 *   by such an account shows «— unset —», not a locked «adult»: the proposal is written only for
 *   products:write (StyleFactsField), so the card would be created without it and reopen unset
 *   (Codex m2). The field itself is left alone — nothing is dirtied on an account that cannot act.
 */
function AgeGroupCell({ creating, locked }: { creating: boolean; locked: boolean }) {
  const { control } = useFormContext<TechCardFormData>();
  return (
    <FormField
      control={control}
      name='ageGroup'
      render={({ field }) => {
        const value =
          creating && locked
            ? AGE_GROUP_UNSET
            : (field.value as string | undefined) || AGE_GROUP_UNSET;
        const loaded = (control._defaultValues as Partial<TechCardFormData>).ageGroup;
        const offerUnset = creating || !isAgeGroupSet(loaded) || !isAgeGroupSet(value);
        const items = [
          ...(offerUnset ? [{ value: AGE_GROUP_UNSET as string, label: '— unset —' }] : []),
          ...ageGroupOptions,
        ];
        return (
          <FormItem
            data-card-age={locked ? 'locked' : 'open'}
            title={locked ? 'needs products:write' : undefined}
          >
            <FormLabel>age group</FormLabel>
            <Select
              name='ageGroup'
              placeholder='age group'
              items={items}
              value={value}
              disabled={locked}
              className={locked ? 'bg-bgZebra text-labelColor' : undefined}
              onValueChange={(v: string) => field.onChange(v)}
              onBlur={field.onBlur}
            />
            {locked && (
              <Text size='micro' variant='label'>
                needs products:write
              </Text>
            )}
          </FormItem>
        );
      }}
    />
  );
}

/**
 * THE WORDS UNDER A STYLE FACT THIS ACCOUNT CANNOT WRITE (Codex M-05, R3): UpdateStyle — the one
 * writer of a saved card's style facts — is `products:write`. FIT and AGE GROUP say so under their
 * controls; collection, season, brand and target gender say the same, on the same grant. Each
 * control is disabled by its OWN prop: a disabled `<fieldset>` does not stop a Radix select, which
 * opens on pointerdown (the one exception is SEASON, see its cell).
 */
function StyleLockNote({ locked }: { locked: boolean }) {
  if (!locked) return null;
  return (
    <Text size='micro' variant='label'>
      needs products:write
    </Text>
  );
}

const NOTE_MAX = 2000;

/**
 * NOTE (T07, D-05) — the card's own `notes` field, persisted by the regular card save
 * (`TechCardInsert.notes`, mapped in `schema.ts`). The field and its round trip always existed; its
 * editor did not since U-9. One textarea and the one quiet `ai ✦` in its corner (`AiEnhance`), fed
 * the facts the model needs to keep a note on-topic: category path, fit, the first lines of the
 * moodboard description.
 */
function NoteField({ context, canEdit }: { context: string; canEdit: boolean }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: 'notes' });
  const value = (field.value as string | undefined) ?? '';
  const id = useId();
  return (
    <div className='relative min-w-0' data-field='notes'>
      <Textarea
        ref={field.ref}
        id={id}
        name='notes'
        aria-label='note'
        value={value}
        rows={3}
        maxLength={NOTE_MAX}
        placeholder='anything the team should know about this style'
        className='pb-7'
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
      <AiEnhance
        field='note'
        value={value}
        maxRunes={NOTE_MAX}
        context={context}
        disabled={!canEdit}
        onApply={(text) => setValue('notes', text.slice(0, NOTE_MAX), { shouldDirty: true })}
      />
    </div>
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
  const { dictionary } = useDictionary();
  const { canWrite } = usePermissions();
  const meta = useWatch({ control, name: [...META_FIELDS] }) as unknown[];
  const auxSubtype = (useWatch({ control, name: 'auxSubtype' }) as string | undefined) ?? '';
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const concept = (useWatch({ control, name: 'concept' }) as string | undefined) ?? '';
  const fit = (useWatch({ control, name: 'fit' }) as string | undefined) ?? '';
  const ageGroup = useWatch({ control, name: 'ageGroup' }) as string | undefined;

  // FIT follows the garment: the family of the card's TOP category decides the list, and «no fit
  // here» (accessories, shoes, bags, objects — and every auxiliary card, which makes packaging)
  // hides the field without touching the stored value. `fitChoicesFor` is the SAME answer
  // StyleFactsField reads to keep a hidden fit out of its mask.
  const categories = dictionary?.categories;
  const fitChoices = useMemo(
    () => fitChoicesFor(categories, categoryId, isAux),
    [categories, categoryId, isAux],
  );
  const fitShown = fitChoices !== null;
  // UpdateStyle — the one writer of a saved card's style facts — is `products:write` on the server
  // (Codex M-05, R3; rbac.go:163): every style-fact cell locks on it.
  const styleLocked = !canWrite(SECTION.products);
  // …except brand, collection and gender on a card being CREATED: CreateTechCard seeds those three
  // from the card's own insert (AddTechCard), so there they are the create's to write.
  const seededLocked = styleLocked && !!techCardId;
  // Fit, season and age group reach the style through UpdateStyle ALONE, so a new card made by such
  // an account gets none of them: the cells, the counter and the ai context read them as unset
  // (m2) — never as a locked value that will not be written.
  const unwritten = !techCardId && styleLocked;
  const ageShown = unwritten ? AGE_GROUP_UNSET : ageGroup;
  const shownMeta = (key: MetaField, v: unknown) => {
    if (!unwritten) return v;
    if (key === 'ageGroup') return AGE_GROUP_UNSET;
    return key === 'fit' || key === 'season' ? '' : v;
  };
  const counted = META_FIELDS.filter((key) => key !== 'fit' || fitShown);
  const filled = META_FIELDS.reduce(
    (n, key, i) => n + (counted.includes(key) && isFilled(key, shownMeta(key, meta[i])) ? 1 : 0),
    0,
  );

  // CLASSIFICATION stays on the six-track grid without a hole (the rule at the top of this file —
  // no lone half-width field beside a gap): four cells are 3+3 / 3+3, five are 2+2+2 / 3+3. Which
  // cells exist is decided here once; each cell reads its width off its place in this list.
  const classCells = [
    'category',
    ...(fitShown ? ['fit'] : []),
    'age',
    'purpose',
    'gender',
    ...(isAux ? ['aux'] : []),
  ];
  const wc = (cell: string) => (classCells.length === 4 || classCells.indexOf(cell) >= 3 ? W3 : W2);

  const categoryPath = categoryChain(categories, categoryId)
    .map((c) => c.name || `#${c.id}`)
    .join(' › ');
  const noteContext = cardFactsContext({
    categoryPath,
    fit: fitShown && !unwritten ? fitLabel(fit) : '',
    ageGroup: ageGroupLabel(ageShown),
    concept,
  });

  // ONE read feeds the counter in the group rule AND the rows: react-query serves both from the
  // cache the card read seeded, so the count cannot disagree with the chips beneath it.
  const { data: rolesData } = useRoleAssignments(techCardId, roleAssignments);
  const assignments = rolesData?.assignments ?? [];
  const ways = colorways ?? [];

  return (
    <Section
      title='card details'
      question='— who and what this card is'
      action={<Counter n={filled} noun='field' total={counted.length} />}
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
          <div
            className={W2}
            data-card-cell='collection'
            data-style-lock={seededLocked ? 'locked' : 'open'}
            title={seededLocked ? 'needs products:write' : undefined}
          >
            <CollectionField locked={seededLocked} />
            <StyleLockNote locked={seededLocked} />
          </div>
          <div
            className={W2}
            data-card-cell='season'
            data-style-lock={styleLocked ? 'locked' : 'open'}
            title={styleLocked ? 'needs products:write' : undefined}
          >
            {/* SeasonField has no lock of its own, and needs none here: its ONE writer is the
                `pick` button's click (the input is read-only and the picker opens only from that
                click), and a disabled fieldset kills click and focus on the buttons inside it —
                measured; pointerdown still fires, but nothing in this cell listens to it. */}
            <fieldset disabled={styleLocked} className='m-0 min-w-0 border-0 p-0'>
              <SeasonField pickHint={seasonPickHint} />
            </fieldset>
            <StyleLockNote locked={styleLocked} />
          </div>
          {/* brand sits inline with the rest of the card's identity: pre-filled with GRBPWR
              (techCardDefaultData) and almost never changed, but hidden it looked absent rather
              than defaulted. */}
          <div
            className={W2}
            data-card-cell='brand'
            data-style-lock={seededLocked ? 'locked' : 'open'}
            title={seededLocked ? 'needs products:write' : undefined}
          >
            <InputField name='brand' label='brand' placeholder='GRBPWR' disabled={seededLocked} />
            <StyleLockNote locked={seededLocked} />
          </div>
        </div>
      </div>

      {/* ── CLASSIFICATION — 2+2+2 / 3+3 with FIT (or the aux type), else 3+3 / 3+3 ─────────── */}
      <div className='min-w-0' data-card-group='classification'>
        <GroupLabel flush className={GROUP_GAP}>
          classification
        </GroupLabel>
        <div className={GRID}>
          {/* The category cascade — three columns in one popover over a single stored leaf.
              Its trigger stretches to the whole cell like the selects beside it. */}
          <div className={wc('category')}>
            <CategoryBrowser />
          </div>
          {/* FIT right after the category it depends on (T02). */}
          {fitChoices && (
            <div className={wc('fit')} data-card-cell='fit'>
              <FitCell choices={fitChoices} creating={!techCardId} locked={styleLocked} />
            </div>
          )}
          {/* AGE GROUP beside fit — the style's other «who is it for» fact (T01). */}
          <div className={wc('age')} data-card-cell='age'>
            <AgeGroupCell creating={!techCardId} locked={styleLocked} />
          </div>
          <div className={wc('purpose')}>
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
          <div
            className={wc('gender')}
            data-card-cell='gender'
            data-style-lock={seededLocked ? 'locked' : 'open'}
            title={seededLocked ? 'needs products:write' : undefined}
          >
            <SelectField
              name='targetGender'
              label='target gender'
              items={techCardGenderOptions}
              disabled={seededLocked}
              className={seededLocked ? 'bg-bgZebra text-labelColor' : undefined}
            />
            <StyleLockNote locked={seededLocked} />
          </div>
          {/* WS7: what KIND of auxiliary item this card makes — auxiliary-only, the dto rejects it
              on a sellable card and the save mapper clears it on a purpose flip. A product field
              the prototype has no cell for; it takes the cell after the gender (an aux card has no
              FIT, so the group is 2+2+2 / 3+3 again). */}
          {isAux && (
            <div className={wc('aux')}>
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

      {/* ── NOTE — the card's free text, full width, before the people and the products ────── */}
      <div className='min-w-0' data-card-group='note'>
        <GroupLabel flush className={GROUP_GAP}>
          note
        </GroupLabel>
        <NoteField context={noteContext} canEdit={canEdit} />
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
