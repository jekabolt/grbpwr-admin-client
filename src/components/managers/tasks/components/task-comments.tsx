import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { useAddComment, useTaskComments } from '../hooks/useTasks';

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
    <div className='flex flex-col gap-3'>
      <Text variant='uppercase' size='small'>
        comments{comments.length ? ` · ${comments.length}` : ''}
      </Text>

      <div className='flex flex-col gap-2'>
        {isLoading ? (
          <Text variant='label' size='small'>
            loading…
          </Text>
        ) : comments.length === 0 ? (
          <Text variant='label' size='small'>
            no comments yet
          </Text>
        ) : (
          comments.map((c) => (
            <div key={c.id} className='flex flex-col gap-0.5 border-b border-textInactiveColor pb-2'>
              <div className='flex items-baseline justify-between gap-2'>
                <Text size='small' className='uppercase'>
                  {c.author}
                </Text>
                <span className='shrink-0 text-[10px] text-labelColor'>
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </span>
              </div>
              <Text size='small' className='whitespace-pre-wrap break-words'>
                {c.body}
              </Text>
            </div>
          ))
        )}
      </div>

      <div className='flex flex-col gap-2'>
        <Textarea
          name='newComment'
          variant='secondary'
          placeholder='add a comment…'
          className='mb-0 min-h-16 border border-textInactiveColor'
          value={body}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        />
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='self-end'
          loading={add.isPending}
          disabled={!body.trim()}
          onClick={submit}
        >
          comment
        </Button>
      </div>
    </div>
  );
}
