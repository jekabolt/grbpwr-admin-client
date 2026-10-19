import { common_EmailCampaignInsert } from 'api/proto-http/admin';
import { LANGUAGES } from 'constants/constants';
import { errorText, isRefused, reasonOf } from 'components/managers/accounting/utils/feedback';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { CalloutBox, ConfirmationModal, Input, Select, Text } from 'ui';
import { useTestSend } from './useCampaign';

interface TestSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Builds the current draft (mapped EmailCampaignInsert) at send time. */
  buildDraft: () => common_EmailCampaignInsert;
  /** Saved campaign id, if any (sent alongside the draft). */
  campaignId?: number;
  /** Sent: the door that opened the modal shows the receipt. */
  onSent?: () => void;
}

/**
 * Recipient-email entry + language select -> SendTestEmail. The backend enforces
 * the recipient allowlist; the UI just collects addresses and the language/variant.
 */
export function TestSendModal({
  open,
  onOpenChange,
  buildDraft,
  campaignId,
  onSent,
}: TestSendModalProps) {
  const [emails, setEmails] = useState('');
  // The server's refusal (the allowlist, a bad address) stands in the modal until the next edit.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [languageId, setLanguageId] = useState<number>(LANGUAGES[0].id);
  const testSend = useTestSend();

  const toEmails = emails
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o) setRefusal(null);
        onOpenChange(o);
      }}
      title='send a test email'
      confirmLabel='send test'
      cancelLabel='cancel'
      confirmDisabled={toEmails.length === 0 || testSend.isPending}
      closeOnConfirm={false}
      onConfirm={() =>
        // SendTestEmailRequest.source is a proto oneof(draft, campaign_id): send ONLY the current
        // draft (mirrors the preview) — passing campaignId too sets the oneof twice and the backend
        // rejects it ("oneof source is already set").
        {
          setRefusal(null);
          testSend.mutate(
            { draft: buildDraft(), languageId, variantId: 0, toEmails },
            {
              onSuccess: () => {
                onOpenChange(false);
                onSent?.();
              },
              onError: (e) => {
                const said = errorText(e, 'unknown error') ?? '';
                if (isRefused(e)) {
                  setRefusal(said);
                  return;
                }
                notify({
                  sev: 'error',
                  subject: campaignId ? `CAMPAIGN ${campaignId}` : 'TEST EMAIL',
                  text: 'not sent',
                  bad: reasonOf(e),
                  detail: said,
                });
              },
            },
          );
        }
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
          <div className='border-b border-borderColor'>
            <Input
              value={emails}
              aria-invalid={refusal !== null || undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setRefusal(null);
                setEmails(e.target.value);
              }}
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
        {refusal && <CalloutBox tone='error'>{refusal}</CalloutBox>}
      </div>
    </ConfirmationModal>
  );
}
