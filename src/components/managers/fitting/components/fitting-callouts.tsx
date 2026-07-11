import { common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { FittingFormData } from './schema';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// Pin numbered markers onto the fitting's photos: click a photo to drop a callout,
// drag a marker to move it (stores normalised pos_x/pos_y 0..1), and write what is
// wrong with the fit at that point. Mirrors the tech-card sketch callouts, minus
// the part/dimensions (a fitting flags posadka, not spec geometry). One field array
// owns both the canvas markers and the text rows so positions stay in sync.
export function FittingCallouts({ mediaById }: { mediaById: Map<number, common_MediaFull> }) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];

  const imageUrl = (id: number) => {
    const f = mediaById.get(id);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };
  const views = mediaIds.filter((id) => !!imageUrl(id));

  const [viewId, setViewId] = useState<number | null>(null);
  const activeViewId = viewId != null && views.includes(viewId) ? viewId : views[0] ?? null;
  const url = activeViewId != null ? imageUrl(activeViewId) : '';
  const viewIndex = (id: number) => views.indexOf(id) + 1;

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

  // When a photo is removed from the fitting, un-pin any fit note that was on it —
  // keep the note text but drop the now-dead pin + coords so it isn't saved pointing
  // at a media no longer attached (which could never be shown/repositioned again).
  // Reacts only to actual removals (diff vs the previous ids), not to mount/additions.
  const prevMediaIdsRef = useRef<number[]>(mediaIds);
  useEffect(() => {
    const prev = prevMediaIdsRef.current;
    prevMediaIdsRef.current = mediaIds;
    const removed = prev.filter((id) => !mediaIds.includes(id));
    if (!removed.length) return;
    callouts.forEach((c, i) => {
      if (c.mediaId && removed.includes(c.mediaId)) {
        setValue(`callouts.${i}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${i}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${i}.posY`, '', { shouldDirty: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds]);

  function addAt(e: React.MouseEvent) {
    if (dragIdxRef.current != null || activeViewId == null) return;
    const { x, y } = coords(e.clientX, e.clientY);
    append({
      number: fields.length + 1,
      note: '',
      mediaId: activeViewId,
      posX: x.toFixed(3),
      posY: y.toFixed(3),
    });
  }

  const pinOptions = [
    { value: 0, label: '— unanchored —' },
    ...views.map((id, i) => ({ value: id, label: `photo #${i + 1}` })),
  ];

  return (
    <div className='space-y-4'>
      {views.length === 0 ? (
        <Text variant='inactive' size='small'>
          add a photo above to pin fit notes on it
        </Text>
      ) : (
        <div className='space-y-2'>
          <div className='flex flex-wrap gap-2'>
            {views.map((id, i) => (
              <button
                key={id}
                type='button'
                onClick={() => setViewId(id)}
                className={cn(
                  'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                  id === activeViewId
                    ? 'border-textColor bg-textColor text-bgColor'
                    : 'border-textInactiveColor text-textColor hover:border-textInactiveColor',
                )}
              >
                photo #{i + 1}
              </button>
            ))}
          </div>

          <div ref={wrapRef} className='relative w-fit touch-none'>
            <img
              src={url}
              alt='fitting photo'
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
            click the photo to add a fit note · drag a marker to move it
          </Text>
        </div>
      )}

      <div className='space-y-3 border-t border-textInactiveColor pt-3'>
        {fields.length === 0 ? (
          <Text variant='inactive' size='small'>
            no fit notes
          </Text>
        ) : (
          fields.map((f, index) => {
            const pinnedTo = callouts[index]?.mediaId ?? 0;
            return (
              <div key={f.id} className='space-y-2 border border-textInactiveColor p-3'>
                <div className='flex items-center justify-between'>
                  <Text variant='uppercase' size='small'>
                    fit note {index + 1}
                    {pinnedTo > 0 ? ` · photo #${viewIndex(pinnedTo)}` : ''}
                  </Text>
                  <Button
                    type='button'
                    variant='secondary'
                    aria-label='remove fit note'
                    onClick={() => remove(index)}
                  >
                    ✕
                  </Button>
                </div>
                <div className='grid grid-cols-1 gap-2 lg:grid-cols-2'>
                  <InputField
                    name={`callouts.${index}.number`}
                    type='number'
                    valueAsNumber
                    label='number'
                  />
                  <Controller
                    control={control}
                    name={`callouts.${index}.mediaId`}
                    render={({ field }) => (
                      <label className='flex flex-col gap-1'>
                        <Text variant='label' size='small' component='span'>
                          pinned to
                        </Text>
                        <Select
                          name={`callouts.${index}.mediaId`}
                          items={pinOptions}
                          value={field.value != null ? String(field.value) : field.value}
                          onValueChange={(val: string | undefined) => {
                            const next = Number(val ?? 0);
                            // re-pinning to another photo: recenter the marker on the new
                            // view — keeping the old coords would point it at an unrelated
                            // spot; unanchoring (0) clears the pin entirely.
                            if (next !== (field.value ?? 0)) {
                              setValue(`callouts.${index}.posX`, next ? '0.500' : '', {
                                shouldDirty: true,
                              });
                              setValue(`callouts.${index}.posY`, next ? '0.500' : '', {
                                shouldDirty: true,
                              });
                            }
                            field.onChange(next);
                          }}
                          fullWidth
                        />
                      </label>
                    )}
                  />
                </div>
                <TextareaField
                  name={`callouts.${index}.note`}
                  label='note (что не так с посадкой)'
                  rows={2}
                  maxLength={2000}
                />
              </div>
            );
          })
        )}
        <Button
          type='button'
          variant='main'
          className='uppercase'
          onClick={() =>
            append({ number: fields.length + 1, note: '', mediaId: 0, posX: '', posY: '' })
          }
        >
          add fit note
        </Button>
      </div>
    </div>
  );
}
