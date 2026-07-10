import type { GeographySessionMetric } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC, useMemo } from 'react';
import CountryList from 'react-select-country-list';
import { ChartCard, EChart, chartColors, echarts, tooltipBase } from '../charts';
import { formatNumber } from '../utils';
import worldGeoJson from '../charts/world-countries.geo.json';

/** API/GA4 country names -> GeoJSON properties.name (Natural Earth) */
const API_TO_TOPJSON_NAME: Record<string, string> = {
  'United States': 'United States of America',
  'United Kingdom': 'United Kingdom of Great Britain and Northern Ireland',
  UK: 'United Kingdom of Great Britain and Northern Ireland',
  Russia: 'Russian Federation',
  Iran: 'Iran (Islamic Republic of)',
  'South Korea': 'Republic of Korea',
  Korea: 'Republic of Korea',
  'North Korea': "Democratic People's Republic of Korea",
  Vietnam: 'Viet Nam',
  Tanzania: 'Tanzania',
  Venezuela: 'Venezuela (Bolivarian Republic of)',
  Syria: 'Syrian Arab Republic',
  Bolivia: 'Bolivia (Plurinational State of)',
  Moldova: 'Republic of Moldova',
  Macedonia: 'North Macedonia',
  Taiwan: 'Taiwan',
  Palestine: 'State of Palestine',
  Laos: "Lao People's Democratic Republic",
  Brunei: 'Brunei Darussalam',
  Turkey: 'Türkiye',
  Congo: 'Republic of the Congo',
  'Democratic Republic of the Congo': 'Democratic Republic of the Congo',
  'Ivory Coast': "Côte d'Ivoire",
  "Côte d'Ivoire": "Côte d'Ivoire",
  Libya: 'Libya',
  'Czech Republic': 'Czechia',
  Czechia: 'Czechia',
  Gambia: 'Gambia',
  Micronesia: 'Micronesia (Federated States of)',
  'Saint Kitts and Nevis': 'Saint Kitts and Nevis',
  'Saint Lucia': 'Saint Lucia',
  'Saint Vincent and the Grenadines': 'Saint Vincent and the Grenadines',
  'Trinidad and Tobago': 'Trinidad and Tobago',
  'Antigua and Barbuda': 'Antigua and Barbuda',
  'Bosnia and Herzegovina': 'Bosnia and Herzegovina',
  'Sao Tome and Principe': 'Sao Tome and Principe',
  Eswatini: 'Eswatini',
  Swaziland: 'Eswatini',
  'Timor-Leste': 'Timor-Leste',
  'East Timor': 'Timor-Leste',
  'Western Sahara': 'W. Sahara',
  'W. Sahara': 'W. Sahara',
};

function getTopoJsonName(apiName: string): string {
  if (!apiName) return apiName;
  return API_TO_TOPJSON_NAME[apiName] ?? apiName;
}

function aggregateSessionsByCountry(
  items: GeographySessionMetric[] | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!items?.length) return map;
  for (const g of items) {
    const country = g.country?.trim() || 'Unknown';
    const sessions = g.sessions ?? 0;
    map.set(country, (map.get(country) ?? 0) + sessions);
  }
  return map;
}

function buildCountryNameVariants(): Map<string, string> {
  const variants = new Map<string, string>();
  for (const { label } of CountryList().getData() as Array<{ value: string; label: string }>) {
    const topoName = getTopoJsonName(label);
    variants.set(label, topoName);
    variants.set(label.toUpperCase(), topoName);
    variants.set(topoName, topoName);
  }
  for (const [api, topo] of Object.entries(API_TO_TOPJSON_NAME)) {
    variants.set(api, topo);
    variants.set(api.toUpperCase(), topo);
  }
  return variants;
}

const countryNameVariants = buildCountryNameVariants();

// Register the vendored world map once (self-hosted — no runtime CDN fetch).
let worldMapRegistered = false;
function ensureWorldMap() {
  if (!worldMapRegistered) {
    echarts.registerMap('world', worldGeoJson as Parameters<typeof echarts.registerMap>[1]);
    worldMapRegistered = true;
  }
}

interface SessionsByCountryMapChartProps {
  sessionsByCountry: GeographySessionMetric[] | undefined;
  showTitle?: boolean;
}

interface MapDatum {
  name: string;
  value: number;
  displayName: string;
}

export const SessionsByCountryMapChart: FC<SessionsByCountryMapChartProps> = ({
  sessionsByCountry,
  showTitle = true,
}) => {
  const { data, maxSessions } = useMemo(() => {
    const byCountry = aggregateSessionsByCountry(sessionsByCountry);
    const byTopoName = new Map<string, MapDatum>();
    let maxSessions = 0;
    for (const [country, sessions] of byCountry) {
      const topoName = countryNameVariants.get(country) ?? country;
      const existing = byTopoName.get(topoName);
      const total = (existing?.value ?? 0) + sessions;
      byTopoName.set(topoName, { name: topoName, value: total, displayName: country });
      if (total > maxSessions) maxSessions = total;
    }
    return { data: Array.from(byTopoName.values()), maxSessions };
  }, [sessionsByCountry]);

  if (data.length === 0) return null;

  ensureWorldMap();

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const p = Array.isArray(raw) ? raw[0] : raw;
    const d = p?.data as MapDatum | undefined;
    const name = d?.displayName ?? p?.name ?? '';
    const sessions = d?.value ?? 0;
    return `<div style="font-size:11px;line-height:1.5"><div style="font-weight:700">${name}</div>${
      d ? `${formatNumber(sessions)} sessions` : 'No sessions'
    }</div>`;
  };

  const option: EChartsOption = {
    tooltip: { ...tooltipBase, trigger: 'item', formatter: tooltipFormatter },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: maxSessions || 1,
      calculable: true,
      left: 8,
      bottom: 8,
      itemWidth: 10,
      itemHeight: 80,
      inRange: { color: ['#f2f2f2', '#bfbfbf', '#595959', '#000000'] },
      text: [formatNumber(maxSessions), '0'],
      textStyle: { color: chartColors.inkSecondary, fontSize: 9 },
    },
    series: [
      {
        type: 'map',
        map: 'world',
        roam: true,
        data,
        itemStyle: { areaColor: '#f5f5f5', borderColor: chartColors.axisLine, borderWidth: 0.5 },
        emphasis: {
          itemStyle: { areaColor: chartColors.accent },
          label: { show: false },
        },
        select: { disabled: true },
      },
    ],
  };

  return (
    <ChartCard title={showTitle ? 'Sessions by country' : undefined}>
      <EChart option={option} height={260} />
    </ChartCard>
  );
};
