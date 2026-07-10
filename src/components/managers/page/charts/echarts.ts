/**
 * Tree-shaken ECharts core instance shared by every analytics chart.
 *
 * We register only the chart types and components the dashboard actually uses,
 * so the bundle stays lean (importing from 'echarts' pulls the whole library).
 * All chart components render through `EChart`, which is wired to this instance.
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  // charts
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  MapChart,
  // components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
  // features + renderer
  LabelLayout,
  CanvasRenderer,
]);

export { echarts };
