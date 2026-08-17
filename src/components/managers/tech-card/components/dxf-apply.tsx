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
import type { WeightBasisResolution } from './nesting/fabric-weight';
import type { TechCardFormData } from './schema';
import { useFabricDxfPieces, type RecipePieceLink } from './use-fabric-dxf-pieces';

const DxfApplyDialog = lazy(() => import('./dxf-apply-dialog'));

export function DxfApplyHint({
  control,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  canEdit,
  compact = false,
  explainOnly = false,
  explainWhenIdle = false,
  recipeLinks,
  techCardId,
  onApply,
}: {
  control: Control<TechCardFormData>;
  lineKey: string;
  unit: string;
  /** Процент раскроя слота. Пустой = применять нельзя (netto без него занижает закупку). */
  wastagePercent: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  /** Основа веса кг-слота (Ф3) — резолвит строка рецепта, сюда приходит готовой. */
  weightBasis: WeightBasisResolution;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  /**
   * Кнопка БЕЗ подписи — для тулбара в шапке карточки (макет «лист»). Подпись «площадь деталей ÷
   * раскройная ширина» объясняет ИНСТРУМЕНТ, а не число, и в ряду из пяти кнопок она разрывала бы
   * строку; то же самое сказано первой строкой самого диалога. Отказы (`explainWhenIdle`) компакт
   * НЕ глушит: они говорят, чего не хватает, и молчание вместо них — та самая пустая кнопка.
   */
  compact?: boolean;
  /**
   * ТОЛЬКО ОБЪЯСНЕНИЕ, НИКОГДА КНОПКА. Кнопка в макете «лист» стоит в тулбаре шапки, а адресный
   * отказ («ряд не заявлен», «ни одна деталь не отнесена к этой ткани») — длинная фраза, которой
   * в ряду кнопок не место, и она обязана стоять у ЧИСЛА. Экземпляр с этим флагом монтируется под
   * таблицей и молчит всегда, кроме случая, когда предлагать нечего.
   */
  explainOnly?: boolean;
  /**
   * Строка рецепта пока БЕЗ нормы — тогда молчаливый возврат null запрещён: у такой строки не
   * остаётся ничего, кроме свёрнутого «ввести руками…», и экран предлагает угадать, ни слова не
   * сказав, что число вообще-то считается. Здесь известно РОВНО то, чего не хватает (комплект
   * деталей и размерный ряд), поэтому объясняет это место, а не вызывающий.
   */
  explainWhenIdle?: boolean;
  /**
   * Привязки «деталь → слот» из СТРОК РЕЦЕПТА этого колорвея — второй, на практике основной
   * источник комплекта деталей (см. useFabricDxfPieces). Без него карточка, где ткань назначена
   * деталям в рецепте, а не на вкладке деталей кроя, оставалась без кнопки вовсе.
   */
  recipeLinks?: readonly RecipePieceLink[];
  /**
   * id карточки — нужен ТОЛЬКО для публикации измеренных площадей на сервер (Ф0/0297), которая
   * происходит в момент подтверждённого применения нормы. 0/undefined = карточка ещё не сохранена:
   * площади публиковать некуда, и применение нормы это никак не задевает.
   */
  techCardId?: number;
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
  const { pieces, unaliasedPieces } = useFabricDxfPieces(control, lineKey, recipeLinks);

  // Кнопки нет, когда предлагать нечего: без деталей этой ткани и без размерного ряда диалог ответил
  // бы отказом на каждое открытие — а кнопка, которая всегда отказывает, читается как поломка, а не
  // как отсутствие данных. Непривязанные детали кнопку НЕ гасят: там отказ содержательный и
  // называет, что именно связать.
  //
  // НО МОЛЧАТЬ ВМЕСТО КНОПКИ МОЖНО ТОЛЬКО ТАМ, ГДЕ НОРМА УЖЕ ЕСТЬ. На строке без нормы (см.
  // explainWhenIdle) пустота вместо кнопки означала, что от всего блока расхода остаётся одна
  // свёрнутая «ввести руками…» — экран предлагал угадать и ни словом не упоминал, что число
  // считается. Условия РАЗНЫЕ, и лечатся они в разных местах карточки, поэтому называются порознь.
  if (pieces.length + unaliasedPieces.length === 0 || sizeIds.length === 0) {
    if (!explainWhenIdle && !explainOnly) return null;
    return (
      <Text size='nano' variant='label' component='p'>
        {sizeIds.length === 0
          ? "consumption can't be computed from the patterns: the card has no size range declared — the norm is written per size, and there is nobody to write it for yet"
          : "consumption can't be computed from the patterns: no cut piece is assigned to this fabric — neither by a recipe line (“assign pieces” on this fabric's card, just below), nor by a piece's material on the cut pieces tab. without that there is nothing to add the garment's area up from"}
      </Text>
    );
  }

  // Предлагать есть что — а этот экземпляр отвечает только за отказ: молчит.
  if (explainOnly) return null;

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
        from the patterns…
      </Button>
      {!compact && (
        <Text size='nano' variant='label' component='span'>
          piece area ÷ cutting width — net, without the waste between pieces
        </Text>
      )}
      {open && (
        <Suspense fallback={null}>
          <DxfApplyDialog
            control={control}
            pieces={pieces}
            unaliasedPieces={unaliasedPieces}
            unit={unit}
            wastagePercent={wastagePercent}
            articleWidth={articleWidth}
            weightBasis={weightBasis}
            sizeIds={sizeIds}
            sizeNameById={sizeNameById}
            canEdit={canEdit}
            techCardId={techCardId ?? 0}
            lineKey={lineKey}
            onClose={() => setOpen(false)}
            onApply={onApply}
          />
        </Suspense>
      )}
    </div>
  );
}
