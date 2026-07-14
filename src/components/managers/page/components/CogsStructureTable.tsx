import type { CogsStructureRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface CogsStructureTableProps {
  cogsStructure: CogsStructureRow[] | undefined;
}

const COMPONENT_LABEL: Record<string, string> = {
  materials: 'Materials',
  cmt: 'CMT (cut-make-trim)',
  hardware: 'Hardware',
  packaging: 'Packaging',
  logistics: 'Logistics',
  overhead: 'Overhead',
  unattributed: 'Unattributed',
};

// COGS split by cost component for the period. Costing-gated — an empty list hides the report.
export const CogsStructureTable: FC<CogsStructureTableProps> = ({ cogsStructure }) => {
  if (!cogsStructure || cogsStructure.length === 0) return null;

  const rows = [...cogsStructure].sort((a, b) => parseDecimal(b.amount) - parseDecimal(a.amount));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold block mb-4'>
        COGS structure
      </Text>
      <div className='space-y-2'>
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, r.pct ?? 0));
          return (
            <div key={r.component} className='space-y-1'>
              <div className='flex items-center justify-between gap-2'>
                <Text size='small'>{COMPONENT_LABEL[r.component ?? ''] ?? r.component}</Text>
                <Text size='small'>
                  {formatCurrency(parseDecimal(r.amount))}
                  <span className='text-textInactiveColor'> · {pct.toFixed(0)}%</span>
                </Text>
              </div>
              <div className='h-2 w-full bg-bgSecondary/40'>
                <div className='h-2 bg-textColor/70' style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {rows.some((r) => r.component === 'unattributed' && (r.pct ?? 0) > 20) && (
        <Text variant='inactive' size='small' className='mt-3 block'>
          A large unattributed share means costs aren’t broken down by component yet — add BOM /
          production-run cost lines to attribute them.
        </Text>
      )}
    </div>
  );
};
