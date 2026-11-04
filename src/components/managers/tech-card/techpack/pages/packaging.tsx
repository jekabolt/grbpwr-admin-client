import { useMemo, type ReactNode } from 'react';
import { DataTable, EmptyCell, GroupLabel, SectionHeader } from 'ui';

import { derivePackaging, type PackagingModel } from '../derive-packaging';
import { own, useT, type PdfT } from '../i18n';
import { TechpackSheet, type TechpackPageProps } from '../sheet';
import { Missing } from './bits';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='flex gap-2 border-b border-hairline py-1 text-textBaseSize last:border-b-0'>
      <span className='w-14 shrink-0 uppercase text-labelColor'>{label}</span>
      <span className='min-w-0'>{value || <EmptyCell />}</span>
    </div>
  );
}

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
          <th data-align='left' className='w-1/5'>
            {t('packaging.what')}
          </th>
          <th className='w-8'>{t('common.quantity')}</th>
          <th className='w-24'>{t('packaging.per')}</th>
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
    <aside className={land ? 'min-w-0' : 'grid min-w-0 grid-cols-3 gap-5'}>
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
        <Fact
          label={t('packaging.units')}
          value={model.carton.units ? model.carton.units : null}
        />
        <Fact label={t('packaging.box')} value={own(model.carton.box)} />
        <Fact label={t('packaging.marking')} value={own(model.carton.marking)} />
      </div>
    </aside>
  );
}

export function PackagingPage({ techCard, orient, docline, n }: TechpackPageProps) {
  const { t } = useT();
  const model = useMemo(() => derivePackaging(techCard, undefined, t), [techCard, t]);
  const land = orient === 'land';

  return (
    <TechpackSheet orient={orient} docline={docline}>
      <SectionHeader title={`${t('common.generated', { text: n })} ${t('packaging.title')}`} />
      <div
        className={
          land
            ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_190px] gap-5'
            : 'flex min-h-0 flex-1 flex-col gap-5'
        }
      >
        <div className='min-w-0'>
          <ItemsTable model={model} items={model.items} t={t} />
        </div>
        <PackedFacts model={model} land={land} t={t} />
      </div>
      <div className='mt-auto flex justify-end border-t border-textColor pt-1 text-micro uppercase tracking-label text-labelColor'>
        {t('packaging.insideFirst')}
      </div>
    </TechpackSheet>
  );
}
