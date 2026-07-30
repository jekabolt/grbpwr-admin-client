import { useFormContext, useWatch } from 'react-hook-form';
import { Canvas, Pin } from 'ui/components/canvas';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import {
  GarmentMapSilhouette,
  SpecGlyph,
  SpecGlyphKind,
  placementPinPosition,
} from './label-placement-pictogram';
import { TechCardFormData } from './schema';

// The labeling & packaging completeness view (top of the LABELS & PKG tab) as a GARMENT MAP: a
// label is a physical object in a physical place, so the spec draws the garment and marks where
// each specified item is attached. Everything that IS placed gets a lettered pin on the drawing and
// a row beside it; everything unplaced or unspecified lists underneath in red, one click from
// being fixed.
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
  glyph: SpecGlyphKind;
  present: boolean;
  /** Set only for the label types that can sit somewhere on the garment. */
  labelType?: string;
  /** Frame-percent coordinates from the placement, or null when it isn't placed. */
  pin: { x: number; y: number } | null;
  /** The pin's letter — assigned only once the item actually lands on the drawing. */
  letter?: string;
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

// An item that actually landed on the drawing — it has both a spot and a letter.
type PinnedItem = CheckItem & { letter: string; pin: { x: number; y: number } };
const isPinned = (i: CheckItem): i is PinnedItem => !!i.letter && !!i.pin;

// Two pins on the same spot (a size tab and its care label both on the right side seam) would draw
// as one. Nudge each repeat down a notch so both stay countable, without moving them off the seam.
function spreadPins(items: CheckItem[]): CheckItem[] {
  const taken = new Map<string, number>();
  return items.map((item) => {
    if (!item.pin) return item;
    const key = `${Math.round(item.pin.x)}:${Math.round(item.pin.y)}`;
    const seen = taken.get(key) ?? 0;
    taken.set(key, seen + 1);
    if (seen === 0) return item;
    return { ...item, pin: { x: item.pin.x, y: Math.min(item.pin.y + seen * 7, 94) } };
  });
}

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

  // One on-garment label row -> a check item. Its pin comes from label-placement-pictogram's
  // placement map (the same data the per-row badge draws), so the two can never disagree.
  const garmentItem = (
    key: string,
    name: string,
    labelType: string,
    source: string,
    glyph: SpecGlyphKind = 'label',
  ): CheckItem => {
    const row = rowOfType(labelType);
    const pin = row ? placementPinPosition(row.placement) : null;
    return {
      key,
      name,
      labelType,
      source,
      glyph,
      present: !!row,
      pin,
      // A row with an unrecognised (or empty) placement says so out loud — otherwise it would sit
      // in the red list showing only its attachment, and the reason it has no pin stays a mystery.
      detail: !row
        ? 'not specified'
        : pin
          ? joinDetail(row.attachment, row.placement)
          : joinDetail(row.attachment, 'not placed'),
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

  // The nine recommended items. The first five/six sit ON the garment and can therefore be pinned;
  // the last three are packaging and never carry a placement, so they are listed, never drawn.
  const base: CheckItem[] = [
    garmentItem('main', 'main / brand', TYPE.MAIN, 'manual'),
    garmentItem('size', 'size', TYPE.SIZE, 'manual'),
    garmentItem('care', 'care', TYPE.CARE, 'from care symbols'),
    {
      key: 'composition',
      name: 'composition',
      source: 'from composition',
      // Composition is written INTO the care label's note (see the care generator) — it has no
      // placement of its own, so it never gets a pin.
      detail: careLabel?.note?.trim() ? 'in the care label' : 'not specified',
      glyph: 'label',
      present: !!careLabel?.note?.trim(),
      labelType: TYPE.CARE,
      pin: null,
    },
    garmentItem('origin', 'origin', TYPE.ORIGIN, 'manual'),
    garmentItem('hangtag', 'hangtag', TYPE.HANGTAG, 'manual', 'hangtag'),
    {
      key: 'polybag',
      name: 'polybag',
      source: 'from packaging',
      detail: polybagPresent ? (packaging.polybag ?? '').trim() : 'not specified',
      glyph: 'polybag',
      present: polybagPresent,
      pin: null,
    },
    {
      key: 'greeting',
      name: 'greeting card',
      source: 'from packaging',
      detail: greetingCardPresent ? 'in the packaging' : 'not specified',
      glyph: 'greetingCard',
      present: greetingCardPresent,
      pin: null,
    },
    {
      key: 'dustbag',
      name: 'dust bag',
      source: 'from packaging',
      detail: dustBagPresent ? 'in the packaging' : 'not specified',
      glyph: 'dustBag',
      present: dustBagPresent,
      pin: null,
    },
  ];

  // Letters run in reading order over whatever actually landed on the drawing, so the map's legend
  // is A, B, C… with no gaps even when a card specifies only two labels.
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let next = 0;
  const items = spreadPins(
    base.map((item) => (item.present && item.pin ? { ...item, letter: ALPHABET[next++] } : item)),
  );

  const placed = items.filter(isPinned);
  const unplaced = items.filter((i) => !isPinned(i));
  const present = items.filter((i) => i.present).length;

  // Any additional label types the card already carries, beyond the recommended set above —
  // acknowledged as present so the operator knows they counted, without demanding them.
  const extras = [
    { type: TYPE.BARCODE, name: 'barcode' },
    { type: TYPE.FLAG, name: 'flag' },
    { type: TYPE.SPECIAL, name: 'special' },
  ].filter((e) => !!rowOfType(e.type));

  // A red row is only useful if it is one click from being fixed: a label type appends (and
  // focuses) its row, a packaging item walks to the packaging spec.
  const fix = (item: CheckItem) => {
    if (item.labelType) onAddLabel?.(item.labelType);
    else onOpenPackaging?.();
  };
  const canFix = (item: CheckItem) => (item.labelType ? !!onAddLabel : !!onOpenPackaging);

  // Each row now carries its SOURCE ("· from composition / from care symbols / from packaging /
  // manual") right after the name — the operator can see whether a value is composed for them or
  // typed by hand — then the placement detail, which truncates first when the pane is narrow.
  const rowLabel = (item: CheckItem) => (
    <span className='flex min-w-0 items-center gap-1.5'>
      {item.letter ? (
        <Text size='micro' component='span' className='font-bold'>
          {item.letter}
        </Text>
      ) : (
        <SpecGlyph kind={item.glyph} className='h-3.5 w-3.5 shrink-0' />
      )}
      <span className='shrink-0'>{item.name}</span>
      <span className='min-w-0 truncate text-labelColor'>
        · {item.source}
        {item.detail ? ` · ${item.detail}` : ''}
      </span>
    </span>
  );

  // The status marker: a composed row reads "auto" (it tracks the spec on its own), a filled manual
  // row "present", an unfilled one "missing".
  const statusPill = (item: CheckItem) =>
    !item.present ? (
      <Pill tone='warn'>missing</Pill>
    ) : AUTO_SOURCE.has(item.key) ? (
      <Pill tone='ok'>auto</Pill>
    ) : (
      <Pill tone='ok'>present</Pill>
    );

  return (
    <div className='flex flex-col gap-2'>
      <SectionHeader
        title='labels checklist'
        question={`— ${present} / ${items.length} specified · подсказка, не блокировка`}
      />

      <div className='grid grid-cols-[110px_1fr] gap-2.5 sm:grid-cols-[140px_1fr]'>
        <Canvas aspect='3/4'>
          <GarmentMapSilhouette />
          {placed.map((item) => (
            <Pin
              key={item.key}
              x={item.pin.x}
              y={item.pin.y}
              label={item.letter}
              title={`${item.name} — ${item.detail}`}
            />
          ))}
        </Canvas>

        <div className='min-w-0'>
          {placed.map((item) => (
            <Row key={item.key} label={rowLabel(item)} value={statusPill(item)} />
          ))}
          {/* An item off the drawing is either present-without-a-placement (composition, packaging,
              a label with no spot yet) — a plain row — or genuinely missing, listed in red one click
              from being fixed. Splitting on `present` stops a filled row reading as an error. */}
          {unplaced.map((item) =>
            item.present ? (
              <Row key={item.key} label={rowLabel(item)} value={statusPill(item)} />
            ) : (
              <Row
                key={item.key}
                tone='error'
                label={
                  canFix(item) ? (
                    <button
                      type='button'
                      onClick={() => fix(item)}
                      title={
                        item.labelType ? 'add this label and jump to it' : 'open the packaging spec'
                      }
                      className='flex min-w-0 max-w-full items-center gap-1.5 text-left underline'
                    >
                      {rowLabel(item)}
                    </button>
                  ) : (
                    rowLabel(item)
                  )
                }
                value={statusPill(item)}
              />
            ),
          )}
          {extras.length > 0 && (
            <div className='flex flex-wrap items-center gap-1 pt-1.5'>
              <Text size='micro' variant='label' component='span'>
                also present:
              </Text>
              {extras.map((e) => (
                <Pill key={e.type} tone='mut'>
                  {e.name}
                </Pill>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
