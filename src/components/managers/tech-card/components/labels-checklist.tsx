import { useFormContext, useWatch } from 'react-hook-form';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';

// The labeling & packaging completeness view (top of the LABELS & PKG tab), presented BY LAYER — no
// garment silhouette, no pins, no glyphs: a label is a spec line, so the checklist is a scannable
// list grouped into the three layers a garment carries (on-garment labels, hangtags & external,
// packaging). Everything specified reads present/auto; everything recommended-but-missing lists in
// red, one click from being fixed.
//
// Pure GUIDANCE, not a validation gate: it reads the live RHF form (labels[] + packaging.*) and
// nothing here blocks a save. "Present" means a label of that type is actually filled in, or the
// matching packaging field carries a value — never just an empty row.

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
  /** Where the value comes from — auto from composition / care symbols, packaging, or manual. */
  source: string;
  /** What the row says after the name — attachment · placement, or the packaging fact. */
  detail: string;
  present: boolean;
  /** Set only for the label types the row can add — a packaging item walks to the packaging spec. */
  labelType?: string;
  /** Recommended-but-not-required (barcode / flag / special): an absent one reads muted, never as a
   *  red "missing", and never counts against the N / M summary. */
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

// The two rows whose value the card composes for you rather than the operator typing it — their
// status reads "auto" instead of "present", the cue that they cannot drift from the spec.
const AUTO_SOURCE = new Set(['composition', 'care']);

export function LabelsChecklist({
  onAddLabel,
  onOpenPackaging,
}: {
  /** Adds (and focuses) a label row of this type — the one click that fixes a red row. */
  onAddLabel?: (labelType: string) => void;
  /** Walks to the packaging spec — the three packaging-derived rows aren't labels. */
  onOpenPackaging?: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as LabelRow[];
  const packaging = (useWatch({ control, name: 'packaging' }) ?? {}) as Packaging;

  const rowOfType = (t: string) => labels.find((l) => l.labelType === t && isUsed(l));
  const careLabel = labels.find((l) => l.labelType === TYPE.CARE);

  // One on-garment label row -> a check item. Present == a used row of that type exists; the detail
  // is the row's attachment · placement text (a specified-but-bare row still reads "specified").
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
      source,
      optional,
      present: !!row,
      detail: row ? joinDetail(row.attachment, row.placement) || 'specified' : 'not specified',
    };
  };

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

  // LAYER 1 — the labels that sit ON the garment. All recommended, so an absent one reads red.
  const onGarment: CheckItem[] = [
    labelItem('main', 'main / brand', TYPE.MAIN, 'manual'),
    labelItem('size', 'size', TYPE.SIZE, 'manual'),
    labelItem('care', 'care', TYPE.CARE, 'from care symbols'),
    {
      key: 'composition',
      name: 'composition',
      source: 'from composition',
      // Composition is written INTO the care label's note (see the care generator) — its presence is
      // that note, not a placement of its own.
      detail: careLabel?.note?.trim() ? 'in the care label' : 'not specified',
      present: !!careLabel?.note?.trim(),
      labelType: TYPE.CARE,
    },
    labelItem('origin', 'origin', TYPE.ORIGIN, 'manual'),
  ];

  // LAYER 2 — hangtags & anything external to the garment. The hangtag is recommended; barcode, flag
  // and special are optional, so an absent one reads muted rather than red and never counts.
  const external: CheckItem[] = [
    labelItem('hangtag', 'hangtag', TYPE.HANGTAG, 'manual'),
    labelItem('barcode', 'barcode', TYPE.BARCODE, 'manual', true),
    labelItem('flag', 'flag', TYPE.FLAG, 'manual', true),
    labelItem('special', 'special', TYPE.SPECIAL, 'manual', true),
  ];

  // LAYER 3 — packaging. Read off the packaging SPEC fields; never a label, so a missing one walks to
  // the packaging spec rather than appending a label row.
  const packagingItems: CheckItem[] = [
    {
      key: 'polybag',
      name: 'polybag',
      source: 'from packaging',
      detail: polybagPresent ? (packaging.polybag ?? '').trim() : 'not specified',
      present: polybagPresent,
    },
    {
      key: 'greeting',
      name: 'greeting card',
      source: 'from packaging',
      detail: greetingCardPresent ? 'in the packaging' : 'not specified',
      present: greetingCardPresent,
    },
    {
      key: 'dustbag',
      name: 'dust bag',
      source: 'from packaging',
      detail: dustBagPresent ? 'in the packaging' : 'not specified',
      present: dustBagPresent,
    },
  ];

  const groups: { title: string; items: CheckItem[] }[] = [
    { title: 'on-garment labels', items: onGarment },
    { title: 'hangtags & external', items: external },
    { title: 'packaging', items: packagingItems },
  ];

  // The summary counts only the recommended (non-optional) items, so an all-optional layer never
  // drags the denominator.
  const counted = [...onGarment, ...external, ...packagingItems].filter((i) => !i.optional);
  const present = counted.filter((i) => i.present).length;

  // A red row is only useful if it is one click from being fixed: a label type appends (and
  // focuses) its row, a packaging item walks to the packaging spec.
  const fix = (item: CheckItem) => {
    if (item.labelType) onAddLabel?.(item.labelType);
    else onOpenPackaging?.();
  };
  const canFix = (item: CheckItem) => (item.labelType ? !!onAddLabel : !!onOpenPackaging);

  // Each row carries its SOURCE ("· from composition / from care symbols / from packaging / manual")
  // right after the name — the operator can see whether a value is composed for them or typed by
  // hand — then the placement detail, which truncates first when the pane is narrow.
  const rowLabel = (item: CheckItem) => (
    <span className='flex min-w-0 items-center gap-1.5'>
      <span className='shrink-0'>{item.name}</span>
      <span className='min-w-0 truncate text-labelColor'>
        · {item.source}
        {item.detail ? ` · ${item.detail}` : ''}
      </span>
    </span>
  );

  // The status marker: a composed row reads "auto" (it tracks the spec on its own), a filled manual
  // row "present", an unfilled recommended row "missing", an unfilled optional row "optional".
  const statusPill = (item: CheckItem) => {
    if (!item.present)
      return item.optional ? <Pill tone='mut'>optional</Pill> : <Pill tone='warn'>missing</Pill>;
    return AUTO_SOURCE.has(item.key) ? <Pill tone='ok'>auto</Pill> : <Pill tone='ok'>present</Pill>;
  };

  // A missing recommended row is red and, when fixable, underlined so the whole label is the click
  // target; a filled row is plain; an absent optional row reads muted so it never looks like an error.
  const renderRow = (item: CheckItem) => {
    const missing = !item.present && !item.optional;
    if (missing && canFix(item)) {
      return (
        <Row
          key={item.key}
          tone='error'
          label={
            <button
              type='button'
              onClick={() => fix(item)}
              title={item.labelType ? 'add this label and jump to it' : 'open the packaging spec'}
              className='flex min-w-0 max-w-full items-center gap-1.5 text-left underline'
            >
              {rowLabel(item)}
            </button>
          }
          value={statusPill(item)}
        />
      );
    }
    return (
      <Row
        key={item.key}
        tone={missing ? 'error' : !item.present ? 'label' : 'default'}
        label={rowLabel(item)}
        value={statusPill(item)}
      />
    );
  };

  return (
    <div className='flex flex-col gap-2'>
      <SectionHeader
        title='labels checklist'
        question={`— ${present} / ${counted.length} specified · подсказка, не блокировка`}
      />

      <div className='flex flex-col gap-2'>
        {groups.map((group) => (
          <div key={group.title} className='border border-borderColor bg-bgColor p-3'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              {group.title}
            </Text>
            <div className='mt-1.5'>{group.items.map(renderRow)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
