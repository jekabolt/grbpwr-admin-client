import { zodResolver } from '@hookform/resolvers/zod';
import { AcctAccount } from 'api/proto-http/admin';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { CalloutBox, ConfirmationModal, Text, Form, InputField, SelectField } from 'ui';
import { applyServerFieldErrors } from 'utils/field-errors';
import { errorText, isRefused, reasonOf } from '../../utils/feedback';
import { ACCT_SECTIONS, ACCT_STATEMENTS, AcctSection, AcctStatement } from '../../utils/constants';
import { useCreateAccount, useUpdateAccountName } from '../../utils/hooks';
import { accountSchema, AccountSchema } from './schema';

type Props = {
  // rename mode when an account is supplied (its code/section/statement are immutable), create
  // mode otherwise. Kept as one "upsert" modal so the field layout and validation live in a
  // single place.
  account?: AcctAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SECTION_ITEMS = ACCT_SECTIONS.map((s) => ({ label: s, value: s }));
const STATEMENT_ITEMS = ACCT_STATEMENTS.map((s) => ({ label: s, value: s }));

export function UpsertAccountModal({ account, open, onOpenChange }: Props) {
  const isRename = !!account;
  // A refusal no field took stands over the form until the next attempt.
  const [refusal, setRefusal] = useState<string | null>(null);
  const createAccount = useCreateAccount();
  const updateName = useUpdateAccountName();

  const defaults = useMemo<AccountSchema>(
    () => ({
      code: account?.code ?? '',
      name: account?.name ?? '',
      section: (account?.section as AcctSection) ?? 'asset',
      statement: (account?.statement as AcctStatement) ?? 'BS',
    }),
    [account],
  );

  const form = useForm<AccountSchema>({
    resolver: zodResolver(accountSchema),
    defaultValues: defaults,
  });

  // Reset when (re)opening or when the rename target changes, mirroring upsert-shipping.tsx.
  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setRefusal(null);
    }
  }, [open, defaults, form]);

  const pending = createAccount.isPending || updateName.isPending;

  // A refusal of what was typed stays in the modal; a lost request is news.
  const fail = (e: unknown, subject: string, text: string, allowed: string[]) => {
    const { applied, unmapped } = applyServerFieldErrors(e, form.setError, {
      allow: (p) => allowed.includes(p),
    });
    const said = errorText(e, `failed: ${text}`) ?? '';
    if (isRefused(e)) {
      if (applied.length === 0 || unmapped.length > 0) setRefusal(said);
      return;
    }
    notify({ sev: 'error', subject, text, bad: reasonOf(e), detail: said });
  };

  // No receipts: the list shows the new name or the new account.
  const onSubmit: SubmitHandler<AccountSchema> = (data) => {
    setRefusal(null);
    if (isRename) {
      updateName.mutate(
        { code: data.code, name: data.name },
        {
          onSuccess: () => onOpenChange(false),
          onError: (e) => fail(e, `ACCOUNT ${data.code}`, 'not renamed', ['name']),
        },
      );
      return;
    }
    createAccount.mutate(
      { code: data.code, name: data.name, section: data.section, statement: data.statement },
      {
        onSuccess: () => onOpenChange(false),
        onError: (e) =>
          fail(e, `ACCOUNT ${data.code}`, 'not created', ['code', 'name', 'section', 'statement']),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={form.handleSubmit(onSubmit)}
      closeOnConfirm={false}
      title={isRename ? `Rename ${account?.code}` : 'New account'}
      confirmLabel={pending ? 'saving…' : isRename ? 'save' : 'create'}
      confirmDisabled={pending}
    >
      <div className='min-w-[min(90vw,22rem)]'>
        <Form {...form}>
          <div className='flex flex-col gap-4'>
            {isRename ? (
              <div className='flex flex-col gap-1'>
                <Text variant='inactive' size='small'>
                  code
                </Text>
                <Text className='tabular-nums'>{account?.code}</Text>
              </div>
            ) : (
              <InputField
                name='code'
                label='code'
                placeholder='4-digit code'
                inputMode='numeric'
                maxLength={4}
                keyboardRestriction={/[0-9]/}
              />
            )}
            <InputField name='name' label='name' placeholder='account name' autoFocus={isRename} />
            {!isRename && (
              <>
                <SelectField name='section' label='section' items={SECTION_ITEMS} />
                <SelectField name='statement' label='statement' items={STATEMENT_ITEMS} />
              </>
            )}
            {refusal && <CalloutBox tone='error'>{refusal}</CalloutBox>}
          </div>
        </Form>
      </div>
    </ConfirmationModal>
  );
}
