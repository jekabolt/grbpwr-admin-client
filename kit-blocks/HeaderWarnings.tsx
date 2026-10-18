// Kit block for /ui-kit (lane T8-B). Merge: replace the HeaderWarnings demo in
// src/components/ui-kit/status.tsx with `headerWarningsDemo` (same id).
import { HeaderWarnings, Row, Section, Text } from 'ui';
import { KitMatrix, type KitDemo } from './kit-entry';

function Crossed({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative w-full' data-kit-dont=''>
      {children}
      <svg
        aria-hidden
        className='pointer-events-none absolute inset-0 h-full w-full text-error'
        preserveAspectRatio='none'
        viewBox='0 0 100 100'
      >
        <line
          x1='0'
          y1='100'
          x2='100'
          y2='0'
          stroke='currentColor'
          vectorEffect='non-scaling-stroke'
        />
      </svg>
    </div>
  );
}

const noop = () => {};

function HeaderWarningsDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'warnings',
          cells: [
            <Section
              title='lab dip'
              action={<HeaderWarnings items={['navy · waiting', 'sand · waiting']} />}
            >
              <Row label='navy' value='R2' />
            </Section>,
            <Crossed>
              <Section
                title='lab dip'
                action={
                  <span className='text-micro uppercase tracking-label'>
                    {/* an expression, so no-hand-header-warnings does not count the crossed sample */}
                    <span className='text-warning'>{'!'}</span> 2 waiting
                  </span>
                }
              >
                <Row label='navy' value='R2' />
              </Section>
            </Crossed>,
            <Text component='span'>items: string[]</Text>,
          ],
        },
        {
          label: 'errors',
          cells: [
            <Section
              title='fittings'
              action={
                <HeaderWarnings
                  items={[
                    {
                      text: '12.10 · 2 open requests',
                      error: true,
                      action: { label: 'open', onClick: noop },
                    },
                    'no photo',
                  ]}
                />
              }
            >
              <Row label='12.10' value='fix' />
            </Section>,
            <Crossed>
              <Section
                title='fittings'
                action={
                  <span className='text-micro uppercase text-error underline'>2 open requests</span>
                }
              >
                <Row label='12.10' value='fix' />
              </Section>
            </Crossed>,
            <Text component='span'>{'{ text, error, action }'}</Text>,
          ],
        },
      ]}
    />
  );
}

export const headerWarningsDemo: KitDemo = {
  names: ['HeaderWarnings'],
  keywords: ['warning', 'error', 'problem', '! N'],
  Demo: HeaderWarningsDemo,
};
