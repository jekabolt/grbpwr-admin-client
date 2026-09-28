import { common_Material } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import { careCodes } from 'components/managers/product/components/care/care-codes';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { materialCompositionCode } from 'components/managers/materials/components/material-code';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardLabelTypeOptions } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useState } from 'react';
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
import {
  defaultCareColorway,
  generateCareLabel,
  hasAnyComposition,
  type CareLabelText,
} from 'utils/care-label';
import {
  adaptFibers,
  adaptMaterials,
  adaptUsages,
  originCountryText,
} from '../care-labels/adapter';
import type { LabelBomLine } from '../care-labels/composition-resolver';
import { hole, isBlocking, type Hole } from '../care-labels/holes';
import { useBomItemIdOptions } from './bom-line-picker';
import { useCareDrift } from './care-drift';
import { LabelsChecklist } from './labels-checklist';
import { TechCardFormData, wireInt } from './schema';
import { labelAttachmentOptions, labelPlacementOptions } from './tech-card-options';

const CARE = 'TECH_CARD_LABEL_TYPE_CARE';
const ORIGIN = 'TECH_CARD_LABEL_TYPE_ORIGIN';

// The brand line printed at the top of the care/composition tag. It is the company mark, not a
// per-card field, so it is a constant here rather than read from a label row.
const BRAND = 'GRBPWR';

// Exported because the header's care picker creates the care label when a card has none — it must
// seed the SAME row shape this tab appends, or the two paths drift the moment a field is added.
export const emptyLabel = {
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
// The door to the care-label print screen (`/tech-cards/:id/care-labels`). It prints the SAVED card
// in a new tab — the screen reads GetTechCard, not this form — so an unsaved card has no door at
// all: a button that would print something other than what is on screen is worse than none
// (the same rule as the assembly order's `print ⎙` in operations-field).
function openCareLabels(techCardId: number) {
  window.open(ROUTES.techCardCareLabels.replace(':id', String(techCardId)), '_blank', 'noopener');
}

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
function LabelRow({
  index,
  onRemove,
  techCardId,
}: {
  index: number;
  onRemove: () => void;
  techCardId?: number;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const labelType = useWatch({ control, name: `labels.${index}.labelType` }) as string;
  const isCare = labelType === CARE;
  // The care label is the card's, but the STOREFRONT care is the style's, written only through
  // UpdateStyle (products:write). For an account without that grant the label saves and the
  // storefront keeps what it had — said here, where the label is edited (25.09 CL-C, Codex M2).
  const { canWrite } = usePermissions();
  const storefrontCareLocked = isCare && !canWrite(SECTION.products);
  // …and when the storefront's care is NOT this label (a legacy card, or a label edited without
  // that grant), StyleFactsField knows it and says so here, with the one door that stages the label
  // as the style's care (`care-drift.ts`; nothing is written on open). Once staged, the row says
  // that instead, with «cancel». Focus follows the door: the button that was pressed unmounts, so
  // focus goes to what replaced it — the staged line, or the door again after «cancel».
  const careDrift = useCareDrift((s) => (isCare && s.drift?.row === index ? s.drift : null));
  const careNoteId = `label-row-${index}-care-note`;
  const careStagedId = `label-row-${index}-care-staged`;
  const careSyncId = `label-row-${index}-care-sync`;
  const [careFocus, setCareFocus] = useState<'staged' | 'door' | null>(null);
  const careState = careDrift?.state;
  useEffect(() => {
    if (careFocus === 'staged' && careState === 'staged') {
      document.getElementById(careStagedId)?.focus();
      setCareFocus(null);
    } else if (careFocus === 'door' && careState === 'differs') {
      document.getElementById(careSyncId)?.focus();
      setCareFocus(null);
    } else if (careFocus && !careState) {
      // The row has nothing to say any more: the hand-off is dropped, not kept for a later state.
      setCareFocus(null);
    }
  }, [careFocus, careState, careStagedId, careSyncId]);
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
        <span className='ml-auto flex items-center gap-1.5'>
          {isCare && techCardId ? (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-care-labels-door='row'
              title='print the care labels of the SAVED card for every colourway (opens in a new tab)'
              onClick={() => openCareLabels(techCardId)}
            >
              print care labels ⎙
            </Button>
          ) : null}
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
            {careDrift?.state === 'differs' && (
              <div className='flex items-center gap-2' data-storefront-care-drift=''>
                <Text
                  id={careNoteId}
                  size='micro'
                  variant='label'
                  component='span'
                  className='min-w-0 flex-1'
                >
                  storefront care differs from this label
                  {careDrift.cannot ? ` — cannot sync: ${careDrift.cannot}` : ''}
                </Text>
                {careDrift.sync && (
                  <Button
                    id={careSyncId}
                    type='button'
                    variant='secondary'
                    size='xs'
                    className='shrink-0 whitespace-nowrap'
                    aria-label='stage storefront care from this label'
                    aria-describedby={careNoteId}
                    onClick={() => {
                      careDrift.sync?.();
                      setCareFocus('staged');
                    }}
                  >
                    sync ›
                  </Button>
                )}
              </div>
            )}
            {careDrift?.state === 'staged' && (
              <div className='flex items-center gap-2' data-storefront-care-staged=''>
                <Text
                  id={careStagedId}
                  tabIndex={-1}
                  size='micro'
                  variant='label'
                  component='span'
                  className='min-w-0 flex-1'
                >
                  storefront care staged
                </Text>
                {careDrift.cancel && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    className='shrink-0 whitespace-nowrap'
                    aria-label='cancel the staged storefront care'
                    aria-describedby={careStagedId}
                    onClick={() => {
                      careDrift.cancel?.();
                      setCareFocus('door');
                    }}
                  >
                    cancel
                  </Button>
                )}
              </div>
            )}
            {storefrontCareLocked && (
              <Text size='micro' variant='label' data-storefront-care-locked=''>
                storefront care needs products:write
              </Text>
            )}
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
        <InputField
          name={`labels.${index}.note`}
          label={isCare ? 'composition / care text' : 'note'}
        />
        <div>
          <SelectField
            name={`labels.${index}.bomItemId`}
            label='material (BOM)'
            items={bomItemOptions}
            valueAsNumber
          />
          {bomItemDangling && (
            <Text size='micro' className='text-error'>
              this BOM line no longer exists — the save will be rejected, pick another one or “not
              linked”
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

type BomComp = {
  section?: string;
  purpose?: string;
  labelPart?: string;
  composition?: string;
  materialId?: number;
  lineKey?: string;
  name?: string;
  unit?: string;
};
type LabelRowLite = { labelType?: string; content?: string };

// Backfill a BOM line's composition from its linked material when the line itself carries none. A
// line linked to a structurally-composed material before its blend existed (or snapshotted from an
// empty legacy string) has a blank composition string, which would leave care generation and the
// preview empty even though the material's fibres are set — this reads the material's derived
// composition code (structured entries → parseable JSON) as the fallback.
function withMaterialComposition<T extends BomComp>(
  bomItems: T[],
  materials: common_Material[],
): T[] {
  return bomItems.map((b) => {
    if (b.composition?.trim() || !b.materialId) return b;
    const m = materials.find((mm) => wireInt(mm.id) === b.materialId);
    const derived = m ? materialCompositionCode(m) : '';
    return derived ? { ...b, composition: derived } : b;
  });
}

// СОСТАВ ДЛЯ ВКЛАДКИ — ТЕМ ЖЕ РЕЗОЛВЕРОМ, ЧТО ЛЕНТА (план §5.4). BOM — живой из формы (правка строки
// видна сразу, без сохранения); колорвей — СОХРАНЁННЫЙ (форма колорвеев не ведёт, RHF `colorways`
// всегда пуст): дефолтный — первый ACTIVE, иначе первый, его пины артикулов и расход — веса; без
// колорвеев (или без сохранённой карточки) — пустые usages, то есть веса 1 и материал слота.
// Страна — ORIGIN-этикетка формы, «Made in» снимается (`originCountryText`), чтобы не вышло
// «Made in Made in Poland».
//
// ⚠ id ЧЕРЕЗ wireInt. int64 с провода приезжает СТРОКОЙ («501»), а форма держит число: ключи
// каталога и пины usages приводит к числу адаптер ленты (`adaptMaterials` / `adaptUsages`), строки
// формы — здесь; иначе материал строки не находится вовсе, а «пин того же артикула» выглядит пином
// ДРУГОГО и закрывает часть дырой.
//
// «НЕ ЗАГРУЗИЛОСЬ» — НЕ «ПУСТО» (как у ленты, holes.ts). Каталог, который упал или ещё едет, — это не
// пустой каталог: без него резолвер законно берёт снимок состава из строки BOM, а снимок бывает
// устаревшим, и «generate» записал бы в CARE неверный юридический состав. Пока каталог и словарь не
// приехали УСПЕШНО, состав не собирается вовсе: дыры `materials-unavailable` / `dictionary-unavailable`
// — генератор отказывает, превью их показывает. Успешный пустой ответ — законный `[]`.
function useCareComposer(techCardId: number | undefined) {
  const materialsQuery = useMaterials('', true);
  const materialsOk = materialsQuery.isSuccess;
  const materialsData = materialsQuery.data;
  const { dictionary, error: dictionaryError } = useDictionary();
  const dictionaryOk = !!dictionary && !dictionaryError;
  const { data: savedCard } = useTechCard(techCardId);
  return useCallback(
    (bomRows: BomComp[], labels: LabelRowLite[]): CareLabelText => {
      const unavailable: Hole[] = [];
      if (!dictionaryOk) {
        unavailable.push(
          hole(
            'dictionary-unavailable',
            'the dictionary did not load (still loading or the request failed) — the composition cannot be generated; reload the page',
          ),
        );
      }
      if (!materialsOk) {
        unavailable.push(
          hole(
            'materials-unavailable',
            'the materials catalogue did not load (still loading or the request failed) — the composition cannot be generated; reload the page',
          ),
        );
      }
      if (unavailable.length) return { text: '', parts: [], holes: unavailable };
      const materialsRaw = materialsData?.materials ?? [];
      const bom: LabelBomLine[] = withMaterialComposition(bomRows, materialsRaw).map((b, i) => ({
        lineKey: b.lineKey || `row-${i}`,
        section: b.section,
        purpose: b.purpose,
        labelPart: b.labelPart ?? null,
        materialId: wireInt(b.materialId) || undefined,
        composition: b.composition,
        name: b.name ?? '',
        unit: b.unit,
      }));
      // Каталог и usages — через адаптер ленты: id с провода он приводит к числу сам, а легаси-usage
      // без bom_line_key находит строку по bom_item_id СОХРАНЁННОЙ карточки.
      const materials = adaptMaterials(materialsRaw);
      const colorway = defaultCareColorway(savedCard?.colorways);
      const usages = colorway ? adaptUsages(colorway, savedCard?.techCard?.bomItems) : [];
      return generateCareLabel({
        colorwayId: colorway ? wireInt(colorway.colorwayId) : undefined,
        bom,
        usages,
        materials,
        fibers: adaptFibers(dictionary?.fibers),
        originCountry: originCountryText(labels.find((l) => l.labelType === ORIGIN)?.content),
      });
    },
    [materialsOk, materialsData, dictionaryOk, dictionary, savedCard],
  );
}

const UNAVAILABLE = new Set(['materials-unavailable', 'dictionary-unavailable']);

// A live printed-label preview, composed from the SAME react-hook-form data the checklist reads
// (bomItems + labels), so it can never word the tag differently from the spec. Nothing here writes:
// it recomposes on every keystroke in the BOM, the CarePicker or the origin label, which is what
// lets the operator catch a stale blend or a wrong symbol before the order goes to print.
function LabelPreview({ techCardId }: { techCardId?: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const vocabulary = useCareVocabulary();
  const compose = useCareComposer(techCardId);
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomComp[];
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as LabelRowLite[];

  const careContent = labels.find((l) => l.labelType === CARE)?.content ?? '';
  const symbolCodes = careCodes(careContent);
  // Same wording the storefront and the printed tag use — the dictionary's canonical care prose.
  const careProse = vocabulary.prose(careContent);

  // The composition / care text is the ONE generator's output (the label resolver, default
  // colourway), split so the "Made in …" line can print at the foot of the tag (as it does on a
  // real care label) below the symbols.
  const result = compose(bomItems, labels);
  // Что мешает составу (блоки: не загрузилось, волокна нет в словаре …) — прямо под превью.
  const shownHoles = result.holes.filter(isBlocking);
  const composed = result.text
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
            fill in the composition (BOM), the care symbols or origin — the label will appear here
            as it prints
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
      {shownHoles.length > 0 && (
        <div className='flex flex-col gap-0.5 pt-1' data-care-preview-holes=''>
          {shownHoles.map((h, i) => (
            <Text
              key={`${h.code}-${i}`}
              size='micro'
              variant={h.level === 'block' ? 'errorLabel' : 'label'}
              data-care-preview-hole={h.code}
              data-hole-level={h.level}
            >
              {h.level}: {h.message}
            </Text>
          ))}
        </div>
      )}
    </div>
  );
}

// Labels / tags (Sheet «Этикетки и упаковка»). label_type is required on each. The care
// generator builds a composition block from the BOM into the CARE label's note; the laundry
// symbols are chosen with the CarePicker on the CARE label's content.
export function LabelsField({
  onMissingComposition,
  techCardId,
}: {
  onMissingComposition?: () => void;
  /** The SAVED card's id; absent on an unsaved card, which then has no print door. */
  techCardId?: number;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'labels' });
  const { showMessage } = useSnackBarStore();
  const compose = useCareComposer(techCardId);

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
    const bomItems = (getValues('bomItems') ?? []) as BomComp[];
    const labels = (getValues('labels') ?? []) as LabelRowLite[];
    const { text, holes } = compose(bomItems, labels);
    // Каталог или словарь не приехали — состав не собирается и ничего не пишется (ни снимок из BOM,
    // ни переход в BOM: чинить там нечего, нужен ответ сервера).
    const unavailable = holes.find((h) => UNAVAILABLE.has(h.code));
    if (unavailable) {
      showMessage(`the composition is not generated: ${unavailable.message}`, 'error');
      return;
    }
    // Блок резолвера говорит точнее двух старых фраз: КАКАЯ строка и ЧТО с ней (волокна нет в
    // словаре, смесевой код, пин артикула без состава…).
    const block = holes.find(isBlocking);
    if (!text) {
      if (block) {
        showMessage(`no composition for the label: ${block.message}`, 'error');
        onMissingComposition?.();
      } else if (hasAnyComposition(bomItems)) {
        // composition strings exist but yielded no %s — most likely percentages weren't set
        showMessage(
          'composition is set but without percentages: in the composition (BOM) field press “select” and set a % for every material',
          'error',
        );
        onMissingComposition?.();
      } else {
        showMessage(
          'no composition: on the BOM tab, in the composition field, press “select” and pick materials with percentages (opening BOM)',
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
    // Записано, но часть строк не дошла до ленты (одна строка с неизвестным волокном не прячет
    // остальные части) — сказать об этом, а не рапортовать успех.
    if (block) {
      showMessage(
        `the composition is written into the “care” label, but not all of it: ${block.message}`,
        'error',
      );
      return;
    }
    showMessage(
      'the composition is written into the “care” label (the “composition / care text” field)',
      'success',
    );
  };

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={150}>
      <div className='flex flex-col gap-3'>
        {/* PRIMARY — creating labels: the toolbar + the label cards. This is the work; the preview
            and the completeness checklist are secondary and sit below, separated by a rule. */}
        <Toolbar>
          <Button type='button' variant='secondary' size='sm' onClick={generateCare}>
            generate composition / care
          </Button>
          {techCardId ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              data-care-labels-door='toolbar'
              title='print the care labels of the SAVED card for every colourway (opens in a new tab)'
              onClick={() => openCareLabels(techCardId)}
            >
              print care labels ⎙
            </Button>
          ) : null}
          <ToolbarSpacer />
          <Button type='button' variant='main' size='sm' onClick={() => append({ ...emptyLabel })}>
            + label
          </Button>
        </Toolbar>
        <Text size='micro' variant='label'>
          collects the composition from BOM (composition) → writes it into the “care” label.
          wash/iron symbols are picked with the “care symbols” picker. the country comes from the
          “origin” label, if there is one.
        </Text>

        {fields.length === 0 ? (
          <Text size='micro' variant='label'>
            no labels
          </Text>
        ) : (
          <div className='flex flex-col gap-1.5'>
            {fields.map((f, index) => (
              <LabelRow
                key={f.id}
                index={index}
                onRemove={() => remove(index)}
                techCardId={techCardId}
              />
            ))}
          </div>
        )}

        {/* SECONDARY — the printed-label preview + a compact completeness checklist, separated from
            the editing above so label creation stays the focus. */}
        <div className='flex flex-col gap-2 border-t border-hairline pt-3'>
          <LabelPreview techCardId={techCardId} />
          <LabelsChecklist onAddLabel={addLabel} onOpenPackaging={openPackaging} />
        </div>
      </div>
    </TooltipProvider>
  );
}
