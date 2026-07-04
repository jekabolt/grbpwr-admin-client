import { cn } from 'lib/utility';
import {
  buildStorefrontLink,
  parseStorefrontLink,
  StorefrontLink,
  StorefrontLinkType,
} from 'lib/storefront-links';
import { ChangeEvent, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

interface LinkFieldProps {
  /** RHF form path holding the URL string (unchanged contract). */
  name: string;
  label: string;
  optional?: boolean;
}

const TYPE_TABS: { value: StorefrontLinkType; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'product', label: 'product' },
  { value: 'catalog', label: 'catalog' },
  { value: 'archive', label: 'archive' },
  { value: 'external', label: 'custom url' },
];

/**
 * Structured picker for a hero "explore / CTA" link. Replaces the raw URL input:
 * the user picks a target (product / catalog+filters / archive / custom / none)
 * and the component serializes it to the URL string the storefront expects (via
 * lib/storefront-links), writing that string back to the same form field — so
 * the contract is unchanged. On edit, the stored URL is parsed back into the
 * picker; anything unrecognized falls back to "custom url" and stays editable.
 */
export function LinkField({ name, label, optional }: LinkFieldProps) {
  const { watch, setValue } = useFormContext();
  const raw: string = watch(name) || '';
  const [link, setLink] = useState<StorefrontLink>(() => parseStorefrontLink(raw));

  // Re-sync when the form value changes from outside (form reset / duplicate),
  // but not on our own writes (then raw already equals build(link)).
  useEffect(() => {
    if (raw !== buildStorefrontLink(link)) setLink(parseStorefrontLink(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const update = (next: StorefrontLink) => {
    setLink(next);
    setValue(name, buildStorefrontLink(next), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const changeType = (type: StorefrontLinkType) => {
    if (type === link.type) return;
    switch (type) {
      case 'none':
        return update({ type: 'none' });
      case 'external':
        return update({ type: 'external', url: link.type === 'external' ? link.url : '' });
      case 'product':
        return update({ type: 'product', slug: link.type === 'product' ? link.slug : '' });
      case 'archive':
        return update({ type: 'archive', slug: link.type === 'archive' ? link.slug : '' });
      case 'catalog':
        return update(link.type === 'catalog' ? link : { type: 'catalog' });
    }
  };

  return (
    <div className='space-y-2'>
      <Text component='label' size='small' variant='label'>
        {label}
        {optional ? ' (optional)' : ''}
      </Text>

      <div className='flex flex-wrap gap-1'>
        {TYPE_TABS.map((t) => {
          const active = link.type === t.value;
          return (
            <button
              key={t.value}
              type='button'
              onClick={() => changeType(t.value)}
              aria-pressed={active}
              className={cn(
                'border px-2 py-1 text-small uppercase leading-none cursor-pointer',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                active
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textColor',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {link.type === 'external' && (
        <Input
          value={link.url}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update({ type: 'external', url: e.target.value })
          }
          placeholder='https://…'
          className='border px-2 py-1.5'
        />
      )}

      {link.type === 'none' && (
        <Text variant='label' size='small'>
          this block has no link.
        </Text>
      )}
    </div>
  );
}
