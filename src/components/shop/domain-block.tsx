import type { Shop, ShopDnsRecord, ShopDomain } from 'api/proto-http/admin';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Button, Close, ConfirmationModal, DataTable, FoldCaret, Input, Section, Text } from 'ui';
import { cleanHost, customDomains, domainMark, isLive, missingRecords, refusalWord } from './model';
import { Copy, Line, StatusMark, OpenLink, Todo } from './parts';
import { shopApi, useShopWrite } from './use-shop';

function Records({ records }: { records: ShopDnsRecord[] }) {
  return (
    <DataTable className='[&_td]:align-middle'>
      <thead>
        <tr>
          <th>type</th>
          <th data-align='left'>name</th>
          <th data-align='left'>value</th>
          <th>status</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={`${r.type}-${r.name}-${i}`}>
            <td>{r.type}</td>
            <td data-align='left'>{r.name}</td>
            <td data-align='left'>
              <span className='inline-flex min-w-0 items-center gap-2'>
                <span className='break-all'>{r.value}</span>
                <Copy v={r.value ?? ''} />
              </span>
            </td>
            <td
              className={
                r.found ? 'whitespace-nowrap text-success' : 'whitespace-nowrap text-error'
              }
            >
              {r.found ? 'found' : 'missing'}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DomainRows({
  d,
  editor,
  onRemove,
}: {
  d: ShopDomain;
  editor: boolean;
  onRemove: (host: string) => void;
}) {
  const host = d.host ?? '';
  const live = isLive(d);
  const [open, setOpen] = useState(false);
  const check = useShopWrite(shopApi.check);
  const records = d.records ?? [];
  const showRecords = !d.redirectTo && records.length > 0;

  return (
    <>
      <Line
        k={<span className='break-all text-textColor'>{host}</span>}
        actions={
          <>
            {live && <OpenLink href={`https://${host}`}>open</OpenLink>}
            {!live && !d.redirectTo && editor && (
              <Button
                variant='secondary'
                className='px-2.5 py-0.5 text-micro'
                disabled={check.isPending}
                loading={check.isPending}
                onClick={() => check.mutate(host)}
              >
                check
              </Button>
            )}
            {editor && !d.managed && !d.redirectTo && (
              <Close size='sm' aria-label={`remove ${host}`} onClick={() => onRemove(host)} />
            )}
          </>
        }
      >
        <StatusMark m={domainMark(d)} />
      </Line>
      {showRecords && live && (
        <Line
          k={
            <Button
              type='button'
              className='inline-flex items-center gap-1.5 text-labelColor'
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <FoldCaret open={open} />
              records
            </Button>
          }
        />
      )}
      {showRecords && (!live || open) && (
        <div className='py-1.5'>
          <Records records={records} />
        </div>
      )}
    </>
  );
}

/** The team's own domains: attach, the DNS records to add, check, remove (mockup «domain»). */
export function ShopDomains({ shop, editor }: { shop: Shop; editor: boolean }) {
  const domains = customDomains(shop);
  const [host, setHost] = useState('');
  const [refused, setRefused] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const attach = useShopWrite(shopApi.attach, { quiet: true });
  const remove = useShopWrite(shopApi.remove);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const h = cleanHost(host);
    if (!h || attach.isPending) return;
    setRefused('');
    attach.mutate(h, {
      onSuccess: () => setHost(''),
      onError: (err) => setRefused(refusalWord(err, 'not attached')),
    });
  };

  return (
    <Section
      title='domain'
      headerClassName='[&_h3]:normal-case'
      action={<Todo n={missingRecords(shop)} />}
    >
      {domains.length > 0 && (
        <div className='flex flex-col'>
          {domains.map((d) => (
            <DomainRows key={d.host} d={d} editor={editor} onRemove={setRemoving} />
          ))}
        </div>
      )}
      {editor && domains.length === 0 && (
        <form onSubmit={submit} className='flex flex-wrap items-center gap-2 pt-1.5 first:pt-0'>
          <Input
            name='shop-domain'
            aria-label='domain'
            placeholder='brand.com'
            autoComplete='off'
            spellCheck={false}
            value={host}
            aria-invalid={refused ? true : undefined}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setHost(e.target.value);
              setRefused('');
            }}
            className='h-[1.625rem] max-w-80'
          />
          <Button
            type='submit'
            variant='secondary'
            className='px-2.5 py-0.5 text-micro'
            disabled={!cleanHost(host) || attach.isPending}
            loading={attach.isPending}
          >
            attach
          </Button>
          {refused && (
            <Text component='span' variant='errorLabel' size='micro' role='alert'>
              {refused}
            </Text>
          )}
        </form>
      )}
      {!editor && domains.length === 0 && (
        <Text component='span' variant='label' size='micro'>
          none
        </Text>
      )}
      {removing && (
        <ConfirmationModal
          open
          lowercase
          sheet
          width='sm'
          title={`remove ${removing}`}
          confirmLabel='remove'
          cancelLabel='cancel'
          onConfirm={() => remove.mutate(removing)}
          onOpenChange={(v) => {
            if (!v) setRemoving(null);
          }}
        >
          {null}
        </ConfirmationModal>
      )}
    </Section>
  );
}
