import { common_Material } from 'api/proto-http/admin';
import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import { careCodes } from 'components/managers/product/components/care/care-codes';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { materialCompositionCode } from 'components/managers/materials/components/material-code';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { techCardLabelTypeOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { TooltipProvider } from 'ui/components/tooltip';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { generateCareLabel, hasAnyComposition } from 'utils/care-label';
import { useBomItemIdOptions } from './bom-line-picker';
import { LabelsChecklist } from './labels-checklist';
import { TechCardFormData, wireInt } from './schema';
import { labelAttachmentOptions, labelPlacementOptions } from './tech-card-options';

const CARE = 'TECH_CARD_LABEL_TYPE_CARE';
const ORIGIN = 'TECH_CARD_LABEL_TYPE_ORIGIN';

// The brand line printed at the top of the care/composition tag. It is the company mark, not a
// per-card field, so it is a constant here rather than read from a label row.
const BRAND = 'GRBPWR';

const emptyLabel = {
  labelType: 'TECH_CARD_LABEL_TYPE_MAIN',
  content: '',
  placement: '',
  attachment: '',
  size: '',
  note: '',
  // 0 = not linked to a BOM line. Present so a freshly appended row starts on the picker's
  // "— not linked —" option instead of an empty trigger (the field is only defaulted by the schema).
  bomItemId: 0,
};

// Labels carry no image, so the "thumbnail" is a typographic square badge of the label type — it
// keeps the card scannable at a glance (which kind of label this card is).
const LABEL_TYPE_BADGE: Record<string, string> = {
  TECH_CARD_LABEL_TYPE_MAIN: 'main',
  TECH_CARD_LABEL_TYPE_SIZE: 'size',
  TECH_CARD_LABEL_TYPE_CARE: 'care',
  TECH_CARD_LABEL_TYPE_ORIGIN: 'orig',
  TECH_CARD_LABEL_TYPE_FLAG: 'flag',
  TECH_CARD_LABEL_TYPE_HANGTAG: 'tag',
  TECH_CARD_LABEL_TYPE_BARCODE: 'code',
  TECH_CARD_LABEL_TYPE_SPECIAL: 'spec',
};

// One label card. A CARE label gets the care-instruction picker for its content (laundry
// symbols); the composition text lives in its note. Other types use a free-text content. One clean
// uniform grid — no per-row pictogram, so the fields align instead of stepping around a badge.
function LabelRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control } = useFormContext<TechCardFormData>();
  const labelType = useWatch({ control, name: `labels.${index}.labelType` }) as string;
  const isCare = labelType === CARE;
  // Which BOM article this label is printed on (§2.8). The wire carries the BOM line's server id,
  // so the picker offers ids — never a number the operator has to know, and never one belonging to
  // another card, which the backend now rejects outright.
  const bomItemId =
    (useWatch({ control, name: `labels.${index}.bomItemId` }) as number | undefined) ?? 0;
  const { options: bomItemOptions, dangling: bomItemDangling } = useBomItemIdOptions(bomItemId);

  return (
    <div id={`label-row-${index}`} className='border border-borderColor bg-bgColor p-2'>
      <div className='mb-1.5 flex items-center gap-2'>
        <Pill tone='ink'>{LABEL_TYPE_BADGE[labelType] ?? 'lbl'}</Pill>
        <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
          label {index + 1}
        </Text>
        <span className='ml-auto'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            aria-label='remove label'
            onClick={onRemove}
          >
            ✕
          </Button>
        </span>
      </div>

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        <SelectField
          name={`labels.${index}.labelType`}
          label='type *'
          items={techCardLabelTypeOptions}
        />
        {isCare ? (
          <div className='col-span-2 sm:col-span-3'>
            <CarePicker name={`labels.${index}.content`} label='care symbols' />
          </div>
        ) : (
          <div className='col-span-1 sm:col-span-2'>
            <InputField name={`labels.${index}.content`} label='content / ref' />
          </div>
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
        <div>
          <SelectField
            name={`labels.${index}.bomItemId`}
            label='материал (BOM)'
            items={bomItemOptions}
            valueAsNumber
          />
          {bomItemDangling && (
            <Text size='micro' className='text-error'>
              строки BOM больше нет — сохранение будет отклонено, выберите другую или «not linked»
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

type BomComp = { section?: string; composition?: string; materialId?: number };

// Backfill a BOM line's composition from its linked material when the line itself carries none. A
// line linked to a structurally-composed material before its blend existed (or snapshotted from an
// empty legacy string) has a blank composition string, which would leave care generation and the
// preview empty even though the material's fibres are set — this reads the material's derived
// composition code (structured entries → parseable JSON) as the fallback.
function withMaterialComposition<T extends BomComp>(bomItems: T[], materials: common_Material[]): T[] {
  return bomItems.map((b) => {
    if (b.composition?.trim() || !b.materialId) return b;
    const m = materials.find((mm) => wireInt(mm.id) === b.materialId);
    const derived = m ? materialCompositionCode(m) : '';
    return derived ? { ...b, composition: derived } : b;
  });
}

// A live printed-label preview, composed from the SAME react-hook-form data the checklist reads
// (bomItems + labels), so it can never word the tag differently from the spec. Nothing here writes:
// it recomposes on every keystroke in the BOM, the CarePicker or the origin label, which is what
// lets the operator catch a stale blend or a wrong symbol before the order goes to print.
function LabelPreview() {
  const { control } = useFormContext<TechCardFormData>();
  const vocabulary = useCareVocabulary();
  const { data: materialsData } = useMaterials('', true);
  const bomItemsRaw = (useWatch({ control, name: 'bomItems' }) ?? []) as BomComp[];
  const bomItems = withMaterialComposition(bomItemsRaw, materialsData?.materials ?? []);
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as Array<{
    labelType?: string;
    content?: string;
  }>;

  const origin = labels.find((l) => l.labelType === ORIGIN)?.content?.trim() || undefined;
  const careContent = labels.find((l) => l.labelType === CARE)?.content ?? '';
  const symbolCodes = careCodes(careContent);
  // Same wording the storefront and the printed tag use — the dictionary's canonical care prose.
  const careProse = vocabulary.prose(careContent);

  // The composition / care text is the EXISTING generator's output, split so the "Made in …" line
  // can print at the foot of the tag (as it does on a real care label) below the symbols.
  const composed = generateCareLabel(bomItems, origin)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const madeIn = composed.find((l) => /^made in/i.test(l));
  const compositionLines = composed.filter((l) => !/^made in/i.test(l));

  const empty = compositionLines.length === 0 && symbolCodes.length === 0 && !madeIn;

  return (
    <div className='flex flex-col'>
      <GroupLabel flush>label preview</GroupLabel>
      <div className='border border-borderColor bg-bgColor p-3'>
        {empty ? (
          <Text size='micro' variant='label' className='text-center'>
            заполните состав (BOM), символы ухода или origin — здесь появится этикетка как на печать
          </Text>
        ) : (
          <div className='mx-auto flex max-w-[240px] flex-col items-center gap-2 text-center'>
            <Text component='span' tracking='label' className='font-bold uppercase'>
              {BRAND}
            </Text>

            {compositionLines.length > 0 ? (
              <div className='flex flex-col items-center gap-0.5'>
                {compositionLines.map((line) => (
                  <Text key={line} size='micro' component='span' className='uppercase'>
                    {line}
                  </Text>
                ))}
              </div>
            ) : (
              <Text size='micro' variant='label' component='span'>
                — no composition —
              </Text>
            )}

            {symbolCodes.length > 0 && (
              <div className='flex flex-wrap items-center justify-center gap-1.5'>
                {symbolCodes.map((code) =>
                  CARE_ARTWORK[code] ? (
                    <img
                      key={code}
                      src={CARE_ARTWORK[code]}
                      alt={code}
                      title={code}
                      className='size-5'
                    />
                  ) : (
                    <Text
                      key={code}
                      size='nano'
                      variant='label'
                      component='span'
                      className='uppercase'
                    >
                      {code}
                    </Text>
                  ),
                )}
              </div>
            )}

            {careProse && (
              <Text size='micro' variant='label' component='span'>
                {careProse}
              </Text>
            )}

            {madeIn && (
              <Text size='micro' variant='label' component='span' className='uppercase'>
                {madeIn}
              </Text>
            )}
          </div>
        )}
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
  const { data: materialsData } = useMaterials('', true);

  // Which row the checklist just sent us to. `nonce` re-arms the effect when the SAME row is asked
  // for twice, so a second click scrolls again instead of sitting silent.
  const [jump, setJump] = useState<{ index: number; nonce: number } | null>(null);
  useEffect(() => {
    if (!jump) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`label-row-${jump.index}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input, select, [role="combobox"], button')?.focus?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [jump]);

  // The checklist's one-click fix: reuse an existing row of that type if there is one (a blank
  // "main" row already waiting), otherwise append a fresh one — then walk to it either way.
  const addLabel = (labelType: string) => {
    const rows = (getValues('labels') ?? []) as Array<{ labelType?: string }>;
    const existing = rows.findIndex((l) => l.labelType === labelType);
    const index = existing >= 0 ? existing : rows.length;
    if (existing < 0) append({ ...emptyLabel, labelType });
    setJump((prev) => ({ index, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  // The three packaging-derived checklist rows aren't labels — walk to the packaging spec, which
  // owns the anchor (packaging-field.tsx).
  const openPackaging = () => {
    document
      .getElementById('packaging-spec')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const generateCare = () => {
    // Backfill each line's composition from its linked material so a structurally-composed material
    // generates its care label even when the line's own composition string is still blank.
    const bomItems = withMaterialComposition(
      (getValues('bomItems') ?? []) as BomComp[],
      materialsData?.materials ?? [],
    );
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
    <TooltipProvider delayDuration={200} skipDelayDuration={150}>
      <div className='flex flex-col gap-3'>
        {/* PRIMARY — creating labels: the toolbar + the label cards. This is the work; the preview
            and the completeness checklist are secondary and sit below, separated by a rule. */}
        <Toolbar>
          <Button type='button' variant='secondary' size='sm' onClick={generateCare}>
            сгенерировать состав / уход
          </Button>
          <ToolbarSpacer />
          <Button type='button' variant='main' size='sm' onClick={() => append({ ...emptyLabel })}>
            + label
          </Button>
        </Toolbar>
        <Text size='micro' variant='label'>
          собирает состав из BOM (composition) → пишет в этикетку «care». Символы стирки/глажки
          выбираются пикером «care symbols». Страна — из этикетки «origin», если есть.
        </Text>

        {fields.length === 0 ? (
          <Text size='micro' variant='label'>
            no labels
          </Text>
        ) : (
          <div className='flex flex-col gap-1.5'>
            {fields.map((f, index) => (
              <LabelRow key={f.id} index={index} onRemove={() => remove(index)} />
            ))}
          </div>
        )}

        {/* SECONDARY — the printed-label preview + a compact completeness checklist, separated from
            the editing above so label creation stays the focus. */}
        <div className='flex flex-col gap-2 border-t border-hairline pt-3'>
          <LabelPreview />
          <LabelsChecklist onAddLabel={addLabel} onOpenPackaging={openPackaging} />
        </div>
      </div>
    </TooltipProvider>
  );
}
