/**
 * Chart design tokens + reusable ECharts option fragments.
 *
 * The GRBPWR admin is a monochrome, light-only brand (see `src/global.css`
 * `@theme`): ink `#000` on `#fff`, one accent `#311eee`. Charts follow suit —
 * a single series is plain ink, a compare/overlay series is a recessive dashed
 * gray. Color is introduced ONLY where it carries meaning that monochrome
 * cannot: semantic status (quadrant matrix), an ordinal magnitude ramp (sizes),
 * and a sequential ink ramp for the choropleth.
 *
 * Palettes below were validated with the dataviz skill's `validate_palette.js`
 * against the `#ffffff` surface. Tokens are grouped so a future dark mode is a
 * single-object swap — the app ships no dark theme today, so we don't wire one.
 */
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from 'echarts';

/** Mirrors the `@theme` tokens in `src/global.css`. */
export const chartColors = {
  surface: '#ffffff', // --color-bgColor
  ink: '#000000', // --color-textColor (primary series)
  inkSecondary: '#666666', // --color-labelColor (axis labels, secondary text)
  muted: '#898781', // recessive marks / "no data"
  grid: '#e5e5e5', // hairline splitLine (lighter than the frame border)
  axisLine: '#cccccc', // --color-textInactiveColor
  accent: '#311eee', // --color-highlightColor
  compare: '#999999', // overlay / previous-period series
  warning: '#c65d00', // --color-warning (text only — fails 3:1 as a fill)

  /** Semantic marks — validated on white; distinct from series ink. */
  status: {
    good: '#0ca30c',
    critical: '#d03b3b',
    info: '#2a78d6',
    muted: '#898781',
  },

  /**
   * Validated categorical set (dataviz reference palette, fixed order). Kept for
   * genuinely unordered multi-series needs. Prefer monochrome / sequential first.
   */
  categorical: [
    '#2a78d6',
    '#1baf7a',
    '#eda100',
    '#008300',
    '#4a3aa7',
    '#e34948',
    '#e87ba4',
    '#eb6834',
  ],

  /** Single-hue BLUE ramp, light→dark — ordinal magnitude (e.g. sizes S→XL). */
  sequentialBlue: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#104281'],

  /** Single-hue INK ramp, light→dark — monochrome choropleth intensity. */
  sequentialInk: ['#f2f2f2', '#d9d9d9', '#bfbfbf', '#8c8c8c', '#595959', '#262626', '#000000'],
} as const;

export const chartFont = "'FeatureMono', 'Inter', 'Helvetica Neue', Arial, sans-serif"; // --font-family-sans

/** Default root textStyle — merged in by `EChart` so charts can omit it. */
export const baseTextStyle = {
  fontFamily: chartFont,
  color: chartColors.ink,
  fontSize: 11,
} as const;

const axisLabel = {
  color: chartColors.inkSecondary,
  fontSize: 10,
  fontFamily: chartFont,
} as const;

/**
 * An axis fragment usable in EITHER the `xAxis` or `yAxis` slot — a value typed
 * as the intersection is assignable to both, so horizontal bars (category on Y)
 * need no per-call cast. The two component option shapes are structurally the
 * same cartesian axis; only the slot they land in differs.
 */
type AxisFragment = XAXisComponentOption & YAXisComponentOption;

/** A category (label) axis — no ticks, no split lines, hairline axis line. */
export function categoryAxis(
  overrides: XAXisComponentOption | YAXisComponentOption = {},
): AxisFragment {
  return {
    type: 'category',
    axisLine: { lineStyle: { color: chartColors.axisLine } },
    axisTick: { show: false },
    axisLabel: { ...axisLabel },
    splitLine: { show: false },
    ...overrides,
  } as AxisFragment;
}

/** A value (magnitude) axis — recessive dashed split lines, no axis line/ticks. */
export function valueAxis(
  overrides: XAXisComponentOption | YAXisComponentOption = {},
): AxisFragment {
  return {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { ...axisLabel },
    splitLine: { show: true, lineStyle: { color: chartColors.grid, type: 'dashed' } },
    ...overrides,
  } as AxisFragment;
}

export const tooltipBase: TooltipComponentOption = {
  backgroundColor: chartColors.surface,
  borderColor: chartColors.axisLine,
  borderWidth: 1,
  padding: [6, 10],
  textStyle: { color: chartColors.ink, fontSize: 11, fontFamily: chartFont },
  extraCssText: 'box-shadow:0 2px 8px rgba(0,0,0,0.08);border-radius:0;',
  confine: true,
};

export const legendBase: LegendComponentOption = {
  bottom: 0,
  icon: 'roundRect',
  itemWidth: 10,
  itemHeight: 10,
  itemGap: 16,
  textStyle: { color: chartColors.inkSecondary, fontSize: 10, fontFamily: chartFont },
};

export const gridBase: GridComponentOption = {
  left: 8,
  right: 12,
  top: 12,
  bottom: 8,
  containLabel: true,
};

/** Compare/overlay line style — recessive, thin, dashed. */
export const compareLineStyle = {
  color: chartColors.compare,
  width: 1,
  type: 'dashed' as const,
};
