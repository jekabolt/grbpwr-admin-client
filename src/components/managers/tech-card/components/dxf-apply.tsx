// «По выкройкам» — ЛЁГКАЯ ПОЛОВИНА: кнопка на строке рецепта и разрешение «есть ли чем считать».
//
// Тяжёлое (скачивание выкроек, воркерный разбор, замер припуска, геометрия слоёв) живёт в
// dxf-apply-dialog.tsx и приезжает ДИНАМИЧЕСКИМ импортом, только когда диалог открыли. Причина ровно
// та же, по которой marker-apply тянет площади через `await import(...)`: этот файл лежит в чанке
// рецепта, который загружается при открытии вкладки колорвеев на КАЖДОЙ карточке, а платить за
// геометрию должен тот, кто её попросил. Диалог монтируется только открытым — сам факт монтирования
// и есть «взвести разбор», поэтому внутри него нет ни одного флага про это.
//
// Что решается ЗДЕСЬ и не может быть отложено: показывать ли кнопку вообще. Ответ читается из формы
// карточки (BOM, детали кроя, связи блоков) и не требует ни одного байта геометрии. Сама сборка
// комплекта деталей ткани вынесена в useFabricDxfPieces — ОБЩИЙ хук с пересчётом нормы по текущим
// данным (dxf-recheck.tsx): два места, собирающие комплект по-разному, рождали бы ложные
// расхождения.
import { lazy, Suspense, useState } from 'react';
import { type Control } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import type { TechCardFormData } from './schema';
import { useFabricDxfPieces } from './use-fabric-dxf-pieces';

const DxfApplyDialog = lazy(() => import('./dxf-apply-dialog'));

export function DxfApplyHint({
  control,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  control: Control<TechCardFormData>;
  lineKey: string;
  unit: string;
  /** Процент раскроя слота. Пустой = применять нельзя (netto без него занижает закупку). */
  wastagePercent: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    quantity?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
    normMarkerId?: number;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const { pieces, unaliasedPieces } = useFabricDxfPieces(control, lineKey);

  // Кнопки нет, когда предлагать нечего: без деталей этой ткани и без размерного ряда диалог ответил
  // бы отказом на каждое открытие — а кнопка, которая всегда отказывает, читается как поломка, а не
  // как отсутствие данных. Непривязанные детали кнопку НЕ гасят: там отказ содержательный и
  // называет, что именно связать.
  if (pieces.length + unaliasedPieces.length === 0 || sizeIds.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
        по выкройкам…
      </Button>
      <Text size='nano' variant='label' component='span'>
        площадь деталей ÷ раскройная ширина — netto, без межлекальных выпадов
      </Text>
      {open && (
        <Suspense fallback={null}>
          <DxfApplyDialog
            control={control}
            pieces={pieces}
            unaliasedPieces={unaliasedPieces}
            unit={unit}
            wastagePercent={wastagePercent}
            articleWidth={articleWidth}
            sizeIds={sizeIds}
            sizeNameById={sizeNameById}
            canEdit={canEdit}
            onClose={() => setOpen(false)}
            onApply={onApply}
          />
        </Suspense>
      )}
    </div>
  );
}
