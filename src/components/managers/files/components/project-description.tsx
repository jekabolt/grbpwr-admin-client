import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { invalidateFileViews } from '../hooks/useFiles';

/**
 * ОПИСАНИЕ ПРОЕКТА — ПЕРВЫЙ АБЗАЦ ЕГО СТРАНИЦЫ.
 *
 * Колонка `description` есть у ЛЮБОЙ темы с 0312, и клиент шлёт её и при создании, и при
 * переименовании. Здесь решается не «завести ли поле», а где оно стоит и что делает пустое.
 *
 * ПУСТОЕ У ПРОЕКТА — ТИХАЯ СТРОКА, У ЯРЛЫКА — НИЧЕГО, и разница не в поле, а в том, есть ли у
 * темы страница. У проекта она есть, и описание — её первый абзац: место под него существует
 * всегда, поэтому пустое место называется. У ярлыка страницы нет, описание там необязательная
 * справка, и рамка «добавьте описание» на каждом экране была бы шумом. Поэтому компонент
 * монтируется ТОЛЬКО в режиме проекта — «у plain-темы ничего» это не ветка внутри, а отсутствие
 * вызова.
 */

/**
 * СВЁРНУТОЕ ОПИСАНИЕ ЛЬЁТСЯ ОДНИМ ПОТОКОМ, а не сохраняет абзацы, и это замерено, а не вкус:
 * `white-space: pre-line` вместе с обрезкой по трём НАРИСОВАННЫМ строкам считает третьей
 * строкой пустую строку между абзацами — и многоточие уезжает на неё в одиночестве, обещая
 * продолжение там, где его не видно. Развёрнутый текст абзацы возвращает: там они и нужны.
 */
export function descFlow(d: string): string {
  return d.replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Длиннее этого — сворачивается. Число, а не «сколько влезло»: измерять высоту после отрисовки
 * значило бы моргать кнопкой «read the whole brief» на каждой смене ширины окна.
 */
const CLAMP_OVER = 200;

export function ProjectDescription({
  project,
  writable,
}: {
  project: FileTopic;
  /** Уже с учётом и права files:write, и тумблера режима. */
  writable: boolean;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const id = Number(project.id ?? 0);
  const saved = (project.description ?? '').trim();

  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(saved);

  // Переход на другой проект закрывает правку: черновик принадлежит ТОМУ проекту, и оставить
  // его открытым здесь значило бы предложить сохранить чужой текст под этим именем.
  useEffect(() => {
    setEditing(false);
    setOpen(false);
    setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * ИМЯ НЕ ТРОГАЕМ. Контракт `RenameFileTopic` принимает имя и описание ВМЕСТЕ и замещает оба:
   * послать сюда пустое имя значило бы стереть имя проекта правкой описания. Имя берётся из
   * того же объекта, которым нарисована шапка.
   */
  const save = useMutation({
    mutationFn: (text: string) => topicsService.rename(id, project.name ?? '', text),
    onSuccess: () => {
      invalidateFileViews(qc);
      setEditing(false);
      showMessage('the description is saved', 'success');
    },
    onError: (e: unknown) => showMessage(failureText(e, "couldn't save the description"), 'error'),
  });

  if (editing) {
    return (
      <div className='flex flex-col gap-1'>
        <textarea
          rows={7}
          value={draft}
          aria-label='project description'
          placeholder='what is being shot, for whom, and what lands in here'
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          className='w-full max-w-[80ch] border border-borderColor bg-bgColor px-2 py-1.5 text-micro'
        />
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='xs'
            variant='secondary'
            disabled={save.isPending}
            onClick={() => save.mutate(draft.trim())}
          >
            {save.isPending ? 'saving…' : 'save the description'}
          </Button>
          <Button
            size='xs'
            variant='underline'
            onClick={() => {
              setDraft(saved);
              setEditing(false);
            }}
          >
            cancel
          </Button>
          <Text size='micro' variant='label' component='span'>
            no length limit — a whole shooting brief goes in
          </Text>
        </div>
      </div>
    );
  }

  if (!saved) {
    return (
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='xs' variant='underline' disabled={!writable} onClick={() => setEditing(true)}>
          + add a description
        </Button>
        <Text size='micro' variant='label' component='span'>
          a project has a page for this to be the first paragraph of — an ordinary label has none,
          and stays silent
        </Text>
      </div>
    );
  }

  const long = saved.length > CLAMP_OVER;
  return (
    <div className='flex flex-col gap-1'>
      {/* СВЁРНУТОЕ — ПОТОКОМ И БЕЗ `pre-line`, развёрнутое — с абзацами. Пара «pre-line +
          обрезка по трём строкам» считает пустую строку между абзацами третьей строкой, и
          многоточие уезжает на неё; довод целиком — у `descFlow`. */}
      <Text
        size='micro'
        className={`max-w-[80ch] ${long && !open ? 'line-clamp-3' : 'whitespace-pre-line'}`}
      >
        {long && !open ? descFlow(saved) : saved}
      </Text>
      <div className='flex flex-wrap items-center gap-2.5'>
        {long && (
          <Button
            size='xs'
            variant='underline'
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'collapse the brief' : 'read the whole brief'}
          </Button>
        )}
        <Button size='xs' variant='underline' disabled={!writable} onClick={() => setEditing(true)}>
          edit the description
        </Button>
      </div>
    </div>
  );
}
