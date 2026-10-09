import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { cn } from 'lib/utility';
import { useEffect, useId, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { AiEnhance } from 'ui/components/ai-enhance';
import Textarea from 'ui/components/text-area';
import { useBomItemIdOptions } from './bom-line-picker';
import { LABEL_MEDIA_MAX } from './labels-schema';

/**
 * ONE LABEL / ONE PACKAGING ITEM (02-DESIGN §2.3, §2.5) — the construction-aspects row grammar
 * (`details-editor.tsx` AspectRow), grown a mockup and a short fixed field set.
 *
 * NOT A BOX IN A BOX. The design sketch drew bordered cards; DESIGN.md forbids a block inside a
 * block, so a card is a RULED ROW of its block, like an aspect: hairline between rows, none under
 * the last, and air instead of frames.
 *
 *   NAME  [! no mockup]                                                           ✕
 *   ┌ mockup ┐   placement  [ … ]      attachment [ … ]
 *   │  160²  │   folding    [ … ]      size       [ … ]
 *   └────────┘   per garment[ 1 ]     material   [ BOM line ▾ ]
 *   ▫ ▫ + mockup note [ …                                              ]
 *
 * ONE CONTROL PER ACTION. The header carries exactly one control: ✕ removes the label (the only
 * way a row leaves — a cleared field never does, see `keepBare`). A mockup is added by clicking the
 * frame / the `+ mockup` tail, or by pasting / dropping anywhere on the row (useMediaIntake), and
 * each thumbnail carries its own small ✕. Nothing else is a button.
 *
 * THE MISSING MOCKUP IS SHOWN, NEVER BLOCKED (D-04). Until an image or SVG is attached the frame is
 * a dashed striped slot that says `no mockup yet`, and the name carries a `! no mockup` pill — red
 * for a label (it blocks the LABELS sign-off server-side), grey for a packaging item (a warning).
 * Saving is never refused for it.
 *
 * SVG IS WELCOME AND NEVER CROPPED: the library and the intake take SVG (vector door) with a FREE
 * aspect, and every frame shows the picture with `contain`, so a label artwork is never cut to fit.
 */

export type CardField =
  | { name: string; label: string; kind: 'pick'; options: string[]; max: number; hint?: string }
  | { name: string; label: string; kind: 'text'; max: number; hint?: string }
  | { name: string; label: string; kind: 'qty' }
  | { name: string; label: string; kind: 'bom' }
  | { name: string; label: string; kind: 'note'; max: number; hint?: string };

export type CardRow = Record<string, unknown> & { key?: string; mediaIds?: number[] };

export function LabelCard({
  cardKey,
  title,
  noun,
  row,
  fields,
  mockupBlocking,
  last,
  urlOf,
  onPatch,
  onRemove,
  onAddMedia,
  onRemoveMedia,
  onOpenViewer,
}: {
  cardKey: string;
  title: string;
  /** `label` / `item` — for accessible names and the intake title. */
  noun: string;
  row: CardRow;
  fields: CardField[];
  /** A missing mockup blocks (labels, red) or only warns (packaging items, grey). */
  mockupBlocking: boolean;
  last: boolean;
  urlOf: (id: number) => string;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onAddMedia: (picked: common_MediaFull[]) => void;
  onRemoveMedia: (id: number) => void;
  onOpenViewer: (index: number, ids: number[]) => void;
}): JSX.Element {
  const ids = (row.mediaIds ?? []) as number[];
  const missing = ids.length === 0;
  const room = Math.max(0, LABEL_MEDIA_MAX - ids.length);
  const purpose = `${noun} mockup · ${title}`;
  // THE WHOLE ROW IS THE RECEIVER (aspects rule): ⌘V over the row or a file dropped on it lands as a
  // mockup of THIS card. Pasted text never reaches it — the intake only takes files.
  const intake = useMediaIntake({
    enabled: room > 0,
    accept: 'image+svg',
    limit: room,
    purpose,
    onMedia: onAddMedia,
  });

  const selector = (trigger: React.ReactNode) => (
    <MediaSelector
      label='+ mockup'
      purpose={purpose}
      aspectRatio={['Custom']}
      allowMultiple
      allowSvg
      showVideos={false}
      saveSelectedMedia={onAddMedia}
      trigger={trigger}
    />
  );

  const [first, ...rest] = ids;

  return (
    <div
      {...intake.regionHandlers}
      className={cn('py-6', !last && 'border-b border-hairline')}
      data-label-card={cardKey}
    >
      {/* THE NAME AND THE ONE REMOVE CONTROL. */}
      <div className='flex items-center gap-3'>
        <Text
          size='control'
          tracking='label'
          component='span'
          className='min-w-0 truncate font-bold uppercase'
          data-label-card-title=''
        >
          {title}
        </Text>
        {missing && (
          <Pill tone={mockupBlocking ? 'warn' : 'mut'} data-mockup-missing-pill=''>
            ! no mockup
          </Pill>
        )}
        <Button
          type='button'
          variant='secondary'
          size='xs'
          className='ml-auto shrink-0'
          aria-label={`remove ${noun} ${title}`}
          onClick={onRemove}
          data-label-card-remove={cardKey}
        >
          ✕
        </Button>
      </div>

      <div className='mt-4 grid grid-cols-1 gap-6 sm:grid-cols-[160px_minmax(0,1fr)]'>
        {/* ── MOCKUP ─────────────────────────────────────────────────────────────────────── */}
        <div className='flex flex-col gap-2' data-mockup={cardKey}>
          {missing ? (
            selector(
              <button
                type='button'
                aria-label={`add a mockup to ${title}`}
                style={PLACEHOLDER_SURFACE}
                data-mockup-missing=''
                className={cn(
                  placeholderClass({ dashed: true, tone: mockupBlocking ? 'error' : 'default' }),
                  'size-40 cursor-pointer flex-col gap-1.5 px-3 text-center hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  !mockupBlocking && 'text-labelColor',
                  intake.dragging && 'border-textColor text-textColor',
                )}
              >
                <span className='leading-tight'>
                  {intake.dragging ? 'drop the mockup' : 'no mockup yet'}
                </span>
                {!intake.dragging && (
                  <span className='text-nano normal-case leading-tight tracking-normal'>
                    click, paste or drop · image or SVG
                  </span>
                )}
              </button>,
            )
          ) : (
            <>
              <Thumb
                id={first}
                size='lg'
                url={urlOf(first)}
                onOpen={() => onOpenViewer(0, ids)}
                onRemove={() => onRemoveMedia(first)}
              />
              <div className='flex flex-wrap items-start gap-1.5'>
                {rest.map((id, i) => (
                  <Thumb
                    key={id}
                    id={id}
                    size='sm'
                    url={urlOf(id)}
                    onOpen={() => onOpenViewer(i + 1, ids)}
                    onRemove={() => onRemoveMedia(id)}
                  />
                ))}
                {room > 0 &&
                  selector(
                    <Chip dashed data-mockup-add={cardKey}>
                      {intake.dragging ? 'drop the mockup' : '+ mockup'}
                    </Chip>,
                  )}
              </div>
            </>
          )}
        </div>

        {/* ── FIELDS ─────────────────────────────────────────────────────────────────────── */}
        <div className='grid grid-cols-1 content-start gap-x-6 gap-y-4 md:grid-cols-2'>
          {fields.map((f) => (
            <CardFieldView key={f.name} cardKey={cardKey} field={f} row={row} onPatch={onPatch} />
          ))}
        </div>
      </div>
      {intake.dialog}
    </div>
  );
}

function Thumb({
  id,
  url,
  size,
  onOpen,
  onRemove,
}: {
  id: number;
  url: string;
  size: 'lg' | 'sm';
  onOpen: () => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative border border-borderColor bg-bgZebra',
        size === 'lg' ? 'size-40' : 'size-12',
      )}
      data-mockup-pic={id}
    >
      <button
        type='button'
        onClick={() => url && onOpen()}
        disabled={!url}
        aria-label='view the mockup'
        className='block size-full cursor-zoom-in'
      >
        {url ? (
          <Media src={url} alt='mockup' aspectRatio='1/1' fit='contain' />
        ) : (
          <span className='flex size-full items-center justify-center text-micro'>#{id}</span>
        )}
      </button>
      <button
        type='button'
        aria-label='remove this mockup'
        onClick={onRemove}
        data-mockup-drop={id}
        className='absolute right-0.5 top-0.5 flex size-4 items-center justify-center border border-borderColor bg-bgColor text-nano leading-none hover:border-textColor'
      >
        ✕
      </button>
    </div>
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function CardFieldView({
  cardKey,
  field,
  row,
  onPatch,
}: {
  cardKey: string;
  field: CardField;
  row: CardRow;
  onPatch: (patch: Record<string, unknown>) => void;
}): JSX.Element {
  const id = `${useId().replace(/:/g, '')}-${field.name}`;
  const label = (
    <Text
      size='micro'
      variant='label'
      tracking='label'
      component='label'
      htmlFor={id}
      className='mb-1 block uppercase'
    >
      {field.label}
    </Text>
  );
  const data = { 'data-label-field': `${cardKey}:${field.name}` };

  switch (field.kind) {
    case 'pick':
    case 'text':
      return (
        <div>
          {label}
          <Input
            name={id}
            value={str(row[field.name])}
            maxLength={field.max}
            placeholder={field.hint}
            autoComplete='off'
            list={field.kind === 'pick' ? `${id}-list` : undefined}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onPatch({ [field.name]: e.target.value })
            }
            {...data}
          />
          {field.kind === 'pick' && (
            <datalist id={`${id}-list`}>
              {field.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </div>
      );
    case 'qty':
      return (
        <div>
          {label}
          <QtyInput
            id={id}
            value={(row[field.name] as number | undefined) || 1}
            onCommit={(n) => onPatch({ [field.name]: n })}
            data={data}
          />
        </div>
      );
    case 'bom':
      return (
        <div>
          {label}
          <BomSelect
            id={id}
            value={(row[field.name] as number | undefined) ?? 0}
            onChange={(n) => onPatch({ [field.name]: n })}
            data={data}
          />
        </div>
      );
    case 'note':
      return (
        <div className='md:col-span-2'>
          {label}
          {/* `ai ✦` на активном поле (item 41, «везде»): ключ `note`. */}
          <div className='relative'>
            <Textarea
              name={id}
              id={id}
              rows={2}
              maxLength={field.max}
              placeholder={field.hint}
              value={str(row[field.name])}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onPatch({ [field.name]: e.target.value })
              }
              className='pb-7'
              {...data}
            />
            <AiEnhance
              field='note'
              value={str(row[field.name])}
              onApply={(text) => onPatch({ [field.name]: text })}
              maxRunes={field.max}
            />
          </div>
        </div>
      );
  }
}

/**
 * «Per garment» — a whole number ≥ 1. Typed through a local draft so the field can be emptied on the
 * way to a new number; only a valid number reaches the form, and leaving the field puts back the
 * stored one.
 */
function QtyInput({
  id,
  value,
  onCommit,
  data,
}: {
  id: string;
  value: number;
  onCommit: (n: number) => void;
  data: Record<string, string>;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      name={id}
      inputMode='numeric'
      value={draft}
      className='w-20'
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value.replace(/[^0-9]/g, '');
        setDraft(v);
        const n = parseInt(v, 10);
        if (n >= 1 && n <= 999) onCommit(n);
      }}
      onBlur={() => setDraft(String(value))}
      {...data}
    />
  );
}

/** Optional link to the BOM line of the physical article (supplier, price stay in the BOM). */
function BomSelect({
  id,
  value,
  onChange,
  data,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  data: Record<string, string>;
}): JSX.Element {
  const { options } = useBomItemIdOptions(value);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className='block min-h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
      {...data}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value} disabled={o.disabled}>
          {o.value === 0 ? '— no BOM line —' : o.label}
        </option>
      ))}
    </select>
  );
}
