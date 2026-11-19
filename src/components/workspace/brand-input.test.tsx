import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from 'ui';
import { describe, expect, it } from 'vitest';

// react-hook-form's `register(name)` finds the field by `event.target.name`: an input that drops
// `name` swallows every keystroke (the /workspace brand form never became dirty, no save dock).
describe('brand input', () => {
  it('puts name on the native input', () => {
    const html = renderToStaticMarkup(<Input name='brandName' aria-label='brand name' />);
    expect(html).toMatch(/<input[^>]* name="brandName"/);
    expect(html).toMatch(/<input[^>]* id="brandName"/);
  });

  it('renders no name attribute without one', () => {
    expect(renderToStaticMarkup(<Input aria-label='x' />)).not.toMatch(/ name=/);
  });
});
