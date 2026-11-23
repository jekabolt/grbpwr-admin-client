import type { Shop } from 'api/proto-http/admin';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Button, EmptyCell, Input, Section, Text, useDoneFlash } from 'ui';
import { refusalKey, refusalWord } from './model';
import { Line } from './parts';
import { shopApi, useShopWrite } from './use-shop';

/** The sender of the shop's letters: name and reply-to (mockup «mail»). */
export function ShopMailer({
  shop,
  editor,
  brandName,
}: {
  shop: Shop;
  editor: boolean;
  brandName: string;
}) {
  const m = shop.mail;
  const initName = m?.fromName ?? '';
  const initReply = m?.replyTo ?? '';
  const [name, setName] = useState(initName);
  const [reply, setReply] = useState(initReply);
  const [refused, setRefused] = useState<{ field: 'name' | 'reply' | null; word: string } | null>(
    null,
  );
  const save = useShopWrite(shopApi.mail, { quiet: true });
  const saved = useDoneFlash();

  useEffect(() => {
    setName(initName);
    setReply(initReply);
  }, [initName, initReply]);

  const dirty = name.trim() !== initName || reply.trim() !== initReply;
  const from = m?.fromAddress ?? '';
  const shownName = initName || brandName;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || save.isPending) return;
    setRefused(null);
    save.mutate(
      { fromName: name.trim(), replyTo: reply.trim() },
      {
        onSuccess: () => saved.flash(),
        onError: (err) => {
          const k = refusalKey(err);
          setRefused({
            field: k === 'bad_from_name' ? 'name' : k === 'bad_reply_to' ? 'reply' : null,
            word: refusalWord(err),
          });
        },
      },
    );
  };

  if (!editor)
    return (
      <Section title='mail' headerClassName='[&_h3]:normal-case'>
        <div className='flex flex-col'>
          <Line k='sender'>
            <span className='min-w-0 break-all'>
              {shownName || from ? `${shownName}${from ? ` <${from}>` : ''}` : <EmptyCell />}
            </span>
          </Line>
          <Line k='reply to'>
            <span className='min-w-0 break-all'>{initReply || <EmptyCell />}</span>
          </Line>
        </div>
      </Section>
    );

  return (
    <Section title='mail' headerClassName='[&_h3]:normal-case'>
      <form onSubmit={submit} className='flex flex-col'>
        <Line k='sender'>
          <Input
            name='shop-from-name'
            aria-label='sender name'
            placeholder={brandName || 'name'}
            autoComplete='off'
            value={name}
            aria-invalid={refused?.field === 'name' ? true : undefined}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
              setRefused(null);
            }}
            className='h-[1.625rem] max-w-60'
          />
          {from && (
            <Text component='span' variant='label' className='min-w-0 break-all'>
              {`<${from}>`}
            </Text>
          )}
        </Line>
        <Line
          k='reply to'
          actions={
            <>
              {refused && (
                <Text component='span' variant='errorLabel' size='micro' role='alert'>
                  {refused.word}
                </Text>
              )}
              {!refused && saved.on && !dirty && (
                <Text component='span' variant='label' size='micro'>
                  saved
                </Text>
              )}
              {dirty && (
                <Button
                  type='submit'
                  variant='main'
                  className='px-3.5 py-1'
                  disabled={save.isPending}
                  loading={save.isPending}
                >
                  save
                </Button>
              )}
            </>
          }
        >
          <Input
            name='shop-reply-to'
            aria-label='reply to'
            type='email'
            placeholder='studio@brand.com'
            autoComplete='off'
            spellCheck={false}
            value={reply}
            aria-invalid={refused?.field === 'reply' ? true : undefined}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setReply(e.target.value);
              setRefused(null);
            }}
            className='h-[1.625rem] max-w-80'
          />
        </Line>
      </form>
    </Section>
  );
}
