import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useCallback, useMemo } from 'react';
import { BUNDLED_WORK_CATALOG, parseWorkCatalog, type WorkCatalog } from './operation-work';

// КАТАЛОГ РАБОТ ОДНИМ ЗАПРОСОМ — И ПИКЕР, КОТОРЫЙ НИКОГДА НЕ ПУСТ.
//
// Один ключ на всё приложение: каталог не зависит ни от карточки, ни от пользователя, и второй
// запрос за ним был бы вторым состоянием того же списка. Кэш держится долго нарочно — это
// СПРАВОЧНИК, растущий миграциями, а не данные карточки; пять минут `staleTime` по умолчанию
// заставляли бы перечитывать его при каждом переходе между вкладками.
//
// ОТКАЗ — НЕ ПУСТОТА. Сеть легла, сервер старее каталога, роль без права — во всех трёх случаях
// пикер обязан рисоваться, потому что выбор вида это единственный способ назвать шаг. Отказ
// подменяется снимком бандла и НАЗЫВАЕТСЯ вслух: `source === 'bundle'` уезжает в подпись пикера,
// а не только в консоль. Молчаливая деградация здесь была бы худшей из возможных: человек
// печатает русское слово, ничего не находит и решает, что работы такой нет.

const CATALOG_KEY = ['tech-card', 'operation-work-catalog'] as const;

export type WorkCatalogState = {
  catalog: WorkCatalog;
  /** Каталог приехал с сервера. `false` — работаем на снимке бандла (нет синонимов и дефолтов). */
  live: boolean;
  loading: boolean;
  /** Перечитать каталог — после жеста «запомнить как дефолт» дефолты обязаны обновиться. */
  refresh: () => void;
};

export function useOperationWorkCatalog(): WorkCatalogState {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => adminService.GetOperationWorkCatalog({}),
    // Справочник, а не данные карточки: час свежести и никакого перезапроса при возврате фокуса.
    staleTime: 60 * 60 * 1000,
    // Одна повторная попытка — как везде в приложении; дальше честный фолбэк вместо ожидания.
    retry: 1,
  });

  const catalog = useMemo(() => parseWorkCatalog(data) ?? BUNDLED_WORK_CATALOG, [data]);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: CATALOG_KEY });
  }, [qc]);

  return { catalog, live: catalog.source === 'server', loading: isLoading, refresh };
}
