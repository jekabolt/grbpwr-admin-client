import {
  common_AdminColorwayRef,
  common_Material,
  common_TechCardBomSection,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  composeArticleFromMaterial,
  materialCompositionCode,
  materialCompositionText,
  materialSpec,
} from 'components/managers/materials/components/material-code';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import {
  MaterialPicker,
  MaterialPickerDialog,
  useMaterialOnHand,
} from 'components/managers/materials/components/material-picker';
import {
  MaterialThumb,
  materialImageUrl,
} from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { CompositionPicker } from 'components/managers/product/components/composition/composition-picker';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import {
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import ComboField from 'ui/form/fields/combo-field';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { flattenFieldErrors } from 'utils/field-errors';
import { ulid } from 'utils/ulid';
import { sectionShort } from './bom-line-picker';
import {
  defaultRoleFor,
  looksLikeArticleName,
  normalizeRole,
  roleCollision,
  roleSuggestions,
} from './bom-roles';
import { TechCardFormData, wireInt } from './schema';
import { unitOptions } from './tech-card-options';

// A new catalog article — meta + price only. Colour, placement and consumption are chosen
// per colourway on the colorways tab.
const emptyBomItem = {
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  name: '',
  supplier: '',
  supplierRef: '',
  color: '',
  composition: '',
  spec: '',
  unit: '',
  unitPrice: '',
  currency: '',
  comment: '',
  fabricWidth: '',
  fabricWeightGsm: '',
  fabricDirection: 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN',
  wastagePercent: '',
  materialId: 0,
  id: 0,
  lineKey: '', // minted on append (see BomField) so downstream refs are stable from creation
};

// Fabric width/weight read from the typed CTI attrs, falling back to the legacy flat fields —
// shared by the link-time snapshot and the linked-line catalog plate so the two never drift apart.
function materialFabricWidth(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.widthCm?.value || m?.fabricWidth?.value;
}
function materialFabricWeight(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.weightGsm?.value || m?.fabricWeightGsm?.value;
}

// The catalog facts a BOM line snapshots off the article it links (S23: the line stays
// self-contained). ONE helper, so creating a line FROM the picker and linking an article onto an
// existing line can never disagree about what a linked line ends up carrying.
function materialLineFields(m: common_Material) {
  return {
    // NO `name` here — the line's name is the slot ROLE («основная молния»), owned by the operator
    // and never derived from the article. Stamping the article name in was the regression that made
    // duplicate-looking slots and printed «YKK → YKK» in the production material plan (SlotName vs
    // MaterialName). An empty role is legal: the server falls back to the article name on read.
    section: m.section || emptyBomItem.section,
    supplier: m.supplier || '',
    supplierRef: m.supplierRef || '',
    // The blend as the parseable JSON the CompositionPicker + care generator read — derived from the
    // material's STRUCTURED fibre entries when it has no legacy free-text `composition`, so a line
    // linked to a structurally-composed material carries a composition that generates the care label.
    composition: materialCompositionCode(m),
    spec: m.spec || '',
    unit: m.unit || '',
    fabricWidth: materialFabricWidth(m) || '',
    fabricWeightGsm: materialFabricWeight(m) || '',
    // latest_price is costing-gated (absent without access) — seeds price only when present.
    unitPrice: m.latestPrice?.price?.value || '',
    currency: m.latestPrice?.currency || '',
  };
}

// A price-less article zeroes the whole costing chain downstream (BOM estimate → style cost →
// COGS), so it is worth saying out loud — but it no longer REFUSES the link. Refusing left the line
// unlinked and unnamed, and a nameless line blocks the entire card's save with the offending field
// rendered nowhere. Warn, link, and let the "no price" markers on the tile and the catalog plate
// carry it from there. Only warnable when this user can SEE prices: latest_price is costing-gated,
// so for a non-costing account every article would look price-less.
function useNoPriceWarning() {
  const { canReadCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  return (m: common_Material) => {
    if (!canReadCosting || m.latestPrice?.price?.value) return;
    showMessage(
      `${m.name || 'этот материал'} без закупочной цены — костинг будет считать 0, пока цену не добавят в materials → prices`,
      'error',
    );
  };
}

const join = (...parts: Array<string | undefined>) => parts.filter((p) => !!p?.trim()).join(' · ');
const widthLabel = (v?: string) => (v?.trim() ? `${v.trim()} cm` : '');
const weightLabel = (v?: string) => (v?.trim() ? `${v.trim()} g/m²` : '');

// The material's class as a short lowercase tag (fabric / hardware / thread / packaging) — the
// "тип" pill beside the section on a linked article tile.
const classShort = (c?: string) =>
  c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';

// The slot's identity — its ROLE in the garment and its section — editable on EVERY line, linked
// or not. The role is the one field a linked line used to render nowhere, which made a wrong or
// article-borrowed role permanently uncorrectable. Section is editable on a linked line too: the
// article keeps its own catalog section on the plate, and a deliberate divergence (a jersey
// article serving a LINING slot) must be expressible.
function SlotIdentityFields({ index }: { index: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as string | undefined;
  return (
    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
      <ComboField
        name={`bomItems.${index}.name`}
        label='роль в изделии *'
        options={roleSuggestions(rowSection)}
        placeholder='основная ткань / подкладка / молния…'
      />
      <SelectField
        name={`bomItems.${index}.section`}
        label='секция *'
        items={techCardBomSectionOptions}
      />
    </div>
  );
}

// This style's use of the article — the ONLY three controls a linked line owns. Everything else on
// a linked line is a catalog fact, rendered as a plate (below) rather than as disabled inputs.
// No top padding: the GroupLabel's own top margin is the box's inner top space.
function ThisStyleFields({ index }: { index: number }) {
  return (
    <div className='border border-borderColor px-2 pb-2'>
      <GroupLabel>how this style uses it</GroupLabel>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <SelectField
          name={`bomItems.${index}.fabricDirection`}
          label='fabric direction'
          items={techCardFabricDirectionOptions}
        />
        <DecimalField name={`bomItems.${index}.wastagePercent`} label='est. cutting wastage %' />
      </div>
      <Text variant='label' size='micro' className='mt-1'>
        Wastage is an estimate — the real figure depends on marker efficiency at cutting and is set
        per production run.
      </Text>
      <div className='mt-2'>
        <TextareaField
          name={`bomItems.${index}.comment`}
          label='comment'
          rows={2}
          maxLength={1000}
        />
      </div>
    </div>
  );
}

// One catalog article (Sheet «Спецификация»). The BOM is a pure material-article catalog:
// identity + supplier + price + fabric data. Which article goes on which part, in what colour and
// at what consumption is the colourway's recipe (colorways tab → usages).
//
// A LINKED line splits in two (11.2): the catalog article on the left as a read-only PLATE — not a
// column of greyed-out inputs, which is what made "which of these 12 fields is mine?" unanswerable —
// and, on the right, the three fields that genuinely belong to this style. An UNLINKED line keeps
// the full manual form, because with no catalog article behind it those fields really are the
// operator's.
function BomItemRow({ index, highlight }: { index: number; highlight?: boolean }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const warnNoPrice = useNoPriceWarning();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  const [createOpen, setCreateOpen] = useState(false);

  const linked = materialId > 0;
  const { data } = useMaterials('', false);
  const linkedMaterial = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === materialId)
    : undefined;
  // Warehouse balance for the plate's "· 41.6 m on hand". Only fetched once a line is actually
  // linked AND being edited (this row only mounts inside the open editor dialog).
  const onHand = useMaterialOnHand(linked);

  // Snapshot a catalog material's meta onto this line (S23: the line stays self-contained). Fabric
  // dims read from the typed CTI attrs, falling back to the legacy flat fields.
  const snapshotFrom = (m: common_Material) => {
    // Material.id is int64 -> arrives as a STRING from grpc-gateway despite the generated type
    // saying `number`. Writing it raw put a string into the form, which z.number() then rejected
    // as "Invalid input" on bomItems.N.materialId — an unsavable card, right after linking.
    setValue(`bomItems.${index}.materialId`, wireInt(m.id), { shouldDirty: true });
    // The role (`name`) is deliberately NOT in materialLineFields: linking an article describes
    // the slot's default material, it does not rename the slot.
    Object.entries(materialLineFields(m)).forEach(([field, val]) => {
      // Only non-empty values are written: linking must never CLEAR a supplier / width / price the
      // operator typed on the line while it was still free-text.
      if (!val) return;
      setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    });
  };

  const pick = (id: number, m?: common_Material) => {
    setValue(`bomItems.${index}.materialId`, wireInt(id), { shouldDirty: true });
    if (id && m) {
      snapshotFrom(m);
      warnNoPrice(m);
    }
  };

  // Prefer the live catalog value; fall back to whatever this line already holds (the linked
  // material is archived/deleted, or the catalog list hasn't loaded yet) so the plate never
  // flashes blank while linked.
  const mirror = (catalogValue: string | undefined, field: string): string | undefined =>
    catalogValue?.trim()
      ? catalogValue
      : (getValues(`bomItems.${index}.${field}` as never) as string);

  // #3: on a linked line the unit price, its currency and the unit are ONE derived fact — the
  // catalog's latest price — folded into a single read-only "8.00 EUR / m". On an unlinked line the
  // operator types the price, so currency stays an editable pick beside it.
  const priceValue = mirror(linkedMaterial?.latestPrice?.price?.value, 'unitPrice');
  const currencyValue = mirror(linkedMaterial?.latestPrice?.currency, 'currency') ?? '';
  const unitValue = mirror(linkedMaterial?.unit, 'unit') ?? '';
  const priceDisplay = priceValue
    ? `${priceValue}${currencyValue ? ` ${currencyValue}` : ''}${unitValue ? ` / ${unitValue}` : ''}`
    : '';
  const stockValue = onHand.get(materialId);

  // The composition cell carries the deep-link anchor + pulse the labels tab uses to point an
  // operator at a missing composition (care-gen). Read-only line on the catalog plate when linked,
  // editable picker when not — kept in one place so both states keep the `#bom-composition-{index}`
  // anchor phase 15's care generator scrolls to and pulses.
  const compositionAnchor = (children: React.ReactNode) => (
    <div
      id={`bom-composition-${index}`}
      className={cn(
        highlight && 'animate-pulse p-1 ring-2 ring-warning motion-reduce:animate-none',
      )}
    >
      {children}
    </div>
  );

  const createModal = (
    // Inline create — prefill the section from this BOM line; auto-select on create (Q9a).
    <MaterialModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      defaultSection={rowSection}
      onCreated={(_id, m) => snapshotFrom(m)}
    />
  );

  const colorwayHint = (
    <Text variant='label' size='micro'>
      Цвет, размещение и расход этого артикула задаются на вкладке colorways (в карточке колорвея).
    </Text>
  );

  if (linked) {
    return (
      <div className='space-y-2.5'>
        <SlotIdentityFields index={index} />
        <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-2'>
          {/* CATALOG ARTICLE — a plate, not fields. Zebra ground + no input chrome, so nothing on
              this half can be mistaken for something editable here. */}
          <div className='border border-borderColor bg-bgZebra px-2 pb-2'>
            <GroupLabel
              action={
                // Straight to THIS article's card, not the bare catalog: ?material= is what opens
                // it on the catalog tab, so the link survives a cold load. Lives inside the linked
                // branch only — an unlinked line has no article to open.
                <Link
                  to={`${ROUTES.materials}?tab=catalog&material=${materialId}`}
                  className='underline underline-offset-2'
                >
                  <Text component='span' variant='label' size='micro'>
                    open →
                  </Text>
                </Link>
              }
            >
              catalog article
            </GroupLabel>
            <div className='flex items-start gap-2'>
              <MaterialThumb material={linkedMaterial} size='md' />
              <div className='min-w-0 flex-1 space-y-0.5'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Pill tone='mut'>{sectionShort(linkedMaterial?.section) || 'section?'}</Pill>
                  {/* The ARTICLE's catalog name — under a "catalog article" header the role would
                      be a lie (the role names the slot, this plate names its default material). */}
                  <Text component='span' className='min-w-0 truncate font-bold'>
                    {linkedMaterial?.name?.trim() || `артикул #${materialId}`}
                  </Text>
                </div>
                <Text variant='label' size='micro' className='truncate'>
                  {join(
                    mirror(linkedMaterial?.supplier, 'supplier'),
                    mirror(linkedMaterial?.supplierRef, 'supplierRef'),
                    mirror(linkedMaterial?.color, 'color'),
                  ) || 'no supplier'}
                </Text>
                <Text variant='label' size='micro' className='truncate'>
                  {join(
                    widthLabel(mirror(materialFabricWidth(linkedMaterial), 'fabricWidth')),
                    weightLabel(mirror(materialFabricWeight(linkedMaterial), 'fabricWeightGsm')),
                    mirror(linkedMaterial?.spec, 'spec'),
                  ) || '—'}
                </Text>
                {/* The material's fibre composition — the readable projection of its STRUCTURED
                    entries (#37), falling back to the legacy free-text `composition`. Read off the
                    linked material itself so it shows even for a line whose composition string was
                    snapshotted before the structured blend existed. */}
                {compositionAnchor(
                  <Text variant='label' size='micro' className='truncate'>
                    {(linkedMaterial ? materialCompositionText(linkedMaterial) : '') ||
                      'composition not set'}
                  </Text>,
                )}
                <Text variant='label' size='micro' className='truncate'>
                  {join(
                    priceDisplay,
                    stockValue ? `${stockValue}${unitValue ? ` ${unitValue}` : ''} on hand` : '',
                  ) || 'no price'}
                </Text>
              </div>
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              <Button type='button' size='xs' variant='secondary' onClick={() => pick(0)}>
                unlink
              </Button>
              {/* A linked line that carries no price silently zeroes the cost estimate and, from
                  there, COGS (linking price-less materials is now blocked, but lines linked before
                  that guard still exist). */}
              {!priceDisplay && <Pill tone='attention'>no price — set it in materials</Pill>}
            </div>
          </div>

          <ThisStyleFields index={index} />
        </div>
        {colorwayHint}
        {createModal}
      </div>
    );
  }

  return (
    <div className='space-y-2.5'>
      {/* Role + section come FIRST: they are the slot's identity, and the section also scopes the
          picker below to the right family — hardware for пуговицы / молнии / кнопки, trim, thread…
          not only fabric. */}
      <SlotIdentityFields index={index} />
      <div>
        <Text variant='label' size='micro' tracking='label' className='uppercase'>
          catalog material *
        </Text>
        <div className='mt-1 flex items-start gap-1.5'>
          <div className='min-w-0 flex-1'>
            {/* 11.3: the BOM links through the SWATCH dialog — choosing a fabric is a visual
                decision. The fast combobox stays the default everywhere else. */}
            <MaterialPicker
              variant='grid'
              value={materialId}
              section={rowSection ?? ''}
              onChange={(id, m) => pick(id, m)}
              onCreate={() => setCreateOpen(true)}
            />
          </div>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='shrink-0 whitespace-nowrap'
            onClick={() => setCreateOpen(true)}
          >
            + create
          </Button>
        </div>
      </div>
      <CalloutBox tone='error'>
        <Text size='micro'>
          Привяжите артикул из справочника материалов — <b>an unlinked line blocks the release</b>.
        </Text>
      </CalloutBox>

      {/* Legacy free-text line: everything editable until it is linked to a catalog material —
          with no catalog article behind it, these fields genuinely ARE the operator's. */}
      <div>
        <GroupLabel>material details</GroupLabel>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          <ComboField
            name={`bomItems.${index}.unit`}
            label='unit'
            options={unitOptions}
            placeholder='м / pcs'
          />
          <InputField name={`bomItems.${index}.supplier`} label='supplier' />
          <InputField name={`bomItems.${index}.supplierRef`} label='supplier ref' />
          <InputField name={`bomItems.${index}.color`} label='base color (ref)' />
          {/* No free-text `spec` input: it duplicated the structured width (cm) + weight (g/m²)
              fields below. The value is preserved — it still round-trips (schema `spec` + map
              in/out), renders on a linked line's catalog plate, and prints to the release
              snapshot — only this hand-typed input is removed. */}
          <DecimalField name={`bomItems.${index}.fabricWidth`} label='width (cm)' />
          <DecimalField name={`bomItems.${index}.fabricWeightGsm`} label='weight (g/m²)' />
          <DecimalField name={`bomItems.${index}.unitPrice`} label='unit price' />
          <CurrencySelect name={`bomItems.${index}.currency`} label='currency' />
        </div>
        <div className='mt-2'>
          {compositionAnchor(<CompositionPicker name={`bomItems.${index}.composition`} />)}
        </div>
      </div>

      <ThisStyleFields index={index} />
      {colorwayHint}
      {createModal}
    </div>
  );
}

// #33: one BOM article as a square, photo-forward TILE — a square material photo over section/тип
// pills, the article name, its self-describing code, spec line and price. Clicking it opens the
// editor in the app's modal shell: the editor is a two-column form, and unfolding that inside the
// tile grid pushed every following article a screen down and left the operator scrolling to find
// where the row they opened had gone.
function BomTile({
  index,
  roleDuplicate,
  onRemove,
  onOpen,
}: {
  index: number;
  // Another slot on this card carries the same normalized role — computed by the parent (a tile
  // only watches its own row). Advisory: duplicates stay savable, they are just indistinguishable
  // in every slot select and in the production material plan, so the tile says so.
  roleDuplicate?: boolean;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const row = (useWatch({ control, name: `bomItems.${index}` }) ?? {}) as {
    name?: string;
    section?: string;
    supplier?: string;
    unit?: string;
    unitPrice?: string;
    currency?: string;
    materialId?: number;
  };

  const linked = (row.materialId ?? 0) > 0;
  const { data } = useMaterials('', false);
  const material = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === row.materialId)
    : undefined;

  // A red underline inside the editor is invisible while the editor is a closed modal, so the tile
  // itself has to carry the error — otherwise a blocked save points at a row the operator can't see
  // is broken. The tile names the offending fields; clicking it opens them.
  const { errors } = useFormState({ control, name: `bomItems.${index}` });
  const rowErrors = flattenFieldErrors(
    (errors.bomItems as FieldErrors[] | undefined)?.[index] as FieldErrors | undefined,
  );
  const hasError = rowErrors.length > 0;

  const price = row.unitPrice?.trim();
  const priceLabel = price
    ? `${price}${row.currency?.trim() ? ` ${row.currency.trim()}` : ''}${row.unit?.trim() ? ` / ${row.unit.trim()}` : ''}`
    : '';
  const imageUrl = materialImageUrl(material);
  const section = sectionShort(row.section);
  const cls = classShort(material?.materialClass);
  // грамматура · ширина · мат/сатин/блеск · состав · цвет — the identifying spec line, with the
  // colour appended. Empty on an unlinked line, which has no catalog material behind it yet.
  const specLine = material ? join(materialSpec(material), material.color) : '';

  // #64: an unlinked line is the release blocker, so it reads as the blocker marker; a linked line
  // shows its price, or flags a missing one.
  const priceStatus = !linked ? (
    <Pill tone='warn'>! link a material</Pill>
  ) : priceLabel ? (
    <Text component='span' variant='label' size='micro' className='min-w-0 flex-1 truncate'>
      {priceLabel}
    </Text>
  ) : (
    <Pill tone='attention'>no price</Pill>
  );

  return (
    // relative so the remove ✕ can sit at the card's top-right OUTSIDE the open button — inside
    // it, the ✕ would grow the square tile and steal clicks meant for the editor.
    <div
      className={cn(
        'relative border bg-bgColor',
        linked && !hasError ? 'border-borderColor' : 'border-error',
      )}
    >
      <Button
        type='button'
        size='xs'
        variant='secondary'
        aria-label='remove BOM article'
        onClick={onRemove}
        className='absolute right-1 top-1 z-10'
      >
        ✕
      </Button>

      <button
        type='button'
        onClick={onOpen}
        className='flex w-full flex-col gap-1 p-1.5 text-left'
        aria-haspopup='dialog'
      >
        {/* The square material photo, full-bleed across the tile. */}
        {imageUrl ? (
          <span className='relative block aspect-square w-full overflow-hidden border border-borderColor'>
            <Media
              src={imageUrl}
              alt={row.name?.trim() || 'material'}
              aspectRatio='1/1'
              fit='cover'
            />
          </span>
        ) : (
          <Placeholder aspect='square' label='no photo' className='w-full' />
        )}

        {/* секция / тип. The class pill is dropped when it just repeats the section — the enums
            overlap word-for-word (fabric/hardware/thread/packaging), so a fabric article read
            «fabric fabric». It earns its place only when the two differ (lining + fabric). */}
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='mut'>{section || 'section?'}</Pill>
          {cls && cls !== section ? <Pill tone='mut'>{cls}</Pill> : null}
        </div>

        {/* The ROLE, bold — the slot's identity. The article is the line below it. */}
        <Text component='span' size='micro' className='min-w-0 truncate font-bold uppercase'>
          {row.name?.trim() || `слот ${index + 1}`}
        </Text>

        {/* the default article: catalog name + self-describing code, once a material is linked */}
        {linked && material ? (
          <>
            <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
              {material.name?.trim() || `#${row.materialId}`}
            </Text>
            <Text
              component='span'
              variant='label'
              size='micro'
              className='min-w-0 truncate font-mono tabular-nums'
            >
              {composeArticleFromMaterial(material, true)}
            </Text>
          </>
        ) : null}

        {specLine ? (
          <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
            {specLine}
          </Text>
        ) : null}

        <div className='mt-0.5 flex min-w-0 flex-wrap items-center gap-1'>
          {priceStatus}
          {/* Advisory role health: a blank role reads as the article name everywhere (the server
              falls back on read), and a role that IS the article name is the tell of the fixed
              picker bug — both mean nobody has named the slot's place in the garment yet. */}
          {!row.name?.trim() || (linked && looksLikeArticleName(row.name, material?.name)) ? (
            <Pill tone='attention'>роль не задана</Pill>
          ) : null}
          {roleDuplicate ? <Pill tone='attention'>дубль роли</Pill> : null}
        </div>
      </button>

      {/* Same idea as the "! link a material" marker, for anything BLOCKING the save: name the
          offending fields on the tile so a row whose editor is closed is diagnosable at a glance. */}
      {hasError && (
        <div className='border-t border-hairline px-2 py-1'>
          <Text size='micro' variant='error' className='truncate'>
            {rowErrors.map((e) => `! ${e.path}: ${e.message}`).join(' · ')}
          </Text>
        </div>
      )}
    </div>
  );
}

// A colourway whose recipe still cuts the article the operator is trying to delete. The server
// refuses that delete; this is what the refusal is turned into on the way in.
type BlockingUser = { colorwayId: number; sku: string };

// Bill of materials = catalog of all material articles used by this style. Recipe (which
// article on which part, colour, consumption) lives per colourway on the colorways tab.
export function BomField({
  highlightComposition = 0,
  colorways,
}: {
  highlightComposition?: number;
  /**
   * The style's colourways as READ (techCard.colorways) — NOT the RHF `colorways` array, which is
   * permanently empty since colourways stopped being style-owned. Their recipes are the one class
   * of reference to a BOM article this form cannot clear on its own, so they are the one thing
   * that has to be checked before a delete rather than fixed up after it.
   */
  colorways?: common_AdminColorwayRef[];
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const warnNoPrice = useNoPriceWarning();
  const [params, setParams] = useSearchParams();
  const [blocked, setBlocked] = useState<{ name: string; users: BlockingUser[] } | null>(null);
  // "add BOM article" is TWO steps in two stacked dialogs: the catalog picker first, then — on its
  // "add" — a small role modal OVER it. The article answers "what is it", the role answers "what is
  // it FOR» («основная ткань», «подкладка»…), and the line is created linked AND role-named, never
  // named after the article (see materialLineFields). Cancelling the role modal falls back to the
  // still-open picker with the selection intact — half a decision is never silently committed.
  const [adding, setAdding] = useState(false);
  // The picked article awaiting its role — the role modal is open exactly while this is set.
  const [addMaterial, setAddMaterial] = useState<common_Material | undefined>(undefined);
  const [addRole, setAddRole] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { fields, append, remove } = useFieldArray({ control, name: 'bomItems' });
  const bomWatch = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    composition?: string;
    name?: string;
    section?: string;
    materialId?: number;
  }>;
  // Duplicate-role detection for the tiles (advisory, never a save rule): normalized role → count.
  const roleCounts = new Map<string, number>();
  bomWatch.forEach((b) => {
    const n = normalizeRole(b.name);
    if (n) roleCounts.set(n, (roleCounts.get(n) ?? 0) + 1);
  });
  // The article whose editor is open. ONE dialog for the whole grid, keyed by index — a modal per
  // tile would mean twenty dialog roots mounted to show at most one.
  const [editing, setEditing] = useState<number | null>(null);
  const [highlightActive, setHighlightActive] = useState(false);

  // When the labels tab asks for composition (care-gen with empty composition), jump here: open the
  // first article missing composition and pulse its empty field.
  useEffect(() => {
    if (!highlightComposition || !bomWatch.length) return;
    const firstEmpty = bomWatch.findIndex((b) => !b.composition?.trim());
    setEditing(firstEmpty >= 0 ? firstEmpty : 0);
    setHighlightActive(true);
    const t = setTimeout(() => setHighlightActive(false), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightComposition]);

  // The pulsed field lives inside the dialog, so it can only be scrolled to once that content has
  // mounted into its portal — a frame after `editing` is set, not in the effect above.
  useEffect(() => {
    if (!highlightActive || editing === null) return;
    const t = setTimeout(() => {
      document
        .getElementById(`bom-composition-${editing}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [highlightActive, editing]);

  // Which colourways cut a given article. Their recipes are colourway-owned — saved by their own
  // RPC, one write per colourway — so this form can neither see them in its own state nor clear
  // them as part of its save.
  //
  // Matched on bom_item_id, with line_key only as a fallback — not the other way round. The read
  // does not emit bom_line_key on a usage at all (ConvertRecipeUsagesToPb sets piece_line_key and
  // the resolved bom_item_id, and nothing else), which is also how the recipe editor resolves a
  // usage back to its BOM line: by id, then to that line's key. It is the same FK the server's
  // RESTRICT fires on. A never-saved article has id 0 and no colourway can reference it yet.
  const colorwayUsers = (lineKey: string, bomItemId: number): BlockingUser[] =>
    (colorways ?? [])
      .filter((c) =>
        (c.usages ?? []).some(
          (u) =>
            (bomItemId > 0 && wireInt(u.bomItemId) === bomItemId) ||
            (!!lineKey && u.bomLineKey === lineKey),
        ),
      )
      .map((c) => ({
        colorwayId: c.colorwayId ?? 0,
        sku: c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`,
      }));

  // Step 1 → step 2: the picker's "add" stages the article and opens the role modal over it. The
  // picker stays open underneath (it does not close itself on confirm), so cancelling the role
  // question returns to the swatch grid with the selection still armed. Prefill answers the easy
  // case only: the section's natural first role when this card has no slot in that section yet. A
  // second fabric gets an empty required field — naming the new role IS the deliberate answer, and
  // the exact moment «добавить ту же ткань ещё раз» turns into either «ткань капюшона» or a pin on
  // the colorways tab.
  const stageAdd = (m?: common_Material) => {
    if (!m || !wireInt(m.id)) {
      setAdding(false);
      return;
    }
    const sectionHasSlots = bomWatch.some((b) => b.section === m.section);
    setAddRole(sectionHasSlots ? '' : defaultRoleFor(m.section));
    setAddMaterial(m);
  };

  // Step 2 commit: one new slot — the answered role, the picked article as its default.
  const commitAdd = () => {
    const m = addMaterial;
    const materialId = wireInt(m?.id);
    if (!m || !materialId || !addRole.trim()) return;
    append({
      ...emptyBomItem,
      ...materialLineFields(m),
      name: addRole.trim(),
      materialId,
      lineKey: ulid(),
    });
    warnNoPrice(m);
    setAddMaterial(undefined);
    setAdding(false);
  };

  // Both advisory — they explain, they never block. The commit is gated only on an empty role.
  const addCollision = roleCollision(bomWatch, addRole);
  const addExistingSlotIdx = addMaterial
    ? bomWatch.findIndex((b) => (b.materialId ?? 0) > 0 && b.materialId === wireInt(addMaterial.id))
    : -1;

  // Land on the offending recipe itself, not merely on the colorways tab: ?colorway= selects the
  // swatch, so the usage to remove is on screen instead of two clicks away.
  const goToColorway = (colorwayId: number) => {
    setBlocked(null);
    const next = new URLSearchParams(params);
    next.set('tab', 'colorways');
    if (colorwayId) next.set('colorway', String(colorwayId));
    setParams(next, { replace: true });
    showMessage('уберите этот артикул из рецепта колорвея и сохраните его', 'success');
  };

  // Stable line_key (§2.3): downstream refs point at the article's key, not its position — so
  // removing an article NEVER renumbers anything. We only clear refs that pointed AT the removed
  // article (its key is gone); refs to other articles are untouched. Kills the S2/S3 renumbering.
  const removeArticle = (bi: number) => {
    const removedKey = (getValues(`bomItems.${bi}.lineKey`) as string) || '';
    // Refuse here rather than let the save carry it to a server that answers with a wall of
    // uppercase naming a line_key the operator has never seen. Operation and piece references are
    // cleared below and go out with the same save; colourway recipes are the one thing this form
    // does not own, so they are the one thing that can block.
    const users = colorwayUsers(removedKey, wireInt(getValues(`bomItems.${bi}.id`)));
    if (users.length > 0) {
      setBlocked({
        name: (getValues(`bomItems.${bi}.name`) as string)?.trim() || `артикул ${bi + 1}`,
        users,
      });
      return;
    }
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        // The LIST is the reference. `operations.N.bomLineKey` is vestigial in the form — the read
        // folds it into bomLineKeys (mergeLegacyBomKey) and the write derives it back from
        // bomLineKeys[0] — so clearing only the singular, as this did, was overwritten by the very
        // next save and the removed key shipped anyway. The server deletes operations before it
        // drops the BOM line, so the delete succeeded and resolveBomRef then failed the whole
        // transaction on a key that no longer exists: a card nothing in the UI could rescue, since
        // the operation's chip row only offers BOM lines that still exist.
        const keys = (o.bomLineKeys ?? []).filter(Boolean);
        if (keys.includes(removedKey)) {
          setValue(
            `operations.${oi}.bomLineKeys`,
            keys.filter((k) => k !== removedKey),
            { shouldDirty: true },
          );
        }
      });
      const pieces = (getValues('pieces') ?? []) as TechCardFormData['pieces'];
      (pieces ?? []).forEach((p, pi) => {
        (p.materials ?? []).forEach((m, mi) => {
          if (m.bomLineKey === removedKey) {
            setValue(`pieces.${pi}.materials.${mi}.bomLineKey`, '', { shouldDirty: true });
          }
          if (m.fusingBomLineKey === removedKey) {
            setValue(`pieces.${pi}.materials.${mi}.fusingBomLineKey`, '', { shouldDirty: true });
          }
        });
      });
      // Labels reference a BOM line by resolved ID, not by key, and no screen renders that link —
      // the card reads it, carries it, and sends it back untouched (§2.8 label ↔ physical label
      // material). Nothing sets it today, so this is a landmine rather than a live bug: the moment
      // something does, deleting that article fails the save with a bare FK error, because the
      // server re-inserts the labels AFTER the BOM upsert has dropped the line. An invisible
      // referrer is exactly the kind that has to be released here — there is no other screen to do
      // it on.
      const removedId = wireInt(getValues(`bomItems.${bi}.id`));
      if (removedId > 0) {
        const labels = (getValues('labels') ?? []) as Array<{ bomItemId?: number }>;
        labels.forEach((l, li) => {
          if (wireInt(l.bomItemId) === removedId) {
            setValue(`labels.${li}.bomItemId`, 0, { shouldDirty: true });
          }
        });
      }
      // No colourway pass here. The RHF `colorways` array has been permanently empty since
      // colourways became products (mapTechCardToForm maps over []), so the loop that used to sit
      // here cleared nothing while reading as if it handled the case — which is exactly how a
      // referenced article reached the server and came back as an error about a line_key. The
      // guard above is what actually handles it.
    }
    // Indices shift under an open editor once a row above it is gone; close it rather than let it
    // repoint at whatever slid into that slot.
    setEditing(null);
    remove(bi);
  };

  return (
    <div className='space-y-2.5'>
      <Text variant='label' size='micro'>
        Справочник артикулов: внесите каждый материал один раз. На вкладке colorways вы выбираете,
        какой артикул идёт на какую часть, в каком цвете и с каким расходом.
      </Text>

      {fields.length === 0 ? (
        <Placeholder label='no BOM articles yet' className='h-16' />
      ) : (
        // Same auto-filling tile grid as the models list (Tiles min=160) — fixed column counts
        // made a BOM article a quarter of the page wide on a desktop, so four articles filled a
        // screen the models list fits a dozen into.
        <Tiles min={160}>
          {fields.map((f, index) => (
            <BomTile
              key={f.id}
              index={index}
              roleDuplicate={(roleCounts.get(normalizeRole(bomWatch[index]?.name)) ?? 0) > 1}
              onRemove={() => removeArticle(index)}
              onOpen={() => setEditing(index)}
            />
          ))}
        </Tiles>
      )}

      {/* The editor, in the app's one modal shell. No footer: nothing here is committed separately —
          the fields write straight into the card's form state, and the card's own save button is
          what persists them. Closing is ✕ / Esc / the overlay. */}
      {editing !== null && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setEditing(null)}
          onConfirm={() => setEditing(null)}
          width='lg'
          hideActions
          title={join(
            bomWatch[editing]?.name?.trim() || `слот ${editing + 1}`,
            sectionShort(bomWatch[editing]?.section),
          )}
        >
          <BomItemRow index={editing} highlight={highlightActive} />
        </ConfirmationModal>
      )}

      {/* Why the delete did not happen, named in the operator's terms: not a line_key, but the
          colourways that still cut this article, each one a link to the recipe that releases it. */}
      {blocked && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setBlocked(null)}
          width='sm'
          title='артикул ещё используется'
          cancelLabel='close'
          confirmLabel={blocked.users[0] ? `открыть ${blocked.users[0].sku} →` : 'close'}
          closeOnConfirm={false}
          onConfirm={() =>
            blocked.users[0] ? goToColorway(blocked.users[0].colorwayId) : setBlocked(null)
          }
        >
          <div className='flex flex-col gap-2'>
            <Text size='micro'>
              «{blocked.name}» стоит в рецептах этих колорвеев. Уберите его оттуда — тогда артикул
              можно будет удалить.
            </Text>
            <div className='flex flex-col'>
              {blocked.users.map((u) => (
                <button
                  key={u.colorwayId}
                  type='button'
                  onClick={() => goToColorway(u.colorwayId)}
                  className='flex items-center gap-2 border-b border-hairline py-1 text-left last:border-b-0 hover:bg-bgZebra'
                >
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {u.sku}
                  </Text>
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='shrink-0 underline'
                  >
                    → colorways
                  </Text>
                </button>
              ))}
            </div>
            <Text size='micro' variant='label'>
              Рецепт колорвея сохраняется отдельно от карточки, поэтому его нельзя почистить этим же
              сохранением.
            </Text>
          </div>
        </ConfirmationModal>
      )}

      <Button
        type='button'
        variant='main'
        size='sm'
        onClick={() => {
          // Fresh flow every time — a role typed for the previous slot must not leak into this one.
          setAddRole('');
          setAddMaterial(undefined);
          setAdding(true);
        }}
      >
        add BOM article
      </Button>

      {/* Step 1: the catalog as swatches. Its "add" stages the pick and opens the role modal on
          top (stageAdd). "+ create" hands off to the material form and re-enters the same staged
          flow, so an article made on the spot gets asked for its role too. */}
      <MaterialPickerDialog
        open={adding}
        title='add BOM article'
        confirmLabel='add'
        onPick={stageAdd}
        onClose={() => setAdding(false)}
        onCreate={() => {
          setAdding(false);
          setCreateOpen(true);
        }}
      />
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(_id, m) => stageAdd(m)}
      />

      {/* Step 2: the role question, stacked over the still-open picker (both portal to body; the
          later dialog renders above). Cancel falls back to the picker with the selection intact. */}
      {addMaterial && (
        <ConfirmationModal
          open
          onOpenChange={(v) => !v && setAddMaterial(undefined)}
          width='sm'
          title='роль в изделии'
          confirmLabel='add'
          confirmDisabled={!addRole.trim()}
          closeOnConfirm={false}
          onConfirm={commitAdd}
        >
          <div className='flex flex-col gap-2'>
            {/* What was just picked, so the question reads in context. */}
            <div className='flex items-center gap-2'>
              <MaterialThumb material={addMaterial} size='md' />
              <div className='min-w-0 flex-1'>
                <Text size='micro' className='truncate font-bold'>
                  {addMaterial.name?.trim() || `#${wireInt(addMaterial.id)}`}
                </Text>
                <Text variant='label' size='micro' className='truncate'>
                  {sectionShort(addMaterial.section) || '—'}
                </Text>
              </div>
            </div>
            <div>
              <Text variant='label' size='micro' tracking='label' className='uppercase'>
                роль в изделии *
              </Text>
              <div className='mt-1'>
                <Input
                  name='bom-add-role'
                  value={addRole}
                  autoComplete='off'
                  autoFocus
                  list='bom-add-role-suggestions'
                  placeholder='основная ткань / подкладка / молния…'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddRole(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && addRole.trim()) {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                />
                <datalist id='bom-add-role-suggestions'>
                  {roleSuggestions(addMaterial.section).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>
            {addExistingSlotIdx >= 0 && (
              <Text variant='label' size='micro'>
                этот артикул уже стоит в слоте «
                {bomWatch[addExistingSlotIdx]?.name?.trim() || `слот ${addExistingSlotIdx + 1}`}» —
                новый слот нужен только для другой роли. Другой цвет/артикул в колорвее задаётся
                пином на вкладке colorways, не вторым слотом.
              </Text>
            )}
            {addCollision >= 0 && (
              <Text size='micro' variant='error'>
                роль «{addRole.trim()}» уже есть на этой карточке — одинаковые роли неразличимы в
                рецептах колорвеев и в плане закупки
              </Text>
            )}
          </div>
        </ConfirmationModal>
      )}
    </div>
  );
}
