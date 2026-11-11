import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { common_TechCardSeam } from 'api/proto-http/admin';
import { CutStripFields } from './cut-strip-fields';

vi.mock('lib/providers/dictionary-provider', () => ({
  useDictionary: () => ({ dictionary: { sizes: [] } }),
}));

const strip = {
  stripKey: 'strip-1',
  lengthMode: 'from_seam',
  seamKey: 'seam-a',
  fitPct: '100',
  overlapMm: '0',
  widthMm: '30',
  qty: 1,
  sizes: [
    { sizeId: 1, seamMm: '465.8', manualCutMm: '' },
    { sizeId: 2, seamMm: '485.8', manualCutMm: '' },
  ],
};

function Form({ children }: { children: ReactNode }) {
  const methods = useForm({
    defaultValues: { cutStrips: [strip], pieces: [], operations: [] } as never,
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

const seam = (status: string, stale = false) =>
  ({ seamKey: 'seam-a', status, stale }) as unknown as common_TechCardSeam;

const seamCells = (html: string) =>
  [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .slice(1)
    .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][1]?.[1] ?? '')
    .map((cell) => cell.replace(/<[^>]+>/g, '').trim());

const renderWith = (seams: common_TechCardSeam[], live?: ReadonlyMap<number, number>) =>
  seamCells(
    renderToStaticMarkup(
      <Form>
        <CutStripFields
          stripIndex={0}
          sizeIds={[1, 2]}
          seams={seams}
          seamLengthsMm={live ? () => live : undefined}
        />
      </Form>,
    ),
  );

describe('seam mm of a strip whose seam decision no longer holds', () => {
  it('shows the seam length for a confirmed seam', () => {
    expect(renderWith([seam('confirmed')])).toEqual(['465.8', '485.8']);
  });

  it.each([
    ['rejected', seam('rejected')],
    ['stale', seam('confirmed', true)],
  ])('shows no stored seam length for a %s seam', (_, row) => {
    const cells = renderWith([row]);
    expect(cells).toHaveLength(2);
    expect(cells).not.toContain('465.8');
    expect(cells).not.toContain('485.8');
  });

  it('shows no live seam length for a rejected seam', () => {
    const cells = renderWith(
      [seam('rejected')],
      new Map([
        [1, 470],
        [2, 490],
      ]),
    );
    expect(cells).toHaveLength(2);
    expect(cells).not.toContain('470');
    expect(cells).not.toContain('490');
  });
});
