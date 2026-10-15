// РЕЖИМ НАСТИЛА МАРКЕРА — предпочтение интерфейса, а не данные: localStorage этого браузера.
// 'single' — один настил без стола (maxLengthCm не уходит в движок), 'table' — настил слоями на
// раскроечном столе со строкой стола и цифрами настила. Хранилище может быть недоступно
// (приватное окно, запрет сайта) — тогда режим живёт до закрытия вкладки.
import { useCallback, useState } from 'react';

export type LayMode = 'single' | 'table';

const KEY = 'grbpwr.nesting.layMode';

function readMode(): LayMode {
  try {
    return localStorage.getItem(KEY) === 'table' ? 'table' : 'single';
  } catch {
    return 'single';
  }
}

export function useLayMode(): [LayMode, (m: LayMode) => void] {
  const [mode, setModeState] = useState<LayMode>(readMode);
  const setMode = useCallback((m: LayMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // нет хранилища — режим остаётся на сессию
    }
  }, []);
  return [mode, setMode];
}
