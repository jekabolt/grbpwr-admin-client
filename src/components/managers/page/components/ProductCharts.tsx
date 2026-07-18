import type { BusinessMetrics } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import type {
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
  XAXisComponentOption,
  YAXisComponentOption,
} from 'echarts';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  categoryAxis,
  ChartCard,
  chartColors,
  EChart,
  gridBase,
  tooltipBase,
  valueAxis,
} from '../charts';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ProductChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const ProductCharts: FC<ProductChartsProps> = ({ metrics }) => {
  const navigate = useNavigate();
  if (!metrics) return null;

  const commerce = metrics.commerce;
  const revenueData =
    commerce?.topProductsByRevenue?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: parseDecimal(p.value),
      count: p.count ?? 0,
      productId: p.productId,
    })) ?? [];

  const quantityData =
    commerce?.topProductsByQuantity?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: p.count ?? 0,
      revenue: parseDecimal(p.value),
      productId: p.productId,
    })) ?? [];

  // Revenue rank with margin, so a top seller that's actually low-margin is visible.
  const revenueMarginRows =
    commerce?.topProductsByRevenue?.slice(0, 10).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      revenue: parseDecimal(p.value),
      units: p.count ?? 0,
      marginPct: p.grossMarginPct,
      hasCost: p.hasCost ?? false,
    })) ?? [];
  const anyCosted = revenueMarginRows.some((r) => r.hasCost);

  const handleProductBarClick = (params: { data?: unknown }) => {
    const id = (params.data as { productId?: number })?.productId;
    if (id != null && !isNaN(id)) {
      navigate(`${BASE_PATH}/products/${id}`);
    }
  };

  const categoryData =
    commerce?.revenueByCategory?.map((c) => ({
      name: (c.categoryDisplayName || c.categoryName || `#${c.categoryId}`).slice(0, 20),
      value: parseDecimal(c.value),
      count: c.count ?? 0,
      sharePct: c.sharePct,
    })) ?? [];

  // Horizontal bar swaps axes: the category helper feeds yAxis, the value helper xAxis.
  const hValueAxis = (o: YAXisComponentOption): XAXisComponentOption =>
    valueAxis(o) as unknown as XAXisComponentOption;
  const hCategoryAxis = (o: XAXisComponentOption): YAXisComponentOption =>
    categoryAxis(o) as unknown as YAXisComponentOption;

  const makeTooltipFormatter =
    (format: (v: number) => string) => (raw: TooltipComponentFormatterCallbackParams) => {
      const items = Array.isArray(raw) ? raw : [raw];
      const label = items[0]?.name ?? '';
      const rows = items
        .map((it) => `${it.marker ?? ''}<b>${format(Number(it.value ?? 0))}</b>`)
        .join('<br/>');
      return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
    };

  const revenueOption: EChartsOption = {
    grid: { ...gridBase },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: makeTooltipFormatter(formatCurrency),
    },
    xAxis: hValueAxis({ axisLabel: { formatter: (v: number) => formatCurrency(v) } }),
    yAxis: hCategoryAxis({ type: 'category', data: revenueData.map((d) => d.name), inverse: true }),
    series: [
      {
        type: 'bar',
        data: revenueData.map((d) => ({ value: d.value, productId: d.productId })),
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  const quantityOption: EChartsOption = {
    grid: { ...gridBase },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: makeTooltipFormatter((v) => formatNumber(v)),
    },
    xAxis: hValueAxis({ axisLabel: { formatter: (v: number) => formatNumber(v) } }),
    yAxis: hCategoryAxis({
      type: 'category',
      data: quantityData.map((d) => d.name),
      inverse: true,
    }),
    series: [
      {
        type: 'bar',
        data: quantityData.map((d) => ({ value: d.value, productId: d.productId })),
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  const categoryTooltip = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const idx = items[0]?.dataIndex;
    const share = typeof idx === 'number' ? categoryData[idx]?.sharePct : undefined;
    const label = items[0]?.name ?? '';
    const shareLine =
      share != null && share > 0 ? ` <span style="color:#666">· ${share.toFixed(0)}%</span>` : '';
    return `<div style="font-size:11px;line-height:1.6">${label}<br/><b>${formatCurrency(
      Number(items[0]?.value ?? 0),
    )}</b>${shareLine}</div>`;
  };

  const categoryOption: EChartsOption = {
    grid: { ...gridBase },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: categoryTooltip,
    },
    xAxis: hValueAxis({ axisLabel: { formatter: (v: number) => formatCurrency(v) } }),
    yAxis: hCategoryAxis({
      type: 'category',
      data: categoryData.map((d) => d.name),
      inverse: true,
    }),
    series: [
      {
        type: 'bar',
        data: categoryData.map((d) => d.value),
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Products & categories
      </Text>
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {revenueData.length > 0 && (
          <ChartCard title='Top products by revenue'>
            <EChart
              option={revenueOption}
              height={220}
              onEvents={{ click: handleProductBarClick }}
            />
          </ChartCard>
        )}
        {quantityData.length > 0 && (
          <ChartCard title='Top products by quantity'>
            <EChart
              option={quantityOption}
              height={220}
              onEvents={{ click: handleProductBarClick }}
            />
          </ChartCard>
        )}
        {categoryData.length > 0 && (
          <ChartCard title='Revenue by category'>
            <EChart option={categoryOption} height={220} />
          </ChartCard>
        )}
      </div>

      {revenueMarginRows.length > 0 && (
        <div className='border border-textInactiveColor p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
            <Text variant='uppercase' className='font-bold block'>
              Top products — revenue vs margin
            </Text>
            {!anyCosted && (
              <Text variant='label' size='small'>
                add product cost to see margin
              </Text>
            )}
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-textBaseSize'>
              <thead>
                <tr className='border-b border-textInactiveColor'>
                  <th className='text-left p-2'>
                    <Text variant='uppercase' className='text-textBaseSize'>
                      Product
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-textBaseSize'>
                      Revenue
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-textBaseSize'>
                      Units
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-textBaseSize'>
                      Margin
                    </Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {revenueMarginRows.map((row, idx) => (
                  <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                    <td className='p-2'>
                      <ProductNameLink
                        productId={row.productId}
                        productName={row.productName}
                        maxWidth='150px'
                      />
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatCurrency(row.revenue)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatNumber(row.units)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      {row.hasCost && row.marginPct != null ? (
                        <Text>{row.marginPct.toFixed(0)}%</Text>
                      ) : (
                        <Text variant='label'>N/A</Text>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
