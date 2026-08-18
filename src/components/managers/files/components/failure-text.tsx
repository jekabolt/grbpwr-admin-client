import Text from 'ui/components/text';
import { resolveFailure } from '../api/rpc-error';

/**
 * Отказ сервера НА ЭКРАНЕ: русская фраза, а под ней — слова сервера, если разбор их не узнал.
 *
 * Две строки, а не одна, потому что у них разный вес. Верхняя — то, что человек читает и по
 * чему решает, что делать. Нижняя — улика: когда таблица `rpc-error` случая не знает, это
 * единственное, по чему вообще можно понять, что произошло, и прятать её нельзя. Но и ставить
 * английскую строку ВМЕСТО русской нельзя тоже — раздел русский целиком.
 *
 * Компонент РЕНДЕРИТ ФРАГМЕНТ, а не блок: половина мест вызова — это ветка тернарника внутри
 * уже открытого `<Text>`, и обёртка сюда не помещается. Улика уходит на свою строку
 * `display: block`-ом, а не переносом абзаца.
 */
export function FailureText({ e, fallback }: { e: unknown; fallback: string }) {
  const f = resolveFailure(e, fallback);
  if (!f.raw) return <>{f.text}</>;
  return (
    <>
      {f.text}
      <Text size='nano' variant='label' component='span' className='mt-0.5 block break-all'>
        the server answered: {f.raw}
      </Text>
    </>
  );
}
