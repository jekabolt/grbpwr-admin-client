import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { techCardMediaKindOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { ConstructionField } from './construction-field';
import { OperationsField } from './operations-field';
import { PieceLegend } from './piece-legend';
import { TechCardFormData } from './schema';

const mediaKindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

// Only technical views belong on the construction assembly map; mood / reference / cover /
// swatch images stay on the Sketch tab.
const CONSTRUCTION_VIEW_KINDS = new Set([
  'TECH_CARD_MEDIA_KIND_FRONT',
  'TECH_CARD_MEDIA_KIND_BACK',
  'TECH_CARD_MEDIA_KIND_DETAIL',
  'TECH_CARD_MEDIA_KIND_LINING',
]);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='space-y-4 border border-textInactiveColor p-4'>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

// The four real construction zones (UNKNOWN is the untagged default, not a zone to cover).
const TOTAL_CONSTRUCTION_ZONES = 4;

type SummaryOp = { calloutNumber?: number; timeNorm?: string; zone?: string };

// Summary lead (config pick: Summary B) — the at-a-glance overview the tab lacked: how many
// operations, total SAM (feeds costing), how many assembly zones are tagged, and how many steps
// still have no place on the sketch. Sits above the assembly workspace.
function ConstructionSummary({ operations }: { operations: SummaryOp[] }) {
  const opCount = operations.length;
  const totalSam = operations.reduce((s, o) => s + (parseFloat(o.timeNorm ?? '') || 0), 0);
  const zonesCovered = new Set(
    operations.map((o) => o.zone).filter((z) => z && z !== 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN'),
  ).size;
  const unpinned = operations.filter((o) => !(o.calloutNumber && o.calloutNumber > 0)).length;

  const cells: { label: string; value: React.ReactNode; sub?: string; warn?: boolean }[] = [
    { label: 'Operations', value: opCount },
    {
      label: 'Total SAM',
      value: (
        <>
          {totalSam.toFixed(1)}
          <span className='text-labelColor text-[10px]'> min</span>
        </>
      ),
      sub: 'feeds costing',
    },
    { label: 'Zones covered', value: `${zonesCovered} / ${TOTAL_CONSTRUCTION_ZONES}` },
    {
      label: 'Unpinned ops',
      value: unpinned,
      sub: 'no sketch pin',
      warn: unpinned > 0,
    },
  ];

  return (
    <div className='grid grid-cols-2 border-l border-t border-textInactiveColor md:grid-cols-4'>
      {cells.map((c) => (
        <div key={c.label} className='border-r border-b border-textInactiveColor px-3 py-2.5'>
          <Text variant='uppercase' className='text-labelColor block text-[10px]'>
            {c.label}
          </Text>
          <Text className={`block font-bold text-lg tabular-nums ${c.warn ? 'text-error' : ''}`}>
            {c.value}
          </Text>
          {c.sub && (
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              {c.sub}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

type FormCallout = {
  number?: number;
  mediaId?: number;
  part?: string;
  posX?: string;
  posY?: string;
};

// Read-only sketch with numbered pins, shown beside the operations list so the assembly
// map and the steps live on one screen.
function ConstructionSketch({
  mediaById,
  usedPins,
  activePin,
  onActivePinChange,
}: {
  mediaById: Map<number, common_MediaFull>;
  usedPins: Set<number>;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  // Assembly map draws on the technical sketches (front/back/detail), not the moodboard.
  const media = (useWatch({ control, name: 'technicalMedia' }) ?? []) as Array<{
    mediaId: number;
    kind?: string;
  }>;
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const views = media.filter((m) => {
    if (!CONSTRUCTION_VIEW_KINDS.has(m.kind ?? '')) return false;
    const f = mediaById.get(m.mediaId);
    return !!(f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl);
  });
  const [viewId, setViewId] = useState<number | null>(null);

  const pinnedViewId = (() => {
    if (!activePin) return null;
    const c = callouts.find((cl) => (cl.number || 0) === activePin);
    const mid = c?.mediaId || 0;
    return mid && views.some((v) => v.mediaId === mid) ? mid : null;
  })();
  const activeViewId = pinnedViewId ?? viewId ?? views[0]?.mediaId ?? null;
  const full = activeViewId != null ? mediaById.get(activeViewId) : undefined;
  const url = full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

  if (views.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        добавьте технический эскиз на вкладке Sketch и расставьте на нём пины — здесь он покажется
        рядом с операциями
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {views.length > 1 && (
        <div className='flex flex-wrap gap-2'>
          {views.map((v) => (
            <button
              key={v.mediaId}
              type='button'
              onClick={() => setViewId(v.mediaId)}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                v.mediaId === activeViewId
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textInactiveColor',
              )}
            >
              {mediaKindLabels[v.kind ?? ''] ?? 'view'}
            </button>
          ))}
        </div>
      )}

      <div className='relative w-fit'>
        <img
          src={url}
          alt='sketch'
          draggable={false}
          className='block max-h-[520px] w-auto select-none border border-textInactiveColor'
        />
        {callouts.map((c, idx) => {
          if (c.mediaId !== activeViewId) return null;
          const x = parseFloat(c.posX ?? '');
          const y = parseFloat(c.posY ?? '');
          if (Number.isNaN(x) || Number.isNaN(y)) return null;
          const num = c.number || 0;
          const used = num > 0 && usedPins.has(num);
          const active = !!activePin && num === activePin && num > 0;
          return (
            <button
              key={idx}
              type='button'
              onMouseEnter={() => num > 0 && onActivePinChange(num)}
              onMouseLeave={() => onActivePinChange(null)}
              className={cn(
                'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-textBaseSize transition-transform',
                used
                  ? 'border-bgColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor bg-bgColor text-textColor',
                active && 'z-10 scale-150 ring-2 ring-textColor',
              )}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              aria-label={`pin ${num || idx + 1}`}
            >
              {num || idx + 1}
            </button>
          );
        })}
      </div>

      <Text variant='inactive' size='small'>
        наведите на операцию — её пин подсветится (и наоборот). Залитые пины уже привязаны к
        операции.
      </Text>
    </div>
  );
}

// Construction workspace: the sketch (assembly map) on the left, the general finishing defaults
// and the ordered operations on the right — so a step and its place on the drawing are visible
// together, without switching tabs. Colourway / material selection lives on the colorways tab;
// this tab is about HOW the garment goes together, not which fabric or colour.
export function ConstructionTab({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];

  const [activePin, setActivePin] = useState<number | null>(null);
  const [activeBom, setActiveBom] = useState<string | null>(null);

  const usedPins = useMemo(
    () => new Set(operations.map((o) => o.calloutNumber || 0).filter((n) => n > 0)),
    [operations],
  );

  // The assembly map pins onto the technical sketches (callouts live there).
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  return (
    <div className='space-y-6'>
      <ConstructionSummary operations={operations} />
      <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
        <div className='w-full space-y-6 lg:sticky lg:top-36 lg:w-2/5'>
          <Section title='sketch — assembly map'>
            <ConstructionSketch
              mediaById={mediaById}
              usedPins={usedPins}
              activePin={activePin}
              onActivePinChange={setActivePin}
            />
          </Section>
          <PieceLegend />
        </div>
        <div className='flex w-full flex-col gap-6 lg:w-3/5'>
          <Section title='general — finishing & defaults'>
            <ConstructionField />
          </Section>
          <Section title='operations — assembly order'>
            <OperationsField
              activePin={activePin}
              onActivePinChange={setActivePin}
              activeBom={activeBom}
              onActiveBomChange={setActiveBom}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
