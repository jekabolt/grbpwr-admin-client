import { common_MediaFull } from 'api/proto-http/admin';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import TextareaField from 'ui/form/fields/textarea-field';
import { useDisclosure } from './disclosure';
import { FittingFormData } from './schema';

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// The text detail behind the pins FittingMedia draws on the photos: same `callouts` field
// array (React Hook Form keeps both in sync automatically), just as an editable list — number,
// which photo it's pinned to, and the note itself. This is the "advanced" view: collapsed by
// default once notes exist you'll want to skim them, but a click on a photo (which appends
// here too) is normally enough on its own.
export function FittingCallouts({ mediaById }: { mediaById: Map<number, common_MediaFull> }) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'callouts' });
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];
  const [open, toggle] = useDisclosure(fields.length > 0);

  const imageUrl = (id: number) => {
    const f = mediaById.get(id);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };
  // Only count photos that actually resolved to a media object, so a stale id never gets a
  // "photo #N" label or shows up as a pin target.
  const views = mediaIds.filter((id) => !!imageUrl(id));
  const viewIndex = (id: number) => views.indexOf(id) + 1;

  const pinOptions = [
    { value: 0, label: '— unanchored —' },
    ...views.map((id, i) => ({ value: id, label: `photo #${i + 1}` })),
  ];

  return (
    <div className='border-t border-textInactiveColor pt-3'>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        className='flex w-full cursor-pointer items-center justify-between gap-2 text-left'
      >
        <Text variant='uppercase' size='small'>
          fit notes {fields.length ? `(${fields.length})` : ''}
        </Text>
        <Text variant='inactive' size='small' className='uppercase'>
          {open ? '− hide' : '+ show'}
        </Text>
      </button>

      {open && (
        <div className='mt-3 space-y-3'>
          {fields.length === 0 ? (
            <Text variant='inactive' size='small'>
              no fit notes — click a photo above to pin one
            </Text>
          ) : (
            fields.map((f, index) => {
              const pinnedTo = (f as FormCallout).mediaId ?? 0;
              return (
                <div key={f.id} className='space-y-2 border border-textInactiveColor p-3'>
                  <div className='flex items-center justify-between'>
                    <Text variant='uppercase' size='small'>
                      fit note {index + 1}
                      {pinnedTo > 0 ? ` · photo #${viewIndex(pinnedTo)}` : ' · unanchored'}
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
                    {/* Auto-assigned (max existing number + 1) and a cross-reference target
                        (changeRequests.calloutNumber) — read-only so hand-edits can't collide
                        with the sequence. Kept in the field array so it still round-trips. */}
                    <div className='flex flex-col gap-1'>
                      <Text variant='label' size='small' component='span'>
                        number
                      </Text>
                      <Text variant='label' className='tabular-nums'>
                        {(f as FormCallout).number ?? index + 1}
                      </Text>
                    </div>
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
                              // Re-pinning to another photo: recenter the marker on the new
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
              // max+1, not length+1: after a mid-list delete, length+1 collides with an existing
              // number — and the number is read-only, so a duplicate can't be fixed by hand.
              append({
                number: Math.max(0, ...fields.map((f) => (f as FormCallout).number ?? 0)) + 1,
                note: '',
                mediaId: 0,
                posX: '',
                posY: '',
              })
            }
          >
            add fit note
          </Button>
        </div>
      )}
    </div>
  );
}
