// СТЕНД РАСКРЫТОЙ СТРОКИ УКАЗАНИЯ (T21, R23–R29). Настоящий CalloutRail в FormProvider; гоняется
// scripts/callout-row-probe.mjs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { CalloutRail } from 'components/managers/tech-card/components/design/callout-rail';
import { seamClassOptions } from 'components/managers/tech-card/components/operation-options';

const seam =
  seamClassOptions.find((o) => /LAP/.test(String(o.value)))?.value ?? seamClassOptions[1].value;
const base = {
  part: '',
  dimensions: '',
  mediaId: 1,
  posX: '0.5',
  posY: '0.5',
  points: [],
  parts: [],
  color: '',
  dashed: false,
  filled: false,
};
const callouts = [
  {
    ...base,
    number: 1,
    kind: 'polygon',
    description: 'yoke panel',
    points: [
      { x: '0.1', y: '0.1' },
      { x: '0.5', y: '0.1' },
      { x: '0.5', y: '0.5' },
    ],
  },
  {
    ...base,
    number: 2,
    kind: 'label',
    description: 'side seam',
    spec: JSON.stringify({ t: 'stitch', iso: '301', seam, stcm: '4' }),
  },
  { ...base, number: 3, kind: 'dim', description: 'hem', caps: 'arrow' },
  {
    ...base,
    number: 4,
    kind: 'label',
    description: 'chain at waist',
    spec: JSON.stringify({ t: 'stitch', iso: '602' }),
  },
  {
    ...base,
    number: 5,
    kind: 'label',
    description: 'empty stitch',
    spec: JSON.stringify({ t: 'stitch' }),
  },
];

function Rail({ sel, tag }: { sel: number; tag: string }) {
  const form = useForm({ defaultValues: { callouts } as never });
  return (
    <FormProvider {...form}>
      <Inner sel={sel} tag={tag} />
    </FormProvider>
  );
}
function Inner({ sel, tag }: { sel: number; tag: string }) {
  const cs = (useWatch({ name: 'callouts' }) ?? []) as typeof callouts;
  const [s, setS] = useState<number | null>(sel);
  const [h, setH] = useState<number | null>(null);
  return (
    <div data-bench={tag} style={{ width: 460, background: '#fff', padding: 12 }}>
      <CalloutRail
        rows={cs.map((c, i) => ({ index: i, c: c as never, where: 'front' }))}
        selected={s}
        onSelect={setS}
        hoverIndex={h}
        onHover={setH}
        onRemove={() => {}}
        caps
        purposes
      />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#eee' }}
    >
      <Rail sel={0} tag='zone' />
      <Rail sel={2} tag='line' />
      <Rail sel={1} tag='stitch' />
      <Rail sel={3} tag='stitch602' />
      <Rail sel={4} tag='stitchempty' />
    </div>
  </QueryClientProvider>,
);
