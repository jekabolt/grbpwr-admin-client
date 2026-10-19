import { BarRow, DataTable, EmptyCell, Stat, StatGrid, Stepper, TotalRow, WaterfallRow } from 'ui';
import { emptyCellDemo } from './empty-cell';
import { KitDemo, KitLabel, KitLines } from './kit-entry';

function DataTableDemo() {
  return (
    <div className='flex flex-col gap-gutter'>
      <KitLabel>list</KitLabel>
      <DataTable>
        <thead>
          <tr>
            <th>material</th>
            <th>qty</th>
            <th>price</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>wool 420</td>
            <td>2.10 m</td>
            <td>€ 58.80</td>
          </tr>
          <tr>
            <td>cupro</td>
            <td>1.60 m</td>
            <td>€ 14.40</td>
          </tr>
          <tr>
            <td>trims</td>
            <td>
              <EmptyCell />
            </td>
            <td>
              <EmptyCell />
            </td>
          </tr>
          <TotalRow>
            <td>total</td>
            <td />
            <td>€ 73.20</td>
          </TotalRow>
        </tbody>
      </DataTable>
      <KitLabel>grid</KitLabel>
      <DataTable variant='grid'>
        <thead>
          <tr>
            <th>size</th>
            <th>S</th>
            <th>M</th>
            <th>L</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>chest</td>
            <td>52</td>
            <td>54</td>
            <td>56</td>
          </tr>
          <tr>
            <td>length</td>
            <td>98</td>
            <td>100</td>
            <td>102</td>
          </tr>
        </tbody>
      </DataTable>
    </div>
  );
}

function StatGridDemo() {
  return (
    <StatGrid>
      <Stat label='styles' value='42' />
      <Stat label='samples' value='17' sub='this week' />
      <Stat label='margin' value='+4%' tone='up' />
      <Stat label='late' value='2' tone='down' />
      <Stat label='revenue' value='€ 12k' big />
    </StatGrid>
  );
}

function BarRowDemo() {
  return (
    <div className='flex flex-col gap-gutter'>
      <div>
        <BarRow name='ink' pct={62} value='62%' />
        <BarRow name='up' pct={40} value='+40%' tone='up' />
        <BarRow name='down' pct={18} value='-18%' tone='down' />
      </div>
      <div>
        <WaterfallRow name='revenue' left={0} width={100} value='100' emphasis />
        <WaterfallRow name='cost' left={60} width={40} value='-40' kind='neg' />
        <WaterfallRow name='margin' left={0} width={60} value='60' kind='final' emphasis />
      </div>
    </div>
  );
}

function StepperDemo() {
  return (
    <KitLines
      lines={[
        {
          label: 'default',
          content: (
            <Stepper
              steps={[
                { label: 'draft', done: true },
                { label: 'sample', done: true },
                { label: 'fit', current: true },
                { label: 'release' },
              ]}
            />
          ),
        },
        {
          label: 'separator',
          content: (
            <Stepper separator='·' steps={[{ label: 'cut', current: true }, { label: 'sew' }]} />
          ),
        },
      ]}
    />
  );
}

export const dataDemos: KitDemo[] = [
  { names: ['DataTable', 'TotalRow'], Demo: DataTableDemo },
  emptyCellDemo,
  { names: ['StatGrid', 'Stat'], Demo: StatGridDemo },
  { names: ['BarRow', 'WaterfallRow'], Demo: BarRowDemo },
  { names: ['Stepper'], Demo: StepperDemo },
];
