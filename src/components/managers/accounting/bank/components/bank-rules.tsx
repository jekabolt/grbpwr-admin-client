import { notify } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button, CalloutBox, Close, Text } from 'ui';
import { errorText, isRefused, isTransient, reasonOf } from '../../utils/feedback';
import {
  useAcctAccounts,
  useBankRules,
  useCreateBankRule,
  useDeleteBankRule,
} from '../../utils/hooks';

const cell = 'w-full border border-borderColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Import-time matching rules (4.1): a case-insensitive substring of a statement line's description
// → the counter-account to pre-suggest when that line imports. Purely advisory — a rule only
// pre-fills the post modal's account, it never posts on its own. Collapsed by default so the inbox
// stays the focus; opened when an operator wants to teach the importer a recurring counterparty.
// Optionally controlled (open/onOpenChange) so a "no suggestion yet — teach a rule" nudge on an
// inbox card can jump straight here.
export function BankRules({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (o: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof o === 'function' ? o(open) : o;
    if (onOpenChange) onOpenChange(next);
    else setOpenLocal(next);
  };
  const { data, isLoading } = useBankRules();
  const { data: accountsData } = useAcctAccounts(false);
  const create = useCreateBankRule();
  const del = useDeleteBankRule();

  const [pattern, setPattern] = useState('');
  const [accountCode, setAccountCode] = useState('');
  // The add row's error (empty field or the server's refusal), until the next edit or attempt.
  const [addError, setAddError] = useState<{
    text: string;
    field?: 'pattern' | 'account';
  } | null>(null);

  const rules = data?.rules ?? [];
  const activeAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => !a.archived),
    [accountsData],
  );

  const addRule = () => {
    const p = pattern.trim();
    if (!p) {
      setAddError({ text: 'enter a text pattern', field: 'pattern' });
      return;
    }
    if (!accountCode) {
      setAddError({ text: 'pick an account', field: 'account' });
      return;
    }
    setAddError(null);
    create.mutate(
      { pattern: p, accountCode },
      {
        // No receipt: the rule appears in the list below.
        onSuccess: () => {
          setPattern('');
          setAccountCode('');
        },
        onError: (e) => {
          const said = errorText(e, 'failed to add rule') ?? '';
          if (isRefused(e)) {
            setAddError({ text: said });
            return;
          }
          notify({
            sev: 'error',
            subject: `RULE ${p}`,
            text: 'not added',
            bad: reasonOf(e),
            detail: said,
          });
        },
      },
    );
  };

  // No receipt: the row leaves the list.
  const removeRule = (id: number): void =>
    del.mutate(
      { id },
      {
        onError: (e) =>
          notify({
            sev: 'error',
            subject: 'RULE',
            text: 'not removed',
            bad: reasonOf(e),
            detail: errorText(e),
            action: isTransient(e) ? { label: 'retry', onClick: () => removeRule(id) } : undefined,
          }),
      },
    );

  return (
    <div id='bank-rules' className='flex flex-col gap-3 border border-borderColor bg-bgColor p-3'>
      <button
        type='button'
        className='flex w-fit items-center gap-2 text-textBaseSize uppercase underline underline-offset-4 hover:opacity-70'
        onClick={() => setOpen((o) => !o)}
      >
        matching rules ({rules.length})<span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className='flex flex-col gap-4'>
          <Text variant='inactive' size='small'>
            a text found in a statement line's description pre-suggests the account when it imports
            — advisory only, it never posts by itself. rules run AT IMPORT: lines already sitting in
            the inbox keep whatever suggestion they came in with, so a new rule kicks in from the
            next CSV import.
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
                aria-invalid={addError?.field === 'pattern' || undefined}
                onChange={(e) => {
                  setAddError(null);
                  setPattern(e.target.value);
                }}
              />
            </label>
            <label className='flex min-w-[200px] flex-1 flex-col gap-1'>
              <Text variant='inactive' size='small'>
                suggest account
              </Text>
              <select
                className={cell}
                value={accountCode}
                aria-invalid={addError?.field === 'account' || undefined}
                onChange={(e) => {
                  setAddError(null);
                  setAccountCode(e.target.value);
                }}
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
          {addError && <CalloutBox tone='error'>{addError.text}</CalloutBox>}

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
                  className='flex items-center justify-between gap-2 border-b border-borderColor py-1.5'
                >
                  <div className='flex min-w-0 flex-wrap items-center gap-x-2'>
                    <Text size='small' className='break-words'>
                      “{r.pattern}”
                    </Text>
                    <Text size='small' variant='inactive'>
                      → {r.accountCode}
                    </Text>
                  </div>
                  <Close
                    size='sm'
                    aria-label='delete bank rule'
                    disabled={del.isPending}
                    onClick={() => r.id != null && removeRule(r.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
