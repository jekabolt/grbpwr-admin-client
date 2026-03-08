import type { GeographySessionMetric } from 'api/proto-http/admin';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { FC, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

/** API/GA4 country names -> TopoJSON properties.name (Natural Earth) */
const API_TO_TOPJSON_NAME: Record<string, string> = {
  'United States': 'United States of America',
  'United Kingdom': 'United Kingdom of Great Britain and Northern Ireland',
  UK: 'United Kingdom of Great Britain and Northern Ireland',
  'Russia': 'Russian Federation',
  'Iran': 'Iran (Islamic Republic of)',
  'South Korea': 'Republic of Korea',
  'Korea': 'Republic of Korea',
  'North Korea': "Democratic People's Republic of Korea",
  'Vietnam': 'Viet Nam',
  'Tanzania': 'Tanzania',
  'Venezuela': 'Venezuela (Bolivarian Republic of)',
  'Syria': 'Syrian Arab Republic',
  'Bolivia': 'Bolivia (Plurinational State of)',
  'Moldova': 'Republic of Moldova',
  'Macedonia': 'North Macedonia',
  'Taiwan': 'Taiwan',
  'Palestine': 'State of Palestine',
  'Laos': "Lao People's Democratic Republic",
  'Brunei': 'Brunei Darussalam',
  'Turkey': 'Türkiye',
  'Congo': 'Republic of the Congo',
  'Democratic Republic of the Congo': 'Democratic Republic of the Congo',
  'Ivory Coast': "Côte d'Ivoire",
  "Côte d'Ivoire": "Côte d'Ivoire",
  'Libya': 'Libya',
  'Czech Republic': 'Czechia',
  'Czechia': 'Czechia',
  'Gambia': 'Gambia',
  'Micronesia': 'Micronesia (Federated States of)',
  'Saint Kitts and Nevis': 'Saint Kitts and Nevis',
  'Saint Lucia': 'Saint Lucia',
  'Saint Vincent and the Grenadines': 'Saint Vincent and the Grenadines',
  'Trinidad and Tobago': 'Trinidad and Tobago',
  'Antigua and Barbuda': 'Antigua and Barbuda',
  'Bosnia and Herzegovina': 'Bosnia and Herzegovina',
  'Sao Tome and Principe': 'Sao Tome and Principe',
  'Eswatini': 'Eswatini',
  'Swaziland': 'Eswatini',
  'Timor-Leste': 'Timor-Leste',
  'East Timor': 'Timor-Leste',
  'Western Sahara': 'W. Sahara',
  'W. Sahara': 'W. Sahara',
};

function getTopoJsonName(apiName: string): string {
  if (!apiName) return apiName;
  return API_TO_TOPJSON_NAME[apiName] ?? apiName;
}

function aggregateSessionsByCountry(items: GeographySessionMetric[] | undefined): Map<string, number> {
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

interface SessionsByCountryMapChartProps {
  sessionsByCountry: GeographySessionMetric[] | undefined;
  showTitle?: boolean;
}

export const SessionsByCountryMapChart: FC<SessionsByCountryMapChartProps> = ({
  sessionsByCountry,
  showTitle = true,
}) => {
  const { dataByTopoName, maxSessions } = useMemo(() => {
    const byCountry = aggregateSessionsByCountry(sessionsByCountry);
    const dataByTopoName = new Map<string, { sessions: number; country: string }>();
    let maxSessions = 0;
    for (const [country, sessions] of byCountry) {
      const topoName = countryNameVariants.get(country) ?? country;
      const existing = dataByTopoName.get(topoName);
      const total = (existing?.sessions ?? 0) + sessions;
      dataByTopoName.set(topoName, { sessions: total, country });
      if (total > maxSessions) maxSessions = total;
    }
    return { dataByTopoName, maxSessions };
  }, [sessionsByCountry]);

  if (dataByTopoName.size === 0) return null;

  const [tooltip, setTooltip] = useState<{ name: string; sessions: number } | null>(null);

  const getFillColor = (topoName: string) => {
    const d = dataByTopoName.get(topoName);
    if (!d) return '#e5e7eb';
    if (maxSessions === 0) return '#e5e7eb';
    const intensity = Math.min(1, d.sessions / maxSessions);
    const opacity = 0.3 + intensity * 0.7;
    return `rgba(0, 0, 0, ${opacity})`;
  };

  return (
    <div className='border border-textInactiveColor p-4 min-h-[280px] flex-1 min-w-0 relative flex flex-col'>
      {showTitle && (
        <Text variant='uppercase' className='font-bold mb-4 block'>
          Sessions by country
        </Text>
      )}
      <div className='flex-1 min-h-[220px]'>
        <ComposableMap
          projection='geoMercator'
          projectionConfig={{ scale: 90 }}
          width={800}
          height={400}
          style={{ width: '100%', height: 220 }}
        >
        <ZoomableGroup center={[0, 0]} minZoom={1} maxZoom={8}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const topoName = (geo.properties?.name as string) ?? geo.id;
              const d = dataByTopoName.get(topoName);
              const displayName = d?.country ?? topoName;
              const sessions = d?.sessions ?? 0;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getFillColor(topoName)}
                  stroke='#94a3b8'
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={() => setTooltip({ name: displayName, sessions })}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
          }
        </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      </div>
      {tooltip && (
        <div className='absolute bottom-2 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-3 py-2 rounded shadow-lg pointer-events-none z-10'>
          <div className='font-semibold'>{tooltip.name}</div>
          <div className='text-white/90'>{formatNumber(tooltip.sessions)} sessions</div>
        </div>
      )}
    </div>
  );
};
