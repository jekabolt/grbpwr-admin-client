import { common_Model } from 'api/proto-http/admin';
import { useModelSession } from 'components/managers/model/components';
import { BODY_MEASUREMENT_GROUPS } from 'components/managers/model/components/measurements';
import {
  MeasurementLine,
  titleCase,
} from 'components/managers/model/components/measurements-fields';
import { ModelPhotoPick } from 'components/managers/model/components/model-media';
import { useFormPins } from 'components/managers/model/components/model-pins';
import { ModelFormData } from 'components/managers/model/components/schema';
import { MeasurementScheme } from 'components/managers/model/components/measurement-pictograms';
import {
  MODEL_MEASUREMENTS,
  shortMeasurementGroup,
  useSheetMeasurementFocus,
} from 'components/managers/model/components/sheet-measurement-focus';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button, Iconoir, Input, Text } from 'ui';
import { ModelMeta } from './model-meta';
import { orderedMedia, TilePhotos } from './model-tile';

function groupTitle(title: string): string {
  const short = shortMeasurementGroup(title);
  return titleCase(short === 'widths' ? 'width' : short);
}

/** The card's name is the form's `name`: typing here is typing in the panel. */
function NameMirror() {
  const { control } = useFormContext<ModelFormData>();
  const { field, fieldState } = useController({ control, name: 'name' });
  return (
    <Input
      ref={field.ref}
      name='model-card-name'
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      placeholder='Name'
      aria-label='name'
      aria-invalid={fieldState.error ? true : undefined}
      autoComplete='off'
      className='h-auto min-h-0 w-full truncate border-0 bg-transparent p-0 pt-3 pr-10 text-display leading-[1.15] text-ink placeholder:text-titleMuted focus:border-0 aria-[invalid=true]:text-error'
    />
  );
}

/** Pinned measurements, grouped like the panel, bound to the same form fields. */
function PinnedFields() {
  const pins = useFormPins();
  const { isEditMode } = useModelSession();
  const { control } = useFormContext<ModelFormData>();
  const values = (useWatch({ control, name: 'measurements' }) ?? {}) as Record<
    string,
    number | undefined
  >;
  if (!pins) return null;
  // A new model shows a pin once it has a value (the default pins would list empty rows).
  const shows = (name: string) => pins.isPinned(name) && (isEditMode || Number(values[name]) > 0);
  const groups = BODY_MEASUREMENT_GROUPS.map((g) => ({
    title: groupTitle(g.title),
    names: g.measurements.map((m) => m.name as string).filter(shows),
  })).filter((g) => g.names.length);
  if (!groups.length) return null;

  return (
    <div className='@container flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pt-27 pr-1'>
      {groups.map((g) => (
        <div key={g.title} className='flex flex-col gap-2'>
          <Text component='h3' className='text-ink'>
            {g.title}
          </Text>
          <div className='grid grid-cols-1 gap-x-6.5 gap-y-4 @[18rem]:grid-cols-2'>
            {g.names.map((name) => (
              <MeasurementLine key={name} name={name} scope='card' />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const SCHEME_NAMES = MODEL_MEASUREMENTS.map((m) => m.name as string);

/**
 * While a measurement field is focused (in the panel or on the card) the photo area turns over —
 * a soft 3D page-turn, 700ms on the soft ease — to the measurement SCHEME: the segment being filled
 * is the selection blue, dashed; a click on any segment puts the caret in its field (and opens
 * Measurements). It turns back when focus leaves the measurements (held 200ms, so stepping from
 * field to field does not flip it twice).
 */
function PhotoOrScheme({ media }: { media: ReturnType<typeof orderedMedia> }) {
  const { focused, active } = useSheetMeasurementFocus();
  const { focusMeasurement } = useModelSession();
  const [scheme, setScheme] = useState(false);
  useEffect(() => {
    if (focused) {
      setScheme(true);
      return;
    }
    const t = window.setTimeout(() => setScheme(false), 200);
    return () => window.clearTimeout(t);
  }, [focused]);

  return (
    <div className='relative min-h-20 flex-1 perspective-distant'>
      <div
        className={cn(
          'relative h-full w-full transition-transform duration-700 ease-soft [transform-style:preserve-3d] motion-reduce:transition-none',
          scheme && '[transform:rotateY(180deg)]',
        )}
      >
        <div className='absolute inset-0 flex flex-col [backface-visibility:hidden]' inert={scheme}>
          <TilePhotos media={media} />
        </div>
        <div
          className='absolute inset-0 bg-bgColor p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]'
          inert={!scheme}
        >
          <MeasurementScheme
            names={SCHEME_NAMES}
            active={focused ?? active}
            onPick={focusMeasurement}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The open card (Lekalo `.mkw .mk`, frame `models-edit.svg`): anchored to the bottom of the left
 * area, `fieldFill`, two zones. Left, the pool card's content at 300 wide — the name (an editable
 * mirror of the form's `name`), `+` (the same photo picker as the panel's Upload Profile Picture),
 * gender and `[sizes]`, the photos. Right, the pinned measurements as `LineField`s on the SAME form
 * fields as the panel; unpinning one takes it off the card.
 */
export function ModelTileOpen({ model }: { model?: common_Model }) {
  const { writer, knownMedia, rememberMedia } = useModelSession();
  const { control, setValue } = useFormContext<ModelFormData>();
  const gender = useWatch({ control, name: 'gender' }) as string;
  const sizeIds = useWatch({ control, name: 'defaultSizeIds' }) as number[] | undefined;
  const mediaIds = useWatch({ control, name: 'mediaIds' }) as number[] | undefined;
  const media = orderedMedia(model, mediaIds, knownMedia);

  return (
    <div className='flex h-[min(31.1875rem,calc(100vh-18.75rem))] w-full max-w-[43.5625rem] min-w-75 gap-8 bg-fieldFill p-2 motion-safe:animate-[models-grow_900ms_var(--ease-soft)_both]'>
      <div className='flex w-75 shrink-0 flex-col'>
        <div className='relative flex h-26 shrink-0 flex-col'>
          <NameMirror />
          {writer && (
            <ModelPhotoPick
              onPicked={rememberMedia}
              trigger={
                <Button
                  type='button'
                  variant='default'
                  aria-label='add photo'
                  title='add photo'
                  className='absolute top-3.5 right-0 grid size-7 place-items-center text-ink'
                >
                  <Iconoir name='plus' className='size-6' />
                </Button>
              }
            />
          )}
          <ModelMeta
            className='mt-1.5'
            gender={gender}
            sizeIds={sizeIds}
            onGender={
              writer
                ? (next) =>
                    setValue('gender', next as ModelFormData['gender'], {
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                : undefined
            }
            onSizes={
              writer
                ? (ids) => setValue('defaultSizeIds', ids, { shouldDirty: true, shouldTouch: true })
                : undefined
            }
          />
        </div>
        <PhotoOrScheme media={media} />
      </div>
      <div className='flex min-w-0 flex-1 flex-col'>
        <PinnedFields />
      </div>
    </div>
  );
}
