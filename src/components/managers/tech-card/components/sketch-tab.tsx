import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { techCardMediaKindOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { MediaField } from './media-field';
import { pieceCodeOptions } from './piece-codes';
import { TechCardFormData } from './schema';

const kindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-4 border border-textInactiveColor p-4', className)}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type FormCallout = {
  number?: number;
  part?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// Sketch annotation: click the active view to add a numbered callout there; drag a
// marker to move it (stores normalised pos_x/pos_y 0..1). One field array owns both the
// canvas markers and the text rows so positions stay in sync.
function CalloutsEditor({ mediaById }: { mediaById: Map<number, common_MediaFull> }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  // Callouts pin onto the TECHNICAL sketches (construction media), not the moodboard.
  const media = (useWatch({ control, name: 'technicalMedia' }) ?? []) as Array<{
    mediaId: number;
    kind?: string;
  }>;

  const views = media.filter((m) => {
    const f = mediaById.get(m.mediaId);
    return !!(f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl);
  });
  const [viewId, setViewId] = useState<number | null>(null);
  const activeViewId = viewId ?? views[0]?.mediaId ?? null;
  const full = activeViewId != null ? mediaById.get(activeViewId) : undefined;
  const url = full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragIdxRef = useRef<number | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ idx: number; x: number; y: number } | null>(null);

  function coords(clientX: number, clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (dragIdxRef.current == null) return;
      const p = coords(e.clientX, e.clientY);
      dragPosRef.current = p;
      setDragPos({ idx: dragIdxRef.current, ...p });
    }
    function up() {
      const idx = dragIdxRef.current;
      const p = dragPosRef.current;
      if (idx != null && p) {
        setValue(`callouts.${idx}.posX`, p.x.toFixed(3), { shouldDirty: true });
        setValue(`callouts.${idx}.posY`, p.y.toFixed(3), { shouldDirty: true });
      }
      dragIdxRef.current = null;
      dragPosRef.current = null;
      setDragPos(null);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setValue]);

  function addAt(e: React.MouseEvent) {
    if (dragIdxRef.current != null || activeViewId == null) return;
    const { x, y } = coords(e.clientX, e.clientY);
    append({
      number: fields.length + 1,
      part: '',
      description: '',
      dimensions: '',
      mediaId: activeViewId,
      posX: x.toFixed(3),
      posY: y.toFixed(3),
    });
  }

  const pinOptions = [
    { value: 0, label: '— unanchored —' },
    ...media.map((m, i) => ({
      value: m.mediaId,
      label: `#${i + 1} ${kindLabels[m.kind ?? ''] ?? 'sketch'}`,
    })),
  ];

  return (
    <div className='space-y-4'>
      {views.length === 0 ? (
        <Text variant='inactive' size='small'>
          add a sketch with an image to place callouts on it
        </Text>
      ) : (
        <div className='space-y-2'>
          <div className='flex flex-wrap gap-2'>
            {views.map((v) => (
              <button
                key={v.mediaId}
                type='button'
                onClick={() => setViewId(v.mediaId)}
                className={cn(
                  'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                  v.mediaId === activeViewId
                    ? 'border-textColor bg-textColor text-bgColor'
                    : 'border-textInactiveColor text-textColor hover:border-textInactiveColor',
                )}
              >
                {kindLabels[v.kind ?? ''] ?? 'view'}
              </button>
            ))}
          </div>

          <div ref={wrapRef} className='relative w-fit touch-none'>
            <img
              src={url}
              alt='sketch'
              onClick={addAt}
              className='block max-h-[460px] w-auto cursor-crosshair select-none border border-textInactiveColor'
              draggable={false}
            />
            {callouts.map((c, idx) => {
              if (c.mediaId !== activeViewId) return null;
              const dragging = dragPos?.idx === idx;
              const x = dragging ? dragPos.x : parseFloat(c.posX ?? '');
              const y = dragging ? dragPos.y : parseFloat(c.posY ?? '');
              if (Number.isNaN(x) || Number.isNaN(y)) return null;
              return (
                <button
                  key={idx}
                  type='button'
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragIdxRef.current = idx;
                    const p = coords(e.clientX, e.clientY);
                    dragPosRef.current = p;
                    setDragPos({ idx, ...p });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className='absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border-2 border-bgColor bg-textColor text-textBaseSize text-bgColor'
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  aria-label={`callout ${c.number || idx + 1}`}
                >
                  {c.number || idx + 1}
                </button>
              );
            })}
          </div>
          <Text variant='inactive' size='small'>
            click the sketch to add a callout · drag a marker to move it
          </Text>
        </div>
      )}

      <div className='space-y-3 border-t border-textInactiveColor pt-3'>
        {fields.length === 0 ? (
          <Text variant='inactive' size='small'>
            no callouts
          </Text>
        ) : (
          fields.map((f, index) => (
            <div key={f.id} className='space-y-2 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  callout {index + 1}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove callout'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
              <div className='grid grid-cols-1 gap-2 lg:grid-cols-4'>
                <InputField
                  name={`callouts.${index}.number`}
                  type='number'
                  valueAsNumber
                  label='number'
                />
                <ComboField
                  name={`callouts.${index}.part`}
                  label='part (код детали)'
                  options={pieceCodeOptions}
                />
                <InputField name={`callouts.${index}.dimensions`} label='dimensions' />
                <SelectField
                  name={`callouts.${index}.mediaId`}
                  label='pinned to'
                  items={pinOptions}
                  valueAsNumber
                />
              </div>
              <TextareaField
                name={`callouts.${index}.description`}
                label='description'
                rows={2}
                maxLength={2000}
              />
            </div>
          ))
        )}
        <Button
          type='button'
          variant='main'
          className='uppercase'
          onClick={() =>
            append({
              number: fields.length + 1,
              part: '',
              description: '',
              dimensions: '',
              mediaId: 0,
              posX: '',
              posY: '',
            })
          }
        >
          add callout
        </Button>
      </div>
    </div>
  );
}

// Sketch sheet — owns the resolved-media map shared by both sketch grids (moodboard +
// technical) and the callout canvas (so a freshly-picked sketch can be annotated without a
// save/reload). Media ids are unique across the two lists, so one shared map serves both.
export function SketchTab({ techCard }: { techCard?: common_TechCard }) {
  const [picked, setPicked] = useState<common_MediaFull[]>([]);

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(techCard?.resolvedTechnicalMedia ?? []),
      ...(techCard?.resolvedMoodboardMedia ?? []),
    ]) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [techCard?.resolvedTechnicalMedia, techCard?.resolvedMoodboardMedia, picked]);

  const onPicked = (items: common_MediaFull[]) => setPicked((prev) => [...prev, ...items]);

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
        <Section title='technical sketch' className='w-full lg:w-1/2'>
          <MediaField name='technicalMedia' mediaById={mediaById} onPickedMedia={onPicked} />
        </Section>
        <Section title='callouts' className='w-full lg:w-1/2'>
          <CalloutsEditor mediaById={mediaById} />
        </Section>
      </div>
      <Section title='moodboard (mood / reference / swatches)'>
        <MediaField name='moodboardMedia' mediaById={mediaById} onPickedMedia={onPicked} />
      </Section>
    </div>
  );
}
