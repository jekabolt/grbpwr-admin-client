import { useEffect, useMemo, useState } from 'react';

// Гейт готовности печати.
//
// ЗАЧЕМ. `window.print()` снимает мгновенный слепок DOM. До этого хука кнопка печати
// разблокировалась, как только приходил ГЛАВНЫЙ запрос страницы, а половина документа ехала
// следом: размерная таблица, материалы, релизы, медиа. Ранний клик печатал бумагу, которая
// выглядит полной — с прочерками вместо мерок, пустой колонкой цвета и «unreleased» в шапке.
// Пустая клетка на бумаге неотличима от «данных нет», и цех читает её именно так.
//
// ПРАВИЛА, которые здесь закодированы:
//
//  1. `error` — НЕ `pending`. Отказ сервера не должен запирать печать: наряд на партию,
//     например, сознательно печатается без кат-листа и называет его отсутствие вслух. Отказ
//     попадает в `degraded` и печатается плашкой, но кнопку не блокирует.
//
//  2. Таймаут обязателен. Гейт без таймаута превращает один залипший запрос в «печать
//     невозможна» — то есть чинит одну молчаливую ложь другой, более грубой.
//
//  3. Картинки ждём ПОСЛЕ данных. `<img>` появляются в DOM только когда пришли данные, которые
//     их порождают; сканировать document.images раньше — значит увидеть пустой список и решить,
//     что всё готово.
//
//  4. Всё, что не успело, называется по именам в `degraded` — и печатается НА БУМАГЕ, а не
//     только на экране. Тот, кто держит лист в цеху, экрана не видел.
//
//  5. Статус запроса берётся из `isLoading`, а НЕ из `isPending`: в react-query v5 отключённый
//     запрос (`enabled: false`) навсегда `isPending`, потому что данных у него нет и не будет.
//     Гейт, принявший это за загрузку, ждёт то, чего никто не посылал. См. `depStatus`.

export type PrintDepStatus = 'pending' | 'ok' | 'error';
export type PrintDep = { label: string; status: PrintDepStatus };

/** Статус запроса react-query в терминах гейта. */
export function depStatus(isLoading: boolean, isError: boolean): PrintDepStatus {
  if (isError) return 'error';
  return isLoading ? 'pending' : 'ok';
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function usePrintReady(
  deps: PrintDep[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { ready: boolean; degraded: string[] } {
  // Ключ сравнения: массив пересоздаётся каждый рендер, но нас интересуют только статусы.
  const key = deps.map((d) => `${d.label}=${d.status}`).join('|');

  const pending = useMemo(() => deps.filter((d) => d.status === 'pending'), [key]);
  const failed = useMemo(() => deps.filter((d) => d.status === 'error'), [key]);

  const [assetsReady, setAssetsReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(t);
  }, [timeoutMs]);

  const dataSettled = pending.length === 0;

  useEffect(() => {
    if (!dataSettled) return;
    let cancelled = false;
    // Шрифты: FeatureMono подключён локально с font-display:swap — печать до его загрузки уходит
    // в Inter/Arial, то есть в другую вёрстку таблиц.
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const images = Promise.allSettled(
      Array.from(document.images).map((img) => (img.decode ? img.decode() : Promise.resolve())),
    );
    Promise.all([fonts, images]).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSettled, key]);

  const ready = (dataSettled && assetsReady) || timedOut;

  const degraded = useMemo(() => {
    const out = failed.map((d) => d.label);
    if (timedOut) {
      out.push(...pending.map((d) => d.label));
      if (!assetsReady) out.push('images');
    }
    return out;
  }, [key, timedOut, assetsReady]);

  return { ready, degraded };
}
