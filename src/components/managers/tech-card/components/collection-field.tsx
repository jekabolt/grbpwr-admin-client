import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Select from 'ui/components/select';
import { FormLabel } from 'ui/form';
import { TechCardFormData } from './schema';

// Radix Select forbids an empty-string item value, so "no collection" needs a sentinel that maps
// back to '' in form state — the same trick the category cascade uses with '0'.
const NONE = '__none__';

// The style's collection, picked from the COLLECTIONS dictionary rather than typed free-hand: a
// hand-typed string that differs from the dictionary entry by a character silently splits the
// collection across the catalogue's filters. `collection` is stored as the NAME (not the id), which
// is what the wire contract and every downstream filter already use.
export function CollectionField({ readOnly }: { readOnly?: boolean }) {
  const { setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const collection = (useWatch({ name: 'collection' }) as string | undefined) ?? '';

  const items = useMemo(() => {
    const names = (dictionary?.collections ?? [])
      .filter((c) => c.name && !c.archived)
      .map((c) => c.name as string);
    // A card saved against a collection that has since been archived (or that predates the
    // dictionary) keeps its value selectable — otherwise opening the card would silently blank a
    // field the user never touched, and the full-replace save would persist that blank.
    if (collection && !names.includes(collection)) names.unshift(collection);
    return [
      { value: NONE, label: '— none —' },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [dictionary?.collections, collection]);

  return (
    <div className='space-y-1'>
      <FormLabel>collection</FormLabel>
      <Select
        name='collection'
        items={items}
        value={collection || NONE}
        readOnly={readOnly}
        onValueChange={(v?: string) =>
          setValue('collection', !v || v === NONE ? '' : v, { shouldDirty: true })
        }
      />
    </div>
  );
}
