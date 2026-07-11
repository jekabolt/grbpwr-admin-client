import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';

const GENDER_LABELS: Record<string, string> = {
  GENDER_ENUM_FEMALE: 'women',
  GENDER_ENUM_MALE: 'men',
  GENDER_ENUM_UNISEX: 'unisex',
  men: 'men',
  women: 'women',
  unisex: 'unisex',
};

// Filter params represented as chips (navigational params like categories are excluded).
const CHIP_PARAM_KEYS = [
  'gender',
  'color',
  'sizes',
  'size',
  'sale',
  'preorder',
  'hidden',
  'tag',
  'from',
  'to',
  'limit',
];

interface Chip {
  key: string;
  label: string;
  remove: () => void;
}

export function ActiveFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const get = (k: string) => searchParams.get(k) || '';

  const removeKeys = (keys: string[]) => {
    const next = new URLSearchParams(searchParams);
    keys.forEach((k) => next.delete(k));
    setSearchParams(next);
  };

  const chips: Chip[] = [];

  const gender = get('gender');
  if (gender && gender !== 'all') {
    chips.push({
      key: 'gender',
      label: `gender: ${GENDER_LABELS[gender] ?? gender.toLowerCase()}`,
      remove: () => removeKeys(['gender']),
    });
  }

  const color = get('color');
  if (color && color !== 'all') {
    chips.push({ key: 'color', label: `color: ${color}`, remove: () => removeKeys(['color']) });
  }

  const sizes = get('sizes') || get('size');
  if (sizes) {
    const n = sizes.split(',').filter(Boolean).length;
    chips.push({
      key: 'sizes',
      label: `sizes (${n})`,
      remove: () => removeKeys(['sizes', 'size']),
    });
  }

  if (get('sale') === 'true') {
    chips.push({ key: 'sale', label: 'on sale', remove: () => removeKeys(['sale']) });
  }
  if (get('preorder') === 'true') {
    chips.push({ key: 'preorder', label: 'preorder', remove: () => removeKeys(['preorder']) });
  }
  if (get('hidden') === 'false') {
    chips.push({ key: 'hidden', label: 'hidden excluded', remove: () => removeKeys(['hidden']) });
  }

  const tag = get('tag');
  if (tag) {
    chips.push({ key: 'tag', label: `tag: ${tag}`, remove: () => removeKeys(['tag']) });
  }

  const from = get('from');
  const to = get('to');
  if (from || to) {
    const currency = get('currency');
    const range = `${from || '0'}–${to || '∞'}${currency ? ` ${currency}` : ''}`;
    chips.push({
      key: 'price',
      label: `price: ${range}`,
      remove: () => removeKeys(['from', 'to']),
    });
  }

  const limit = get('limit');
  if (limit) {
    chips.push({ key: 'limit', label: `latest ${limit}`, remove: () => removeKeys(['limit']) });
  }

  if (!chips.length) return null;

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Text variant='inactive' size='small'>
        filters:
      </Text>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type='button'
          onClick={chip.remove}
          className='flex items-center gap-1 border border-textInactiveColor px-2 py-0.5 text-textBaseSize uppercase transition-colors hover:bg-textColor hover:text-bgColor cursor-pointer'
        >
          {chip.label}
          <span aria-hidden>×</span>
        </button>
      ))}
      <button
        type='button'
        onClick={() => removeKeys(CHIP_PARAM_KEYS)}
        className='underline underline-offset-2 hover:opacity-70 cursor-pointer'
      >
        <Text variant='inactive' size='small'>
          clear all
        </Text>
      </button>
    </div>
  );
}
