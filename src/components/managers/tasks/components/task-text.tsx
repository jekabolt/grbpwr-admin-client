import { cn } from 'lib/utility';
import { Fragment, useMemo } from 'react';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';
import type { TaskMedia } from '../api/types';

/**
 * ССЫЛКА НА ВЛОЖЕНИЕ ЖИВЁТ В САМОМ ТЕКСТЕ.
 *
 * «На второй фотографии сверху» — это не ссылка, а описание пути к ней, и оно ломается от любой
 * перестановки. Токен адресует медиа ПО ID, а не по месту в списке: вложения можно менять местами
 * (стрелки в `media-attachments.tsx` для того и стоят), и позиционная ссылка сдвинула бы смысл
 * всех ссылок разом и молча.
 *
 * Хранение при этом не меняется: описание и тело комментария остаются одной строкой, токен — часть
 * этой строки. Ни нового поля на сервере, ни разметки в базе.
 *
 * ЧИТАЕМАЯ ФОРМА ЧИПА — ПОЗИЦИЯ, а не id: `▣ 2` значит «второе вложение ЭТОЙ карточки». Id в чипе
 * не показывается — он ничего не говорит глазу и не находится взглядом в ряду миниатюр.
 */

/**
 * `[[media:1234]]` и `[[media:1234#2]]` — второе с номером выноски на этом снимке.
 *
 * Форма с выноской понимается УЖЕ СЕЙЧАС, хотя самих выносок на вложениях ещё нет: разбор текста
 * и постановка указаний — разные половины работы, и текст, набранный после второй, обязан
 * читаться первой, а не показываться сырыми скобками.
 *
 * Источник, а не готовая регулярка: с флагом `g` у объекта есть `lastIndex`, и одна модульная
 * копия на все вызовы разбора отдавала бы разный результат в зависимости от того, кто разбирал
 * текст до неё.
 */
const MEDIA_REF_SOURCE = String.raw`\[\[media:(\d+)(?:#(\d+))?\]\]`;

export interface MediaRef {
  mediaId: number;
  /** Номер выноски на этом снимке; `undefined` — ссылка на кадр целиком. */
  note?: number;
}

export type TaskTextPart = { text: string; ref?: undefined } | { text?: undefined; ref: MediaRef };

/** Единственное место, где токен собирается. Разбирает его `parseTaskText`. */
export function mediaRefToken(mediaId: number, note?: number): string {
  return note ? `[[media:${mediaId}#${note}]]` : `[[media:${mediaId}]]`;
}

/** Режет строку на куски текста и ссылки, сохраняя порядок и все пробелы между ними. */
export function parseTaskText(text: string): TaskTextPart[] {
  const re = new RegExp(MEDIA_REF_SOURCE, 'g');
  const parts: TaskTextPart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ ref: { mediaId: Number(m[1]), note: m[2] ? Number(m[2]) : undefined } });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * МЁРТВАЯ ССЫЛКА НАЗЫВАЕТСЯ СЛОВОМ.
 *
 * Вложение открепили от карточки (или удалили вовсе) — ссылка на него осталась в тексте, потому
 * что текст никто не переписывал. Спрятать её значило бы стереть предложение из описания задним
 * числом: читатель не узнает, что здесь вообще что-то показывали, и будет искать смысл в
 * оставшемся куске фразы. Поэтому чип остаётся на месте, красный (в системе красный = сломано),
 * говорит словами, чем он стал, и не кликается.
 */
function MediaRefChip({
  refr,
  media,
  onOpen,
}: {
  refr: MediaRef;
  media: TaskMedia[];
  onOpen?: (ref: MediaRef) => void;
}) {
  const index = media.findIndex((m) => m.id === refr.mediaId);

  if (index < 0) {
    return (
      <Chip tone='error' title={`media #${refr.mediaId} is not attached to this task anymore`}>
        ▣ attachment removed
      </Chip>
    );
  }

  const label = `▣ ${index + 1}${refr.note ? ` · note ${refr.note}` : ''}`;
  return (
    <Chip
      title={`open attachment ${index + 1}`}
      onClick={onOpen ? () => onOpen(refr) : undefined}
      className='cursor-pointer align-baseline'
    >
      {label}
    </Chip>
  );
}

/**
 * Описание задачи и тело комментария рисуются ОДНИМ компонентом: это один и тот же текст с одними
 * и теми же ссылками, и разойтись они могут только в сторону «в комментарии скобки, а в описании
 * чип».
 *
 * Переносы строк остаются переносами (`whitespace-pre-wrap`), разметки нет и не заводится —
 * `dangerouslySetInnerHTML` здесь означал бы, что любой, кто может написать комментарий, может
 * выполнить свой скрипт в чужой админке.
 */
export function TaskText({
  text,
  media,
  onOpen,
  className,
}: {
  text: string;
  /** Вложения ЭТОЙ карточки в их порядке — из него берётся номер в чипе. */
  media: TaskMedia[];
  /** Открыть вложение. Не задан — чипы рисуются, но не кликаются. */
  onOpen?: (ref: MediaRef) => void;
  className?: string;
}) {
  const parts = useMemo(() => parseTaskText(text), [text]);

  return (
    <Text
      size='micro'
      component='span'
      className={cn('whitespace-pre-wrap break-words', className)}
    >
      {parts.map((p, i) =>
        p.ref ? (
          <MediaRefChip key={i} refr={p.ref} media={media} onOpen={onOpen} />
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </Text>
  );
}
