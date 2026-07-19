import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';
import type { ActionItem } from '../productSignals';
import { ProductNameLink } from './ProductNameLink';
import { ActPill, MiniPill, VerdictList, VerdictRow } from './VerdictList';

// Signals read "<reason> — <action>"; split so the action becomes a pill and a leading
// "€X frozen" becomes a mini-pill, matching the products-final CLEAR rows.
function parseSignal(signal: string): { reason: ReactNode; action?: string } {
  const [rawReason, ...rest] = signal.split(' — ');
  const action = rest.length > 0 ? rest.join(' — ') : undefined;
  const frozen = rawReason.match(/^(€[\d.,]+\s*frozen)\s*·?\s*(.*)$/i);
  if (frozen) {
    return {
      reason: (
        <>
          <MiniPill>{frozen[1]}</MiniPill>
          {frozen[2]}
        </>
      ),
      action,
    };
  }
  return { reason: rawReason, action };
}

/** Bounded, scannable action list: bold name · reason (with a frozen badge) · action pill. */
export const ActionList: FC<{ items: ActionItem[]; total: number }> = ({ items, total }) => {
  if (items.length === 0) return null;
  return (
    <VerdictList>
      {items.map((it) => {
        const { reason, action } = parseSignal(it.signal);
        const crit = it.key.startsWith('dead');
        const linkable = typeof it.productId === 'number' && it.productId > 0;
        return (
          <VerdictRow
            key={it.key}
            name={
              linkable ? (
                <ProductNameLink productId={it.productId} productName={it.name} maxWidth='100%' />
              ) : (
                it.name
              )
            }
            why={reason}
            act={action ? <ActPill tone={crit ? 'crit' : 'neutral'}>{action}</ActPill> : undefined}
          />
        );
      })}
      {total > items.length && (
        <li className='py-2'>
          <Text className='text-labelColor text-textBaseSize'>
            +{total - items.length} more — see the full table below
          </Text>
        </li>
      )}
    </VerdictList>
  );
};
