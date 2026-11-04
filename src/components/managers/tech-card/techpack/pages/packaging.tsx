import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DataTable, EmptyCell, GroupLabel, SectionHeader } from 'ui';

import { derivePackaging, type PackagingModel } from '../derive-packaging';
import { own, useT, type PdfT } from '../i18n';
import { continuedTitle, TechpackSheet, type TechpackPageProps } from '../sheet';
import { Missing } from './bits';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='flex gap-2 border-b border-hairline py-1 text-textBaseSize last:border-b-0'>
      <span className='w-14 shrink-0 uppercase text-labelColor'>{label}</span>
      <span className='min-w-0'>{value || <EmptyCell />}</span>
    </div>
  );
}

/** The name gets the room the optional columns leave, by the table's column count. */
const WHAT_WIDTH: Record<number, string> = { 7: 'w-1/3', 8: 'w-1/4', 9: 'w-1/5', 10: 'w-1/6' };

function ItemsTable({
  model,
  items,
  t,
}: {
  model: PackagingModel;
  items: PackagingModel['items'];
  t: PdfT;
}) {
  const span =
    6 + [model.showSize, model.showHow, model.showNote, model.showColour].filter(Boolean).length;
  return (
    <DataTable className='table-fixed [&_td]:px-1 [&_th]:px-1'>
      <thead>
        <tr>
          <th className='w-6'>#</th>
          <th className='w-12'>{t('packaging.picture')}</th>
          <th data-align='left' className='w-24'>
            {t('packaging.item')}
          </th>
          <th data-align='left' className={WHAT_WIDTH[span]}>
            {t('packaging.what')}
          </th>
          <th className='w-8'>{t('common.quantity')}</th>
          <th className='w-28'>{t('packaging.per')}</th>
          {model.showSize && <th data-align='left'>{t('packaging.size')}</th>}
          {model.showHow && <th data-align='left'>{t('packaging.how')}</th>}
          {model.showNote && <th data-align='left'>{t('common.note')}</th>}
          {model.showColour && <th data-align='left'>{t('packaging.colour')}</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.key}>
            <td>{item.number}</td>
            <td>
              {item.picture ? (
                <img
                  src={item.picture.url}
                  alt={t('packaging.pictureAlt')}
                  className='size-10 object-contain'
                />
              ) : (
                <EmptyCell />
              )}
            </td>
            <td data-align='left' className='font-bold' translate='no'>
              {own(item.item)}
            </td>
            <td data-align='left' translate='no'>
              {own(item.what)}
            </td>
            <td>{item.quantity}</td>
            <td>{item.perOrder ? t('packaging.perOrder') : t('packaging.perGarment')}</td>
            {model.showSize && (
              <td data-align='left' translate='no'>
                {item.size ? own(item.size) : <EmptyCell />}
              </td>
            )}
            {model.showHow && (
              <td data-align='left' translate='no'>
                {item.how ? own(item.how) : <EmptyCell />}
              </td>
            )}
            {model.showNote && (
              <td data-align='left' translate='no'>
                {item.note ? own(item.note) : <EmptyCell />}
              </td>
            )}
            {model.showColour && (
              <td data-align='left' translate='no'>
                {item.allColours ? t('packaging.allColours') : own(item.colours.join(' · '))}
              </td>
            )}
          </tr>
        ))}
        {!model.items.length && (
          <tr>
            <td colSpan={span}>{model.missing && <Missing gap={model.missing} />}</td>
          </tr>
        )}
      </tbody>
    </DataTable>
  );
}

function PackedFacts({ model, land, t }: { model: PackagingModel; land: boolean; t: PdfT }) {
  return (
    <aside className={land ? 'w-48 shrink-0' : 'grid min-w-0 grid-cols-3 gap-5'}>
      <div className='min-w-0'>
        <GroupLabel flush>{t('packaging.packed')}</GroupLabel>
        <Fact label={t('packaging.ships')} value={own(model.packed.ships)} />
        <Fact label={t('packaging.size')} value={own(model.packed.size)} />
        <Fact
          label={t('packaging.net')}
          value={
            model.packed.netGrams ? <span translate='no'>{model.packed.netGrams} g</span> : null
          }
        />
        <Fact
          label={t('packaging.gross')}
          value={
            model.packed.grossGrams ? <span translate='no'>{model.packed.grossGrams} g</span> : null
          }
        />
      </div>
      <div className={land ? 'my-3' : 'min-w-0'}>
        {model.packed.photo ? (
          <img
            src={model.packed.photo.url}
            alt={t('packaging.packedPhoto')}
            className='h-24 w-full border border-borderColor object-contain'
          />
        ) : (
          <div className='flex h-24 items-center justify-center border border-dashed border-borderColor text-micro uppercase text-labelColor'>
            {t('packaging.packedPhoto')}
          </div>
        )}
      </div>
      <div className='min-w-0'>
        <GroupLabel flush={!land}>{t('packaging.carton')}</GroupLabel>
        <Fact label={t('packaging.units')} value={model.carton.units ? model.carton.units : null} />
        <Fact label={t('packaging.box')} value={own(model.carton.box)} />
        <Fact label={t('packaging.marking')} value={own(model.carton.marking)} />
        {model.carton.note && <Fact label={t('common.note')} value={own(model.carton.note)} />}
      </div>
    </aside>
  );
}

export function PackagingPage({ techCard, orient, docline, n }: TechpackPageProps) {
  const { t } = useT();
  const model = useMemo(() => derivePackaging(techCard, undefined, t), [techCard, t]);
  const land = orient === 'land';
  const key = `${techCard.id ?? 0}:${orient}:${model.items.length}`;
  const [fit, setFit] = useState<{ key: string; ends: number[] }>({ key: '', ends: [] });
  const ends = useMemo(() => (fit.key === key ? fit.ends : []), [fit, key]);
  const pages = [0, ...ends].map((from, index) => model.items.slice(from, ends[index]));
  const marks = useRef<(HTMLElement | null)[]>([]);

  // Row heights depend on the text, so sheets are cut where the rows really stop fitting.
  useLayoutEffect(() => {
    for (let page = 0; page < ends.length + 1; page += 1) {
      const body = marks.current[page]?.closest<HTMLElement>('.tp-body');
      const over = body ? body.scrollHeight - body.clientHeight : 0;
      if (!body || over <= 1) continue;
      const rows = Array.from(body.querySelectorAll('tbody tr'));
      let keep = rows.length;
      for (let freed = 0; keep > 1 && freed < over; ) {
        keep -= 1;
        freed += rows[keep].getBoundingClientRect().height;
      }
      if (keep === rows.length) continue;
      setFit({ key, ends: [...ends.slice(0, page), (ends[page - 1] ?? 0) + keep] });
      return;
    }
  });
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFit({ key: '', ends: [] });
    });
    return () => {
      live = false;
    };
  }, [key]);

  return (
    <>
      {pages.map((items, page) => (
        <TechpackSheet key={page} orient={orient} docline={docline}>
          <div
            ref={(el) => {
              marks.current[page] = el;
            }}
            className='contents'
          >
            <SectionHeader
              title={continuedTitle(
                t('common.generated', { text: n }),
                t('packaging.title'),
                page > 0,
                t,
              )}
            />
            <div
              className={
                land && page === 0
                  ? 'flex min-h-0 flex-1 gap-5'
                  : 'flex min-h-0 flex-1 flex-col gap-5'
              }
            >
              <div className={land && page === 0 ? 'min-w-0 flex-1' : 'min-w-0'}>
                <ItemsTable model={model} items={items} t={t} />
              </div>
              {page === 0 && <PackedFacts model={model} land={land} t={t} />}
            </div>
            <div className='mt-auto flex justify-end border-t border-textColor pt-1 text-micro uppercase tracking-label text-labelColor'>
              {t('packaging.insideFirst')}
            </div>
          </div>
        </TechpackSheet>
      ))}
    </>
  );
}
