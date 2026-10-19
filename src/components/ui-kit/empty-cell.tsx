import { DataTable, EmptyCell, Row, Stat, StatGrid, Text } from 'ui';
import { Crossed, KitMatrix, type KitDemo } from './kit-entry';

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
