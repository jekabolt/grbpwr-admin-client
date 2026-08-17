import { useEffect, useMemo, useState } from 'react';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
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
    setDraft(next);
    save.mutate(
      { username, specialties: next },
      // Отказ ОТКАТЫВАЕТ чипы к тому, что лежит на сервере: оставить их в «сохранённом» виде
      // после отказа — это тихо соврать про состояние аккаунта. Слова об отказе показывает
      // сам мутатор.
      { onError: () => setDraft(stored) },
    );
  };

  const toggle = (name: string) =>
    apply(has(name) ? mine.filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...mine, name]);

  const commitTyped = () => {
    const v = typed.trim();
    setTyped('');
    setAdding(false);
    if (!v || has(v)) return;
    apply([...mine, v]);
  };

  if (!editable) {
    return mine.length ? (
      <ChipRow>
        {mine.map((s) => (
          <Chip key={s} selected>
            {s}
          </Chip>
        ))}
      </ChipRow>
    ) : (
      <Text size='micro' variant='label'>
        —
      </Text>
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
              name='newSpecialty'
              value={typed}
              autoFocus
              placeholder='своя специальность'
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
              // Набранное, но не «заэнтеренное» слово — тоже выбор: уходя из поля, человек
              // считает, что он его уже назвал.
              onBlur={commitTyped}
            />
          </span>
        ) : (
          <Chip dashed disabled={busy} onClick={() => setAdding(true)}>
            + добавить специальность
          </Chip>
        )}
      </ChipRow>
      <Text size='micro' variant='label'>
        новая специальность попадает в общий список и станет доступна остальным аккаунтам — так
        словарь растёт сам, но не превращается в свободный текст. прав специальность не даёт:
        по ней вас находят, когда назначают владельца файла или упоминают в обсуждении.
      </Text>
    </div>
  );
}
