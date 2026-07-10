import type { ECElementEvent, EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { CSSProperties, FC } from 'react';
import { echarts } from './echarts';
import { baseTextStyle } from './theme';

export interface EChartProps {
  option: EChartsOption;
  /** Plot height in px (the frame/title lives in ChartCard). */
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  /** ECharts events, e.g. `{ click: (p) => ... }`. */
  onEvents?: Record<string, (params: ECElementEvent) => void>;
  /** Replace the whole option on update (default). Set false to merge. */
  notMerge?: boolean;
}

/**
 * Thin wrapper over the tree-shaken ECharts core instance. Applies the shared
 * root `textStyle` and a transparent background so charts sit on the card, then
 * hands off to `echarts-for-react`, which owns resize + dispose lifecycle.
 */
export const EChart: FC<EChartProps> = ({
  option,
  height = 220,
  className,
  style,
  onEvents,
  notMerge = true,
}) => {
  const merged: EChartsOption = {
    textStyle: baseTextStyle,
    backgroundColor: 'transparent',
    ...option,
  };

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={merged}
      notMerge={notMerge}
      lazyUpdate
      className={className}
      style={{ height, width: '100%', ...style }}
      opts={{ renderer: 'canvas' }}
      onEvents={onEvents}
    />
  );
};
