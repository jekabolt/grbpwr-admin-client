import { cn } from 'lib/utility';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';

// The labeling & packaging completeness view: a COMPACT, secondary status board — no garment
// silhouette, no pins, no glyphs, no big rows. Each recommended item is a small chip grouped into
// the three layers a garment carries (on-garment labels, hangtags & external, packaging): present
// reads plain, missing reads red and is one click from being fixed, optional reads muted.
//
// Pure GUIDANCE, not a validation gate: it reads the live RHF form (labels[] + packaging.*) and
// nothing here blocks a save. It is deliberately small — the label editing above it is the work.

const TYPE = {
  MAIN: 'TECH_CARD_LABEL_TYPE_MAIN',
  SIZE: 'TECH_CARD_LABEL_TYPE_SIZE',
  CARE: 'TECH_CARD_LABEL_TYPE_CARE',
  ORIGIN: 'TECH_CARD_LABEL_TYPE_ORIGIN',
  FLAG: 'TECH_CARD_LABEL_TYPE_FLAG',
  HANGTAG: 'TECH_CARD_LABEL_TYPE_HANGTAG',
  BARCODE: 'TECH_CARD_LABEL_TYPE_BARCODE',
  SPECIAL: 'TECH_CARD_LABEL_TYPE_SPECIAL',
} as const;

type LabelRow = {
  labelType?: string;
  content?: string;
  placement?: string;
  attachment?: string;
  size?: string;
  note?: string;
};

type Packaging = {
  polybag?: string;
  inserts?: string;
  notes?: string;
  foldingMethod?: string;
  bagSticker?: string;
};

type CheckItem = {
  key: string;
  name: string;
  /** Human tooltip — where the value comes from + the placement/packaging detail. */
  hint: string;
  present: boolean;
  /** Set only for the label types the chip can add — a packaging item walks to the packaging spec. */
  labelType?: string;
  /** Recommended-but-not-required (barcode / flag / special): absent reads muted, never red, and
   *  never counts against the N / M summary. */
  optional?: boolean;
};

// A label row counts only when it's actually been filled in — a bare row left on the default MAIN
// type shouldn't tick "main label specified".
const isUsed = (l: LabelRow) =>
  [l.content, l.placement, l.attachment, l.size, l.note].some((v) => !!v?.trim());

const matches = (value: string | undefined, re: RegExp) => !!value && re.test(value);

const joinDetail = (...parts: Array<string | undefined>) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' · ');

export function LabelsChecklist({
  onAddLabel,
  onOpenPackaging,
}: {
  /** Adds (and focuses) a label row of this type — the one click that fixes a red chip. */
  onAddLabel?: (labelType: string) => void;
  /** Walks to the packaging spec — the three packaging-derived chips aren't labels. */
  onOpenPackaging?: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as LabelRow[];
  const packaging = (useWatch({ control, name: 'packaging' }) ?? {}) as Packaging;

  const rowOfType = (t: string) => labels.find((l) => l.labelType === t && isUsed(l));
  const careLabel = labels.find((l) => l.labelType === TYPE.CARE);

  const labelItem = (
    key: string,
    name: string,
    labelType: string,
    source: string,
    optional = false,
  ): CheckItem => {
    const row = rowOfType(labelType);
    return {
      key,
      name,
      labelType,
      optional,
      present: !!row,
      hint: joinDetail(source, row ? joinDetail(row.attachment, row.placement) : 'not specified'),
    };
  };

  // Packaging signals come from the packaging SPEC fields the packaging-field owns; the dust bag /
  // greeting card also live as loose "inserts", so we scan the free-text packaging fields.
  const packagingText = [
    packaging.inserts,
    packaging.notes,
    packaging.foldingMethod,
    packaging.bagSticker,
  ]
    .filter(Boolean)
    .join(' · ');
  // The "none" arm must know the CURRENT default (`no polybag`, tech-card-options) as well as the
  // legacy Cyrillic one still stored on older cards: this is a NEGATIVE matcher, so a value it
  // fails to recognise reads as «a polybag is specified» — the chip would tick green on the one
  // answer that means the opposite.
  const polybagPresent =
    matches(packaging.polybag, /.+/) &&
    !matches(packaging.polybag, /без пакет|no polybag|no bag|none/i);
  const greetingCardPresent = matches(
    packagingText,
    /card|карт|открыт|привет|thank|greet|благодар/i,
  );
  const dustBagPresent = matches(
    `${packagingText} ${packaging.polybag ?? ''}`,
    /пыльник|dust\s*-?\s*bag|dustbag|мешоч|чехол/i,
  );

  const packagingItem = (key: string, name: string, present: boolean): CheckItem => ({
    key,
    name,
    present,
    hint: joinDetail('packaging', present ? 'specified' : 'not specified'),
  });

  // LAYER 1 — on the garment (all recommended). LAYER 2 — hangtags & external (hangtag recommended;
  // barcode/flag/special optional). LAYER 3 — packaging (walks to the packaging spec, never a label).
  const onGarment: CheckItem[] = [
    labelItem('main', 'main', TYPE.MAIN, 'manual'),
    labelItem('size', 'size', TYPE.SIZE, 'manual'),
    labelItem('care', 'care', TYPE.CARE, 'care symbols'),
    {
      key: 'composition',
      name: 'composition',
      labelType: TYPE.CARE,
      present: !!careLabel?.note?.trim(),
      hint: joinDetail(
        'composition',
        careLabel?.note?.trim() ? 'in the care label' : 'not specified',
      ),
    },
    labelItem('origin', 'origin', TYPE.ORIGIN, 'manual'),
  ];
  const external: CheckItem[] = [
    labelItem('hangtag', 'hangtag', TYPE.HANGTAG, 'manual'),
    labelItem('barcode', 'barcode', TYPE.BARCODE, 'manual', true),
    labelItem('flag', 'flag', TYPE.FLAG, 'manual', true),
    labelItem('special', 'special', TYPE.SPECIAL, 'manual', true),
  ];
  const packagingItems: CheckItem[] = [
    packagingItem('polybag', 'polybag', polybagPresent),
    packagingItem('greeting', 'greeting card', greetingCardPresent),
    packagingItem('dustbag', 'dust bag', dustBagPresent),
  ];

  const groups: { title: string; items: CheckItem[] }[] = [
    { title: 'on-garment', items: onGarment },
    { title: 'external', items: external },
    { title: 'packaging', items: packagingItems },
  ];

  // The summary counts only the recommended (non-optional) items.
  const counted = [...onGarment, ...external, ...packagingItems].filter((i) => !i.optional);
  const present = counted.filter((i) => i.present).length;

  // A red chip is one click from being fixed: a label type appends (and focuses) its row, a
  // packaging item walks to the packaging spec.
  const fix = (item: CheckItem) => {
    if (item.labelType) onAddLabel?.(item.labelType);
    else onOpenPackaging?.();
  };
  const canFix = (item: CheckItem) => (item.labelType ? !!onAddLabel : !!onOpenPackaging);

  // One compact chip: name + a status glyph. Present is plain, an absent optional is muted, an
  // absent recommended is red and — when fixable — a button (the whole chip is the click target).
  const renderChip = (item: CheckItem) => {
    const missing = !item.present && !item.optional;
    const glyph = item.present ? '✓' : item.optional ? '·' : '✕';
    const chipClass = cn(
      'inline-flex items-center gap-1 border px-1 py-px text-micro uppercase leading-none tracking-label',
      item.present
        ? 'border-borderColor text-textColor'
        : item.optional
          ? 'border-hairline text-labelColor'
          : 'border-error text-error',
    );
    if (missing && canFix(item)) {
      return (
        <button
          key={item.key}
          type='button'
          onClick={() => fix(item)}
          title={item.labelType ? 'add this label and jump to it' : 'open the packaging spec'}
          className={cn(chipClass, 'transition-colors hover:bg-bgZebra')}
        >
          {item.name}
          <span aria-hidden>{glyph}</span>
        </button>
      );
    }
    return (
      <span key={item.key} title={item.hint} className={chipClass}>
        {item.name}
        <span aria-hidden>{glyph}</span>
      </span>
    );
  };

  return (
    <div className='border border-borderColor bg-bgColor p-2'>
      <div className='mb-1.5 flex items-baseline gap-2'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          checklist
        </Text>
        <Text size='micro' variant='label' component='span' className='tabular-nums'>
          {present} / {counted.length}
        </Text>
        <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
          hint
        </Text>
      </div>
      <div className='flex flex-col gap-1.5'>
        {groups.map((group) => (
          <div key={group.title} className='flex flex-wrap items-center gap-1'>
            <Text
              size='nano'
              variant='label'
              component='span'
              className='w-14 shrink-0 uppercase text-labelColor'
            >
              {group.title}
            </Text>
            {group.items.map(renderChip)}
          </div>
        ))}
      </div>
    </div>
  );
}
