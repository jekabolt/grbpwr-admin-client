import { Button, Loader, Section, Textarea } from 'ui';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { draftFittingEdits } from './draft-api';
import { FittingFormData } from './schema';
import { useFittingWorkspace } from './workspace';

const SAVE_WORD = { idle: '', saving: 'saving', saved: 'saved', error: 'not saved' } as const;

// Note block: the fitting comment (autosaved by the shell) + «Draft edits».
export function FittingNote() {
  const ws = useFittingWorkspace();
  const { watch, setValue } = useFormContext<FittingFormData>();
  const comment = watch('comment') ?? '';
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState('');

  const draft = async () => {
    setBusy(true);
    setState('');
    try {
      ws.saveNow();
      const edits = await draftFittingEdits(ws.fittingId, comment);
      ws.setDrafts(edits);
      setState(edits.length ? `${edits.length} drafts` : 'nothing to draft');
    } catch {
      setState('not drafted');
      notify({ sev: 'error', subject: 'DRAFT EDITS', text: 'not drafted' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title='Note' question={touched ? SAVE_WORD[ws.saveState] : undefined}>
      <Textarea
        name='comment'
        aria-label='fitting note'
        placeholder='fitting note'
        className='min-h-24 w-full'
        disabled={ws.readOnly}
        value={comment}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          setTouched(true);
          setValue('comment', e.target.value, { shouldDirty: true });
        }}
      />
      <div className='mt-2 flex items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={busy || ws.readOnly || !comment.trim()}
          onClick={draft}
        >
          Draft edits
        </Button>
        {busy ? (
          <Loader />
        ) : (
          <span className={state === 'not drafted' ? 'text-error' : 'text-labelColor'}>
            {state}
          </span>
        )}
      </div>
    </Section>
  );
}
