import { useDictionary } from 'lib/providers/dictionary-provider';
import { ChangeEvent, useId } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

interface TagPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Reusable product-tag picker: a text field with autocomplete suggestions from
 * the dictionary's `productTags`, so the admin selects an existing tag instead
 * of typing it blind — while still allowing a custom tag (a drop may reference a
 * tag before products carry it). Controlled (value + onChange) so it works both
 * as an RHF-bound field and inside the link builder's local catalog state.
 */
export function TagPicker({
  value,
  onChange,
  label = 'tag',
  placeholder = 'select or type a tag',
}: TagPickerProps) {
  const { dictionary } = useDictionary();
  const productTags = dictionary?.productTags || [];
  const listId = useId();

  return (
    <div className='space-y-1'>
      {label && (
        <Text component='label' size='small' variant='label'>
          {label}
        </Text>
      )}
      <Input
        value={value}
        list={listId}
        placeholder={placeholder}
        className='border px-2 py-1.5'
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {productTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
