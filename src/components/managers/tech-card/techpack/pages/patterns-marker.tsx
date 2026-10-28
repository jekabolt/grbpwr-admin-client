import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { useMemo } from 'react';
import { DataTable, EmptyCell, GroupLabel, HeaderNote, SectionHeader } from 'ui';
import { viewerOrigin } from 'utils/viewer-origin';
import {
  derivePatternsMarkerPage,
  type PatternsMarkerModel,
  type TechpackMarkerRow,
} from '../derive-patterns';
import { chunksOf, continuedTitle, TechpackSheet, useTechpackOverflow } from '../sheet';
import { Missing } from './bits';
import { QrFigure } from './figures';
import type { Gap } from '../gaps';
import { own, useT } from '../i18n';

type ContentProps = {
  techCard: common_TechCard;
  orient: PrintOrient;
  n: string;
  markerLayouts?: readonly common_TechCardMarker[];
  patternViewerToken?: string;
  patternOrigin?: string;
  markerOrigin?: string;
  sizeNames?: Readonly<Record<number, string>>;
  netM2ByLine?: Readonly<Record<string, number>>;
  /** The marker pictures; off when the section shares its sheet or prints a frozen release. */
  layouts?: boolean;
};

type Props = Omit<ContentProps, 'layouts'> & { docline: string; layouts?: boolean };

type QrItem = {
  key: string;
  value?: string;
  label: string;
  sub?: string;
  gap?: Gap;
};

const number = (value: number | undefined, digits = 2): string =>
  value == null ? '' : value.toFixed(digits);

function usePatternsMarkerModel(props: ContentProps, layouts: boolean) {
  const { t } = useT();
  const patternOrigin = props.patternOrigin ?? viewerOrigin();
  const markerOrigin = props.markerOrigin ?? viewerOrigin();
  const model = useMemo(
    () =>
      derivePatternsMarkerPage({
        techCard: props.techCard,
        markerLayouts: props.markerLayouts,
        patternViewerToken: props.patternViewerToken,
        patternOrigin,
        markerOrigin,
        sizeNames: props.sizeNames,
        netM2ByLine: props.netM2ByLine,
        includeLayouts: layouts,
        t,
      }),
    [
      props.techCard,
      props.markerLayouts,
      props.patternViewerToken,
      patternOrigin,
      markerOrigin,
      props.sizeNames,
      props.netM2ByLine,
      layouts,
      t,
    ],
  );
  const labelsQr =
    props.techCard.id && markerOrigin
      ? `${markerOrigin}/tech-cards/${props.techCard.id}/care-labels`
      : '';
  const qrs: QrItem[] = [
    ...model.patterns.map((pattern) => ({
      key: `pattern-${pattern.key}`,
      value: pattern.qrValue,
      label: `${pattern.code} ${own(pattern.label)}`,
      sub: [
        t('common.sheets', { count: pattern.sheetCount }),
        pattern.pieceCount ? t('common.piecesShort', { count: pattern.pieceCount }) : '',
        pattern.version ? `v${pattern.version}` : '',
        pattern.sizes,
      ]
        .filter(Boolean)
        .join(' · '),
      gap: pattern.qrGap,
    })),
    ...model.markers
      .filter((marker) => marker.id)
      .map((marker) => ({
        key: `marker-${marker.key}`,
        value: marker.qrValue,
        label: own(marker.label),
        sub: t('patterns.layoutViewer'),
        gap: marker.gap,
      })),
    ...(model.emptyGap
      ? [{ key: 'missing-pattern', label: t('common.pattern'), gap: model.emptyGap }]
      : []),
    ...(labelsQr
      ? [
          {
            key: 'labels',
            value: labelsQr,
            label: t('patterns.labelArtwork'),
            sub: t('patterns.careLabels'),
          },
        ]
      : []),
  ];
  const pictures = layouts
    ? model.markers.filter((marker) => marker.layoutSvg || marker.missing === 'layout')
    : [];
  return { model, qrs, pictures };
}

function PatternsHeader({
  model,
  n,
  continued = false,
}: {
  model: PatternsMarkerModel;
  n: string;
  continued?: boolean;
}) {
  const { t } = useT();
  return (
    <SectionHeader
      title={continuedTitle(n, t('patterns.title'), continued, t)}
      action={
        model.missing.length > 0 ? (
          <HeaderNote tone='warn'>{t('common.gaps', { count: model.missing.length })}</HeaderNote>
        ) : (
          <HeaderNote>{t('patterns.scanReadOnly')}</HeaderNote>
        )
      }
    />
  );
}

function QrGrid({ qrs, size }: { qrs: readonly QrItem[]; size: number }) {
  return (
    <div className='grid shrink-0 grid-cols-2 gap-3'>
      {qrs.map((qr) => (
        <QrFigure
          key={qr.key}
          size={size}
          value={qr.value}
          label={qr.label}
          sub={qr.sub}
          gap={qr.gap}
        />
      ))}
    </div>
  );
}

function ConsumptionTable({ markers }: { markers: readonly TechpackMarkerRow[] }) {
  const { t } = useT();
  return (
    <div className='min-w-0 flex-1'>
      <GroupLabel flush>{t('patterns.consumption')}</GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th data-align='left'>{t('patterns.fabric')}</th>
            <th>{t('common.width')}</th>
            <th>{t('patterns.piecesShort')}</th>
            <th>{t('patterns.netSquareMetres')}</th>
            <th>{t('patterns.markerMetres')}</th>
            <th>{t('patterns.utilization')}</th>
            <th>{t('patterns.perGarment')}</th>
          </tr>
        </thead>
        <tbody>
          {markers.map((marker) => (
            <tr key={marker.key}>
              <td data-align='left'>
                {marker.code && <b>{marker.code} </b>}
                {own(marker.fabric)}
              </td>
              <td className='whitespace-nowrap'>
                {marker.widthCm == null ? null : `${number(marker.widthCm, 0)} cm`}
              </td>
              <td>{marker.pieceCount}</td>
              <td>{number(marker.netM2)}</td>
              <td>{marker.missing === 'marker' ? <EmptyCell /> : number(marker.markerM)}</td>
              <td>
                {marker.missing === 'marker' ? <EmptyCell /> : number(marker.utilizationPct, 1)}
              </td>
              <td>
                {marker.perGarment.length > 0
                  ? marker.perGarment.map((value) => <div key={value}>{value}</div>)
                  : marker.missing
                    ? marker.gap && <Missing gap={marker.gap} />
                    : null}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function LayoutGrid({ pictures, land }: { pictures: readonly TechpackMarkerRow[]; land: boolean }) {
  const { t } = useT();
  return (
    <div className='min-h-0 flex-1'>
      <GroupLabel flush>{t('patterns.markerLayouts')}</GroupLabel>
      <div className={land ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
        {pictures.map((marker) => (
          <figure key={`layout-${marker.key}`} className='min-w-0'>
            <div className='flex h-40 items-center justify-center overflow-hidden border border-borderColor [&_svg]:h-full [&_svg]:w-full'>
              {marker.layoutSvg ? (
                <div
                  className='h-full w-full'
                  dangerouslySetInnerHTML={{ __html: marker.layoutSvg }}
                />
              ) : (
                marker.gap && <Missing gap={marker.gap} />
              )}
            </div>
            <figcaption className='mt-1 text-micro uppercase text-labelColor'>
              {own(marker.label)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function PatternsMarkerBody({
  model,
  qrs,
  pictures,
  orient,
  n,
}: {
  model: PatternsMarkerModel;
  qrs: readonly QrItem[];
  pictures: readonly TechpackMarkerRow[];
  orient: PrintOrient;
  n: string;
}) {
  const land = orient === 'land';
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <PatternsHeader model={model} n={n} />
      <div className={land ? 'flex items-start gap-8' : 'flex flex-col gap-5'}>
        <QrGrid qrs={qrs} size={land ? 104 : 96} />
        <ConsumptionTable markers={model.markers} />
      </div>
      {pictures.length > 0 && (
        <div className='mt-4 min-h-0 flex-1'>
          <LayoutGrid pictures={pictures} land={land} />
        </div>
      )}
    </div>
  );
}

export function PatternsMarkerContent(props: ContentProps) {
  const layouts = props.layouts ?? true;
  const { model, qrs, pictures } = usePatternsMarkerModel(props, layouts);
  return (
    <PatternsMarkerBody
      model={model}
      qrs={qrs}
      pictures={pictures}
      orient={props.orient}
      n={props.n}
    />
  );
}

export function PatternsMarkerPage({ docline, layouts = true, ...props }: Props) {
  const { model, qrs, pictures } = usePatternsMarkerModel(props, layouts);
  const land = props.orient === 'land';
  const paginationKey = `${props.techCard.id ?? 0}:${props.orient}:${qrs.length}:${model.markers.length}:${pictures.length}:${layouts}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);
  const tooMany =
    qrs.length > (land ? 8 : 6) ||
    model.markers.length > (land ? 12 : 16) ||
    pictures.length > (land ? 4 : 3);

  if (!overflow && !tooMany) {
    return (
      <TechpackSheet orient={props.orient} docline={docline}>
        <div ref={contentRef} className='contents'>
          <PatternsMarkerBody
            model={model}
            qrs={qrs}
            pictures={pictures}
            orient={props.orient}
            n={props.n}
          />
        </div>
      </TechpackSheet>
    );
  }

  const pages: Array<{ key: string; body: React.ReactNode }> = [
    ...chunksOf(qrs, land ? 8 : 6).map((items, index) => ({
      key: `qr-${index}`,
      body: <QrGrid qrs={items} size={land ? 104 : 96} />,
    })),
    ...chunksOf(model.markers, land ? 8 : 12).map((markers, index) => ({
      key: `consumption-${index}`,
      body: <ConsumptionTable markers={markers} />,
    })),
    ...chunksOf(pictures, land ? 4 : 3).map((items, index) => ({
      key: `layouts-${index}`,
      body: <LayoutGrid pictures={items} land={land} />,
    })),
  ];

  return (
    <>
      {pages.map((page, index) => (
        <TechpackSheet key={page.key} orient={props.orient} docline={docline}>
          <PatternsHeader model={model} n={props.n} continued={index > 0} />
          {page.body}
        </TechpackSheet>
      ))}
    </>
  );
}
