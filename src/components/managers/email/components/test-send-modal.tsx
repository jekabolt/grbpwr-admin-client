import { common_EmailCampaignInsert } from 'api/proto-http/admin';
import { LANGUAGES } from 'constants/constants';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { useTestSend } from './useCampaign';

interface TestSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Builds the current draft (mapped EmailCampaignInsert) at send time. */
  buildDraft: () => common_EmailCampaignInsert;
  /** Saved campaign id, if any (sent alongside the draft). */
  campaignId?: number;
}

/**
 * Recipient-email entry + language select -> SendTestEmail. The backend enforces
 * the recipient allowlist; the UI just collects addresses and the language/variant.
 */
export function TestSendModal({ open, onOpenChange, buildDraft, campaignId }: TestSendModalProps) {
  const [emails, setEmails] = useState('');
  const [languageId, setLanguageId] = useState<number>(LANGUAGES[0].id);
  const testSend = useTestSend();

  const toEmails = emails
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      title='send a test email'
      confirmLabel='send test'
      cancelLabel='cancel'
      confirmDisabled={toEmails.length === 0 || testSend.isPending}
      closeOnConfirm={false}
      onConfirm={() =>
        testSend.mutate(
          { draft: buildDraft(), campaignId, languageId, variantId: 0, toEmails },
          { onSuccess: () => onOpenChange(false) },
        )
      }
    >
      <div className='space-y-3'>
        <Text variant='label' size='small'>
          sends the current draft to an allowlisted address (the backend enforces the allowlist).
          separate multiple addresses with commas or spaces.
        </Text>
        <div className='space-y-1'>
          <Text component='label' size='small' variant='label'>
            recipient email(s)
          </Text>
          <div className='border-b border-textInactiveColor'>
            <Input
              value={emails}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmails(e.target.value)}
              placeholder='you@grbpwr.com'
              className='w-full border-none bg-transparent'
            />
          </div>
        </div>
        <div className='space-y-1'>
          <Text component='label' size='small' variant='label'>
            language
          </Text>
          <Select
            name='test-send-language'
            items={LANGUAGES.map((l) => ({ value: l.id, label: l.name }))}
            value={String(languageId)}
            onValueChange={(v: string) => setLanguageId(Number(v))}
          />
        </div>
      </div>
    </ConfirmationModal>
  );
}
