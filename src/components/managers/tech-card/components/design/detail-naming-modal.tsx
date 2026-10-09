import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

/**
 * ИМЯ НОВОЙ ДЕТАЛИ — спрашивается ДО записи: слот без имени сервер отвергает
 * (`detail_name_required`), а безымянная деталь в промпте читается словом «detail». Открывается из
 * угла плитки доски (`new detail…`) и из вопроса «which detail is this?» (101 Ф3).
 *
 * ПОДТВЕРЖДЕНИЕ НЕДОСТУПНО, ПОКА ИМЯ ПУСТО. Кнопка, которая нажимается и молча ничего не делает,
 * читается как сломанная.
 */
export function DetailNamingModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setName('');
  }
  const ready = name.trim().length > 0;
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      onConfirm={() => ready && onConfirm(name.trim())}
      onCancel={onCancel}
      title='name this detail'
      confirmLabel='add the detail'
      confirmDisabled={!ready}
      width='sm'
    >
      <div className='space-y-1'>
        <label htmlFor='detail-name' className='block'>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            name — the sheet cites it by this
          </Text>
        </label>
        <Input
          name='detail-name'
          id='detail-name'
          value={name}
          maxLength={60}
          autoFocus
          placeholder='collar, patch pocket, cuff…'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
      </div>
    </ConfirmationModal>
  );
}
