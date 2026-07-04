import { LANGUAGES } from 'constants/constants';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { MediaPairField } from './media-pair-field';

type FieldConfig = {
  name: string;
  label: string;
  type?: 'input' | 'textarea';
  required?: boolean;
  rows?: number;
  maxLength?: number;
};

interface SlideListFieldProps {
  /** Form path of the HeroSingle array, e.g. `entities.3.slideshow.slides`. */
  name: string;
  /** Per-item translation field config. */
  translationFields: FieldConfig[];
  /** Singular noun for each entry (slide / tile / frame). */
  itemLabel?: string;
  landscapeRatio?: string[];
  portraitRatio?: string[];
}

// A fresh HeroSingle-shaped row. Translations are pre-seeded for all languages so
// the strict per-item translation schema is satisfied even before the nested
// UnifiedTranslationFields mounts.
function blankSlide() {
  return {
    mediaLandscapeId: undefined,
    mediaPortraitId: undefined,
    mediaLandscapeUrl: '',
    mediaPortraitUrl: '',
    exploreLink: '',
    translations: LANGUAGES.map((l) => ({
      languageId: l.id,
      headline: '',
      exploreText: '',
      caption: '',
    })),
  };
}

/**
 * A reorderable list of HeroSingle items (media pair + explore link + copy),
 * shared by the slideshow / mosaic / lookbook blocks. Uses a nested field array
 * for add/remove/move and reads live values via useWatch so the media previews
 * update as media is picked.
 */
export function SlideListField({
  name,
  translationFields,
  itemLabel = 'slide',
  landscapeRatio,
  portraitRatio,
}: SlideListFieldProps) {
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const watched: any[] = useWatch({ control, name }) || [];

  return (
    <div className='space-y-4'>
      {fields.length === 0 && (
        <Text variant='label' size='small'>
          no {itemLabel}s yet — add one below.
        </Text>
      )}

      {fields.map((field, i) => {
        const slide = watched[i] || {};
        return (
          <div key={field.id} className='space-y-3 border border-textInactiveColor p-3'>
            <div className='flex items-center justify-between'>
              <Text variant='uppercase' size='small'>
                {itemLabel} {i + 1}
              </Text>
              <div className='flex items-center gap-3'>
                <Button
                  type='button'
                  variant='underline'
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  up
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  down
                </Button>
                <Button type='button' variant='underline' onClick={() => remove(i)}>
                  remove
                </Button>
              </div>
            </div>

            <MediaPairField
              prefix={`${name}.${i}`}
              landscapeUrl={slide.mediaLandscapeUrl || ''}
              portraitUrl={slide.mediaPortraitUrl || ''}
              landscapeRatio={landscapeRatio}
              portraitRatio={portraitRatio}
            />

            <InputField
              name={`${name}.${i}.exploreLink`}
              label='explore link (optional)'
              placeholder='https://…'
            />

            <UnifiedTranslationFields
              fieldPrefix={`${name}.${i}.translations`}
              fields={translationFields}
              editMode
            />
          </div>
        );
      })}

      <Button type='button' variant='secondary' size='lg' onClick={() => append(blankSlide())}>
        + add {itemLabel}
      </Button>
    </div>
  );
}
