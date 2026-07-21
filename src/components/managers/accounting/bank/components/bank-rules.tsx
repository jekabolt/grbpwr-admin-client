import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import {
  useAcctAccounts,
  useBankRules,
  useCreateBankRule,
  useDeleteBankRule,
} from '../../utils/hooks';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Import-time matching rules (4.1): a case-insensitive substring of a statement line's description
// → the counter-account to pre-suggest when that line imports. Purely advisory — a rule only
// pre-fills the post modal's account, it never posts on its own. Collapsed by default so the inbox
// stays the focus; opened when an operator wants to teach the importer a recurring counterparty.
export function BankRules() {
  const { showMessage } = useSnackBarStore();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useBankRules();
  const { data: accountsData } = useAcctAccounts(false);
  const create = useCreateBankRule();
  const del = useDeleteBankRule();

  const [pattern, setPattern] = useState('');
  const [accountCode, setAccountCode] = useState('');

  const rules = data?.rules ?? [];
  const activeAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => !a.archived),
    [accountsData],
  );

  const addRule = () => {
    const p = pattern.trim();
    if (!p) {
      showMessage('Enter a text pattern to match', 'error');
      return;
    }
    if (!accountCode) {
      showMessage('Pick the account to suggest', 'error');
      return;
    }
    create.mutate(
      { pattern: p, accountCode },
      {
        onSuccess: () => {
          showMessage('Rule added', 'success');
          setPattern('');
          setAccountCode('');
        },
        onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add rule', 'error'),
      },
    );
  };

  const removeRule = (id: number) =>
    del.mutate(
      { id },
      {
        onSuccess: () => showMessage('Rule removed', 'success'),
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to remove rule', 'error'),
      },
    );

  return (
    <div className='flex flex-col gap-3 border border-textInactiveColor p-3'>
      <button
        type='button'
        className='flex w-fit items-center gap-2 text-textBaseSize uppercase underline underline-offset-4 hover:opacity-70'
        onClick={() => setOpen((o) => !o)}
      >
        matching rules ({rules.length})
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className='flex flex-col gap-4'>
          <Text variant='inactive' size='small'>
            a text found in a statement line's description pre-suggests the account when it imports —
            advisory only, it never posts by itself
          </Text>

          {/* Add-rule row. */}
          <div className='flex flex-wrap items-end gap-2'>
            <label className='flex min-w-[200px] flex-1 flex-col gap-1'>
              <Text variant='inactive' size='small'>
                description contains
              </Text>
              <input
                className={cell}
                value={pattern}
                placeholder='e.g. AWS or STRIPE'
                onChange={(e) => setPattern(e.target.value)}
              />
            </label>
            <label className='flex min-w-[200px] flex-1 flex-col gap-1'>
              <Text variant='inactive' size='small'>
                suggest account
              </Text>
              <select
                className={cell}
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
              >
                <option value=''>— pick account —</option>
                {activeAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={create.isPending}
              onClick={addRule}
            >
              {create.isPending ? 'adding…' : 'add rule'}
            </Button>
          </div>

          {/* Existing rules. */}
          {isLoading ? (
            <Text variant='inactive' size='small'>
              loading…
            </Text>
          ) : rules.length === 0 ? (
            <Text variant='inactive' size='small'>
              no rules yet
            </Text>
          ) : (
            <div className='flex flex-col gap-1'>
              {rules.map((r) => (
                <div
                  key={r.id}
                  className='flex items-center justify-between gap-2 border-b border-textInactiveColor py-1.5'
                >
                  <div className='flex min-w-0 flex-wrap items-center gap-x-2'>
                    <Text size='small' className='break-words'>
                      “{r.pattern}”
                    </Text>
                    <Text size='small' variant='inactive'>
                      → {r.accountCode}
                    </Text>
                  </div>
                  <button
                    type='button'
                    className='shrink-0 text-textBaseSize underline underline-offset-2 hover:opacity-70 disabled:opacity-40'
                    disabled={del.isPending}
                    onClick={() => r.id != null && removeRule(r.id)}
                  >
                    [x]
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
