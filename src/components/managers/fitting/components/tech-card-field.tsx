import { common_TechCard, common_TechCardListItem } from 'api/proto-http/admin';
import {
  useInfiniteTechCards,
  useTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { stageLabel } from 'components/managers/tech-cards/components/utils';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { FittingFormData } from './schema';

// The list endpoint returns lightweight list items (flat header fields); GetTechCard
// returns the full card with the header under `.techCard`. Normalise both to one summary.
type TechCardSummary = {
  id: number;
  styleNumber: string;
  name: string;
  brand: string;
  stage?: string;
};

function fromListItem(tc: common_TechCardListItem): TechCardSummary {
  return {
    id: tc.id ?? 0,
    styleNumber: tc.styleNumber ?? '',
    name: tc.name ?? '',
    brand: tc.brand ?? '',
    stage: tc.stage,
  };
}

function fromFull(tc: common_TechCard): TechCardSummary {
  const h = tc.techCard;
  return {
    id: tc.id ?? 0,
    styleNumber: h?.styleNumber ?? '',
    name: h?.name ?? '',
    brand: h?.brand ?? '',
    stage: h?.stage,
  };
}

function label(tc: TechCardSummary): string {
  const parts = [tc.styleNumber, tc.name].filter(Boolean);
  return parts.join(' · ') || `tech card #${tc.id}`;
}

// Optional tech-card (style) link for a fitting. The backend keeps the relationship on the
// fitting (FittingInsert.tech_card_id) — a fitting anchors to a tech card and/or a product.
// Searchable by name / style number via ListTechCards; resolves the id to a label on load.
export function TechCardField() {
  const { control } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'techCardId' });
  const id = field.value || 0;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<TechCardSummary | undefined>();
  const boxRef = useRef<HTMLDivElement>(null);

  // Resolve the selected tech card for display when only its id is known (edit / deep-link).
  const { data: resolved } = useTechCard(id || undefined);
  const selected: TechCardSummary | undefined =
    picked?.id === id ? picked : id && resolved ? fromFull(resolved) : undefined;

  const { data, isLoading } = useInfiniteTechCards({ name: query.trim() || undefined }, 10);
  const results = (data?.pages.flatMap((p) => p.techCards ?? []) ?? []).map(fromListItem);

  // Close the results dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(tc: TechCardSummary) {
    setPicked(tc);
    field.onChange(tc.id);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    setPicked(undefined);
    field.onChange(0);
  }

  return (
    <div className='space-y-2' ref={boxRef}>
      {selected ? (
        <div className='flex items-center justify-between gap-3 border border-textInactiveColor p-2'>
          <div className='min-w-0'>
            <Text>{label(selected)}</Text>
            <Text variant='inactive' size='small'>
              #{selected.id}
              {selected.stage ? ` · ${stageLabel(selected.stage)}` : ''}
            </Text>
          </div>
          <Button type='button' variant='secondary' aria-label='clear tech card' onClick={clear}>
            ✕
          </Button>
        </div>
      ) : (
        <Text variant='inactive' size='small'>
          no tech card linked
        </Text>
      )}

      <div className='relative'>
        <Input
          name='techCardSearch'
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={selected ? 'change tech card…' : 'search name / style number'}
        />
        {open && (
          <div className='absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto border border-textInactiveColor bg-bgColor'>
            {isLoading ? (
              <Text variant='inactive' size='small' className='block p-2'>
                searching…
              </Text>
            ) : results.length === 0 ? (
              <Text variant='inactive' size='small' className='block p-2'>
                no tech cards
              </Text>
            ) : (
              results.map((tc) => (
                <button
                  key={tc.id}
                  type='button'
                  onClick={() => choose(tc)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 border-b border-textInactiveColor px-2 py-1.5 text-left transition-colors last:border-b-0 hover:bg-highlightColor/5',
                    tc.id === id && 'bg-highlightColor/10',
                  )}
                >
                  <Text size='small'>{label(tc)}</Text>
                  <Text variant='inactive' size='small'>
                    #{tc.id}
                    {tc.brand ? ` · ${tc.brand}` : ''}
                    {tc.stage ? ` · ${stageLabel(tc.stage)}` : ''}
                  </Text>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
