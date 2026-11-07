// ТЕХ-ПАК: СОСТАВНИК, ЭТИКЕТКИ, УПАКОВКА (labels rework I-17). Заменяет прежнюю таблицу `labels`
// (тип · содержимое · место), которой больше нет в модели: составник печатается строками для
// колорвея по умолчанию — той же выводкой, что у блока на вкладке (`compositionLabelSummary`), —
// а этикетки и предметы упаковки таблицами с мокапом в первой колонке. Мокапа нет — клетка так и
// говорит: пустая клетка на бумаге читается как «картинка не нужна».
import type {
  common_Dictionary,
  common_Material,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardGarmentLabel,
  common_TechCardPackagingItem,
} from 'api/proto-http/admin';
import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { depStatus, type PrintDepStatus } from 'components/managers/print/use-print-ready';
import { Nothing, Sheet, TD, TH } from 'components/managers/print/sheet';
import type { ArtworkTile } from 'components/managers/print/sheets/label-facts';
import { ArtworkQr } from 'components/managers/print/sheets/labels';
import { packagingItemFacts } from 'components/managers/print/sheets/packaging-items';
import { useCallback, useMemo, type JSX } from 'react';
import { adaptCareLabels, useColorwayFull } from '../care-labels/adapter';
import {
  compositionLabelSummary,
  sizesInOrder,
  type CompositionLabelSummary,
} from './composition-label/label-summary';
import { isCompositionLabel, labelBomLine } from './sewn-label-model';
import { garmentLabelKindNames, kindLabel } from './tech-card-options';
import { wireInt } from './wire-int';
import { useLabelDictionary } from '../care-labels/use-label-dictionary';
import { EmptyCell } from 'ui';

/**
 * Строки составника колорвеев для печати. Страна живёт в самом колорвее, поэтому читается его полный
 * ответ (тот же ключ запроса, что у блока и страницы печати); статус — в гейт готовности листа.
 * Размеры на бумаге идут в порядке градации, как колонки artwork: карточка хранит порядок кликов.
 */
export function useCompositionLabels({
  techCard,
  colorwayIds,
  materials,
  dictionary,
}: {
  techCard: common_TechCard | undefined;
  colorwayIds: readonly number[];
  /** null — каталог ещё не приехал или не загрузился. */
  materials: readonly common_Material[] | null;
  dictionary: common_Dictionary | undefined;
}): { summaries: CompositionLabelSummary[]; status: PrintDepStatus } {
  const idsKey = colorwayIds.join(',');
  const ids = useMemo(
    () => colorwayIds.filter((id) => id > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const full = useColorwayFull(ids);
  // Countries come from ListCountries (GetDictionary never fills them); the rest of the tech pack
  // keeps its own dictionary, so a failed country read only affects this sheet.
  const labelDict = useLabelDictionary().dictionary;
  const dict = labelDict ?? dictionary;
  const orderSizes = useSizeOrdering();
  const summaries = useMemo(() => {
    if (!techCard || !ids.length) return [];
    const data = sizesInOrder(
      adaptCareLabels({
        techCard,
        colorwayFull: full.byId,
        materials,
        dictionary: dict,
        runs: [],
      }),
      orderSizes,
    );
    // The summary falls back to the card's first colour: paper must not print another colour's label.
    return ids.flatMap((id) => {
      const summary = compositionLabelSummary(data, id);
      return summary?.colorway.id === id ? [summary] : [];
    });
  }, [techCard, ids, full.byId, materials, dict, orderSizes]);
  return { summaries, status: depStatus(full.loading, full.error) };
}

/** Составник одного колорвея: колорвей по умолчанию на листе тех-пака. */
export function useTechPackCompositionLabel({
  colorwayId,
  ...rest
}: {
  techCard: common_TechCard;
  colorwayId: number;
  materials: readonly common_Material[] | null;
  dictionary: common_Dictionary | undefined;
}): { summary: CompositionLabelSummary | null; status: PrintDepStatus } {
  const colorwayIds = useMemo(() => [colorwayId], [colorwayId]);
  const { summaries, status } = useCompositionLabels({ ...rest, colorwayIds });
  return { summary: summaries[0] ?? null, status };
}

export type CareArt = (code: string) => { img?: string; name: string };

export function useCareArt(): CareArt {
  const { byCode } = useCareVocabulary();
  return useCallback(
    (code) => ({ img: byCode[code]?.img ?? CARE_ARTWORK[code], name: byCode[code]?.name ?? code }),
    [byCode],
  );
}

const qty = (n: number | undefined) => (wireInt(n) > 0 ? String(wireInt(n)) : '—');
const txt = (s: string | undefined) => (s ?? '').trim() || '—';

const pickedUrl = (item: common_TechCardPackagingItem): string | undefined => {
  const media = item.pickedThumbnail?.media;
  return media?.compressed?.mediaUrl || media?.fullSize?.mediaUrl || media?.thumbnail?.mediaUrl;
};

/** Мокапы строки: все картинки, каждая квадратом 18 мм; нет ни одной — «no mockup». */
function MockupCell({
  ids,
  urlOf,
  picked,
}: {
  ids: number[];
  urlOf: (id: number) => string;
  /** The picture of the picked item, for a row with no mockup of its own. */
  picked?: string;
}) {
  const shown = ids.filter((id) => id > 0);
  return (
    <td className={`${TD} w-[20mm]`}>
      {shown.length === 0 ? (
        picked ? (
          <img
            src={picked}
            alt='mockup'
            className='size-[18mm] border border-textColor object-contain'
          />
        ) : (
          <div
            className='flex size-[18mm] items-center justify-center border border-dashed border-black text-center text-nano uppercase leading-tight'
            data-no-mockup=''
          >
            no mockup
          </div>
        )
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

/** Строки составника одного колорвея: тех-пак и наряд партии печатают их одинаково. */
function CompositionLabelBody({
  summary,
  careArt,
}: {
  summary: CompositionLabelSummary | null;
  careArt: CareArt;
}): JSX.Element {
  const cw = summary?.colorway;
  if (!summary || !cw) return <Nothing>reading the colourway…</Nothing>;
  return (
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
                  <EmptyCell />
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
                {l.overridden ? <span className='font-semibold'>set on the card</span> : l.source}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompositionLabelSheet({
  summary,
  careArt,
}: {
  summary: CompositionLabelSummary | null;
  careArt: CareArt;
}): JSX.Element {
  return (
    <Sheet title='composition label'>
      <CompositionLabelBody summary={summary} careArt={careArt} />
    </Sheet>
  );
}

export function TechPackLabelSheets({
  summary,
  hasColorway,
  labels,
  bomItems,
  artwork,
  items,
  urlOf,
  colourName,
  careArt,
  showLabels,
  showItems,
}: {
  summary: CompositionLabelSummary | null;
  /** У карточки есть колорвей: без него составник не выводится вовсе. */
  hasColorway: boolean;
  labels: readonly common_TechCardGarmentLabel[];
  bomItems: readonly common_TechCardBomItem[];
  /** The artwork of the labels this sheet lists, in the document's scope. */
  artwork: readonly ArtworkTile[];
  items: readonly common_TechCardPackagingItem[];
  urlOf: (id: number) => string;
  colourName: (colorwayId: number) => string;
  careArt: CareArt;
  /** Тетради пошива / ОТК: составник и этикетки. */
  showLabels: boolean;
  /** Тетрадь ОТК: предметы упаковки (как лист packaging). */
  showItems: boolean;
}): JSX.Element {
  // The composition row holds where that label sits; its own sheet above prints the label itself.
  const sewnLabels = labels.filter((l) => !isCompositionLabel(l.key));
  // A column of «no mockup» in every row says nothing the QR under the table does not answer.
  const hasMockup = sewnLabels.some((l) => (l.mediaIds ?? []).some((id) => wireInt(id) > 0));
  return (
    <>
      {showLabels && (
        <Sheet title='composition label'>
          {!hasColorway ? (
            <Nothing>
              no colourway yet: the composition label is set per colourway, add one to the style
            </Nothing>
          ) : (
            <CompositionLabelBody summary={summary} careArt={careArt} />
          )}
        </Sheet>
      )}

      {showLabels && sewnLabels.length > 0 && (
        <Sheet title='labels'>
          <table className='w-full border-collapse text-micro' data-tp-labels=''>
            <thead>
              <tr>
                {hasMockup && <th className={TH}>mockup</th>}
                <th className={TH}>label</th>
                <th className={TH}>placement</th>
                <th className={TH}>attachment</th>
                <th className={TH}>folding</th>
                <th className={TH}>size</th>
                <th className={TH}>material</th>
                <th className={`${TH} text-right`}>qty / garment</th>
                <th className={TH}>note</th>
              </tr>
            </thead>
            <tbody>
              {sewnLabels.map((l, i) => (
                <tr key={l.key || i} className='break-inside-avoid' data-tp-label={l.key ?? ''}>
                  {hasMockup && <MockupCell ids={(l.mediaIds ?? []).map(wireInt)} urlOf={urlOf} />}
                  <td className={`${TD} font-semibold`}>
                    {txt(kindLabel(garmentLabelKindNames, l.key))}
                  </td>
                  <td className={TD}>{txt(l.placement)}</td>
                  <td className={TD}>{txt(l.attachment)}</td>
                  <td className={TD}>{txt(l.fold)}</td>
                  <td className={TD}>{txt(l.size)}</td>
                  <td className={TD}>{txt(labelBomLine(l, bomItems)?.name)}</td>
                  <td className={`${TD} text-right`}>{qty(l.qtyPerGarment)}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>{txt(l.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ArtworkQr title='artwork qr' tiles={artwork} />
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
              {items.map((it, i) => {
                const facts = packagingItemFacts(it);
                const usedFor = [it.usage?.trim(), ...facts.colorwayIds.map(colourName)];
                return (
                  <tr key={it.key || i} className='break-inside-avoid' data-tp-item={it.key ?? ''}>
                    <MockupCell
                      ids={(it.mediaIds ?? []).map(wireInt)}
                      urlOf={urlOf}
                      picked={pickedUrl(it)}
                    />
                    <td className={TD}>
                      <div className='font-semibold'>{txt(facts.item)}</div>
                      {facts.what !== facts.item && <div>{facts.what}</div>}
                    </td>
                    <td className={TD}>{txt(usedFor.filter(Boolean).join(', '))}</td>
                    <td className={TD}>{txt(it.packing)}</td>
                    <td className={TD}>{txt(it.size)}</td>
                    <td className={`${TD} text-right`}>
                      {facts.quantity}
                      {facts.perOrder && ' / order'}
                    </td>
                    <td className={`${TD} whitespace-pre-wrap`}>{txt(it.note)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}
    </>
  );
}
