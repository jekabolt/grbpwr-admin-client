import type { RefObject } from 'react';
import Text from 'ui/components/text';
import type { TaskMedia } from '../api/types';
import { mediaRefToken } from './task-text';

/**
 * РЯД МИНИАТЮР ПОД ПОЛЕМ — единственный способ поставить ссылку, не зная её синтаксиса. Набирать
 * `[[media:1234]]` руками некому: id вложения нигде на экране не написан, а если бы и был, человек
 * не обязан помнить формат.
 *
 * ВСТАВКА ИДЁТ В КАРЕТКУ, А НЕ В КОНЕЦ. Ссылку ставят посреди фразы («шов вот здесь ▣ 2 идёт
 * криво»), и приписанная к концу текста она означала бы ровно то, чего мы избегаем: «смотри
 * где-то там».
 *
 * НЕТ ВЛОЖЕНИЙ — НЕТ РЯДА. Пустая заглушка «приложите сначала снимок» здесь была бы подсказкой
 * ради подсказки: вставлять нечего, и место под полем ввода дороже.
 */
export function MediaRefRow({
  media,
  targetRef,
  value,
  onChange,
  label = 'link to attachment',
}: {
  /** Вложения карточки в их порядке: номер на плитке = номер в чипе. */
  media: TaskMedia[];
  targetRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  if (media.length === 0) return null;

  function insert(mediaId: number) {
    const el = targetRef.current;
    // Поле могло не получить фокуса ни разу — тогда каретки нет, и единственное осмысленное
    // место это конец текста.
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    // Пробелы вокруг токена: без них чип слипается с соседним словом в одну кашу. Лишний пробел
    // не ставится, если он уже есть — иначе десяток вставок подряд разъезжается лесенкой.
    const lead = before && !/\s$/.test(before) ? ' ' : '';
    const trail = /^\s/.test(after) ? '' : ' ';
    const chunk = `${lead}${mediaRefToken(mediaId)}${trail}`;
    onChange(before + chunk + after);

    // КАРЕТКА ВОЗВРАЩАЕТСЯ ЗА ТОКЕН, а фокус — в поле: вставка это часть набора текста, и после
    // неё человек продолжает печатать, а не ищет мышью, куда он писал. Кадром позже, потому что
    // до перерисовки в поле лежит ещё старая строка и ставить в неё позицию не по чему.
    const caret = before.length + chunk.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className='flex flex-wrap items-center gap-1'>
      <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
        {label}
      </Text>
      {media.map((m, i) => (
        <button
          key={m.id}
          type='button'
          title={`insert a link to attachment ${i + 1}`}
          aria-label={`insert a link to attachment ${i + 1}`}
          onClick={() => insert(m.id)}
          className='relative size-8 shrink-0 border border-borderColor bg-bgColor hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          {m.thumbnail ? (
            <img src={m.thumbnail} alt='' className='size-full object-cover' />
          ) : (
            <span className='flex size-full items-center justify-center text-nano leading-none text-labelColor'>
              #{m.id}
            </span>
          )}
          {/* Номер на плитке — то же число, что встанет в чипе. Без него связь «эта картинка →
              вот этот ▣ 3» пришлось бы восстанавливать счётом слева направо. */}
          <span className='absolute bottom-0 right-0 bg-textColor px-0.5 text-nano leading-none text-bgColor'>
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
