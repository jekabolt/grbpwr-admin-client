// Квиз раскладки пройден для пары (карточка, слот ткани) — следующее открытие начинается с шага
// «run». Сами ответы здесь не хранятся: режим настила помнит use-lay-mode, стол — настройки цеха.
// Хранилище может быть недоступно (приватное окно, запрет сайта) — тогда квиз просто идёт сначала.
import { useCallback, useEffect, useState } from 'react';

const keyOf = (techCardId: number | undefined, slotKey: string) =>
  `marker-quiz:done:${techCardId ?? 0}:${slotKey || '-'}`;

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function useQuizDone(
  techCardId: number | undefined,
  slotKey: string,
): [boolean, () => void] {
  const key = keyOf(techCardId, slotKey);
  const [done, setDone] = useState(() => read(key));
  useEffect(() => {
    setDone(read(key));
  }, [key]);
  const markDone = useCallback(() => {
    setDone(true);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Не запомнили — в следующий раз квиз пойдёт с первого шага.
    }
  }, [key]);
  return [done, markDone];
}
