import { useEffect, useMemo, useState } from 'react';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useSetAccountSpecialties } from '../utils/hooks';

/**
 * «Чем занимается» — чипы специальностей аккаунта.
 *
 * Грамматика ровно та же, что у тем файла, и это не совпадение: список готовых, клик
 * переключает, пунктирный «+ добавить» заводит новую, новая попадает в ОБЩИЙ словарь. Один
 * способ выбирать из справочника на всю админку — чтобы человек, научившийся ставить тему
 * файлу, не учился заново.
 *
 * Несколько специальностей — норма, а не исключение: в команде из шести человек один и тот
 * же человек и снимает, и монтирует.
 *
 * ПОЛЕ НИЧЕГО НЕ РАЗРЕШАЕТ. Специальность не несёт ни грамма прав — она отвечает на вопрос
 * «кто у нас фотограф» в пикере владельцев файла. Поэтому своё правит человек сам, а чужое
 * требует accounts:write, и интерфейс не обещает больше этого.
 */
export function SpecialtiesField({
  username,
  specialties,
  editable,
}: {
  username?: string;
  specialties?: string[];
  /** Своё — всегда, чужое — только с accounts:write. Решает вызывающий. */
  editable: boolean;
}) {
  const { data: adminsData } = useAdmins();
  const save = useSetAccountSpecialties();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');

  const stored = useMemo(() => specialties ?? [], [specialties]);

  // Набор живёт ЛОКАЛЬНО между кликом и ответом сервера, потому что каждая правка — это
  // replace всего набора: без этого второй клик подряд считался бы от ещё не обновившихся
  // пропов и стирал первый. Пришедшее с сервера всегда побеждает — эффект следит за
  // содержимым, а не за ссылкой на массив, иначе он сбрасывал бы правку на каждый рендер.
  const [draft, setDraft] = useState<string[]>(stored);
  const storedKey = stored.join('|');
  useEffect(() => {
    // Пока правка в полёте, серверное ЕЩЁ старое: приняв его, чип на секунду отскочил бы и
    // вернулся. Следующий ответ всё равно принесёт свежий ключ.
    if (save.isPending) return;
    setDraft(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);
  const mine = draft;

  // Словарь целиком, а не только занятое: затравку, которую ещё никто не выбрал, иначе не
  // видно вовсе — и каждый следующий человек пишет свой синоним вместо готового слова.
  // Своё, чего в словаре почему-то нет, дописывается в хвост: чип, которого не видно, нельзя
  // ни оставить, ни снять.
  const vocabulary = useMemo(() => {
    const all = [...(adminsData?.specialties ?? [])];
    mine.forEach((s) => {
      if (!all.some((x) => x.toLowerCase() === s.toLowerCase())) all.push(s);
    });
    return all;
  }, [adminsData, mine]);

  const busy = save.isPending;
  const has = (name: string) => mine.some((x) => x.toLowerCase() === name.toLowerCase());

  const apply = (next: string[]) => {
    if (!username) return;
    const previous = mine;
    setDraft(next);
    save.mutate(
      { username, specialties: next },
      // Отказ откатывает к тому, что было ПЕРЕД ЭТИМ кликом, а не к пропам: пропы отстают на
      // круг, и откат к ним снял бы заодно предыдущую, успешно сохранённую правку.
      { onError: () => setDraft(previous) },
    );
  };

  const toggle = (name: string) =>
    apply(has(name) ? mine.filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...mine, name]);

  /**
   * НАБРАННОЕ СОХРАНЯЕТСЯ ТОЛЬКО ЯВНЫМ ЖЕСТОМ — Enter или «добавить», и никогда по потере
   * фокуса.
   *
   * Словарь специальностей ОБЩИЙ и НЕУДАЛЯЕМЫЙ: RPC удаления записи нет, а снятие её у себя
   * лишь обнуляет счётчик использования. Коммит по blur означал бы, что переключение окна
   * посреди слова навсегда вписывает «ретуш» в справочник, который видят все. Здесь это
   * дороже, чем у тем файла, где недописанное имя правится следующей же правкой.
   */
  const commitTyped = () => {
    const v = typed.trim();
    if (!v || has(v)) {
      setTyped('');
      setAdding(false);
      return;
    }
    setTyped('');
    setAdding(false);
    apply([...mine, v]);
  };

  // В ПОКОЕ ВИДНО ТОЛЬКО ВЫБРАННОЕ. Весь словарь на каждой строке списка аккаунтов — это
  // четырнадцать чипов на человека вместо ответа на вопрос «чем он занимается», ради которого
  // колонка и заводилась. Правка раскрывается по нажатию и там же закрывается.
  if (!editable || !open) {
    return (
      <div className='flex flex-wrap items-center gap-1'>
        {mine.length ? (
          <ChipRow>
            {mine.map((s) => (
              <Chip key={s} selected>
                {s}
              </Chip>
            ))}
          </ChipRow>
        ) : (
          <Text size='micro' variant='label' component='span'>
            —
          </Text>
        )}
        {editable && (
          <Button
            size='xs'
            variant='secondary'
            aria-label={`${mine.length ? 'edit' : 'set'} specialties · ${username ?? ''}`}
            onClick={() => setOpen(true)}
          >
            {mine.length ? 'edit' : 'set'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        {vocabulary.map((s) => (
          <Chip
            key={s}
            selected={has(s)}
            pressed={has(s)}
            disabled={busy}
            onClick={() => toggle(s)}
          >
            {s}
          </Chip>
        ))}
        {adding ? (
          <span className='inline-flex items-center gap-1'>
            <Input
              // Имя (а с ним и id) уникально на аккаунт: в списке аккаунтов таких полей может
              // быть открыто несколько, а два одинаковых id — это подпись, указывающая не на
              // то поле.
              name={`newSpecialty-${username ?? 'me'}`}
              aria-label='new specialty'
              value={typed}
              autoFocus
              placeholder='your own specialty'
              className='h-[22px] w-[170px]'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Escape') {
                  setTyped('');
                  setAdding(false);
                  return;
                }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                commitTyped();
              }}
            />
            {/* Явная кнопка вместо коммита по blur: набранное мышью тоже должно уметь
                сохраниться, а уход фокуса записью быть не может. */}
            <Button size='xs' variant='secondary' disabled={busy} onClick={commitTyped}>
              add
            </Button>
          </span>
        ) : (
          <Chip dashed disabled={busy} onClick={() => setAdding(true)}>
            + add a specialty
          </Chip>
        )}
      </ChipRow>
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='micro' variant='label' component='span' className='max-w-[70ch]'>
          a new specialty joins the shared list and becomes available to the other accounts — that
          way the vocabulary grows by itself without turning into free text. a specialty grants no
          rights: it is how people are found when a file owner is assigned or somebody is mentioned
          in a discussion.
        </Text>
        {/* Отдельной кнопки «сохранить» нет намеренно: каждый клик по чипу уже сохранён,
            «готово» только сворачивает список обратно. */}
        <Button size='xs' variant='secondary' className='ml-auto' onClick={() => setOpen(false)}>
          done
        </Button>
      </div>
    </div>
  );
}
