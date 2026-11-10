import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PaperDoc } from '../assembly-print/paper';
import { LabelFoldEditor } from './label-fold-editor';

const doc = (stem: string) => ({ w: 100, h: 30, prims: [], fileStem: stem }) as unknown as PaperDoc;

const render = (onChange: () => void) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LabelFoldEditor
        widthMm={100}
        heightMm={30}
        pages={1}
        composition
        ribbons={[doc('a'), doc('b')]}
        disabled={false}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );

describe('LabelFoldEditor with built ribbons', () => {
  it('shows the ribbon count as pages without writing the row', () => {
    const onChange = vi.fn();
    const html = render(onChange);
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*aria-label="pages" value="2"/);
    expect(onChange).not.toHaveBeenCalled();
  });
});
