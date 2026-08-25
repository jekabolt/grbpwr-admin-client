import { MarkdownView } from 'components/managers/files/note/markdown-view';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import type { TaskMedia } from '../api/types';
import { TaskText, type MediaRef } from './task-text';

/**
 * ОПИСАНИЕ ЗАДАЧИ — ТОТ ЖЕ МАРКДАУН, ЧТО В ЗАМЕТКАХ БИБЛИОТЕКИ.
 *
 * Разметчик берётся ГОТОВЫЙ (`files/note/markdown-view`), а не пишется похожий: два разметчика на
 * один язык разойдутся на первой же правке, и «маркдаун» стал бы значить разное на двух экранах
 * одной админки. Он же приносит с собой всё, что уже умеет: заголовки, списки, цитаты, огороженный
 * код, ссылки на файлы библиотеки `/files/{id}` и картинки с просмотрщиком.
 *
 * ── ШОВ СО ССЫЛКАМИ НА ВЛОЖЕНИЯ ─────────────────────────────────────────────────────────────
 *
 * У задачи в том же тексте живёт СВОЙ токен — `[[media:12]]`, ссылка на вложение карточки по id.
 * Разметчику заметок он неизвестен: `[[…]]` не подходит ни под одну его конструкцию, и он
 * напечатал бы его сырыми скобками — то есть ровно тем, что выглядит как поломка.
 *
 * Дописать поддержку токена внутрь разметчика нельзя: он чужой (раздел файлов), и правка там
 * означала бы, что раздел задач диктует форму чужому экрану.
 *
 * Поэтому шов проходит ПО СТРОКАМ: строка, в которой есть токен вложения, рисуется прежним
 * `TaskText` (чипы + текст), всё остальное идёт разметчику целыми кусками. Цена названа честно —
 * на строке с чипом не работает markdown-разметка (жирный, пункт списка), потому что эта строка
 * до разметчика не доходит. Обмен выбран сознательно: ссылка на вложение — это почти всегда
 * короткий указатель («см. ▣ 2»), а не абзац с оформлением, тогда как обратный обмен (отдать
 * строку разметчику) показал бы сырые скобки вместо живого чипа.
 *
 * ЕСЛИ ТОКЕНОВ НЕТ ВОВСЕ — а это подавляющее большинство описаний, — текст НЕ РЕЖЕТСЯ вообще и
 * уходит разметчику одним куском. Значит огороженный блок кода, растянутый на десяток строк,
 * ничем не рискует: разрезать его может только соседство с токеном вложения внутри самой ограды.
 */

/** Есть ли в строке ссылка на вложение. Тот же источник формы, что у `parseTaskText`. */
const MEDIA_REF_LINE = /\[\[media:\d+(?:#\d+)?\]\]/;

export type DescriptionSegment = { kind: 'md'; text: string } | { kind: 'refs'; text: string };

/**
 * Режет описание на куски. ЧИСТАЯ ФУНКЦИЯ, потому что это и есть всё решение: где проходит шов,
 * можно проверить без браузера.
 *
 * Пустой текст даёт пустой список — рисовать нечего, и «нет описания» решает вызывающий.
 */
export function splitDescription(text: string): DescriptionSegment[] {
  if (!text) return [];
  if (!MEDIA_REF_LINE.test(text)) return [{ kind: 'md', text }];

  const out: DescriptionSegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) {
      out.push({ kind: 'md', text: buffer.join('\n') });
      buffer = [];
    }
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (MEDIA_REF_LINE.test(line)) {
      flush();
      out.push({ kind: 'refs', text: line });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out;
}

export function TaskDescriptionView({
  text,
  media,
  onOpen,
  className,
}: {
  text: string;
  /** Вложения ЭТОЙ карточки в их порядке — из него берётся номер в чипе. */
  media: TaskMedia[];
  onOpen?: (ref: MediaRef) => void;
  className?: string;
}) {
  const segments = useMemo(() => splitDescription(text), [text]);

  return (
    <div className={cn('flex flex-col', className)}>
      {segments.map((s, i) =>
        s.kind === 'md' ? (
          <MarkdownView key={i} source={s.text} />
        ) : (
          <TaskText key={i} text={s.text} media={media} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}
