import { cn } from 'lib/utility';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { SpecGlyph, SpecGlyphKind } from './label-placement-pictogram';
import { TechCardFormData } from './schema';

// Completeness checklist for the labeling & packaging spec (top of the LABELS & PKG tab). Pure
// GUIDANCE, not a validation gate: it reads the live RHF form (labels[] + packaging.*) and shows,
// as scannable tiles, which recommended items are already specified (☑) and which are still
// missing (☐), so the operator can see the gaps at a glance. Nothing here blocks a save.
//
// Everything is derived from form state the labels/packaging fields already own, so it stays in
// sync without touching the tab shell or the assembly/recipe RPCs. "Present" means a label of that
// type is actually filled in, or the matching packaging field carries a value — never just an
// empty row.

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
  hint: string;
  glyph: SpecGlyphKind;
  present: boolean;
};

// A label row counts only when it's actually been filled in — a bare row left on the default MAIN
// type shouldn't tick "main label specified".
const isUsed = (l: LabelRow) =>
  [l.content, l.placement, l.attachment, l.size, l.note].some((v) => !!v?.trim());

const matches = (value: string | undefined, re: RegExp) => !!value && re.test(value);

// A small outlined-checkbox mark (present = box + tick, missing = dashed empty box). Geometric SVG
// rather than the ☑/☐ glyphs so it stays crisp and identical across platforms; colour comes from
// the tile (full contrast when present, muted when missing).
function StatusMark({ present }: { present: boolean }) {
  return (
    <svg
      viewBox='0 0 16 16'
      className='h-4 w-4 shrink-0'
      fill='none'
      stroke='currentColor'
      aria-hidden='true'
      xmlns='http://www.w3.org/2000/svg'
    >
      <rect
        x={1.5}
        y={1.5}
        width={13}
        height={13}
        strokeWidth={present ? 1.5 : 1.3}
        strokeDasharray={present ? undefined : '2.5 2'}
      />
      {present && (
        <path
          d='M4.5,8.5 L7,11 L11.5,5.5'
          strokeWidth={1.8}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      )}
    </svg>
  );
}

function ChecklistTile({ item }: { item: CheckItem }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 border p-2',
        item.present
          ? 'border-textColor text-textColor'
          : 'border-dashed border-textInactiveColor text-textInactiveColor',
      )}
      aria-label={`${item.name}: ${item.present ? 'present' : 'missing'}`}
    >
      <StatusMark present={item.present} />
      <div className='min-w-0 flex-1'>
        <Text variant='uppercase' size='small' className='truncate'>
          {item.name}
        </Text>
        <Text size='small' className='truncate'>
          {item.hint}
        </Text>
      </div>
      <SpecGlyph kind={item.glyph} className='mt-0.5 shrink-0' />
    </div>
  );
}

export function LabelsChecklist() {
  const { control } = useFormContext<TechCardFormData>();
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as LabelRow[];
  const packaging = (useWatch({ control, name: 'packaging' }) ?? {}) as Packaging;

  const usedOfType = (t: string) => labels.some((l) => l.labelType === t && isUsed(l));
  const careLabel = labels.find((l) => l.labelType === TYPE.CARE);

  // Packaging signals come from the packaging SPEC fields (RHF) the packaging-field owns; the dust
  // bag / greeting card also live as loose "inserts", so we scan the free-text packaging fields.
  const packagingText = [
    packaging.inserts,
    packaging.notes,
    packaging.foldingMethod,
    packaging.bagSticker,
  ]
    .filter(Boolean)
    .join(' · ');
  const polybagPresent =
    matches(packaging.polybag, /.+/) && !matches(packaging.polybag, /без пакет|no bag|none/i);
  const greetingCardPresent = matches(
    packagingText,
    /card|карт|открыт|привет|thank|greet|благодар/i,
  );
  const dustBagPresent = matches(
    `${packagingText} ${packaging.polybag ?? ''}`,
    /пыльник|dust\s*-?\s*bag|dustbag|мешоч|чехол/i,
  );

  const items: CheckItem[] = [
    {
      key: 'main',
      name: 'main / brand',
      hint: 'бренд',
      glyph: 'label',
      present: usedOfType(TYPE.MAIN),
    },
    { key: 'size', name: 'size', hint: 'размер', glyph: 'label', present: usedOfType(TYPE.SIZE) },
    {
      key: 'care',
      name: 'care',
      hint: 'символы ухода',
      glyph: 'label',
      present: usedOfType(TYPE.CARE),
    },
    {
      key: 'composition',
      name: 'composition',
      hint: 'состав / волокна',
      glyph: 'label',
      present: !!careLabel?.note?.trim(),
    },
    {
      key: 'origin',
      name: 'origin',
      hint: 'страна',
      glyph: 'label',
      present: usedOfType(TYPE.ORIGIN),
    },
    {
      key: 'hangtag',
      name: 'hangtag',
      hint: 'обвес / swing-tag',
      glyph: 'hangtag',
      present: usedOfType(TYPE.HANGTAG),
    },
    {
      key: 'polybag',
      name: 'polybag',
      hint: 'индив. пакет',
      glyph: 'polybag',
      present: polybagPresent,
    },
    {
      key: 'greeting',
      name: 'greeting card',
      hint: 'в упаковку',
      glyph: 'greetingCard',
      present: greetingCardPresent,
    },
    {
      key: 'dustbag',
      name: 'dust bag',
      hint: 'пыльник',
      glyph: 'dustBag',
      present: dustBagPresent,
    },
  ];

  const present = items.filter((i) => i.present).length;

  // Any additional label types the card already carries, beyond the recommended set above —
  // acknowledged as present so the operator knows they counted, without demanding them.
  const extras = [
    { type: TYPE.BARCODE, name: 'barcode' },
    { type: TYPE.FLAG, name: 'flag' },
    { type: TYPE.SPECIAL, name: 'special' },
  ].filter((e) => usedOfType(e.type));

  return (
    <div className='space-y-2 border border-textInactiveColor p-3'>
      <div className='flex items-baseline justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          spec checklist
        </Text>
        <Text variant='inactive' size='small'>
          {present} / {items.length} specified
        </Text>
      </div>
      <Text variant='label' size='small'>
        подсказка, не блокировка — что ещё стоит указать для этикеток и упаковки
      </Text>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {items.map((item) => (
          <ChecklistTile key={item.key} item={item} />
        ))}
      </div>
      {extras.length > 0 && (
        <div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
          <Text variant='inactive' size='small'>
            also present:
          </Text>
          {extras.map((e) => (
            <span
              key={e.type}
              className='border border-textInactiveColor px-1 text-textBaseSize uppercase leading-tight text-labelColor'
            >
              {e.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
