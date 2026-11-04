import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PatternQR } from 'components/managers/tech-card/patterns/pattern-qr';
import { DataTable, GrbpwrMark, HeaderNote, SectionHeader } from 'ui';
import {
  deriveLabels,
  type LabelsDeriveOptions,
  type LabelsModel,
  type SewnTableRow,
} from '../derive-labels';
import {
  LABEL_BLOCK_GAP_PX,
  LABEL_FLAT_PX,
  LABEL_QR_PX,
  LABEL_TABLE_COLS,
  labelTableCols,
  planLabelSheets,
  QR_COL_GAP_PX,
  qrColumns,
  QR_ROW_GAP_PX,
  QR_TITLE_PX,
  type QrGridRow,
} from '../labels-sheets';
import { Missing, TechpackDrawing } from './bits';
import { continuedTitle, TechpackSheet, type TechpackPageProps } from '../sheet';
import { englishT, own, useT } from '../i18n';

type LabelsPageProps = TechpackPageProps & LabelsDeriveOptions;

// The composition-label sheet contract from care-labels/layout.ts, kept local so this print page
// does not pull the outline shaper and its font assets into the tech-pack bundle.
const labelSheet = { widthMm: 100, heightMm: 30, seamMm: 10 } as const;

function PhysicalTape({
  caption,
  scale,
  heightMm = labelSheet.heightMm,
  children,
}: {
  caption: string;
  scale: number;
  heightMm?: number;
  children: ReactNode;
}) {
  return (
    <figure>
      <figcaption className='mb-1 text-micro uppercase tracking-label text-labelColor'>
        {caption}
      </figcaption>
      <div
        className='relative border border-textColor bg-bgColor text-textColor'
        style={{ width: labelSheet.widthMm * scale, height: heightMm * scale }}
      >
        <div
          className='absolute inset-y-0 left-0 p-1.5'
          style={{ width: (labelSheet.widthMm - labelSheet.seamMm) * scale }}
        >
          {children}
        </div>
        <div
          className='absolute inset-y-0 border-l border-dashed border-textColor'
          style={{ left: (labelSheet.widthMm - labelSheet.seamMm) * scale }}
        />
      </div>
    </figure>
  );
}

function SewnTable({
  rows,
  model,
  orient,
}: {
  rows: readonly SewnTableRow[];
  model: LabelsModel;
  orient: LabelsPageProps['orient'];
}) {
  const { t } = useT();
  const cols = labelTableCols(orient, model.sewn.table);
  const showNote = cols.length > LABEL_TABLE_COLS[orient].length;
  return (
    <div className='min-w-0 flex-1' data-label-table=''>
      <DataTable className='table-fixed'>
        <colgroup>
          {cols.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th data-align='left'>#</th>
            <th data-align='left'>{t('labels.item')}</th>
            <th data-align='left'>{t('labels.location')}</th>
            <th data-align='left'>{t('labels.attachment')}</th>
            <th data-align='left'>{t('labels.fold')}</th>
            <th data-align='left'>{t('labels.sizeMm')}</th>
            <th data-align='left'>{t('common.material')}</th>
            <th>{t('common.quantity')}</th>
            {showNote && <th data-align='left'>{t('common.note')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-label-row={row.key}>
              <td data-align='left'>{row.number}</td>
              <td data-align='left'>{own(row.item)}</td>
              <td data-align='left'>
                {own(row.location) ||
                  (model.gaps.placement && <Missing gap={model.gaps.placement} />)}
              </td>
              <td data-align='left'>{own(row.attachment)}</td>
              <td data-align='left'>{own(row.fold)}</td>
              <td data-align='left'>{own(row.size)}</td>
              <td data-align='left'>{own(row.material)}</td>
              <td>{row.qty}</td>
              {showNote && (
                <td data-align='left' translate='no'>
                  {own(row.note)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function QrGrid({ rows, columns }: { rows: readonly QrGridRow[]; columns: number }) {
  const { t } = useT();
  return (
    <div data-label-qr=''>
      <div className='mb-2 border-b border-textColor pb-1 font-bold uppercase tracking-label'>
        {t('labels.artworkQr')}
      </div>
      <div
        className='grid items-center text-micro'
        style={{
          gridTemplateColumns: `${QR_TITLE_PX}px repeat(${columns}, ${LABEL_QR_PX}px)`,
          columnGap: QR_COL_GAP_PX,
          rowGap: QR_ROW_GAP_PX,
        }}
      >
        {rows.map((row) =>
          row.kind === 'sizes' ? (
            row.labels.map((label, index) => (
              <span
                key={`${row.key}-${index}`}
                className='text-center'
                style={index === 0 ? { gridColumnStart: 2 } : undefined}
              >
                {label}
              </span>
            ))
          ) : (
            <QrLine key={row.key} title={row.title} cells={row.cells} noFile={t('labels.noFile')} />
          ),
        )}
      </div>
    </div>
  );
}

function QrLine({
  title,
  cells,
  noFile,
}: {
  title: string;
  cells: Extract<QrGridRow, { kind: 'qr' }>['cells'];
  noFile: string;
}) {
  return (
    <>
      <span translate='no' style={{ gridColumnStart: 1 }}>
        {title}
      </span>
      {cells.map((cell) =>
        cell.url ? (
          <div
            key={cell.key}
            data-label-qr-cell={cell.key}
            style={{ width: LABEL_QR_PX, height: LABEL_QR_PX }}
          >
            <PatternQR value={cell.url} size={LABEL_QR_PX} />
          </div>
        ) : (
          <div
            key={cell.key}
            data-label-no-file={cell.key}
            className='flex items-center justify-center border border-dashed border-error text-center uppercase text-textColor'
            style={{ width: LABEL_QR_PX, height: LABEL_QR_PX }}
          >
            {noFile}
          </div>
        ),
      )}
    </>
  );
}

/** The sheet's box clips, so an estimate that fell short has to be seen, not printed. */
function OverflowWatch({ onOverflow }: { onOverflow: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const body = ref.current?.closest<HTMLElement>('.tp-body');
    if (body && body.scrollHeight > body.clientHeight + 1) onOverflow();
  });
  return <span ref={ref} hidden />;
}

export function LabelsPage({
  techCard,
  orient,
  docline,
  n,
  sampleSizeName,
  sizeNames,
  orderSizes,
}: LabelsPageProps) {
  const { t } = useT();
  const model = useMemo(
    () => deriveLabels(techCard, { sampleSizeName, sizeNames, orderSizes }, undefined, t),
    [techCard, sampleSizeName, sizeNames, orderSizes, t],
  );
  const [tight, setTight] = useState(0);
  const sheets = useMemo(
    () => planLabelSheets(model.sewn, orient, tight),
    [model.sewn, orient, tight],
  );
  const land = orient === 'land';
  const scale = land ? (model.hasSewn ? 4.8 : 5.2) : 5.4;
  const tapes = (
    <div className={land && model.hasSewn ? 'flex gap-8' : 'flex flex-col gap-5'}>
      <PhysicalTape caption={t('labels.identity')} scale={scale}>
        <div className='flex h-full items-center gap-3'>
          <div className='h-full shrink-0' style={{ width: 22 * scale }}>
            {model.identity.logo ? (
              <img
                src={model.identity.logo.url}
                alt={t('labels.logoAlt')}
                className='h-full w-full object-contain'
              />
            ) : (
              <GrbpwrMark className='h-full w-full text-textColor' />
            )}
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-1 text-control uppercase leading-tight'>
            <div className='font-bold'>
              {model.identity.name || (model.gaps.name && <Missing gap={model.gaps.name} />)}
            </div>
            <div>
              {model.identity.colour ? (
                <span translate='no'>{model.identity.colour}</span>
              ) : (
                model.gaps.colour && <Missing gap={model.gaps.colour} />
              )}{' '}
              · {model.identity.size || (model.gaps.size && <Missing gap={model.gaps.size} />)}
            </div>
            <div className='text-labelColor'>{model.identity.brand}</div>
          </div>
        </div>
      </PhysicalTape>
      <PhysicalTape
        caption={t('labels.composition')}
        scale={scale}
        heightMm={labelSheet.heightMm / 2}
      >
        <div className='flex h-full gap-3 text-micro uppercase leading-snug'>
          <div className='text-labelColor' translate='no'>
            {englishT('labels.language')}
          </div>
          <div>
            {model.composition.length
              ? model.composition.map((line) => (
                  <div key={`${line.part}-${line.value}`}>
                    <span className='font-bold' translate='no'>
                      {line.part}
                    </span>{' '}
                    <span translate='no'>{line.value}</span>
                  </div>
                ))
              : model.gaps.composition && <Missing gap={model.gaps.composition} />}
          </div>
        </div>
      </PhysicalTape>
    </div>
  );
  const placement = (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center border border-borderColor'>
      <TechpackDrawing
        media={model.back}
        name={t('common.back')}
        height={land ? 480 : 430}
        caption=''
        missingGap={model.gaps.back}
      />
      <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-micro uppercase'>
        <b>
          {own(model.placement.name) ||
            (model.gaps.placement && <Missing gap={model.gaps.placement} />)}
        </b>
        {model.placement.attachment && <span>{own(model.placement.attachment)}</span>}
        {model.placement.folding && <span>{own(model.placement.folding)}</span>}
        {model.placement.size && <span>{own(model.placement.size)}</span>}
        {model.placement.qty != null && (
          <span>{t('labels.quantity', { count: model.placement.qty })}</span>
        )}
      </div>
    </div>
  );

  if (model.hasSewn) {
    const flat = (
      <div
        className='relative flex flex-none items-center justify-center border border-hairline'
        style={{ width: LABEL_FLAT_PX.w, height: LABEL_FLAT_PX.h }}
        data-label-flat=''
      >
        <TechpackDrawing
          media={model.sewn.flat}
          name={t('common.back')}
          height={LABEL_FLAT_PX.h - 2}
          pins={model.sewn.pins}
          caption=''
          missingGap={model.gaps.back}
        />
      </div>
    );
    return (
      <>
        {sheets.map((sheet, index) => (
          <TechpackSheet key={index} orient={orient} docline={docline}>
            <OverflowWatch onOverflow={() => setTight((value) => Math.min(value + 1, 4))} />
            <SectionHeader title={continuedTitle(n, t('labels.title'), index > 0, t)} />
            <div className='flex flex-col' style={{ gap: LABEL_BLOCK_GAP_PX }}>
              {sheet.flat && land ? (
                <div className='flex items-start gap-6'>
                  {flat}
                  <SewnTable rows={sheet.rows} model={model} orient={orient} />
                </div>
              ) : (
                <>
                  {sheet.flat && flat}
                  {sheet.rows.length > 0 && (
                    <SewnTable rows={sheet.rows} model={model} orient={orient} />
                  )}
                </>
              )}
              {sheet.qr.length > 0 && <QrGrid rows={sheet.qr} columns={qrColumns(orient)} />}
              {sheet.tapes && tapes}
            </div>
          </TechpackSheet>
        ))}
      </>
    );
  }

  return (
    <TechpackSheet orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} ${t('labels.title')}`}
        action={<HeaderNote>{t('labels.summary')}</HeaderNote>}
      />
      {land ? (
        <div className='flex min-h-0 flex-1 gap-8'>
          <div className='flex flex-col'>{tapes}</div>
          <div className='flex min-w-0 flex-1 flex-col'>{placement}</div>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col gap-5'>
          <div className='flex justify-center'>{tapes}</div>
          {placement}
        </div>
      )}
    </TechpackSheet>
  );
}
