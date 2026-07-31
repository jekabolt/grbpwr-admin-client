import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { useAddComment, useTaskComments } from '../hooks/useTasks';

// tskComments v1 (kept) — a flat activity list + composer, now living in the detail's
// right rail. Token cleanup only; each comment leads with the author's Avatar.
export function TaskComments({ taskId }: { taskId: number }) {
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const [body, setBody] = useState('');

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
                <Text size='micro' component='span' className='whitespace-pre-wrap break-words'>
                  {c.body}
                </Text>
              </div>
            </div>
          ))
        )}
      </div>

      <div className='flex flex-col gap-2'>
        <Textarea
          name='newComment'
          variant='secondary'
          placeholder='add a comment…'
          className='mb-0 min-h-16 border border-borderColor'
          value={body}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        />
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
