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

const renderTee = (foldAxis = '') =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LabelFoldEditor
        widthMm={foldAxis === 'width' ? 100 : 30}
        heightMm={foldAxis === 'width' ? 30 : 100}
        widthValue={foldAxis === 'width' ? '100' : '30'}
        heightValue={foldAxis === 'width' ? '30' : '100'}
        fold='tee'
        foldAxis={foldAxis}
        foldLinesMm='42,58'
        stitchLinesMm='47,53'
        pages={1}
        composition
        disabled={false}
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );

describe('LabelFoldEditor tee fold', () => {
  it.each([
    ['', '30 × 84'],
    ['width', '84 × 30'],
  ])('draws the band, side and joined front on the %s axis', (foldAxis, folded) => {
    const html = renderTee(foldAxis);
    expect(html).toContain('data-label-tee-band');
    expect(html).toContain('data-label-folded-view="tee"');
    expect(html).toContain('aria-label="T fold side"');
    expect(html).toContain('aria-label="fold a"');
    expect(html).toContain('aria-label="fold b"');
    expect(html).toContain('aria-label="in seam"');
    expect(html).toContain('value="8"');
    expect(html).toContain('mm from tip');
    expect(html).toContain(folded);
    expect(html).not.toContain('aria-label="pages"');
  });
});

describe('LabelFoldEditor prints', () => {
  it('server-renders prints on the flat label canvas', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <LabelFoldEditor
          widthMm={44}
          heightMm={28}
          widthValue='44'
          heightValue='28'
          fold='flat'
          pages={1}
          composition={false}
          prints={[
            {
              id: 1,
              name: 'grbpwr logo',
              libraryFileId: 9,
              method: 'screen',
              colour: 'black',
              widthMm: '30',
              heightMm: '8',
              xMm: '7',
              yMm: '6',
            },
          ]}
          disabled={false}
          onChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('GRBPWR LOGO');
    expect(html).toContain('stroke="var(--color-warning)"');
  });
});

describe('LabelFoldEditor reads the attachment fact (J1, owner 14.11)', () => {
  const renderAttach = (attachment: string) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <LabelFoldEditor
          widthMm={50}
          heightMm={20}
          widthValue='50'
          heightValue='20'
          fold='flat'
          attachment={attachment}
          pages={1}
          composition={false}
          disabled={false}
          onChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
  it('a hung label has no sewn edge on either picture and no sewn side', () => {
    const html = renderAttach('hung');
    expect(html).not.toContain('data-label-sewn-edge');
    expect(html).not.toContain('sewn side');
    expect(html).not.toContain('data-label-attach');
  });
  it('corner tacks show the corners on both pictures, as on the tile', () => {
    const html = renderAttach('corner tacks');
    expect(html.match(/data-label-attach="corners"/g)).toHaveLength(2);
    expect(html).toContain('sewn side');
    expect(html.match(/data-label-sewn-edge/g)?.length).toBe(2);
  });
});
