import { common_Dictionary } from 'api/proto-http/admin';
import { common_AddressInsert, common_OrderFull } from 'api/proto-http/frontend';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { ReactNode } from 'react';
import { GrbpwrMark } from 'ui/icons/grbpwr-mark';

const TD = 'border border-black px-1.5 py-1 align-top';
const TH = 'border border-black px-1.5 py-1 text-left font-semibold bg-neutral-100 uppercase';

// GRBPWR seller identity printed as the invoice "from" party. Contact only — no legal
// entity address is carried in the client, so we surface what we know.
const SELLER = {
  name: 'GRBPWR',
  site: 'grbpwr.com',
  email: 'customercare@grbpwr.com',
};

const toNum = (s?: string): number => {
  const n = parseFloat(s ?? '');
  return Number.isNaN(n) ? 0 : n;
};

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='mb-5'>
      <h2 className='mb-2 break-after-avoid bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white'>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v?: ReactNode }) {
  const empty = v == null || v === '' || v === '—';
  return (
    <div className='flex gap-2 break-inside-avoid border-b border-textInactiveColor py-0.5 text-[11px] leading-tight'>
      <span className='w-28 shrink-0 uppercase tracking-wide text-labelColor'>{k}</span>
      <span className='font-medium'>{empty ? '—' : v}</span>
    </div>
  );
}

function AddressLines({ address }: { address?: common_AddressInsert }) {
  if (!address) return <div className='text-[11px] text-labelColor'>—</div>;
  const lines = [
    address.company,
    address.addressLineOne,
    address.addressLineTwo,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    [address.state, address.country].filter(Boolean).join(', '),
  ].filter((l) => l && l.trim());
  if (lines.length === 0) return <div className='text-[11px] text-labelColor'>—</div>;
  return (
    <div className='text-[11px] leading-snug'>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

const sameAddress = (a?: common_AddressInsert, b?: common_AddressInsert) =>
  !!a &&
  !!b &&
  a.addressLineOne === b.addressLineOne &&
  a.addressLineTwo === b.addressLineTwo &&
  a.city === b.city &&
  a.postalCode === b.postalCode &&
  a.country === b.country &&
  a.state === b.state;

// Full printable commercial invoice for one order. Pure presentational, self-contained
// black-on-white so it prints/PDFs identically regardless of app theme — same document
// language as the tech pack (see tech-pack-document). Rendered by invoice-page under the
// layout-less print route.
export function InvoiceDocument({
  orderDetails,
  orderStatus,
  dictionary,
}: {
  orderDetails?: common_OrderFull;
  orderStatus?: string;
  dictionary?: common_Dictionary;
}) {
  const order = orderDetails?.order;
  if (!order) return null;

  const currency = order.currency ?? '';
  const money = (n: number) => `${n.toFixed(2)} ${currency}`.trim();

  const buyer = orderDetails?.buyer?.buyerInsert;
  const shipAddr = orderDetails?.shipping?.addressInsert;
  const billAddr = orderDetails?.billing?.addressInsert;
  const shipment = orderDetails?.shipment;
  const payment = orderDetails?.payment?.paymentInsert;
  const promo = orderDetails?.promoCode?.promoCodeInsert;

  const refundedIds = new Set(
    (orderDetails?.refundedOrderItems ?? []).map((r) => r.id).filter((id) => id != null),
  );
  const isRefunded = orderStatus === 'PARTIALLY REFUNDED' || orderStatus === 'REFUNDED';

  const sizeName = (id?: number) =>
    dictionary?.sizes?.find((s) => s.id === id)?.name?.replace('SIZE_ENUM_', '') ?? '—';

  const carrierName = dictionary?.shipmentCarriers?.find((c) => c.id === shipment?.carrierId)
    ?.shipmentCarrier?.carrier;

  const items = orderDetails?.orderItems ?? [];
  const rows = items.map((item) => {
    const qty = Math.max(1, item.orderItem?.quantity ?? 1);
    const unit = toNum(item.productPriceWithSale);
    const base = toNum(item.productPrice);
    const sale = toNum(item.productSalePercentage);
    return { item, qty, unit, base, sale, line: unit * qty };
  });

  const subtotal = rows.reduce((s, r) => s + r.line, 0);
  const shippingCost = shipment?.freeShipping ? 0 : toNum(shipment?.cost?.value);
  const total = toNum(order.totalPrice?.value);
  // The grand total is authoritative (promo/vouchers apply on top of line sale prices).
  // Derive the discount so the summary reconciles: subtotal + shipping − discount = total.
  const discount = Math.max(0, subtotal + shippingCost - total);
  const refundedAmount = toNum(order.refundedAmount?.value);

  const paymentMethod = payment?.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '');
  const paid = !!payment?.isTransactionDone;

  return (
    <div className='mx-auto max-w-[210mm] bg-white px-8 py-6 text-black'>
      {/* HEADER / IDENTITY */}
      <header className='mb-5 border-b-2 border-black pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-12 w-12 shrink-0 text-black' />
            <div>
              <div className='text-[10px] uppercase tracking-[0.2em] text-labelColor'>
                {SELLER.name} · commercial invoice
              </div>
              <div className='text-2xl font-bold uppercase leading-tight'>
                invoice #{order.id ?? '—'}
              </div>
              <div className='break-all text-[11px] text-labelColor'>ref {order.uuid || '—'}</div>
            </div>
          </div>
          <div className='shrink-0 text-right text-[11px] leading-tight'>
            <div className='font-semibold uppercase'>{orderStatus || '—'}</div>
            <div>placed {formatDateShort(order.placed, true) || '—'}</div>
            <div className='text-labelColor'>{currency || '—'}</div>
          </div>
        </div>
      </header>

      {/* PARTIES */}
      <div className='mb-5 grid grid-cols-2 gap-x-8 gap-y-4'>
        <div>
          <div className='mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-labelColor'>
            from
          </div>
          <div className='text-[11px] leading-snug'>
            <div className='font-bold uppercase'>{SELLER.name}</div>
            <div>{SELLER.site}</div>
            <div>{SELLER.email}</div>
          </div>
        </div>
        <div>
          <div className='mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-labelColor'>
            bill to
          </div>
          <div className='text-[11px] leading-snug'>
            <div className='font-bold uppercase'>
              {[buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ') || '—'}
            </div>
            {buyer?.email && <div>{buyer.email}</div>}
            {buyer?.phone && <div>{buyer.phone}</div>}
          </div>
          <div className='mt-1'>
            <AddressLines address={billAddr} />
          </div>
        </div>
        <div>
          <div className='mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-labelColor'>
            ship to
          </div>
          {sameAddress(shipAddr, billAddr) ? (
            <div className='text-[11px] text-labelColor'>same as billing address</div>
          ) : (
            <AddressLines address={shipAddr} />
          )}
        </div>
        <div>
          <div className='mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-labelColor'>
            shipment
          </div>
          <KV k='carrier' v={carrierName} />
          <KV k='tracking' v={shipment?.trackingCode} />
          <KV k='shipped' v={formatDateShort(shipment?.shippingDate)} />
          <KV k='est. arrival' v={formatDateShort(shipment?.estimatedArrivalDate)} />
        </div>
      </div>

      {/* ITEMS */}
      <Sheet title='items'>
        <table className='w-full border-collapse text-[10px]'>
          <thead>
            <tr>
              <th className={`${TH} w-6`}>#</th>
              <th className={TH}>sku</th>
              <th className={TH}>product</th>
              <th className={`${TH} text-center`}>size</th>
              <th className={`${TH} text-right`}>unit price</th>
              <th className={`${TH} text-center`}>qty</th>
              <th className={`${TH} text-right`}>amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={`${TD} text-center`} colSpan={7}>
                  no items
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const refunded = r.item.id != null && refundedIds.has(r.item.id);
                return (
                  <tr key={r.item.id ?? i} className='break-inside-avoid'>
                    <td className={`${TD} text-center font-semibold`}>{i + 1}</td>
                    <td className={`${TD} whitespace-nowrap`}>{r.item.sku || '—'}</td>
                    <td className={TD}>
                      <div className='font-medium'>{r.item.translations?.[0]?.name || '—'}</div>
                      <div className='text-labelColor'>
                        {[r.item.productBrand, r.item.color].filter(Boolean).join(' · ')}
                        {refunded ? ' · refunded' : ''}
                      </div>
                    </td>
                    <td className={`${TD} text-center`}>{sizeName(r.item.orderItem?.sizeId)}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {money(r.unit)}
                      {r.sale > 0 && (
                        <div className='text-labelColor line-through'>{money(r.base)}</div>
                      )}
                    </td>
                    <td className={`${TD} text-center`}>{r.qty}</td>
                    <td className={`${TD} whitespace-nowrap text-right font-medium`}>
                      {money(r.line)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Sheet>

      {/* SUMMARY */}
      <div className='mb-5 flex justify-end'>
        <div className='w-full max-w-[280px] text-[11px]'>
          <div className='flex justify-between border-b border-textInactiveColor py-0.5'>
            <span className='uppercase text-labelColor'>subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className='flex justify-between border-b border-textInactiveColor py-0.5'>
            <span className='uppercase text-labelColor'>shipping</span>
            <span>{shipment?.freeShipping ? 'free' : money(shippingCost)}</span>
          </div>
          {discount > 0.005 && (
            <div className='flex justify-between border-b border-textInactiveColor py-0.5'>
              <span className='uppercase text-labelColor'>
                discount{promo?.code ? ` · ${promo.code}` : ''}
              </span>
              <span>−{money(discount)}</span>
            </div>
          )}
          <div className='mt-1 flex justify-between border-t-2 border-black pt-1 text-sm font-bold uppercase'>
            <span>total</span>
            <span>{money(total)}</span>
          </div>
          {isRefunded && (
            <div className='mt-1 flex justify-between py-0.5'>
              <span className='uppercase text-labelColor'>refunded</span>
              <span>−{money(refundedAmount)}</span>
            </div>
          )}
        </div>
      </div>

      {/* PAYMENT */}
      <Sheet title='payment'>
        <div className='grid grid-cols-2 gap-x-8'>
          <div>
            <KV k='method' v={paymentMethod} />
            <KV k='status' v={paid ? 'paid' : 'unpaid'} />
          </div>
          <div>
            <KV
              k='paid at'
              v={paid ? formatDateShort(orderDetails?.payment?.modifiedAt, true) : ''}
            />
            <KV k='amount' v={paid ? money(total) : ''} />
          </div>
        </div>
        {order.refundReason && <KV k='refund reason' v={order.refundReason} />}
      </Sheet>

      <footer className='mt-6 border-t border-textInactiveColor pt-2 text-[9px] uppercase tracking-wide text-labelColor'>
        {SELLER.name} · invoice #{order.id ?? ''} · questions? {SELLER.email}
      </footer>
    </div>
  );
}
