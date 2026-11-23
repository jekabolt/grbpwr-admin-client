import type { Shop } from 'api/proto-http/admin';
import { goToUrl } from 'lib/host';
import { notify } from 'lib/stores/store';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Button, Close, ConfirmationModal, Input, Pill, Section, Text } from 'ui';
import { paymentsNeedWork, payState, refusalWord, stripeNotReady } from './model';
import { Copy, Line, StatusMark, Todo } from './parts';
import { shopApi, useShopWrite } from './use-shop';

const onOff = (v: boolean | undefined) => (
  <StatusMark m={v ? { word: 'on', tone: 'ok' } : { word: 'off', tone: 'mut' }} />
);

const EMPTY_KEYS = { publishableKey: '', secretKey: '', webhookSecret: '' };

/** The team's own Stripe keys: three boxes and save (method «keys»). */
function KeysForm({ onDone, onNotReady }: { onDone: () => void; onNotReady: () => void }) {
  const [v, setV] = useState(EMPTY_KEYS);
  const [refused, setRefused] = useState('');
  const save = useShopWrite(shopApi.keys, { quiet: true });
  const ready = v.publishableKey.trim() && v.secretKey.trim() && v.webhookSecret.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || save.isPending) return;
    setRefused('');
    save.mutate(
      {
        publishableKey: v.publishableKey.trim(),
        secretKey: v.secretKey.trim(),
        webhookSecret: v.webhookSecret.trim(),
      },
      {
        onSuccess: () => {
          setV(EMPTY_KEYS);
          onDone();
        },
        onError: (err) => {
          if (stripeNotReady(err)) onNotReady();
          else setRefused(refusalWord(err));
        },
      },
    );
  };

  const box = (key: keyof typeof EMPTY_KEYS, label: string, placeholder: string) => (
    <Line k={label}>
      <Input
        name={`stripe-${key}`}
        aria-label={label}
        placeholder={placeholder}
        type={key === 'publishableKey' ? 'text' : 'password'}
        autoComplete='off'
        spellCheck={false}
        value={v[key]}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setV((o) => ({ ...o, [key]: e.target.value }))
        }
        className='h-[1.625rem] max-w-80'
      />
    </Line>
  );

  return (
    <form onSubmit={submit} className='flex flex-col'>
      {box('publishableKey', 'publishable key', 'pk_live_…')}
      {box('secretKey', 'secret key', 'sk_live_…')}
      {box('webhookSecret', 'webhook secret', 'whsec_…')}
      <div className='flex items-center justify-end gap-3 pt-1.5'>
        {refused && (
          <Text component='span' variant='errorLabel' size='micro' role='alert'>
            {refused}
          </Text>
        )}
        <Button type='button' variant='underline' onClick={onDone}>
          cancel
        </Button>
        <Button
          type='submit'
          variant='main'
          className='px-4 py-1'
          disabled={!ready || save.isPending}
          loading={save.isPending}
        >
          save
        </Button>
      </div>
    </form>
  );
}

/**
 * How the shop takes money (mockup «payments»). Until the Stripe lane lands every Stripe call
 * answers `stripe_not_ready`: the buttons then go quiet and the row says `not available`.
 */
export function ShopPayment({ shop, editor }: { shop: Shop; editor: boolean }) {
  const p = shop.payments;
  const state = payState(p);
  const [notReady, setNotReady] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connect = useShopWrite(shopApi.connect, { quiet: true });
  const disconnect = useShopWrite(shopApi.disconnect, { quiet: true });

  const goStripe = () =>
    connect.mutate(undefined, {
      onSuccess: (r) => {
        if (r.url) goToUrl(r.url);
      },
      onError: (err) => {
        if (stripeNotReady(err)) setNotReady(true);
      },
    });

  const owned = p?.method === 'keys';
  const name = owned
    ? `own keys${p?.keyLast4 ? ` ····${p.keyLast4}` : ''}`
    : p?.accountName || 'stripe';
  const remove = editor && !notReady && (
    <Close size='sm' aria-label='disconnect stripe' onClick={() => setDisconnecting(true)} />
  );

  return (
    <Section
      title='payments'
      headerClassName='[&_h3]:normal-case'
      action={<Todo n={paymentsNeedWork(p) ? 1 : 0} />}
    >
      <div className='flex flex-col'>
        {state === 'none' && (
          <Line
            k='stripe'
            actions={
              editor &&
              !keysOpen && (
                <>
                  <Button variant='underline' disabled={notReady} onClick={() => setKeysOpen(true)}>
                    own keys
                  </Button>
                  <Button
                    variant='main'
                    className='whitespace-nowrap px-3.5 py-1'
                    disabled={notReady || connect.isPending}
                    loading={connect.isPending}
                    onClick={goStripe}
                  >
                    connect stripe
                  </Button>
                </>
              )
            }
          >
            <Pill lowercase tone='gap'>
              {notReady ? 'not available' : 'not connected'}
            </Pill>
          </Line>
        )}
        {state === 'none' && keysOpen && (
          <KeysForm
            onDone={() => setKeysOpen(false)}
            onNotReady={() => {
              setNotReady(true);
              setKeysOpen(false);
            }}
          />
        )}

        {state !== 'none' && (
          <>
            <Line
              k='stripe'
              actions={
                <>
                  {editor && !owned && !notReady && (
                    <Button variant='underline' disabled={connect.isPending} onClick={goStripe}>
                      {state === 'onboarding' ? 'continue' : 'open stripe'}
                    </Button>
                  )}
                  {remove}
                </>
              }
            >
              <span className='min-w-0 break-words'>{name}</span>
              {state === 'onboarding' && (
                <StatusMark m={{ word: 'details needed', tone: 'attention' }} />
              )}
              {state === 'restricted' && <StatusMark m={{ word: 'restricted', tone: 'warn' }} />}
            </Line>
            <Line k='payments'>{onOff(p?.chargesEnabled)}</Line>
            <Line k='payouts'>{onOff(p?.payoutsEnabled)}</Line>
            {state === 'active' && p?.mode && (
              <Line k='mode'>
                <StatusMark
                  m={
                    p.mode === 'live'
                      ? { word: 'live', tone: 'ink' }
                      : { word: 'test', tone: 'attention' }
                  }
                />
              </Line>
            )}
            {owned && p?.webhookUrl && (
              <Line k='webhook' actions={<Copy v={p.webhookUrl} />}>
                <span className='min-w-0 break-all'>{p.webhookUrl}</span>
              </Line>
            )}
          </>
        )}
      </div>
      {disconnecting && (
        <ConfirmationModal
          open
          lowercase
          sheet
          width='sm'
          title='disconnect stripe'
          confirmLabel='disconnect'
          cancelLabel='cancel'
          onConfirm={() =>
            disconnect.mutate(undefined, {
              onError: (err) => {
                if (stripeNotReady(err)) setNotReady(true);
                else notify({ sev: 'error', subject: 'SHOP', text: refusalWord(err) });
              },
            })
          }
          onOpenChange={(v) => {
            if (!v) setDisconnecting(false);
          }}
        >
          {null}
        </ConfirmationModal>
      )}
    </Section>
  );
}
