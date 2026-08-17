import { formatDistanceToNow } from 'date-fns';
import { useRef, useState } from 'react';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import type { TaskMedia } from '../api/types';
import { useAddComment, useTaskComments } from '../hooks/useTasks';
import { MediaRefRow } from './media-ref-row';
import { TaskText, type MediaRef } from './task-text';

// tskComments v1 (kept) — a flat activity list + composer, now living in the detail's
// right rail. Token cleanup only; each comment leads with the author's Avatar.
//
// Тело комментария идёт через тот же `TaskText`, что и описание: «посмотри вот сюда» одинаково
// нужно и в описании, и в обсуждении, а сырые `[[media:…]]` в ленте выглядели бы поломкой.
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
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
                  <Text size='micro' component='span' className='font-bold uppercase tracking-label'>
                    {c.author}
                  </Text>
                  <Text size='nano' variant='label' component='span' className='shrink-0'>
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </Text>
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
    </Section>
  );
}
