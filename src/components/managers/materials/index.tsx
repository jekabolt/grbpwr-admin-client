import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import { CatalogTab } from './components/catalog-tab';
import { LotsTab } from './components/lots-tab';
import { StockTab } from './components/stock-tab';
import { MovementsTab } from './components/movements-tab';

type Tab = 'catalog' | 'stock' | 'movements' | 'lots';
const TABS: { id: Tab; label: string }[] = [
  { id: 'catalog', label: 'catalog' },
  { id: 'stock', label: 'stock' },
  { id: 'movements', label: 'movements' },
  { id: 'lots', label: 'lots' },
];

// /materials is three views of one nomenclature: the catalog (articles + prices), the warehouse
// stock (balances + valuation), and the append-only movement ledger. The active tab lives in the
// URL (?tab=) so a filtered stock/movements view is a shareable link (R-1).
export function Materials() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'catalog';

  const select = (id: Tab) => {
    // Clicking the already-active tab is a no-op — running the reset would wipe
    // that tab's own filters (?section=/&q=/&belowMin=…).
    if (id === tab) return;
    setParams(
      (prev) => {
        // Switching tab drops the other tab's filters so a stale ?section=/?type= can't leak across.
        const p = new URLSearchParams();
        if (prev.get('material')) p.set('material', prev.get('material')!);
        p.set('tab', id);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          materials
        </Text>
      </div>

      <div className='flex items-center gap-4 border-b border-textInactiveColor'>
        {TABS.map((t) => (
          <button
            key={t.id}
            type='button'
            onClick={() => select(t.id)}
            className={cn(
              'border-b-2 px-1 pb-2 text-textBaseSize uppercase transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              tab === t.id ? 'border-textColor' : 'border-transparent hover:opacity-70',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' ? (
        <StockTab />
      ) : tab === 'movements' ? (
        <MovementsTab />
      ) : tab === 'lots' ? (
        <LotsTab />
      ) : (
        <CatalogTab />
      )}
    </div>
  );
}
