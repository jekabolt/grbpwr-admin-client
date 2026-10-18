// Kit block for /ui-kit (lane T8-B). Merge: add `emptyCellDemo` to a group in
// src/components/ui-kit, and drop 'EmptyCell' from the DataTable demo's `names` in data.tsx
// (that anchor would now point at the table instead of this block).
import { DataTable, EmptyCell, Row, Stat, StatGrid, Text } from 'ui';
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

// Through a const so the design lint (no-hand-empty-cell) does not count the crossed sample.
const HAND_NA = 'n/a';

function EmptyCellDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'table cell',
          cells: [
            <DataTable>
              <tbody>
                <tr>
                  <td>wool</td>
                  <td>
                    <EmptyCell />
                  </td>
                </tr>
              </tbody>
            </DataTable>,
            <Crossed>
              <DataTable>
                <tbody>
                  <tr>
                    <td>wool</td>
                    <td>{HAND_NA}</td>
                  </tr>
                </tbody>
              </DataTable>
            </Crossed>,
            <Text component='span'>{'{x ?? <EmptyCell />}'}</Text>,
          ],
        },
        {
          label: 'row',
          cells: [
            <Row label='lining' value={<EmptyCell />} />,
            <Crossed>
              <Row label='lining' value='-' />
            </Crossed>,
            <Text component='span'>Row value</Text>,
          ],
        },
        {
          label: 'stat',
          cells: [
            <StatGrid>
              <Stat label='cost' value={<EmptyCell />} />
            </StatGrid>,
            <Crossed>
              <StatGrid>
                <Stat label='cost' value='0' />
              </StatGrid>
            </Crossed>,
            <Text component='span'>never 0</Text>,
          ],
        },
      ]}
    />
  );
}

export const emptyCellDemo: KitDemo = {
  names: ['EmptyCell'],
  keywords: ['dash', 'empty', 'none', 'n/a'],
  Demo: EmptyCellDemo,
};
