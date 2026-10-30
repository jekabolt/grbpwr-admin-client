import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SelectComponent from './select';

const items = [
  { value: '', label: 'plain' },
  { value: 'faced_split', label: 'turned' },
];

describe('SelectComponent — an empty option that is chosen', () => {
  it.each([[''], [undefined]])('value %j reads as selected, not as the placeholder', (value) => {
    const html = renderToStaticMarkup(
      <SelectComponent name='edge' items={items} value={value as string} />,
    );
    expect(html).not.toContain('data-placeholder');
  });

  it('without an empty option an empty value stays the placeholder', () => {
    const html = renderToStaticMarkup(
      <SelectComponent name='edge' items={items.slice(1)} value='' />,
    );
    expect(html).toContain('data-placeholder');
  });
});
