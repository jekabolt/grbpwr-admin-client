import type { common_OrderStripeDetails, googletype_Decimal } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

// Shared rendering for the admin-only Stripe settlement metadata (common.OrderStripeDetails)
// plus the payment-identity fields on the order. Used by the order detail Payment section and
// the fulfillment card. All settlement money is base currency (EUR) by contract.

// Wallet / payment-method-type → display label. Falls back to title-casing the raw snake_case
// value so a future Stripe rail never renders as `apple_pay`.
const METHOD_TYPE_LABEL: Record<string, string> = {
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  link: 'Link',
  card: 'Card',
  klarna: 'Klarna',
  paypal: 'PayPal',
  sepa_debit: 'SEPA Direct Debit',
  ideal: 'iDEAL',
  bancontact: 'Bancontact',
  revolut_pay: 'Revolut Pay',
};

function titleCase(s: string): string {
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function num(d: googletype_Decimal | undefined): number | null {
  const raw = d?.value;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Clean 2-decimal EUR string, or null when the field is empty (uncaptured). Callers omit the
// row on null rather than printing a dash — an unpaid order shouldn't be a wall of dashes.
export function formatEur(d: googletype_Decimal | undefined): string | null {
  const n = num(d);
  return n == null ? null : `${n.toFixed(2)} EUR`;
}

// composePaymentMethod builds the human method line: the most specific Stripe label
// (paymentMethodType) with card identity appended, falling back to the enum name for
// legacy / uncaptured orders. Returns '' when nothing is known.
export function composePaymentMethod(args: {
  paymentMethodType?: string;
  paymentMethodEnum?: string;
  cardBrand?: string;
  cardLast4?: string;
}): string {
  const { paymentMethodType, paymentMethodEnum, cardBrand, cardLast4 } = args;
  // The enum is the only carrier of the test/live distinction; preserve it even when the more
  // specific paymentMethodType label is used, so an operator can tell a test order from a real one.
  const isTest = (paymentMethodEnum ?? '').toUpperCase().includes('_TEST');
  const primary = paymentMethodType
    ? (METHOD_TYPE_LABEL[paymentMethodType] ?? titleCase(paymentMethodType))
    : paymentMethodEnum
      ? titleCase(
          paymentMethodEnum.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace(/_TEST$/i, ''),
        )
      : '';
  const card =
    cardBrand || cardLast4
      ? `${cardBrand ? cardBrand.toUpperCase() : 'CARD'}${cardLast4 ? ` •••• ${cardLast4}` : ''}`
      : '';
  // Don't repeat "Card" when the wallet label is the generic card and we already show the brand.
  const base =
    card && primary && primary.toLowerCase() !== 'card' ? `${primary} · ${card}` : card || primary;
  return isTest && base ? `${base} (test)` : base;
}

// Radar outcomes worth surfacing. `normal`/empty resolve to null — absence of a warning is the
// default state and a "NORMAL" chip on every order is noise.
export function riskTone(riskLevel: string | undefined): 'elevated' | 'highest' | null {
  const r = (riskLevel ?? '').trim().toLowerCase();
  if (r === 'highest') return 'highest';
  if (r === 'elevated') return 'elevated';
  return null;
}

// True when the settlement block has any monetary figure to show (so we don't render an empty
// shell for non-Stripe methods or pre-settlement lag).
export function hasSettlement(sd: common_OrderStripeDetails | undefined): boolean {
  if (!sd) return false;
  return (
    num(sd.totalSettledBase) != null ||
    num(sd.paymentFee) != null ||
    num(sd.netSettledBase) != null
  );
}

// Worded risk chip (monochrome-safe: the word carries the state, colour reinforces it).
export function RiskChip({ riskLevel }: { riskLevel: string | undefined }) {
  const tone = riskTone(riskLevel);
  if (!tone) return null;
  const cls = tone === 'highest' ? 'bg-error text-bgColor' : 'bg-warning text-bgColor';
  return (
    <span className={cn('px-1.5 py-0.5', cls)} title='Stripe Radar risk assessment'>
      <Text component='span' variant='uppercase'>
        {tone} risk
      </Text>
    </span>
  );
}

// Full-width risk banner for the fulfillment card — same grammar as the payment-failures
// alert on the analytics board, placed next to the ship action so it can't be missed.
export function RiskBanner({ riskLevel }: { riskLevel: string | undefined }) {
  const tone = riskTone(riskLevel);
  if (!tone) return null;
  const isHighest = tone === 'highest';
  const tint = isHighest ? 'border-error bg-error/10 text-error' : 'border-warning bg-warning/10 text-warning';
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-2 p-3', tint)}>
      <Text variant='uppercase' className='text-textBaseSize font-semibold'>
        ⚠ Stripe Radar: {tone} risk
      </Text>
      <Text variant='uppercase' className='text-textBaseSize'>
        — review before shipping
      </Text>
    </div>
  );
}

// External link to a Stripe-hosted URL (dashboard payment, or the customer receipt). Never
// rendered when the URL is empty; hidden in print (a hosted URL is useless on paper).
export function StripeExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-1 text-textBaseSize uppercase underline hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor print:hidden'
    >
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
}

// Label / value row in the order-page grammar (readable #666 label, black uppercase value).
export function DetailRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className='flex items-center justify-between gap-4'>
      <Text variant='label'>{label}</Text>
      <Text variant='uppercase' className={cn('text-right', strong && 'font-bold')}>
        {value}
      </Text>
    </div>
  );
}

// Settlement economics sub-block for the order detail page. Costing-gated by the caller.
// `presentmentCurrency` is the customer's charge currency; the FX row is hidden for EUR-native
// orders (a rate of 1 says nothing). `isRefunded` adds the capture caveat when figures are
// frozen at capture (backend semantics — see plan open question).
export function SettlementBlock({
  stripeDetails,
  presentmentCurrency,
  isRefunded,
}: {
  stripeDetails: common_OrderStripeDetails | undefined;
  presentmentCurrency?: string;
  isRefunded?: boolean;
}) {
  if (!hasSettlement(stripeDetails)) return null;
  const sd = stripeDetails as common_OrderStripeDetails;

  const settled = formatEur(sd.totalSettledBase);
  const fee = formatEur(sd.paymentFee);
  const net = formatEur(sd.netSettledBase);
  const settledNum = num(sd.totalSettledBase);
  const feeNum = num(sd.paymentFee);
  const feePct = settledNum && settledNum > 0 && feeNum != null ? (feeNum / settledNum) * 100 : null;
  const fx = num(sd.stripeExchangeRate);
  const showFx = fx != null && fx !== 1 && !!presentmentCurrency && presentmentCurrency !== 'EUR';

  return (
    <div className='space-y-1 border-t border-textInactiveColor pt-3'>
      <Text variant='label' size='small' className='uppercase'>
        settlement (EUR)
      </Text>
      {settled && <DetailRow label='settled' value={settled} />}
      {fee && (
        <DetailRow
          label='stripe fee'
          value={`−${fee}${feePct != null ? ` (${feePct.toFixed(1)}%)` : ''}`}
        />
      )}
      {net && <DetailRow label='net settled' value={net} strong />}
      {showFx && (
        <DetailRow label='fx rate' value={`${fx.toFixed(4)} ${presentmentCurrency}→EUR`} />
      )}
      {isRefunded && net && (
        <Text variant='label' size='small'>
          at capture · refund not netted
        </Text>
      )}
      {sd.stripeDashboardUrl && (
        <div className='pt-1'>
          <StripeExternalLink href={sd.stripeDashboardUrl}>open in stripe</StripeExternalLink>
        </div>
      )}
    </div>
  );
}

// Compact settlement for the fulfillment card aside — net settled + Stripe link only; the full
// breakdown lives on the order detail page ("open full order").
export function SettlementCompact({
  stripeDetails,
}: {
  stripeDetails: common_OrderStripeDetails | undefined;
}) {
  if (!hasSettlement(stripeDetails)) return null;
  const sd = stripeDetails as common_OrderStripeDetails;
  // Prefer net-of-fee; fall back to gross settled — but label the row for whichever figure we
  // actually show, so a gross amount is never presented as "net settled".
  const netStr = formatEur(sd.netSettledBase);
  const value = netStr ?? formatEur(sd.totalSettledBase);
  const rowLabel = netStr ? 'net settled' : 'settled';
  return (
    <div className='flex flex-col gap-1 border-t border-textInactiveColor pt-4'>
      <Text variant='uppercase' size='small' className='text-labelColor'>
        settlement
      </Text>
      {value && (
        <div className='flex items-center justify-between gap-4'>
          <Text variant='label' size='small'>
            {rowLabel}
          </Text>
          <Text size='small' className='font-bold'>
            {value}
          </Text>
        </div>
      )}
      {sd.stripeDashboardUrl && (
        <div className='pt-1'>
          <StripeExternalLink href={sd.stripeDashboardUrl}>open in stripe</StripeExternalLink>
        </div>
      )}
    </div>
  );
}
