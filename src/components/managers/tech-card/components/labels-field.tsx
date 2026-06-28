import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { techCardLabelTypeOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { generateCareLabel, hasAnyComposition } from 'utils/care-label';
import { TechCardFormData } from './schema';
import { labelAttachmentOptions, labelPlacementOptions } from './tech-card-options';

const CARE = 'TECH_CARD_LABEL_TYPE_CARE';
const ORIGIN = 'TECH_CARD_LABEL_TYPE_ORIGIN';

const emptyLabel = {
  labelType: 'TECH_CARD_LABEL_TYPE_MAIN',
  content: '',
  placement: '',
  attachment: '',
  size: '',
  note: '',
};

// One label row. A CARE label gets the care-instruction picker for its content (laundry
// symbols); the composition text lives in its note. Other types use a free-text content.
function LabelRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control } = useFormContext<TechCardFormData>();
  const labelType = useWatch({ control, name: `labels.${index}.labelType` }) as string;
  const isCare = labelType === CARE;

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          label {index + 1}
        </Text>
        <Button type='button' variant='secondary' aria-label='remove label' onClick={onRemove}>
          ✕
        </Button>
      </div>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <SelectField
          name={`labels.${index}.labelType`}
          label='type *'
          items={techCardLabelTypeOptions}
        />
        {isCare ? (
          <div className='lg:col-span-2'>
            <CarePicker name={`labels.${index}.content`} label='care symbols' />
          </div>
        ) : (
          <InputField name={`labels.${index}.content`} label='content / ref' />
        )}
        <ComboField
          name={`labels.${index}.placement`}
          label='placement'
          options={labelPlacementOptions}
        />
        <ComboField
          name={`labels.${index}.attachment`}
          label='attachment'
          options={labelAttachmentOptions}
        />
        <InputField name={`labels.${index}.size`} label='size' />
        <InputField name={`labels.${index}.note`} label={isCare ? 'состав / care text' : 'note'} />
      </div>
    </div>
  );
}

// Labels / tags (Sheet «Этикетки и упаковка»). label_type is required on each. The care
// generator builds a composition block from the BOM into the CARE label's note; the laundry
// symbols are chosen with the CarePicker on the CARE label's content.
export function LabelsField({ onMissingComposition }: { onMissingComposition?: () => void }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'labels' });
  const { showMessage } = useSnackBarStore();

  const generateCare = () => {
    const bomItems = (getValues('bomItems') ?? []) as Array<{
      section?: string;
      composition?: string;
    }>;
    const labels = (getValues('labels') ?? []) as Array<{ labelType?: string; content?: string }>;
    const origin = labels.find((l) => l.labelType === ORIGIN)?.content?.trim();
    const text = generateCareLabel(bomItems, origin);
    if (!text) {
      if (hasAnyComposition(bomItems)) {
        // composition strings exist but yielded no %s — most likely percentages weren't set
        showMessage(
          'Состав указан, но без процентов: в поле composition (BOM) нажмите «select» и задайте % для каждого материала',
          'error',
        );
        onMissingComposition?.();
      } else {
        showMessage(
          'Нет состава: на вкладке BOM в поле composition нажмите «select» и выберите материалы с процентами (открываю BOM)',
          'error',
        );
        onMissingComposition?.();
      }
      return;
    }
    const idx = labels.findIndex((l) => l.labelType === CARE);
    if (idx >= 0) {
      setValue(`labels.${idx}.note`, text, { shouldDirty: true });
    } else {
      append({ ...emptyLabel, labelType: CARE, note: text });
    }
    showMessage('состав записан в этикетку «care» (поле «состав / care text»)', 'success');
  };

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <Button type='button' variant='secondary' className='uppercase' onClick={generateCare}>
          сгенерировать состав / уход
        </Button>
        <Text variant='inactive' size='small'>
          собирает состав из BOM (composition) → пишет в этикетку «care». Символы стирки/глажки
          выбираются пикером «care symbols». Страна — из этикетки «origin», если есть.
        </Text>
      </div>

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no labels
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <LabelRow key={f.id} index={index} onRemove={() => remove(index)} />
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyLabel })}
      >
        add label
      </Button>
    </div>
  );
}
