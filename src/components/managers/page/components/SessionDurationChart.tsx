import type { SessionDurationMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';

interface SessionDurationChartProps {
  sessionDuration: SessionDurationMetric[] | undefined;
}

export const SessionDurationChart: FC<SessionDurationChartProps> = ({ sessionDuration }) => {
  if (!sessionDuration || sessionDuration.length === 0) return null;

  const data = sessionDuration.map((metric) => {
    const date = metric.date ? new Date(metric.date) : new Date();
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      avgSeconds: metric.avgTimeBetweenEventsSeconds || 0,
      medianSeconds: metric.medianTimeBetweenEvents || 0,
    };
  });

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Session duration (time between events)
      </Text>
      <ResponsiveContainer width='100%' height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray='3 3' stroke='#333' />
          <XAxis dataKey='date' stroke='#999' tick={{ fill: '#999' }} />
          <YAxis 
            stroke='#999' 
            tick={{ fill: '#999' }}
            label={{ value: 'Seconds', angle: -90, position: 'insideLeft', fill: '#999' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number, name: string) => {
              const label = name === 'avgSeconds' ? 'Avg' : 'Median';
              return [`${value.toFixed(1)}s`, label];
            }}
          />
          <Line type='monotone' dataKey='avgSeconds' stroke='#fff' strokeWidth={2} name='Average' />
          <Line type='monotone' dataKey='medianSeconds' stroke='#aaa' strokeWidth={2} strokeDasharray='5 5' name='Median' />
        </LineChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Time between user interactions - higher = more engaged sessions</Text>
      </div>
    </div>
  );
};
