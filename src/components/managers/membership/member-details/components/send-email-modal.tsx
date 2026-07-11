import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useSendMemberEmail } from '../../utils/hooks';

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
}

export function SendEmailModal({ open, onOpenChange, userId }: SendEmailModalProps) {
  const sendEmail = useSendMemberEmail();
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  const canSend = heading.trim().length > 0 && body.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    sendEmail.mutate(
      { userId, heading, body, ctaLabel: ctaLabel || undefined, ctaUrl: ctaUrl || undefined },
      {
        onSuccess: () => {
          setHeading('');
          setBody('');
          setCtaLabel('');
          setCtaUrl('');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex h-auto -translate-y-1/2 flex-col gap-3 border border-textInactiveColor bg-bgColor p-4 text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2'>
          <DialogPrimitives.Title asChild>
            <Text variant='uppercase' size='large'>
              Send custom email
            </Text>
          </DialogPrimitives.Title>
          <DialogPrimitives.Description className='sr-only'>
            Send a custom email to this member
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Heading *
            </Text>
            <Input
              name='heading'
              type='text'
              value={heading}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeading(e.target.value)}
            />
          </div>

          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Body *
            </Text>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className='w-full resize-none border border-textInactiveColor bg-bgColor p-2 text-textBaseSize focus:outline-none'
            />
          </div>

          <div className='flex gap-3'>
            <div className='flex flex-col gap-1 flex-1'>
              <Text variant='inactive' size='small'>
                CTA label
              </Text>
              <Input
                name='ctaLabel'
                type='text'
                value={ctaLabel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCtaLabel(e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-1 flex-1'>
              <Text variant='inactive' size='small'>
                CTA url
              </Text>
              <Input
                name='ctaUrl'
                type='text'
                value={ctaUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCtaUrl(e.target.value)}
              />
            </div>
          </div>

          <div className='mt-2 flex justify-end gap-2'>
            <Button
              variant='main'
              size='lg'
              onClick={handleSend}
              disabled={!canSend}
              loading={sendEmail.isPending}
            >
              send
            </Button>
            <Button variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
