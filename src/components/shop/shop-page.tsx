import type { Shop } from 'api/proto-http/admin';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { Loader, Section, SectionStack, Select, Text, ToggleSwitch } from 'ui';
import { ShopDomains } from './domain-block';
import { ShopMailer } from './mail-block';
import { primaryChoices, shopMark } from './model';
import { Copy, HostWord, Line, StatusMark, OpenLink } from './parts';
import { ShopPayment } from './payments-block';
import { shopApi, useShop, useShopWrite } from './use-shop';

// `/shop` on a team host (lane X18-L4, mockup x18-shop-mockup.html, states off · on · domain
// added · live): the team's storefront — on/off and address, own domain, payments, mail. Writes
// are an owner's of a team that is not paused; everyone else reads the same blocks.

const FEATURE_WORD: Record<string, string> = { products: 'no products', orders: 'no orders' };

function ShopMain({ shop, editor }: { shop: Shop; editor: boolean }) {
  const on = !!shop.enabled;
  const enable = useShopWrite(shopApi.setEnabled);
  const primary = useShopWrite(shopApi.primary);
  const address = shop.address ?? '';
  const choices = primaryChoices(shop);
  const main = shop.primaryHost || address;
  const missing = shop.missingFeatures ?? [];

  return (
    <Section title='shop' headerClassName='[&_h3]:normal-case'>
      <div className='flex flex-col'>
        <Line k='shop'>
          <ToggleSwitch
            checked={on}
            label={on ? 'on' : 'off'}
            disabled={!editor || enable.isPending || !!shop.closedByOperator}
            onCheckedChange={(v) => enable.mutate(v)}
          />
        </Line>
        <Line k='status'>
          <StatusMark m={shopMark(shop.status)} />
          {missing.map((f) => (
            <StatusMark key={f} m={{ word: FEATURE_WORD[f] ?? `no ${f}`, tone: 'warn' }} />
          ))}
        </Line>
        {address && (
          <Line
            k='address'
            actions={
              <>
                <Copy v={address} />
                {on && <OpenLink href={`https://${address}`}>open</OpenLink>}
              </>
            }
          >
            <span className={on ? 'min-w-0 break-all' : 'min-w-0 break-all text-labelColor'}>
              {address}
            </span>
          </Line>
        )}
        {on && choices.length > 1 && (
          <Line k='main address'>
            {editor ? (
              <Select
                name='shop-primary'
                size='sm'
                value={main}
                className='w-auto max-w-80 normal-case'
                items={choices.map((h) => ({
                  value: h,
                  label: <span className='normal-case'>{h}</span>,
                }))}
                disabled={primary.isPending}
                onValueChange={(h) => h !== main && primary.mutate(h)}
              />
            ) : (
              <span className='min-w-0 break-all'>{main}</span>
            )}
          </Line>
        )}
      </div>
    </Section>
  );
}

export default function ShopPage() {
  const { role, readOnly, workspace } = useWorkspace();
  const editor = role === 'owner' && !readOnly;
  const q = useShop();
  const shop = q.data;
  const on = !!shop?.enabled;
  const head = shop?.primaryHost || shop?.address || '';

  return (
    <SectionStack>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-borderColor pb-3'>
        <Text component='h1' size='large'>
          shop
        </Text>
        {head && (
          <Text component='span' variant='label' className='ml-auto break-all'>
            <HostWord host={head} muted={!on} />
          </Text>
        )}
      </div>
      {q.isLoading && <Loader />}
      {q.isError && (
        <Section
          title='shop'
          headerClassName='[&_h3]:normal-case'
          action={
            <Text component='span' variant='errorLabel' size='micro'>
              not loaded
            </Text>
          }
        >
          {null}
        </Section>
      )}
      {shop && <ShopMain shop={shop} editor={editor} />}
      {shop && on && (
        <>
          <ShopDomains shop={shop} editor={editor} />
          <ShopPayment shop={shop} editor={editor} />
          <ShopMailer shop={shop} editor={editor} brandName={workspace?.brand?.brandName ?? ''} />
        </>
      )}
    </SectionStack>
  );
}
