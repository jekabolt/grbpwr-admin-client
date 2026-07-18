import { common_Material, common_TechCardBomSection } from 'api/proto-http/admin';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { CompositionPicker } from 'components/managers/product/components/composition/composition-picker';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';
import { unitOptions } from './tech-card-options';
import { ulid } from 'utils/ulid';

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
// shared by the link-time snapshot (MaterialLinkField) and the linked-line read-only mirror
// (BomItemRow) so the two never drift apart.
function materialFabricWidth(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.widthCm?.value || m?.fabricWidth?.value;
}
function materialFabricWeight(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.weightGsm?.value || m?.fabricWeightGsm?.value;
}

// Read-only presentation for an identity field mirrored from the linked catalog material (S23):
// shown instead of the editable input while a BOM line is linked, so the line can no longer
// diverge from the catalog by hand-editing. Styled like the Input it replaces; the value is
// passed in explicitly (the live catalog lookup, falling back to the line's own stored value)
// rather than bound to the form field.
function ReadOnlyMirrorField({ label, value }: { label: string; value?: string }) {
  return (
    <div className='space-y-2'>
      <Text size='small' variant='label'>
        {label}
      </Text>
      <Input value={value ?? ''} placeholder='—' disabled className='text-textInactiveColor' />
    </div>
  );
}

// Optionally link this BOM line to a catalog Material. Picking one snapshots the catalog's
// meta (name/section/supplier/composition/spec/unit/fabric + latest price) onto the line, so
// the line stays self-contained even after the catalog changes. `materialId` records the link.
// A "+ create" button makes a new material inline (Q9a) — no round-trip to /materials, and it is
// auto-selected on the line once created. Once linked, the identity fields render read-only
// (BomItemRow, S23) — "unlink" (equivalent to re-picking "— not linked —") hands the line back
// for free-text editing.
function MaterialLinkField({ index }: { index: number }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  const [createOpen, setCreateOpen] = useState(false);

  // Snapshot a catalog material's meta onto this line (S23: the line stays self-contained). Fabric
  // dims read from the typed CTI attrs, falling back to the legacy flat fields.
  const snapshotFrom = (m: common_Material) => {
    setValue(`bomItems.${index}.materialId`, m.id ?? 0, { shouldDirty: true });
    const put = (field: string, val?: string) => {
      if (val) setValue(`bomItems.${index}.${field}` as never, val as never, { shouldDirty: true });
    };
    put('name', m.name);
    put('section', m.section);
    put('supplier', m.supplier);
    put('supplierRef', m.supplierRef);
    put('composition', m.composition);
    put('spec', m.spec);
    put('unit', m.unit);
    put('fabricWidth', materialFabricWidth(m));
    put('fabricWeightGsm', materialFabricWeight(m));
    // latest_price is costing-gated (absent without access) — seed price only when present.
    put('unitPrice', m.latestPrice?.price?.value);
    put('currency', m.latestPrice?.currency);
  };

  const pick = (id: number, m?: common_Material) => {
    setValue(`bomItems.${index}.materialId`, id, { shouldDirty: true });
    if (id && m) snapshotFrom(m);
  };

  return (
    <div className='space-y-1 lg:col-span-3'>
      <Text size='small' variant='label'>
        catalog material *
      </Text>
      <div className='flex items-start gap-2'>
        <div className='min-w-0 flex-1'>
          {/* #64: the shared searchable MaterialPicker, scoped to THIS line's BOM section — replaces
              the old unfiltered, unsearchable native <select> of every catalog material. */}
          <MaterialPicker
            value={materialId}
            section={rowSection ?? ''}
            onChange={(id, m) => pick(id, m)}
          />
        </div>
        <Button
          type='button'
          variant='secondary'
          className='shrink-0 whitespace-nowrap uppercase'
          onClick={() => setCreateOpen(true)}
        >
          + create
        </Button>
        {materialId ? (
          <Button
            type='button'
            variant='secondary'
            className='shrink-0 whitespace-nowrap uppercase'
            onClick={() => pick(0)}
          >
            unlink
          </Button>
        ) : null}
      </div>
      {materialId ? (
        <Text size='small' variant='inactive'>
          Поля ниже — снимок из справочника; пока материал привязан, их нельзя редактировать. Чтобы
          изменить — отвяжите материал.
        </Text>
      ) : (
        <Text size='small' className='text-error'>
          Привяжите артикул из справочника материалов (обязательно).
        </Text>
      )}
      {/* Inline create — prefill the section from this BOM line; auto-select on create. */}
      <MaterialModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSection={rowSection}
        onCreated={(_id, m) => snapshotFrom(m)}
      />
    </div>
  );
}

// One catalog article (Sheet «Спецификация»). The BOM is a pure material-article catalog:
// identity + supplier + price + fabric data. Which article goes on which part, in what
// colour and at what consumption is the colourway's recipe (colorways tab → usages).
function BomItemRow({ index, highlight }: { index: number; highlight?: boolean }) {
  const { control, getValues } = useFormContext<TechCardFormData>();
  // materialId > 0 = this line is linked to a catalog Material: the material's own facts below render
  // as a read-only mirror instead of editable inputs (S23) so a hand-edit can no longer diverge from
  // the catalog (e.g. a fabric line silently set to section=hardware). What the material defines —
  // section, unit, base colour, spec, composition, supplier, unit price — is mirrored; what belongs to
  // THIS line's use of it stays editable: consumption/wastage/fabric-direction/currency/comment.
  const materialId =
    (useWatch({ control, name: `bomItems.${index}.materialId` }) as number | undefined) || 0;
  const linked = materialId > 0;
  const { data } = useMaterials('', false);
  const linkedMaterial = linked
    ? (data?.materials ?? []).find((m) => m.id === materialId)
    : undefined;

  // Prefer the live catalog value; fall back to whatever this line already holds (the linked
  // material is archived/deleted, or the catalog list hasn't loaded yet) so the mirror never
  // flashes blank while linked.
  const mirror = (catalogValue: string | undefined, field: string): string | undefined =>
    catalogValue?.trim()
      ? catalogValue
      : (getValues(`bomItems.${index}.${field}` as never) as string);
  const sectionLabel = (v?: string): string =>
    techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '';

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <MaterialLinkField index={index} />
        {linked ? (
          <ReadOnlyMirrorField
            label='section'
            value={sectionLabel(mirror(linkedMaterial?.section, 'section'))}
          />
        ) : (
          <SelectField
            name={`bomItems.${index}.section`}
            label='section *'
            items={techCardBomSectionOptions}
          />
        )}
        {linked ? (
          <ReadOnlyMirrorField label='name' value={mirror(linkedMaterial?.name, 'name')} />
        ) : (
          <InputField name={`bomItems.${index}.name`} label='name *' />
        )}
        {linked ? (
          <ReadOnlyMirrorField label='unit' value={mirror(linkedMaterial?.unit, 'unit')} />
        ) : (
          <ComboField
            name={`bomItems.${index}.unit`}
            label='unit'
            options={unitOptions}
            placeholder='м / pcs'
          />
        )}
        {linked ? (
          <ReadOnlyMirrorField
            label='supplier'
            value={mirror(linkedMaterial?.supplier, 'supplier')}
          />
        ) : (
          <InputField name={`bomItems.${index}.supplier`} label='supplier' />
        )}
        {linked ? (
          <ReadOnlyMirrorField
            label='supplier ref'
            value={mirror(linkedMaterial?.supplierRef, 'supplierRef')}
          />
        ) : (
          <InputField name={`bomItems.${index}.supplierRef`} label='supplier ref' />
        )}
        {linked ? (
          <ReadOnlyMirrorField
            label='base color (ref)'
            value={mirror(linkedMaterial?.color, 'color')}
          />
        ) : (
          <InputField name={`bomItems.${index}.color`} label='base color (ref)' />
        )}
        {linked ? (
          <ReadOnlyMirrorField
            label='spec (width / weight)'
            value={mirror(linkedMaterial?.spec, 'spec')}
          />
        ) : (
          <InputField name={`bomItems.${index}.spec`} label='spec (width / weight)' />
        )}
        <div
          id={`bom-composition-${index}`}
          className={cn(
            'rounded-none lg:col-span-3',
            highlight && 'animate-pulse p-1 ring-2 ring-warning',
          )}
        >
          {linked ? (
            // M1: the material's `composition` string is legacy plain text — shown as-is, never
            // parsed. The style's STRUCTURED fibre composition is the typed composition_entries
            // projection (see CompositionEntries at the top of the BOM tab), not this per-line string.
            <ReadOnlyMirrorField
              label='composition'
              value={mirror(linkedMaterial?.composition, 'composition')}
            />
          ) : (
            <CompositionPicker name={`bomItems.${index}.composition`} />
          )}
        </div>
      </div>

      <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-3'>
        {linked ? (
          <ReadOnlyMirrorField
            label='unit price'
            value={mirror(linkedMaterial?.latestPrice?.price?.value, 'unitPrice')}
          />
        ) : (
          <DecimalField name={`bomItems.${index}.unitPrice`} label='unit price' />
        )}
        <CurrencySelect name={`bomItems.${index}.currency`} label='currency' />
      </div>

      <TextareaField name={`bomItems.${index}.comment`} label='comment' rows={2} maxLength={1000} />

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          fabric data (for the cutter)
        </Text>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {linked ? (
            <ReadOnlyMirrorField
              label='width (cm)'
              value={mirror(materialFabricWidth(linkedMaterial), 'fabricWidth')}
            />
          ) : (
            <DecimalField name={`bomItems.${index}.fabricWidth`} label='width (cm)' />
          )}
          {linked ? (
            <ReadOnlyMirrorField
              label='weight (g/m²)'
              value={mirror(materialFabricWeight(linkedMaterial), 'fabricWeightGsm')}
            />
          ) : (
            <DecimalField name={`bomItems.${index}.fabricWeightGsm`} label='weight (g/m²)' />
          )}
          <SelectField
            name={`bomItems.${index}.fabricDirection`}
            label='direction'
            items={techCardFabricDirectionOptions}
          />
          <DecimalField name={`bomItems.${index}.wastagePercent`} label='wastage %' />
        </div>
      </div>

      <Text variant='inactive' size='small'>
        Цвет, размещение и расход этого артикула задаются на вкладке colorways (в карточке
        колорвея).
      </Text>
    </div>
  );
}

// #33: one BOM article as a scannable TILE — a compact summary card (section badge · name ·
// supplier / price / linked) that expands in place to the full editor. Owner's card/tile layout
// preference; the old always-expanded stack was unusable with many materials. An expanded tile spans
// the full grid width so the wide editor never gets crushed in a column.
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
    unitPrice?: string;
    currency?: string;
    materialId?: number;
  };
  // Open the tile when the labels tab deep-links here to fill a missing composition, so the pulsed
  // field is actually visible (it lives inside the collapsed editor).
  useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  const sectionLabel =
    techCardBomSectionOptions.find((o) => o.value === row.section)?.label ?? 'section?';
  const linked = (row.materialId ?? 0) > 0;
  const price = row.unitPrice?.trim();
  const facts = [
    row.supplier?.trim(),
    price ? `${price}${row.currency?.trim() ? ` ${row.currency.trim()}` : ''}` : '',
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'border',
        open && 'lg:col-span-2',
        linked ? 'border-textInactiveColor' : 'border-error',
      )}
    >
      <div className='flex items-start justify-between gap-2 p-3'>
        <button
          type='button'
          onClick={() => setOpen((o) => !o)}
          className='flex min-w-0 flex-1 items-center gap-3 text-left'
          aria-expanded={open}
        >
          <span className='shrink-0 border border-textInactiveColor px-1.5 py-0.5 text-textBaseSize uppercase text-textInactiveColor'>
            {sectionLabel}
          </span>
          <span className='min-w-0 flex-1'>
            <Text className='truncate'>{row.name?.trim() || `артикул ${index + 1}`}</Text>
            <Text
              variant={linked ? 'inactive' : undefined}
              size='small'
              className={cn('truncate', !linked && 'text-error')}
            >
              {/* #64: an unlinked line is scannable on the collapsed tile — no need to expand to find it */}
              {[...facts, linked ? '' : '! link a material'].filter(Boolean).join(' · ')}
            </Text>
          </span>
          <Text variant='inactive' className='shrink-0'>
            {open ? '▴' : '▾'}
          </Text>
        </button>
        <Button
          type='button'
          variant='secondary'
          aria-label='remove BOM article'
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>
      {open && (
        <div className='border-t border-textInactiveColor p-3'>
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
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        Справочник артикулов: внесите каждый материал один раз. На вкладке colorways вы выбираете,
        какой артикул идёт на какую часть, в каком цвете и с каким расходом.
      </Text>

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no BOM articles
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
          {fields.map((f, index) => (
            <BomTile
              key={f.id}
              index={index}
              onRemove={() => removeArticle(index)}
              highlight={highlightActive && !bomWatch[index]?.composition?.trim()}
            />
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyBomItem, lineKey: ulid() })}
      >
        add BOM article
      </Button>
    </div>
  );
}
