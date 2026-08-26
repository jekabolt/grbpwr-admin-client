import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { formatDistanceToNow } from 'date-fns';
import { useRef, useState } from 'react';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import type { TaskComment, TaskMedia } from '../api/types';
import { useAddComment, useDeleteComment, useTaskComments } from '../hooks/useTasks';
import { MediaRefRow } from './media-ref-row';
import { TaskText, type MediaRef } from './task-text';

// tskComments v1 (kept) — a flat activity list + composer, now living in the detail's
// right rail. Token cleanup only; each comment leads with the author's Avatar.
//
// Тело комментария идёт через тот же `TaskText`, что и описание: «посмотри вот сюда» одинаково
// нужно и в описании, и в обсуждении, а сырые `[[media:…]]` в ленте выглядели бы поломкой.

/**
 * СВОЯ ЛИ ЭТО РЕПЛИКА — ПАРА, А НЕ ОДНО ИМЯ.
 *
 * `UNIQUE` на `admins.username` освобождает имя при удалении аккаунта: новый однофамилец совпал
 * бы по строке со ВСЕЙ перепиской прежнего. Поэтому нужна ещё и ЖИВАЯ ссылка на аккаунт —
 * `authorId > 0`. Ноль значит «спросить некого»: автора этих слов больше нет, и владельцем их
 * не становится никто.
 *
 * Отдельно от `canDeleteComment` потому, что у неё ДВА читателя с разными вопросами: кому
 * показать кнопку и КАК НАЗВАТЬ то, что человек собирается сделать. Супер-администратор кнопку
 * видит везде — но «удалить свою реплику» и «стереть чужие слова» это разные поступки, и
 * подтверждение обязано их различать.
 */
export function isOwnComment(c: TaskComment, currentUser: string | undefined): boolean {
  return !!currentUser && c.authorId > 0 && c.author === currentUser;
}

/**
 * МОЖНО ЛИ ПОКАЗАТЬ КНОПКУ УДАЛЕНИЯ — ЧИСТАЯ ФУНКЦИЯ, чтобы правило проверялось без браузера.
 *
 * ЗЕРКАЛИТ `mayEditTaskComment` (`internal/apisrv/admin/task.go`) ПОРЯДКОМ ВЕТОК: сперва полный
 * доступ, и только потом пара «имя ПРИ живой ссылке».
 *
 *     FullAccess()  →  true
 *     иначе         →  author == caller && author_id IS NOT NULL
 *
 * ЗДЕСЬ БЫЛО НАПИСАНО «это ровно то условие, которое проверяет сервер», И ЭТО БЫЛО НЕПРАВДОЙ:
 * ветки супер-администратора не было вовсе, то есть клиент реализовывал СТРОГОЕ ПОДМНОЖЕСТВО
 * серверного права. Стоило это ровно того, чего такие расхождения стоят всегда: единственным
 * человеком, которому интерфейс молча отказывал в разрешённом, оказался владелец панели — он же
 * единственный супер. Комментарий переписан по факту, а не по замыслу.
 *
 * ЭТО НЕ ЗАЩИТА, и расширение ветки её не ослабляет: право проверяет сервер тем же вторым
 * гейтом, что у комментариев к файлам (`tasks:write` мало — иначе журнал обсуждения стал бы
 * полем формы). Клиент решает ровно одно — не предлагать заведомо невозможного; ошибись он в
 * щедрую сторону, ответом будет отказ сервера, а строка вернётся откатом (`useDeleteComment`).
 */
export function canDeleteComment(
  c: TaskComment,
  currentUser: string | undefined,
  /**
   * Обязательный, а не «по умолчанию false»: у предиката два места вызова, и умолчание значило
   * бы, что забытый аргумент молча возвращает УЗКУЮ политику. Пусть места вызова перечисляет
   * компилятор, а не глаз.
   */
  isSuper: boolean,
): boolean {
  return isSuper || isOwnComment(c, currentUser);
}

export function TaskComments({
  taskId,
  media = [],
  onOpenMedia,
}: {
  taskId: number;
  /** Вложения карточки — из них берутся номера ссылок и ряд для вставки. */
  media?: TaskMedia[];
  onOpenMedia?: (ref: MediaRef) => void;
}) {
  const { account, isSuper } = usePermissions();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const del = useDeleteComment(taskId);
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** Какую реплику собираются стереть; `null` — никакую. Слова стирают с подтверждением. */
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);
  /**
   * СВОЮ И ЧУЖУЮ РЕПЛИКУ НЕЛЬЗЯ СТИРАТЬ ОДНИМ И ТЕМ ЖЕ ЖЕСТОМ. Кнопка выглядит одинаково —
   * значит различать обязано подтверждение, и различать СЛОВАМИ, а не оттенком: «удалить свою»
   * и «стереть слова nina» — разные поступки, и второй нельзя совершить, не заметив.
   */
  const pendingIsMine = !!pendingDelete && isOwnComment(pendingDelete, account?.username);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    try {
      await add.mutateAsync(text);
      setBody('');
    } catch {
      /* snackbar shown by the mutation */
    }
  }

  return (
    <Section title={`comments${comments.length ? ` · ${comments.length}` : ''}`}>
      <div className='flex flex-col gap-2.5'>
        {isLoading ? (
          <Text size='micro' variant='label' component='span'>
            loading…
          </Text>
        ) : comments.length === 0 ? (
          <Text size='micro' variant='label' component='span'>
            no comments yet
          </Text>
        ) : (
          comments.map((c) => (
            <div key={c.id} className='flex gap-2 border-b border-borderColor pb-2 last:border-b-0'>
              <Avatar name={c.author} title={c.author} />
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <div className='flex items-baseline justify-between gap-2'>
                  <Text
                    size='micro'
                    component='span'
                    className='font-bold uppercase tracking-label'
                  >
                    {c.author}
                  </Text>
                  <span className='flex shrink-0 items-baseline gap-1.5'>
                    <Text size='nano' variant='label' component='span'>
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </Text>
                    {canDeleteComment(c, account?.username, isSuper) && (
                      <button
                        type='button'
                        /* Имя РАЗЛИЧИМОЕ: в ленте таких кнопок столько же, сколько реплик, и
                           «delete» без адреса не находится ни читалкой с экрана, ни стендом. */
                        aria-label={`delete comment ${c.id}`}
                        disabled={del.isPending}
                        onClick={() => setPendingDelete(c)}
                        className='text-nano uppercase tracking-label text-labelColor underline hover:text-error disabled:opacity-50'
                      >
                        delete
                      </button>
                    )}
                  </span>
                </div>
                <TaskText text={c.body} media={media} onOpen={onOpenMedia} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className='flex flex-col gap-2'>
        <Textarea
          ref={bodyRef}
          name='newComment'
          variant='secondary'
          placeholder='add a comment…'
          className='mb-0 min-h-16 border border-borderColor'
          value={body}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        />
        <MediaRefRow media={media} targetRef={bodyRef} value={body} onChange={setBody} />
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='self-end'
          loading={add.isPending}
          disabled={!body.trim()}
          onClick={submit}
        >
          comment
        </Button>
      </div>

      {/* ПОДТВЕРЖДЕНИЕ, ПОТОМУ ЧТО ОТМЕНЫ НЕТ. Реплика стирается насовсем: `DeleteTaskComment` не
          мягкий, и вернуть набранное будет нечем. Тот же модал, что у удаления самой карточки. */}
      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) del.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        title={pendingIsMine ? 'delete comment' : 'delete someone else’s comment'}
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro' component='span'>
          {pendingIsMine
            ? 'Delete your comment? This can’t be undone.'
            : `Delete ${pendingDelete?.author || 'this'}’s comment? You are removing someone else’s words. This can’t be undone.`}
        </Text>
      </ConfirmationModal>
    </Section>
  );
}
