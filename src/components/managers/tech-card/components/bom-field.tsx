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
};

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
            'rounded-sm lg:col-span-3',
            highlight && 'animate-pulse p-1 ring-2 ring-amber-500',
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

  // Colourway usages and operations reference BOM articles by index. Removing article `bi`
  // shifts every later index down by one — drop refs that pointed AT it and decrement refs
  // that pointed PAST it, so the references stay valid (and the backend accepts them).
  const removeArticle = (bi: number) => {
    const colorways = (getValues('colorways') ?? []) as TechCardFormData['colorways'];
    (colorways ?? []).forEach((c, ci) => {
      (c.usages ?? []).forEach((u, ui) => {
        const idx = u.bomItemIndex ?? -1;
        if (idx === bi) {
          setValue(`colorways.${ci}.usages.${ui}.bomItemIndex`, -1, { shouldDirty: true });
        } else if (idx > bi) {
          setValue(`colorways.${ci}.usages.${ui}.bomItemIndex`, idx - 1, { shouldDirty: true });
        }
      });
    });
    const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
    (operations ?? []).forEach((o, oi) => {
      const idx = o.bomItemIndex ?? -1;
      if (idx === bi) {
        setValue(`operations.${oi}.bomItemIndex`, -1, { shouldDirty: true });
      } else if (idx > bi) {
        setValue(`operations.${oi}.bomItemIndex`, idx - 1, { shouldDirty: true });
      }
    });
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
        onClick={() => append({ ...emptyBomItem })}
      >
        add BOM article
      </Button>
    </div>
  );
}
