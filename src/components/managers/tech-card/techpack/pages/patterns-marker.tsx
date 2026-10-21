import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, GroupLabel, HeaderNote, SectionHeader } from 'ui';
import { viewerOrigin } from 'utils/viewer-origin';
import { derivePatternsMarkerPage } from '../derive-patterns';
import { QrFigure } from './figures';
import { Paper } from './paper';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  markerLayouts?: readonly common_TechCardMarker[];
  patternViewerToken?: string;
  patternOrigin?: string;
  markerOrigin?: string;
  sizeNames?: Readonly<Record<number, string>>;
};

const number = (value: number | undefined, digits = 2): string =>
  value == null ? '' : value.toFixed(digits);

function Required({ name }: { name: string }) {
  return <span className='font-bold text-error'>! {name}</span>;
}

export function PatternsMarkerPage({
  techCard,
  orient,
  docline,
  n,
  markerLayouts,
  patternViewerToken,
  patternOrigin,
  markerOrigin,
  sizeNames,
}: Props) {
  const land = orient === 'land';
  const origin = patternOrigin ?? viewerOrigin();
  const localOrigin = markerOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const model = derivePatternsMarkerPage({
    techCard,
    markerLayouts,
    patternViewerToken,
    patternOrigin: origin,
    markerOrigin: localOrigin,
    sizeNames,
  });
  const qrSize = land ? 104 : 96;

  return (
    <Paper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} patterns & marker`}
        action={
          model.missing.length > 0 ? (
            <HeaderNote tone='warn'>! {model.missing.join(' · ! ')}</HeaderNote>
          ) : (
            <HeaderNote>scan · read-only</HeaderNote>
          )
        }
      />
      <div className={land ? 'flex items-start gap-8' : 'flex flex-col gap-5'}>
        <div className='grid shrink-0 grid-cols-2 gap-3'>
          {model.patterns.map((pattern) => (
            <QrFigure
              key={pattern.key}
              size={qrSize}
              value={pattern.qrValue}
              label={`${pattern.code} ${pattern.label}`}
              sub={[
                `${pattern.sheetCount} ${pattern.sheetCount === 1 ? 'sheet' : 'sheets'}`,
                pattern.pieceCount ? `${pattern.pieceCount} pcs` : '',
                pattern.version ? `v${pattern.version}` : '',
                pattern.sizes,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
          {model.markers
            .filter((marker) => marker.id)
            .map((marker) => (
              <QrFigure
                key={`qr-${marker.key}`}
                size={qrSize}
                value={marker.qrValue}
                label={marker.label}
                sub='layout viewer'
              />
            ))}
          {model.patterns.length === 0 && <QrFigure size={qrSize} label='! pattern' />}
        </div>
        <div className='min-w-0 flex-1'>
          <GroupLabel flush>consumption</GroupLabel>
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>fabric</th>
                <th>width</th>
                <th>pcs</th>
                <th>net m²</th>
                <th>marker m</th>
                <th>util %</th>
                <th>m / garment</th>
              </tr>
            </thead>
            <tbody>
              {model.markers.map((marker) => (
                <tr key={marker.key}>
                  <td data-align='left' className='tp-wrap'>
                    {marker.missing === 'marker' ? <Required name='marker' /> : marker.fabric}
                  </td>
                  <td>{marker.widthCm == null ? null : `${number(marker.widthCm, 0)} cm`}</td>
                  <td>{marker.pieceCount}</td>
                  <td>{number(marker.netM2)}</td>
                  <td>{number(marker.markerM)}</td>
                  <td>{number(marker.utilizationPct, 1)}</td>
                  <td>
                    {marker.perGarment.length > 0 ? (
                      marker.perGarment.map((value) => <div key={value}>{value}</div>)
                    ) : marker.missing ? (
                      <Required name={marker.missing} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </div>

      {model.markers.some((marker) => marker.layoutSvg || marker.missing === 'layout') && (
        <div className='mt-4 min-h-0 flex-1'>
          <GroupLabel flush>marker layouts</GroupLabel>
          <div className={land ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
            {model.markers
              .filter((marker) => marker.layoutSvg || marker.missing === 'layout')
              .map((marker) => (
                <figure key={`layout-${marker.key}`} className='min-w-0'>
                  <div className='flex h-40 items-center justify-center overflow-hidden border border-borderColor [&_svg]:h-full [&_svg]:w-full'>
                    {marker.layoutSvg ? (
                      <div
                        className='h-full w-full'
                        dangerouslySetInnerHTML={{ __html: marker.layoutSvg }}
                      />
                    ) : (
                      <Required name='layout' />
                    )}
                  </div>
                  <figcaption className='mt-1 text-micro uppercase text-labelColor'>
                    {marker.label}
                  </figcaption>
                </figure>
              ))}
          </div>
        </div>
      )}
    </Paper>
  );
}
