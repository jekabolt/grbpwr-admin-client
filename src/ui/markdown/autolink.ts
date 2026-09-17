/**
 * ГОЛЫЙ АДРЕС В ТЕКСТЕ — ЭТО ССЫЛКА.
 *
 * Адрес вставляют скопированным из строки браузера, а не оформляют `[текст](адрес)`: так пишут
 * и описание задачи, и заметку, и комментарий. Нарисованный простым текстом, он заставлял
 * выделять его и копировать обратно в строку браузера — то есть ссылкой не был.
 *
 * Два места читают адреса (разметчик `doc.tsx` и простой текст задачи `task-text.tsx`), и
 * правило у них обязано быть одно: иначе один и тот же адрес был бы ссылкой в описании и
 * текстом в комментарии.
 *
 * ТОЛЬКО `http://` и `https://`. Любая другая схема (`javascript:`, `data:`) — исполняемая или
 * подменяющая страницу ссылка, которую может написать любой, кто пишет текст.
 *
 * Две формы: голая `https://…` и в угловых скобках `<https://…>` — вторую ставят, чтобы
 * отделить адрес от соседней пунктуации, и сами скобки к адресу не относятся.
 */
export const AUTOLINK_SOURCE = String.raw`<https?:\/\/[^\s<>]+>|https?:\/\/[^\s<>]+`;

/**
 * КОНЕЦ ФРАЗЫ — НЕ ЧАСТЬ АДРЕСА. «см. https://x.com/a.» — точка закрывает предложение, и
 * ссылка на `a.` вела бы на другую страницу (или на 404). То же с закрывающей скобкой вокруг
 * адреса «(https://x.com/a)», но только непарной: у `…/wiki/Foo_(bar)` скобка своя.
 */
const TRAILING = /[.,:;!?'"*_~]/;

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}

export interface Autolink {
  href: string;
  /**
   * Сколько символов найденного куска заняла ссылка. Остаток (отрезанная пунктуация)
   * возвращается в текст — вызывающий продолжает разбор с этого места.
   */
  length: number;
}

/**
 * Разбирает кусок, найденный по `AUTOLINK_SOURCE`. `null` — адреса в нём нет (например,
 * `https://.` после отрезания точки), и кусок остаётся текстом.
 */
export function readAutolink(token: string): Autolink | null {
  const angled = token.startsWith('<');
  let href = angled ? token.slice(1, -1) : token;

  if (!angled) {
    let end = href.length;
    for (;;) {
      const ch = href[end - 1];
      if (TRAILING.test(ch)) {
        end -= 1;
        continue;
      }
      if (ch === ')' || ch === ']') {
        const head = href.slice(0, end);
        if (count(head, ch) > count(head, ch === ')' ? '(' : '[')) {
          end -= 1;
          continue;
        }
      }
      break;
    }
    href = href.slice(0, end);
  }

  // Без хоста это не адрес, а начало фразы про протокол.
  try {
    if (!new URL(href).hostname) return null;
  } catch {
    return null;
  }
  return { href, length: angled ? token.length : href.length };
}
