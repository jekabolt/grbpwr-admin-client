import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useMemo } from 'react';

import { wireInt } from '../../wire-int';
import { archivedRef } from '../colorway-picker';
import { isRunLive } from '../generation/run-state';
import { patternRuns } from './model';
import {
  pairKey,
  pairOfRun,
  runTraces,
  shelfCeiling,
  type ClothSlot,
  type RunTraces,
  type ShelfCeiling,
} from './slot-fabrics';

/**
 * ═══ ДВА БЛОКА ШАГА — ОДНО ПРОЧТЕНИЕ ПОЛОСЫ (владелец, 2026-09-26: «IMAGE TO FABRIC должно быть
 * отдельным блоком») ═══════════════════════════════════════════════════════════════════════════
 *
 * Шаг PATTERN — два соседних `Section` в стеке композитора: PATTERN (колорвеи × слоты) и IMAGE TO
 * FABRIC (фото → ткань и карусель LAST FABRICS). Пока карусель жила группой внутри PATTERN, её входы
 * — какие колорвеи нарисованы, какие живые прогоны без ячейки, чей свотч сейчас делается, след
 * последнего «картинка → ткань», потолок полки — считал экран PATTERN и отдавал пропами. Теперь у
 * блоков нет общего родителя ниже композитора, и оба берут ОДНИ И ТЕ ЖЕ сырые пропы (полоса,
 * колорвеи оси, слоты одного `useWatch`) и выводят из них одно и то же ЭТОЙ функцией. Правило
 * «какой прогон ждут в ячейке, а какой — в карусели» написано один раз: выведенное дважды двумя
 * руками, оно разошлось бы, и один прогон стоял бы и в ячейке, и в голове карусели.
 *
 * ⚠ ЭТО ЧИСТЫЙ ВЫВОД, А НЕ ЧТЕНИЕ. Ни опроса (`useRunPolling` — один на шаг, у `PatternStudio`),
 * ни `useWatch`, ни запроса: только `useMemo` над пропами.
 */
export type PatternStepView = {
  /**
   * Колорвеи, которые шаг рисует: живые, и архивный — только если он дошёл до экрана и что-то
   * носит. Архивный без привязок — пустая строка «ничего и нельзя», и её не рисуют.
   * ⚠ ЭТО ФИЛЬТР, А НЕ ОБЕЩАНИЕ ПОКАЗАТЬ АРХИВ С ПРИВЯЗКАМИ (ревью m-5). Ось композитора
   * (`useColorwayChoice`) отдаёт архивный колорвей, только пока он цель студии или у него есть
   * рендеры на верстаке; архивный, у которого есть одни привязки, до этого шага НЕ ДОХОДИТ вовсе,
   * и его ткани видны лишь в карусели (ярлык плитки называет такую пару числом). Расширять ось
   * ради этого шага не стали: она одна на всю студию.
   */
  shown: common_AdminColorwayRef[];
  /** Живой прогон нарисованной пары — его ждут в её ячейке (первый, если их вдруг два). */
  liveByPair: Map<string, common_DesignRun>;
  /** Живые прогоны без своей ячейки на экране — «картинка → ткань» и ненарисованные пары. */
  unpaired: common_DesignRun[];
  /** Следы прогонов, не давших ткани (ревью M-1): пары — под рядом, «картинка → ткань» — плиткой. */
  traces: RunTraces;
  /** Пары, чей свотч сейчас делается, — «making…» у листа `use for ▸` (U-6). */
  making: ReadonlySet<string>;
  /** Потолок полки — один ответ на обе платные двери шага (`shelfCeiling`, ревью m-2). */
  ceiling: ShelfCeiling;
};

export function usePatternStepView(
  band: GetDesignBandResponse,
  colorways: common_AdminColorwayRef[],
  slots: ClothSlot[],
): PatternStepView {
  const shown = useMemo(() => {
    const dressed = new Set((band.assetBindings ?? []).map((b) => wireInt(b.colorwayId)));
    return colorways.filter((c) => {
      const id = c.colorwayId ?? 0;
      return id > 0 && (!archivedRef(c) || dressed.has(id));
    });
  }, [colorways, band.assetBindings]);

  /* Пара прогона читается с его ПАРАМЕТРОВ (`colorwayId` + `pattern.bomItemId`), а не угадывается. */
  const runs = useMemo(() => {
    const drawn = new Set<string>();
    for (const c of shown)
      for (const s of slots) drawn.add(pairKey(c.colorwayId ?? 0, s.bomItemId));
    const liveByPair = new Map<string, common_DesignRun>();
    const unpaired: common_DesignRun[] = [];
    for (const r of patternRuns(band).filter(isRunLive)) {
      const key = pairOfRun(r);
      if (key && drawn.has(key)) {
        if (!liveByPair.has(key)) liveByPair.set(key, r);
      } else unpaired.push(r);
    }
    return {
      liveByPair,
      unpaired,
      traces: runTraces(band, drawn),
      making: new Set(liveByPair.keys()) as ReadonlySet<string>,
    };
  }, [band, shown, slots]);

  const ceiling = useMemo(() => shelfCeiling(band), [band]);

  return useMemo(() => ({ shown, ...runs, ceiling }), [shown, runs, ceiling]);
}
