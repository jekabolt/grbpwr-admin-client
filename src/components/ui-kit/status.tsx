import {
  CalloutBox,
  HeaderWarnings,
  Pill,
  Placeholder,
  Progress,
  SkeletonBlocks,
  SkeletonLine,
  SkeletonRows,
} from 'ui';
import { KitDemo, KitLines, KitMatrix } from './kit-entry';

function PillDemo() {
  const tones = ['ok', 'warn', 'attention', 'mut', 'ink', 'gap'] as const;
  return (
    <KitMatrix
      cols={[...tones]}
      rows={[{ label: 'tone', cells: tones.map((t) => <Pill tone={t}>{t}</Pill>) }]}
    />
  );
}

function CalloutDemo() {
  return (
    <KitLines
      lines={[
        { label: 'note', content: <CalloutBox>3 sizes open</CalloutBox> },
        { label: 'warning', content: <CalloutBox tone='warning'>round 2</CalloutBox> },
        { label: 'error', content: <CalloutBox tone='error'>trims missing</CalloutBox> },
      ]}
    />
  );
}

function HeaderWarningsDemo() {
  return (
    <KitLines
      lines={[
        { label: 'warnings', content: <HeaderWarnings items={['no lining', 'no care label']} /> },
        {
          label: 'errors',
          content: (
            <HeaderWarnings items={[{ text: 'trims missing', error: true }, 'no lining']} />
          ),
        },
      ]}
    />
  );
}

function ProgressDemo() {
  return (
    <KitLines
      lines={[0, 62, 100].map((v) => ({ label: `${v}%`, content: <Progress value={v} /> }))}
    />
  );
}

function SkeletonDemo() {
  return (
    <KitLines
      lines={[
        {
          label: 'line',
          content: (
            <div className='flex w-full flex-col gap-1.5'>
              <SkeletonLine width='70%' />
              <SkeletonLine width='50%' />
            </div>
          ),
        },
        {
          label: 'rows',
          content: (
            <table className='w-full'>
              <tbody>
                <SkeletonRows rows={2} widths={['60%', '30%', '40%']} />
              </tbody>
            </table>
          ),
        },
        {
          label: 'blocks',
          content: <SkeletonBlocks count={2} height={32} className='w-full' />,
        },
      ]}
    />
  );
}

function PlaceholderDemo() {
  return (
    <KitMatrix
      cols={['auto', 'square', '3/4', '4/3']}
      rows={[
        {
          label: 'default',
          cells: [
            <Placeholder label='empty' className='h-16 w-full' />,
            <Placeholder label='square' aspect='square' className='w-24' />,
            <Placeholder label='3/4' aspect='3/4' className='w-24' />,
            <Placeholder label='4/3' aspect='4/3' className='w-24' />,
          ],
        },
        {
          label: 'dashed · error',
          cells: [
            <Placeholder label='dashed' dashed className='h-16 w-full' />,
            <Placeholder label='error' tone='error' aspect='square' className='w-24' />,
          ],
        },
      ]}
    />
  );
}

export const statusDemos: KitDemo[] = [
  { names: ['Pill'], Demo: PillDemo },
  { names: ['CalloutBox'], Demo: CalloutDemo },
  { names: ['HeaderWarnings'], Demo: HeaderWarningsDemo },
  { names: ['Progress'], Demo: ProgressDemo },
  { names: ['SkeletonLine', 'SkeletonRows', 'SkeletonBlocks'], Demo: SkeletonDemo },
  { names: ['Placeholder'], Demo: PlaceholderDemo },
];
