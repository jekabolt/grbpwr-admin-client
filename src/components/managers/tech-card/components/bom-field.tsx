import { common_Material, common_TechCardBomSection } from 'api/proto-http/admin';
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
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
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

const join = (...parts: Array<string | undefined>) => parts.filter((p) => !!p?.trim()).join(' · ');
const widthLabel = (v?: string) => (v?.trim() ? `${v.trim()} cm` : '');
const weightLabel = (v?: string) => (v?.trim() ? `${v.trim()} g/m²` : '');

// The material's class as a short lowercase tag (fabric / hardware / thread / packaging) — the
// "тип" pill beside the section on a linked article tile.
const classShort = (c?: string) =>
  c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';

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
  const { canReadCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  // `name` is watched rather than read through getValues so linking a material repaints the plate
  // immediately. The server resolves a linked line's name from the material by link rather than
  // storing a copy, so the value RHF already holds IS the resolved one.
  const nameValue = useWatch({ control, name: `bomItems.${index}.name` }) as string | undefined;
  const [createOpen, setCreateOpen] = useState(false);

  const linked = materialId > 0;
  const { data } = useMaterials('', false);
  const linkedMaterial = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === materialId)
    : undefined;
  // Warehouse balance for the plate's "· 41.6 m on hand". Only fetched once a line is actually
  // linked AND expanded (this row only mounts when its tile is open).
  const onHand = useMaterialOnHand(linked);

  // Snapshot a catalog material's meta onto this line (S23: the line stays self-contained). Fabric
  // dims read from the typed CTI attrs, falling back to the legacy flat fields.
  const snapshotFrom = (m: common_Material) => {
    // Material.id is int64 -> arrives as a STRING from grpc-gateway despite the generated type
    // saying `number`. Writing it raw put a string into the form, which z.number() then rejected
    // as "Invalid input" on bomItems.N.materialId — an unsavable card, right after linking.
    setValue(`bomItems.${index}.materialId`, wireInt(m.id), { shouldDirty: true });
    const put = (field: string, val?: string) => {
      if (val) setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    };
    // Slots: the line's name is the ROLE («основная молния»), and the read path now keeps it over
    // the linked article's catalog name. Stamp the article name only into an EMPTY name — a role
    // the operator already typed must survive linking a default article, or no role name can ever
    // exist on a linked line.
    if (!String(getValues(`bomItems.${index}.name`) ?? '').trim()) put('name', m.name);
    put('section', m.section);
    put('supplier', m.supplier);
    put('supplierRef', m.supplierRef);
    // The blend as the parseable JSON the CompositionPicker + care generator read — derived from the
    // material's STRUCTURED fibre entries when it has no legacy free-text `composition`, so a line
    // linked to a structurally-composed material carries a composition that generates the care label
    // (was copying the empty legacy string → "composition not set" → care-gen blocked).
    put('composition', materialCompositionCode(m));
    put('spec', m.spec);
    put('unit', m.unit);
    put('fabricWidth', materialFabricWidth(m));
    put('fabricWeightGsm', materialFabricWeight(m));
    // latest_price is costing-gated (absent without access) — seed price only when present.
    put('unitPrice', m.latestPrice?.price?.value);
    put('currency', m.latestPrice?.currency);
  };

  const pick = (id: number, m?: common_Material) => {
    // A price-less material breaks the whole costing chain downstream (BOM estimate → style cost →
    // COGS), so linking one is blocked — add the purchase price in materials → prices first, then
    // link. Only enforceable when this user can SEE prices: latest_price is costing-gated, so for
    // a non-costing user every material would look price-less and nothing could ever be linked.
    if (id && m && canReadCosting && !m.latestPrice?.price?.value) {
      showMessage(
        `${m.name || 'this material'} has no purchase price — add it in materials → prices first (costing and COGS depend on it)`,
        'error',
      );
      return;
    }
    setValue(`bomItems.${index}.materialId`, wireInt(id), { shouldDirty: true });
    if (id && m) snapshotFrom(m);
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
                  <Pill tone='mut'>
                    {sectionShort(mirror(linkedMaterial?.section, 'section')) || 'section?'}
                  </Pill>
                  <Text component='span' className='min-w-0 truncate font-bold'>
                    {nameValue?.trim() || `артикул ${index + 1}`}
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
      {/* Section is chosen FIRST so the picker below is scoped to the right family — hardware for
          пуговицы / молнии / кнопки, trim, thread… not only fabric. */}
      <div className='max-w-xs'>
        <SelectField
          name={`bomItems.${index}.section`}
          label='секция *'
          items={techCardBomSectionOptions}
        />
      </div>
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
          <InputField name={`bomItems.${index}.name`} label='name *' />
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
// pills, the article name, its self-describing code, spec line and price — that expands in place to
// the editor. An expanded tile spans the full grid width so the two-column editor never gets
// crushed in a column.
function BomTile({
  index,
  onRemove,
  highlight,
}: {
  index: number;
  onRemove: () => void;
  highlight?: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const [open, setOpen] = useState(false);
  const row = (useWatch({ control, name: `bomItems.${index}` }) ?? {}) as {
    name?: string;
    section?: string;
    supplier?: string;
    unit?: string;
    unitPrice?: string;
    currency?: string;
    materialId?: number;
  };
  // Open the tile when the labels tab deep-links here to fill a missing composition, so the pulsed
  // field is actually visible (it lives inside the collapsed editor).
  useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  const linked = (row.materialId ?? 0) > 0;
  const { data } = useMaterials('', false);
  const material = linked
    ? (data?.materials ?? []).find((m) => wireInt(m.id) === row.materialId)
    : undefined;

  // A red underline inside a COLLAPSED tile is invisible, so the tile itself has to carry the
  // error — otherwise a blocked save points at a row the operator can't see is broken.
  const { errors } = useFormState({ control, name: `bomItems.${index}` });
  const rowErrors = flattenFieldErrors(
    (errors.bomItems as FieldErrors[] | undefined)?.[index] as FieldErrors | undefined,
  );
  const hasError = rowErrors.length > 0;
  // Expand a broken row so its fields are reachable and visibly red. Keyed on the transition, so
  // the operator can still collapse it again while the error stands.
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

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
    // relative so the remove ✕ can sit at the card's top-right OUTSIDE the toggle button — inside
    // it, the ✕ would grow the square tile and steal clicks meant for expand.
    <div
      className={cn(
        'relative border bg-bgColor',
        open && 'col-span-full',
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
        onClick={() => setOpen((o) => !o)}
        className='flex w-full flex-col gap-1 p-1.5 text-left'
        aria-expanded={open}
      >
        {/* The square material photo — full-bleed on the collapsed grid tile, but capped small once
            the tile is open (col-span-full), or a w-full square would blow past the viewport. */}
        {imageUrl ? (
          <span
            className={cn(
              'relative block aspect-square overflow-hidden border border-borderColor',
              open ? 'w-28' : 'w-full',
            )}
          >
            <Media
              src={imageUrl}
              alt={row.name?.trim() || 'material'}
              aspectRatio='1/1'
              fit='cover'
            />
          </span>
        ) : (
          <Placeholder aspect='square' label='no photo' className={open ? 'w-28' : 'w-full'} />
        )}

        {/* секция / тип. The class pill is dropped when it just repeats the section — the enums
            overlap word-for-word (fabric/hardware/thread/packaging), so a fabric article read
            «fabric fabric». It earns its place only when the two differ (lining + fabric). */}
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='mut'>{section || 'section?'}</Pill>
          {cls && cls !== section ? <Pill tone='mut'>{cls}</Pill> : null}
        </div>

        <Text component='span' size='micro' className='min-w-0 truncate font-bold uppercase'>
          {row.name?.trim() || `артикул ${index + 1}`}
        </Text>

        {/* the self-describing article code, only once a catalog material is linked */}
        {linked && material ? (
          <Text
            component='span'
            variant='label'
            size='micro'
            className='min-w-0 truncate font-mono tabular-nums'
          >
            {composeArticleFromMaterial(material, true)}
          </Text>
        ) : null}

        {specLine ? (
          <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
            {specLine}
          </Text>
        ) : null}

        <div className='mt-0.5 flex min-w-0 items-center gap-1'>
          {priceStatus}
          <Text component='span' variant='inactive' className='ml-auto shrink-0'>
            {open ? '▴' : '▾'}
          </Text>
        </div>
      </button>

      {/* Same idea as the "! link a material" marker, for anything BLOCKING the save: name the
          offending fields on the tile so a collapsed row is diagnosable at a glance. */}
      {hasError && (
        <div className='border-t border-hairline px-2 py-1'>
          <Text size='micro' variant='error' className='truncate'>
            {rowErrors.map((e) => `! ${e.path}: ${e.message}`).join(' · ')}
          </Text>
        </div>
      )}

      {open && (
        <div className='border-t border-hairline p-2'>
          <BomItemRow index={index} highlight={highlight} />
        </div>
      )}
    </div>
  );
}

// Bill of materials = catalog of all material articles used by this style. Recipe (which
// article on which part, colour, consumption) lives per colourway on the colorways tab.
export function BomField({ highlightComposition = 0 }: { highlightComposition?: number }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'bomItems' });
  const bomWatch = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    composition?: string;
  }>;
  const [highlightActive, setHighlightActive] = useState(false);

  // When the labels tab asks for composition (care-gen with empty composition), jump here:
  // scroll the first article missing composition into view and pulse the empty fields.
  useEffect(() => {
    if (!highlightComposition) return;
    setHighlightActive(true);
    const firstEmpty = bomWatch.findIndex((b) => !b.composition?.trim());
    const target = firstEmpty >= 0 ? firstEmpty : 0;
    requestAnimationFrame(() => {
      document
        .getElementById(`bom-composition-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const t = setTimeout(() => setHighlightActive(false), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightComposition]);

  // Stable line_key (§2.3): downstream refs point at the article's key, not its position — so
  // removing an article NEVER renumbers anything. We only clear refs that pointed AT the removed
  // article (its key is gone); refs to other articles are untouched. Kills the S2/S3 renumbering.
  const removeArticle = (bi: number) => {
    const removedKey = (getValues(`bomItems.${bi}.lineKey`) as string) || '';
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        if (o.bomLineKey === removedKey) {
          setValue(`operations.${oi}.bomLineKey`, '', { shouldDirty: true });
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
      const colorways = (getValues('colorways') ?? []) as TechCardFormData['colorways'];
      (colorways ?? []).forEach((c, ci) => {
        (c.usages ?? []).forEach((u, ui) => {
          if (u.bomLineKey === removedKey) {
            setValue(`colorways.${ci}.usages.${ui}.bomLineKey`, '', { shouldDirty: true });
          }
        });
      });
    }
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
              onRemove={() => removeArticle(index)}
              highlight={highlightActive && !bomWatch[index]?.composition?.trim()}
            />
          ))}
        </Tiles>
      )}

      <Button
        type='button'
        variant='main'
        size='sm'
        onClick={() => append({ ...emptyBomItem, lineKey: ulid() })}
      >
        add BOM article
      </Button>
    </div>
  );
}
