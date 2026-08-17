import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Черновик несохранённого текста заметки — в localStorage.
 *
 * Закрытая вкладка не должна стоить набранного текста: страницу перезагружают по случайности,
 * вкладку закрывают вместо соседней, ноутбук засыпает. Заметка — единственное место раздела, где
 * потерянное не восстанавливается ничем: файл лежит в бакете, а текст до сохранения есть только
 * в этом поле.
 *
 * ── ЧТО ЗДЕСЬ НАМЕРЕННО НЕ ХРАНИТСЯ ──────────────────────────────────────────────────────────
 *
 * ТОЛЬКО ТЕКСТ. Ни имени файла, ни тем, ни владельцев, ни доступа. Это не экономия места: в этом
 * проекте черновик тех-карты уже стирал поля, которых в нём не было, — восстановление
 * подставляло свой объект целиком, и всё, что появилось на сервере ПОСЛЕ снятия снимка,
 * обнулялось молча. Черновик, который умеет хранить только одно поле, не может обеднить
 * остальные по построению — и поэтому здесь у него ровно одно поле.
 *
 * ── ПОЧЕМУ ХРАНИТСЯ ОТПЕЧАТОК ────────────────────────────────────────────────────────────────
 *
 * `base` — отпечаток той версии, от которой черновик произошёл. Без него восстановленный вчера
 * текст сохранялся бы поверх сегодняшней чужой правки БЕЗ конфликта: клиент подставил бы свежий
 * отпечаток с сервера, сравнение прошло бы, и чужая работа исчезла бы молча. С ним сервер честно
 * ответит конфликтом, и человек увидит обе версии.
 */

const PREFIX = 'files:note-draft:';

export interface NoteDraft {
  /** Единственное поле-содержимое. См. шапку: расширять его — значит воспроизводить дефект. */
  content: string;
  /** Отпечаток версии, ОТ КОТОРОЙ произошёл этот текст. Пустая строка — «неизвестно». */
  base: string;
  /** Когда набрано, ms. Показывается в предложении восстановить: свежесть тут — это довод. */
  at: number;
}

function keyOf(id: number): string {
  return `${PREFIX}${id}`;
}

function read(id: number | undefined): NoteDraft | null {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NoteDraft>;
    // Форма проверяется, а не предполагается: ключ в localStorage переживает выкаты клиента, и
    // мусор оттуда не имеет права ни подставиться в поле, ни уронить экран.
    if (typeof parsed?.content !== 'string') return null;
    return {
      content: parsed.content,
      base: typeof parsed.base === 'string' ? parsed.base : '',
      at: typeof parsed.at === 'number' ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Черновик одной заметки.
 *
 * `offer` — снимок, снятый ОДИН РАЗ при открытии. Дальше по нему рисуется предложение
 * «восстановить/отбросить», и собственная запись черновика его не трогает: иначе набор текста
 * пересобирал бы предложение восстановить этот же текст, и оно висело бы вечно.
 */
export function useNoteDraft(id: number | undefined) {
  const [offer, setOffer] = useState<NoteDraft | null>(() => read(id));
  /** Браузер может отказать в записи (приватный режим, переполненная квота). Молчать об этом
   * нельзя: человек считает, что текст под защитой, а его там нет. */
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<NoteDraft | null>(null);

  useEffect(() => {
    setOffer(read(id));
    setBlocked(false);
  }, [id]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const draft = pending.current;
    pending.current = null;
    if (!id || !draft) return;
    try {
      localStorage.setItem(keyOf(id), JSON.stringify(draft));
      setBlocked(false);
    } catch {
      setBlocked(true);
    }
  }, [id]);

  /** Пишет по мере набора, но не на каждую букву: 512 КиБ в localStorage на каждый keydown —
   * это заметная задержка ввода на длинной заметке. */
  const write = useCallback(
    (content: string, base: string) => {
      pending.current = { content, base, at: Date.now() };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500);
    },
    [flush],
  );

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    if (!id) return;
    try {
      localStorage.removeItem(keyOf(id));
    } catch {
      /* нечего чистить — и это не повод ронять экран */
    }
  }, [id]);

  /** Предложение снимается, когда на него ответили; сам черновик при этом живёт. */
  const dismissOffer = useCallback(() => setOffer(null), []);

  // Уход со страницы и закрытие вкладки — ровно те два случая, ради которых черновик и заведён;
  // отложенная на 500 мс запись обязана успеть в обоих.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  // Тождество объекта держится стабильным намеренно: экран кладёт его в зависимости эффекта,
  // который пишет черновик, и новый объект на каждый рендер гонял бы запись по кругу — а «не
  // грязно» означало бы `removeItem` из localStorage на каждый рендер.
  return useMemo(
    () => ({ offer, dismissOffer, write, clear, blocked }),
    [blocked, clear, dismissOffer, offer, write],
  );
}
