// ТЕХ-ПАК: СОСТАВНИК, ЭТИКЕТКИ, УПАКОВКА (labels rework I-17). Заменяет прежнюю таблицу `labels`
// (тип · содержимое · место), которой больше нет в модели: составник печатается строками для
// колорвея по умолчанию — той же выводкой, что у блока на вкладке (`compositionLabelSummary`), —
// а этикетки и предметы упаковки таблицами с мокапом в первой колонке. Мокапа нет — клетка так и
// говорит: пустая клетка на бумаге читается как «картинка не нужна».
import type {
  common_Dictionary,
  common_Material,
  common_TechCard,
  common_TechCardGarmentLabel,
  common_TechCardPackagingItem,
} from 'api/proto-http/admin';
import { depStatus, type PrintDepStatus } from 'components/managers/print/use-print-ready';
import { Nothing, Sheet, TD, TH } from 'components/managers/print/sheet';
import { useMemo, type JSX } from 'react';
import { adaptCareLabels, useColorwayFull } from '../care-labels/adapter';
import {
  compositionLabelSummary,
  type CompositionLabelSummary,
} from './composition-label/label-summary';
import { garmentLabelKinds, kindLabel, packagingItemKinds } from './tech-card-options';
import { wireInt } from './wire-int';

/**
 * Строки составника колорвея по умолчанию для печати. Страна живёт в самом колорвее, поэтому
 * читается его полный ответ (тот же ключ запроса, что у блока и страницы печати); статус — в гейт
 * готовности листа.
 */
export function useTechPackCompositionLabel({
  techCard,
  colorwayId,
  materials,
  dictionary,
}: {
  techCard: common_TechCard;
  colorwayId: number;
  /** null — каталог ещё не приехал или не загрузился. */
  materials: readonly common_Material[] | null;
  dictionary: common_Dictionary | undefined;
}): { summary: CompositionLabelSummary | null; status: PrintDepStatus } {
  const ids = useMemo(() => (colorwayId > 0 ? [colorwayId] : []), [colorwayId]);
  const full = useColorwayFull(ids);
  const summary = useMemo(() => {
    if (!(colorwayId > 0)) return null;
    const data = adaptCareLabels({
      techCard,
      colorwayFull: full.byId,
      materials,
      dictionary,
      runs: [],
    });
    return compositionLabelSummary(data, colorwayId);
  }, [techCard, colorwayId, full.byId, materials, dictionary]);
  return { summary, status: depStatus(full.loading, full.error) };
}

export type CareArt = (code: string) => { img?: string; name: string };

const qty = (n: number | undefined) => (wireInt(n) > 0 ? String(wireInt(n)) : '—');
const txt = (s: string | undefined) => (s ?? '').trim() || '—';

/** Мокапы строки: все картинки, каждая квадратом 18 мм; нет ни одной — «no mockup». */
function MockupCell({ ids, urlOf }: { ids: number[]; urlOf: (id: number) => string }) {
  const shown = ids.filter((id) => id > 0);
  return (
    <td className={`${TD} w-[20mm]`}>
      {shown.length === 0 ? (
        <div
          className='flex size-[18mm] items-center justify-center border border-dashed border-black text-center text-nano uppercase leading-tight'
          data-no-mockup=''
        >
          no mockup
        </div>
      ) : (
        <div className='flex flex-col gap-1'>
          {shown.map((id) => {
            const url = urlOf(id);
            return url ? (
              <img
                key={id}
                src={url}
                alt='mockup'
                className='size-[18mm] border border-black object-contain'
                data-mockup={id}
              />
            ) : (
              <div
                key={id}
                className='flex size-[18mm] items-center justify-center border border-black text-nano'
                data-mockup={id}
              >
                #{id}
              </div>
            );
          })}
        </div>
      )}
    </td>
  );
}

export function TechPackLabelSheets({
  summary,
  hasColorway,
  labels,
  items,
  urlOf,
  careArt,
  showLabels,
  showItems,
}: {
  summary: CompositionLabelSummary | null;
  /** У карточки есть колорвей: без него составник не выводится вовсе. */
  hasColorway: boolean;
  labels: readonly common_TechCardGarmentLabel[];
  items: readonly common_TechCardPackagingItem[];
  urlOf: (id: number) => string;
  careArt: CareArt;
  /** Тетради пошива / ОТК: составник и этикетки. */
  showLabels: boolean;
  /** Тетрадь ОТК: предметы упаковки (как лист packaging). */
  showItems: boolean;
}): JSX.Element {
  const cw = summary?.colorway;
  return (
    <>
      {showLabels && (
        <Sheet title='composition label'>
          {!hasColorway ? (
            <Nothing>
              no colourway yet: the composition label is set per colourway, add one to the style
            </Nothing>
          ) : !summary || !cw ? (
            <Nothing>reading the colourway…</Nothing>
          ) : (
            <div data-tp-composition=''>
              <p className='mb-2 text-micro uppercase text-labelColor'>
                colourway {cw.colourName || cw.baseSku || `#${cw.id}`}
                {cw.baseSku && cw.colourName ? ` · ${cw.baseSku}` : ''} · sewn into every garment
              </p>
              <table className='w-full border-collapse text-micro'>
                <thead>
                  <tr>
                    <th className={`${TH} w-32`}>line</th>
                    <th className={TH}>on the label</th>
                    <th className={`${TH} w-32`}>from</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lines.map((l) => (
                    <tr key={l.line} className='break-inside-avoid' data-tp-line={l.line}>
                      <td className={`${TD} uppercase`}>{l.name}</td>
                      <td className={TD}>
                        {l.line === 'care-symbols' && summary.careCodes.length > 0 ? (
                          <div className='flex flex-wrap items-center gap-2'>
                            {summary.careCodes.map((code) => {
                              const a = careArt(code);
                              return a.img ? (
                                <img
                                  key={code}
                                  src={a.img}
                                  alt={a.name}
                                  title={a.name}
                                  className='size-5'
                                />
                              ) : (
                                <span key={code}>{code}</span>
                              );
                            })}
                          </div>
                        ) : l.value.length === 0 ? (
                          '—'
                        ) : (
                          <div
                            className={
                              l.line === 'qr' || l.line === 'logo'
                                ? 'break-all'
                                : 'whitespace-pre-wrap uppercase'
                            }
                          >
                            {l.value.map((v, i) => (
                              <div key={i}>{v}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={TD}>
                        {l.overridden ? (
                          <span className='font-semibold'>set on the card</span>
                        ) : (
                          l.source
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sheet>
      )}

      {showLabels && labels.length > 0 && (
        <Sheet title='labels'>
          <table className='w-full border-collapse text-micro' data-tp-labels=''>
            <thead>
              <tr>
                <th className={TH}>mockup</th>
                <th className={TH}>label</th>
                <th className={TH}>placement</th>
                <th className={TH}>attachment</th>
                <th className={TH}>folding</th>
                <th className={TH}>size</th>
                <th className={`${TH} text-right`}>qty / garment</th>
                <th className={TH}>note</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l.key || i} className='break-inside-avoid' data-tp-label={l.key ?? ''}>
                  <MockupCell ids={(l.mediaIds ?? []).map(wireInt)} urlOf={urlOf} />
                  <td className={`${TD} font-semibold`}>
                    {txt(kindLabel(garmentLabelKinds, l.key))}
                  </td>
                  <td className={TD}>{txt(l.placement)}</td>
                  <td className={TD}>{txt(l.attachment)}</td>
                  <td className={TD}>{txt(l.folding)}</td>
                  <td className={TD}>{txt(l.size)}</td>
                  <td className={`${TD} text-right`}>{qty(l.qtyPerGarment)}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>{txt(l.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}

      {showItems && items.length > 0 && (
        <Sheet title='packaging items'>
          <table className='w-full border-collapse text-micro' data-tp-items=''>
            <thead>
              <tr>
                <th className={TH}>mockup</th>
                <th className={TH}>item</th>
                <th className={TH}>used for</th>
                <th className={TH}>packing</th>
                <th className={TH}>size</th>
                <th className={`${TH} text-right`}>qty / garment</th>
                <th className={TH}>note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.key || i} className='break-inside-avoid' data-tp-item={it.key ?? ''}>
                  <MockupCell ids={(it.mediaIds ?? []).map(wireInt)} urlOf={urlOf} />
                  <td className={`${TD} font-semibold`}>
                    {txt(kindLabel(packagingItemKinds, it.key))}
                  </td>
                  <td className={TD}>{txt(it.usage)}</td>
                  <td className={TD}>{txt(it.packing)}</td>
                  <td className={TD}>{txt(it.size)}</td>
                  <td className={`${TD} text-right`}>{qty(it.qtyPerGarment)}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>{txt(it.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
    </>
  );
}
