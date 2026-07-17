import { common_Material, common_TechCardBomSection } from 'api/proto-http/admin';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { CompositionPicker } from 'components/managers/product/components/composition/composition-picker';
import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
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

// Optionally link this BOM line to a catalog Material. Picking one snapshots the catalog's
// meta (name/section/supplier/composition/spec/unit/fabric + latest price) onto the line, so
// the line stays self-contained even after the catalog changes. `materialId` records the link.
// A "+ create" button makes a new material inline (Q9a) — no round-trip to /materials, and it is
// auto-selected on the line once created.
function MaterialLinkField({ index }: { index: number }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const materialId = useWatch({ control, name: `bomItems.${index}.materialId` }) as
    | number
    | undefined;
  const rowSection = useWatch({ control, name: `bomItems.${index}.section` }) as
    | common_TechCardBomSection
    | undefined;
  const { data } = useMaterials('', false);
  const materials = data?.materials ?? [];
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
    put('fabricWidth', m.fabricAttrs?.widthCm?.value || m.fabricWidth?.value);
    put('fabricWeightGsm', m.fabricAttrs?.weightGsm?.value || m.fabricWeightGsm?.value);
    // latest_price is costing-gated (absent without access) — seed price only when present.
    put('unitPrice', m.latestPrice?.price?.value);
    put('currency', m.latestPrice?.currency);
  };

  const pick = (idStr: string) => {
    const id = Number(idStr) || 0;
    setValue(`bomItems.${index}.materialId`, id, { shouldDirty: true });
    const m = materials.find((x) => x.id === id);
    if (m) snapshotFrom(m);
  };

  return (
    <div className='space-y-1 lg:col-span-3'>
      <Text size='small' variant='label'>
        catalog material (optional)
      </Text>
      <div className='flex items-center gap-2'>
        <select
          className='w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize'
          value={materialId || 0}
          onChange={(e) => pick(e.target.value)}
        >
          <option value={0}>— not linked (free text) —</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.supplier ? ` · ${m.supplier}` : ''}
            </option>
          ))}
        </select>
        <Button
          type='button'
          variant='secondary'
          className='shrink-0 whitespace-nowrap uppercase'
          onClick={() => setCreateOpen(true)}
        >
          + create
        </Button>
      </div>
      {materialId ? (
        <Text size='small' variant='inactive'>
          Поля ниже — снимок из справочника; их можно править для этого стиля.
        </Text>
      ) : null}
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
function BomItemRow({
  index,
  onRemove,
  highlight,
}: {
  index: number;
  onRemove: () => void;
  highlight?: boolean;
}) {
  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          артикул {index + 1}
        </Text>
        <Button
          type='button'
          variant='secondary'
          aria-label='remove BOM article'
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <MaterialLinkField index={index} />
        <SelectField
          name={`bomItems.${index}.section`}
          label='section *'
          items={techCardBomSectionOptions}
        />
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
        <InputField name={`bomItems.${index}.spec`} label='spec (width / weight)' />
        <div
          id={`bom-composition-${index}`}
          className={cn(
            'rounded-none lg:col-span-3',
            highlight && 'animate-pulse p-1 ring-2 ring-warning',
          )}
        >
          <CompositionPicker name={`bomItems.${index}.composition`} />
        </div>
      </div>

      <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-3'>
        <DecimalField name={`bomItems.${index}.unitPrice`} label='unit price' />
        <CurrencySelect name={`bomItems.${index}.currency`} label='currency' />
      </div>

      <TextareaField name={`bomItems.${index}.comment`} label='comment' rows={2} maxLength={1000} />

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          fabric data (for the cutter)
        </Text>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <DecimalField name={`bomItems.${index}.fabricWidth`} label='width (cm)' />
          <DecimalField name={`bomItems.${index}.fabricWeightGsm`} label='weight (g/m²)' />
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
        fields.map((f, index) => (
          <BomItemRow
            key={f.id}
            index={index}
            onRemove={() => removeArticle(index)}
            highlight={highlightActive && !bomWatch[index]?.composition?.trim()}
          />
        ))
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
