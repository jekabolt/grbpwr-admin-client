import { AcctAccount } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { AcctSectionHeader } from '../components/section-header';
import { Callout, Note, StatGrid, StatTile } from '../components/kit';
import { ACCT_SECTIONS, AcctSection } from '../utils/constants';
import { useAcctAccounts, useArchiveAccount } from '../utils/hooks';
import { AccountsTable } from './components/accounts-table';
import { UpsertAccountModal } from './components/upsert-account-modal';

// Plain-language sub-label per section — the approved "Section tiles" variant's vocabulary.
const SECTION_SUBLABEL: Record<AcctSection, string> = {
  asset: 'things we own',
  liability: 'what we owe',
  equity: "owner's stake",
  revenue: 'sales',
  cogs: 'cost of goods',
  opex: 'running costs',
};

// Chart of Accounts screen (03 §3.1): the reference table of accounts postings hit. Small
// surface — a table plus create/rename/archive modals — but the source of truth the manual-entry
// combo and every report row resolve names against.
export function AcctAccountsPage() {
  const { canWrite } = usePermissions();
  const canWriteAcct = canWrite(SECTION.accounting);
  const { showMessage } = useSnackBarStore();

  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, isError, refetch } = useAcctAccounts(showArchived);
  const accounts = data?.accounts ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AcctAccount | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AcctAccount | null>(null);

  const archiveAccount = useArchiveAccount();

  const handleArchiveConfirm = () => {
    if (!archiveTarget?.code) return;
    const next = !archiveTarget.archived;
    archiveAccount.mutate(
      { code: archiveTarget.code, archived: next },
      {
        onSuccess: () => showMessage(next ? 'Account archived' : 'Account unarchived', 'success'),
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to update account', 'error'),
      },
    );
  };

  return (
    <div className='px-2.5'>
      <AcctSectionHeader>
        <label className='flex cursor-pointer items-center gap-2'>
          <ToggleSwitch checked={showArchived} onCheckedChange={setShowArchived} />
          <Text size='small' variant='inactive'>
            show archived
          </Text>
        </label>
        {canWriteAcct && (
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => setCreateOpen(true)}
          >
            + new account
          </Button>
        )}
      </AcctSectionHeader>

      <div className='flex flex-col gap-4 py-6'>
        {isLoading ? (
          <div className='min-h-40'>
            <Loader />
          </div>
        ) : isError ? (
          <div className='border border-error p-4 text-center'>
            <Text className='mb-3 text-error'>Failed to load accounts</Text>
            <Button variant='secondary' size='lg' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : (
          <>
            {/* Section tiles (approved variant): one tile per section, valued with the COUNT of
                accounts in it — the chart carries no balances, so counts are the honest figure
                (balances live in reports). Counts follow the show-archived toggle because the
                list itself does. */}
            <div>
              <StatGrid>
                {ACCT_SECTIONS.map((s) => (
                  <StatTile
                    key={s}
                    label={s}
                    value={accounts.filter((a) => a.section === s).length}
                    sub={SECTION_SUBLABEL[s]}
                  />
                ))}
              </StatGrid>
              <Note>account counts per section — for balances see reports</Note>
            </div>
            <Callout className='text-small'>
              <span className='font-bold text-textColor'>How the codes read:</span> 1xxx own ·
              2xxx owe · 3xxx owner&apos;s stake · 4xxx sales · 5–6xxx costs
            </Callout>
            <AccountsTable
              accounts={accounts}
              canWrite={canWriteAcct}
              isLoading={isLoading}
              onRename={setRenameTarget}
              onArchiveToggle={setArchiveTarget}
            />
          </>
        )}
      </div>

      <UpsertAccountModal open={createOpen} onOpenChange={setCreateOpen} />

      <UpsertAccountModal
        account={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />

      <ConfirmationModal
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        onConfirm={handleArchiveConfirm}
        title={
          archiveTarget?.archived
            ? `Unarchive ${archiveTarget?.code}?`
            : `Archive ${archiveTarget?.code}?`
        }
        confirmLabel={archiveTarget?.archived ? 'unarchive' : 'archive'}
      >
        <Text size='small'>
          {archiveTarget?.archived
            ? 'Unarchiving makes this account selectable in manual entries again.'
            : 'Archiving hides this account from new manual entries. Existing postings are unaffected.'}
        </Text>
      </ConfirmationModal>
    </div>
  );
}
