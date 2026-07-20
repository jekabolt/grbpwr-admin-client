import { zodResolver } from '@hookform/resolvers/zod';
import { AcctAccount } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { applyServerFieldErrors } from 'utils/field-errors';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
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
  const { showMessage } = useSnackBarStore();
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
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const pending = createAccount.isPending || updateName.isPending;

  const onSubmit: SubmitHandler<AccountSchema> = (data) => {
    if (isRename) {
      updateName.mutate(
        { code: data.code, name: data.name },
        {
          onSuccess: () => {
            showMessage('Account updated', 'success');
            onOpenChange(false);
          },
          onError: (e) => {
            applyServerFieldErrors(e, form.setError, { allow: (p) => p === 'name' });
            showMessage(e instanceof Error ? e.message : 'Failed to update account', 'error');
          },
        },
      );
      return;
    }
    createAccount.mutate(
      { code: data.code, name: data.name, section: data.section, statement: data.statement },
      {
        onSuccess: () => {
          showMessage('Account created', 'success');
          onOpenChange(false);
        },
        onError: (e) => {
          applyServerFieldErrors(e, form.setError, {
            allow: (p) => ['code', 'name', 'section', 'statement'].includes(p),
          });
          showMessage(e instanceof Error ? e.message : 'Failed to create account', 'error');
        },
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
          </div>
        </Form>
      </div>
    </ConfirmationModal>
  );
}
