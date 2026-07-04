import { LANGUAGES } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { LinkField } from './link-field';
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
 * shared by the slideshow / mosaic / lookbook blocks. Each item is a collapsible
 * row — a compact summary (thumbnail + primary copy) that expands to the full
 * editor — so a long list stays scannable instead of a giant stacked scroll.
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const prevLen = useRef(fields.length);

  // Auto-expand a newly added item (not existing ones on mount).
  useEffect(() => {
    if (fields.length > prevLen.current) {
      const newId = fields[fields.length - 1]?.id;
      if (newId) setExpanded((prev) => new Set(prev).add(newId));
    }
    prevLen.current = fields.length;
  }, [fields]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const primaryKey = translationFields[0]?.name;
  const summaryOf = (slide: any): string => {
    const list = slide?.translations || [];
    const t = list.find((x: any) => x?.languageId === 1) || list[0];
    return primaryKey ? (t?.[primaryKey] || '').trim() : '';
  };

  return (
    <div className='space-y-3'>
      {fields.length === 0 && (
        <Text variant='label' size='small'>
          no {itemLabel}s yet — add one below.
        </Text>
      )}

      {fields.map((field, i) => {
        const slide = watched[i] || {};
        const isOpen = expanded.has(field.id);
        const thumb = slide.mediaLandscapeUrl || slide.mediaPortraitUrl || '';
        const summary = summaryOf(slide);

        return (
          <div key={field.id} className='border border-textInactiveColor'>
            <div className='flex items-center gap-1 p-2'>
              <button
                type='button'
                onClick={() => toggle(field.id)}
                aria-expanded={isOpen}
                className='flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=''
                    className='h-9 w-9 shrink-0 border border-textInactiveColor object-cover'
                  />
                ) : (
                  <div className='h-9 w-9 shrink-0 border border-dashed border-textInactiveColor' />
                )}
                <span className='flex min-w-0 flex-1 flex-col'>
                  <Text variant='label' size='small'>
                    {itemLabel} {i + 1}
                  </Text>
                  {summary && (
                    <Text size='small' className='truncate'>
                      {summary}
                    </Text>
                  )}
                </span>
                <span className='shrink-0 text-labelColor'>{isOpen ? '▴' : '▾'}</span>
              </button>

              <div className='flex shrink-0 items-center'>
                <button
                  type='button'
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`move ${itemLabel} up`}
                  className='px-1.5 py-1 leading-none cursor-pointer text-textInactiveColor hover:text-textColor disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  ↑
                </button>
                <button
                  type='button'
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`move ${itemLabel} down`}
                  className='px-1.5 py-1 leading-none cursor-pointer text-textInactiveColor hover:text-textColor disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  ↓
                </button>
                <button
                  type='button'
                  onClick={() => remove(i)}
                  aria-label={`remove ${itemLabel}`}
                  className='px-1.5 py-1 leading-none cursor-pointer text-textInactiveColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  ×
                </button>
              </div>
            </div>

            {isOpen && (
              <div className='space-y-3 border-t border-textInactiveColor p-3'>
                <MediaPairField
                  prefix={`${name}.${i}`}
                  landscapeUrl={slide.mediaLandscapeUrl || ''}
                  portraitUrl={slide.mediaPortraitUrl || ''}
                  landscapeRatio={landscapeRatio}
                  portraitRatio={portraitRatio}
                />

                <LinkField name={`${name}.${i}.exploreLink`} label='explore link (optional)' />

                <UnifiedTranslationFields
                  fieldPrefix={`${name}.${i}.translations`}
                  fields={translationFields}
                  editMode
                />
              </div>
            )}
          </div>
        );
      })}

      <Button type='button' variant='secondary' size='lg' onClick={() => append(blankSlide())}>
        + add {itemLabel}
      </Button>
    </div>
  );
}
