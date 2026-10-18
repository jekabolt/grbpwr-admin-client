import {
  Button,
  GroupLabel,
  HeaderWarnings,
  Row,
  Section,
  SectionStack,
  Stat,
  StatGrid,
  Text,
  Toolbar,
  ToolbarSpacer,
} from 'ui';
import { KitDemo, KitMatrix } from './kit-entry';

/**
 * How blocks sit next to each other — DESIGN.md «Neighbours». Every sample is the real primitive
 * on the real ground; the class column is what the code does (section.tsx, shell/layout.tsx), not
 * what the draft hoped. A crossed sample is the shape that must not ship.
 */

function Ground({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`w-full bg-pageBg p-2.5 ${className ?? ''}`}>{children}</div>;
}

function Crossed({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative w-full'>
      {children}
      <svg
        aria-hidden
        className='pointer-events-none absolute inset-0 h-full w-full text-error'
        preserveAspectRatio='none'
        viewBox='0 0 100 100'
      >
        <line x1='0' y1='100' x2='100' y2='0' stroke='currentColor' vectorEffect='non-scaling-stroke' />
      </svg>
    </div>
  );
}

function Mini({ title }: { title: string }) {
  return (
    <Section title={title}>
      <Row label='fabric' value='wool' />
    </Section>
  );
}

const STATS = (
  <StatGrid>
    <Stat label='styles' value='42' />
    <Stat label='late' value='2' tone='down' />
  </StatGrid>
);

function NeighboursDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'under',
          cells: [
            <Ground>
              <SectionStack>
                <Mini title='shell' />
                <Mini title='lining' />
              </SectionStack>
            </Ground>,
            null,
            <Text component='span'>SectionStack · gap-gutter</Text>,
          ],
        },
        {
          label: 'beside',
          cells: [
            <Ground>
              <SectionStack row>
                <Mini title='shell' />
                <Mini title='lining' />
              </SectionStack>
            </Ground>,
            <Crossed>
              <Ground>
                <div className='flex'>
                  <Mini title='shell' />
                  <Mini title='lining' />
                </div>
              </Ground>
            </Crossed>,
            <Text component='span'>SectionStack row · lg:flex-row gap-gutter</Text>,
          ],
        },
        {
          label: 'in',
          cells: [
            <Ground>
              <Section title='materials'>
                <GroupLabel flush>shell</GroupLabel>
                <Row label='fabric' value='wool' />
                <GroupLabel>lining</GroupLabel>
                <Row label='fabric' value='cupro' />
              </Section>
            </Ground>,
            <Crossed>
              <Ground>
                <Section title='materials'>
                  <Mini title='shell' />
                </Section>
              </Ground>
            </Crossed>,
            <Text component='span'>GroupLabel + Row</Text>,
          ],
        },
        {
          label: 'own surface',
          cells: [
            <Ground>
              <SectionStack>
                {STATS}
                <Mini title='shell' />
              </SectionStack>
            </Ground>,
            <Crossed>
              <Ground>
                <Section title='stats'>{STATS}</Section>
              </Ground>
            </Crossed>,
            <Text component='span'>StatGrid · Tiles · Board</Text>,
          ],
        },
        {
          label: 'toolbar',
          cells: [
            <Ground>
              <SectionStack>
                <Toolbar>
                  <Text component='span'>filters</Text>
                  <ToolbarSpacer />
                </Toolbar>
                <Mini title='entries' />
              </SectionStack>
            </Ground>,
            null,
            <Text component='span'>SectionStack · gap-gutter</Text>,
          ],
        },
        {
          label: 'inside',
          cells: [
            <Ground>
              <Section
                title='shell'
                action={
                  <Button variant='underline' size='xs'>
                    edit
                  </Button>
                }
              >
                <Row label='fabric' value='wool' />
                <Row label='weight' value='420 g/m²' />
              </Section>
            </Ground>,
            null,
            <Text component='span'>p-block · space-y-stack</Text>,
          ],
        },
        {
          label: 'page edge',
          cells: [
            <Ground>
              <Mini title='page' />
            </Ground>,
            null,
            <Text component='span'>Layout · px-2.5 pt-26</Text>,
          ],
        },
        {
          label: 'warnings',
          cells: [
            <Ground>
              <Section title='trims' action={<HeaderWarnings items={[{ text: 'missing', error: true }]} />}>
                <Row label='label' value='missing' tone='error' />
              </Section>
            </Ground>,
            null,
            <Text component='span'>HeaderWarnings</Text>,
          ],
        },
      ]}
    />
  );
}

export const neighboursDemo: KitDemo = {
  names: ['neighbours'],
  question: 'DESIGN.md',
  keywords: ['соседство', 'neighbor', 'gap', 'nest', 'divider', 'beside'],
  Demo: NeighboursDemo,
};

// A block header carries actions as underlined words only (`edit`, `+ add`, `delete`); a framed
// or filled button belongs to the page, not to a block.
function HeaderActionsDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'actions',
          cells: [
            <Ground>
              <Section
                title='trims'
                action={
                  <>
                    <Button variant='underline' size='xs'>
                      edit
                    </Button>
                    <Button variant='underline' size='xs'>
                      + add
                    </Button>
                  </>
                }
              >
                <Row label='label' value='woven' />
              </Section>
            </Ground>,
            <Crossed>
              <Ground>
                <Section
                  title='trims'
                  action={
                    <>
                      <Button variant='secondary' size='sm'>
                        edit
                      </Button>
                      <Button variant='main' size='sm'>
                        add
                      </Button>
                    </>
                  }
                >
                  <Row label='label' value='woven' />
                </Section>
              </Ground>
            </Crossed>,
            <Text component='span'>Button underline · xs</Text>,
          ],
        },
      ]}
    />
  );
}

export const headerActionsDemo: KitDemo = {
  names: ['header-actions'],
  title: 'header actions',
  question: 'DESIGN.md',
  keywords: ['edit', 'add', 'delete'],
  Demo: HeaderActionsDemo,
};
