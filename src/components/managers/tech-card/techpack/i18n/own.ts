// Свой текст карточки (названия операций, деталей, заметки, материалы) переводится не словарём,
// а моделью — на язык, выбранный для печати. Этот модуль — единственная точка, через которую
// такой текст попадает на лист.
//
// Почему модульное состояние, а не контекст: own() зовут и чистые derive-функции, у которых нет
// React. Печать рисует ровно один документ, а его язык выставляет хук печати перед отрисовкой.
// Каждая строка, прошедшая через own() на чужом языке, запоминается — хук после отрисовки
// отправляет непереведённые в /api/translate и перемонтирует документ, когда ответ пришёл.
// На английском own() возвращает текст как есть и ничего не запоминает: английский лист
// остаётся байт в байт прежним.

type OwnState = { lang: string; table: Map<string, string>; seen: Set<string> };

let active: OwnState = { lang: 'en', table: new Map(), seen: new Set() };
let notify: (() => void) | null = null;
let notifyQueued = false;

// Строка без единой буквы — цифры, размеры, «—» — переводить нечего.
const HAS_LETTER = /\p{L}/u;

/** Card-authored copy: translated when a non-English PDF language is active, verbatim otherwise. */
export const own = (text: string | undefined | null): string => {
  const s = text ?? '';
  if (active.lang === 'en' || !HAS_LETTER.test(s)) return s;
  const hit = active.table.get(s);
  if (hit !== undefined) return hit;
  if (!active.seen.has(s)) {
    active.seen.add(s);
    // Отрисовка не место для setState: хук узнаёт о новой строке уже после неё.
    if (notify && !notifyQueued) {
      notifyQueued = true;
      setTimeout(() => {
        notifyQueued = false;
        notify?.();
      }, 0);
    }
  }
  return s;
};

export function setOwnState(next: OwnState) {
  active = next;
}

export function onOwnSeen(cb: (() => void) | null) {
  notify = cb;
}
