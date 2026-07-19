import type { PaymentMethodMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface PaymentMixTableProps {
  methods: PaymentMethodMetric[] | undefined;
}

// Enum name (PAYMENT_METHOD_NAME_ENUM_CARD) or raw method type → readable label. Keeps a
// `_TEST` suffix visible rather than hiding test traffic silently.
function methodLabel(raw: string | undefined): string {
  if (!raw) return '—';
  const cleaned = raw.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace(/_/g, ' ').trim();
  if (!cleaned) return '—';
  return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Revenue split by payment method for the period, share shown as a gray bar (same treatment
// as the COGS structure report). Self-hides on an empty list, so backend field-shaping removes
// the section transparently. PaymentMethodMetric carries no compare fields — period-only.
export const PaymentMixTable: FC<PaymentMixTableProps> = ({ methods }) => {
  if (!methods || methods.length === 0) return null;

  const rows = [...methods].sort((a, b) => parseDecimal(b.value) - parseDecimal(a.value));
  const total = rows.reduce((s, r) => s + parseDecimal(r.value), 0);

  return (
    <div className='space-y-2'>
      {rows.map((r, i) => {
        const val = parseDecimal(r.value);
        const pct = total > 0 ? (val / total) * 100 : 0;
        return (
          <div key={`${r.paymentMethod ?? 'unknown'}-${i}`} className='space-y-1'>
            <div className='flex items-center justify-between gap-2'>
              <Text size='small'>{methodLabel(r.paymentMethod)}</Text>
              <Text size='small'>
                {formatCurrency(val)}
                <span className='text-labelColor'>
                  {' · '}
                  {formatNumber(r.count ?? 0)} orders · {pct.toFixed(0)}%
                </span>
              </Text>
            </div>
            <div className='h-2 w-full bg-bgSecondary/40'>
              <div className='h-2 bg-textColor/70' style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
