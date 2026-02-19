import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface CurrencyPaymentChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const CurrencyPaymentCharts: FC<CurrencyPaymentChartsProps> = ({ metrics }) => {
  if (!metrics) return null;

  const currencyData =
    metrics.revenueByCurrency?.map((c) => ({
      name: c.currency || 'Unknown',
      value: parseDecimal(c.value),
      count: c.count ?? 0,
    })) ?? [];

  const paymentData =
    metrics.revenueByPaymentMethod?.map((p) => ({
      name: (p.paymentMethod ?? 'Unknown')
        .replace(/PAYMENT_METHOD_NAME_ENUM_/g, '')
        .replace(/_/g, ' '),
      value: parseDecimal(p.value),
      count: p.count ?? 0,
    })) ?? [];

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Currency & payment
      </Text>
      <div className='grid gap-4 md:grid-cols-2'>
        {currencyData.length > 0 && (
          <div className='border border-textInactiveColor p-4 min-h-[280px]'>
            <Text variant='uppercase' className='font-bold mb-4 block'>
              Revenue by currency
            </Text>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={currencyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis dataKey='name' tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  formatter={(value?: number) => [value != null ? formatCurrency(value) : '', '']}
                />
                <Bar dataKey='value' fill='#000' radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {paymentData.length > 0 && (
          <div className='border border-textInactiveColor p-4 min-h-[280px]'>
            <Text variant='uppercase' className='font-bold mb-4 block'>
              Revenue by payment method
            </Text>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={paymentData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis dataKey='name' tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  formatter={(value?: number) => [value != null ? formatCurrency(value) : '', '']}
                />
                <Bar dataKey='value' fill='#000' radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
