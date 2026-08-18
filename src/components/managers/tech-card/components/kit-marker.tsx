// «РАСКЛАДКА КОМПЛЕКТА» — ЛЁГКАЯ ПОЛОВИНА: кнопка на карточке ткани и решение, показывать ли её.
//
// ЗАЧЕМ ЭТО ДЕЙСТВИЕ ЖИВЁТ ИМЕННО ЗДЕСЬ. Претензия владельца звучала так: «одна и та же ткань
// бывает и карманкой, и основной, и один процент раскроя на них не логичен». Процент раскроя стоит
// на СТРОКЕ BOM — то есть на РОЛИ ткани, — и одинаковым он быть не обязан; беда в том, что взять
// его неоткуда, кроме как «на глаз». Раскладка отвечает на этот вопрос измерением: карманка и
// основная кроят РАЗНЫЕ детали, и настил каждой даёт своё число. А как только у слота появляется
// норма из раскладки, процент раскроя на нём перестаёт применяться САМ СОБОЙ — костинг не гроссит
// марочную норму (отходы уже внутри измеренной длины). Ручной процент не запрещается, он просто
// становится не нужен.
//
// ТЯЖЁЛОЕ — В ЛЕНИВОМ ЧАНКЕ. Движок раскладки тянет воркер, dxf-parser и clipper; этот файл лежит
// в чанке рецепта, который грузится при открытии вкладки колорвеев на КАЖДОЙ карточке. Тот же
// приём и та же причина, что у `dxf-apply.tsx`.
//
// ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ. Это не второй движок и не второй планировщик: диалог собирает ВХОД (скоуп
// этой строки, базовый размер, ширина этого пина) и отдаёт его тому же `planBatchMarkers`, которым
// считает очередь раскроя партии, — в режиме размерных норм. Очередь делает то же самое сразу для
// всей карточки и всей партии, с вкладки костинга; здесь то же действие доступно с той строки, где
// на него смотрят, и результат сразу становится нормой ЭТОЙ строки.
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { fabricScopes, isRollGoodsSection } from './bom-purpose';
import type { MarkerColorway } from './nesting/colorway-widths';
import { dxfSheetsByScope } from './nesting/dxf-by-scope';
import type { WeightBasisResolution } from './nesting/fabric-weight';
import type { KitMarkerApplyPatch } from './kit-marker-dialog';
import type { TechCardFormData } from './schema';

const KitMarkerDialog = lazy(() => import('./kit-marker-dialog'));

export function KitMarkerHint({
  control,
  techCardId,
  lineKey,
  colorwayId,
  colorwayPins,
  unit,
  articleWidth,
  weightBasis,
  sizeNameById,
  cardMarkersAllColorways,
  stampedMarker,
  canEdit,
  frozen,
  onApply,
}: {
  control: Control<TechCardFormData>;
  techCardId: number;
  lineKey: string;
  colorwayId: number;
  /** Пины колорвеев карточки с их ширинами (markerColorways) — вход планировщика. */
  colorwayPins?: readonly MarkerColorway[];
  unit: string;
  articleWidth: string;
  weightBasis: WeightBasisResolution;
  sizeNameById: Map<number, string>;
  cardMarkersAllColorways?: common_TechCardMarkerSummary[];
  stampedMarker?: common_TechCardMarkerSummary;
  canEdit: boolean;
  /**
   * Карточка ВЫПУЩЕНА. Отдельно от `canEdit`, потому что это РАЗНЫЕ причины с разными починками:
   * «нет прав» лечится ролью, «карточка выпущена» — снятием с релиза, и сервер отказывает во
   * втором случае сам (SaveMarker требует изменяемую карточку для всего, что не принадлежит
   * прогону; норма может быть только карточной — прогонной это запрещено chk_tcm_run_not_norm).
   */
  frozen: boolean;
  onApply: (patch: KitMarkerApplyPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    lineKey?: string;
    purpose?: string;
    name?: string;
  }>;
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }>;

  // ЕСТЬ ЛИ У ЭТОЙ ТКАНИ ХОТЬ ОДИН DXF — единственный вопрос, на который отвечает лёгкая половина.
  // Он читается из формы и не стоит ни байта геометрии; всё остальное (нашлись ли контуры, есть ли
  // детали базового размера, известна ли ширина) знает только разбор, и отвечает на это диалог —
  // словами, а не погасшей кнопкой.
  const hasSheets = useMemo(() => {
    const scopes = fabricScopes(
      bomItems
        .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
        .map((b) => ({
          lineKey: b.lineKey as string,
          purpose: b.purpose ?? '',
          name: b.name ?? '',
          section: b.section ?? '',
        })),
    );
    const scope = scopes.find((s) => s.lines.some((l) => l.lineKey === lineKey));
    if (!scope) return false;
    return (dxfSheetsByScope(patterns, scopes).get(scope.key) ?? []).length > 0;
  }, [bomItems, patterns, lineKey]);

  // Нет выкроек — нет и предложения. Кнопка, которая всегда отказывает, читается как поломка, а не
  // как отсутствие данных; куда грузить выкройки, говорит вкладка «выкройки», а строка рецепта без
  // нормы и так объясняет, что расход считают (см. DxfApplyHint.explainWhenIdle).
  if (!hasSheets) return null;

  // ВЫПУЩЕННАЯ КАРТОЧКА: НА МЕСТЕ КНОПКИ — ПРИЧИНА, А НЕ ПУСТОТА. Это отказ СЕРВЕРА, а не
  // осторожность экрана, и он стоит ДО прогона: иначе задание отработало бы полный бюджет и
  // получило отказ на сохранении — минуты счёта в мусор.
  if (frozen) {
    return (
      <Text size='nano' variant='label' component='p'>
        a kit marker can't be captured on a released card: the server doesn't accept card markers on
        it, and only a card marker can be the norm. take the card off release, or capture the run's
        lay from the cutting queue on the costing tab — it belongs to the run, and release doesn't
        stand in its way
      </Text>
    );
  }
  if (!canEdit) return null;

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
        kit marker…
      </Button>
      <Text size='nano' variant='label' component='span'>
        lay out the pieces of THIS fabric at this article's width — a measured length, waste already
        inside it
      </Text>
      {open && (
        <Suspense fallback={null}>
          <KitMarkerDialog
            control={control}
            techCardId={techCardId}
            lineKey={lineKey}
            colorwayId={colorwayId}
            colorwayPins={colorwayPins ?? []}
            unit={unit}
            articleWidth={articleWidth}
            weightBasis={weightBasis}
            sizeNameById={sizeNameById}
            cardMarkersAllColorways={cardMarkersAllColorways}
            stampedMarker={stampedMarker}
            onApply={onApply}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
