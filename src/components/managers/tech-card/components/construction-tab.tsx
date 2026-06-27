import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { techCardBomSectionOptions, techCardMediaKindOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { ConstructionField } from './construction-field';
import { colorwayColorSummary } from './operation-options';
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
    <section className='space-y-4 border border-textColor p-4'>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
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
// map and the steps live on one screen. Pins are created on the Sketch tab; here they are
// the index: hovering a pin highlights the operations that reference it, and vice-versa.
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
  const media = (useWatch({ control, name: 'media' }) ?? []) as Array<{
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

  // When an operation is hovered (activePin set), auto-switch to the sketch view that
  // carries that pin — so the right picture is shown without manual view switching.
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
                'border px-2 py-1 text-sm uppercase transition-colors',
                v.mediaId === activeViewId
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor hover:border-textColor',
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
          className='block max-h-[520px] w-auto select-none border border-textColor'
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
                'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs transition-transform',
                used
                  ? 'border-bgColor bg-textColor text-bgColor'
                  : 'border-textColor bg-bgColor text-textColor',
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

const bomSectionLabels: Record<string, string> = Object.fromEntries(
  techCardBomSectionOptions.map((o) => [o.value, o.label]),
);

// Compact, read-only BOM list shown in the construction workspace so an operation can be
// linked to a material — and the link seen — without leaving for the BOM tab. Hovering a
// line highlights the operations that use it, and vice-versa.
function ConstructionBom({
  activeBom,
  onActiveBomChange,
  usedBomIndexes,
}: {
  activeBom: number | null;
  onActiveBomChange: (n: number | null) => void;
  usedBomIndexes: Set<number>;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    name?: string;
    section?: string;
    colorwayColors?: Array<{ colorwayIndex?: number; color?: string; pantone?: string }>;
  }>;
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    code?: string;
    name?: string;
  }>;
  const colorwayLabels = colorways.map((c, i) => c.code?.trim() || c.name?.trim() || `#${i + 1}`);

  if (bomItems.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        добавьте материалы на вкладке BOM — они появятся здесь, и операции можно будет к ним
        привязывать
      </Text>
    );
  }

  return (
    <ul className='max-h-72 space-y-1 overflow-auto'>
      {bomItems.map((b, i) => {
        const active = activeBom === i;
        const used = usedBomIndexes.has(i);
        const summary = colorwayColorSummary(b.colorwayColors, colorwayLabels);
        return (
          <li key={i}>
            <button
              type='button'
              onMouseEnter={() => onActiveBomChange(i)}
              onMouseLeave={() => onActiveBomChange(null)}
              className={cn(
                'flex w-full flex-col gap-0.5 border px-2 py-1 text-left text-sm transition-colors',
                active
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor hover:border-textColor',
              )}
            >
              <span className='flex w-full items-center justify-between gap-2'>
                <span className='truncate'>
                  {i + 1}. {b.name?.trim() || '—'}
                </span>
                <span className='shrink-0 text-xs uppercase opacity-70'>
                  {bomSectionLabels[b.section ?? ''] ?? ''}
                  {used ? ' · ✓' : ''}
                </span>
              </span>
              {summary && <span className='text-xs opacity-70'>{summary}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Construction workspace: the sketch (assembly map) and the BOM (materials) on the left, the
// general defaults and the ordered operations on the right — so a step, its place on the
// drawing, and the material it uses are all visible together, without switching tabs.
export function ConstructionTab({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as Array<{
    calloutNumber?: number;
    bomItemIndex?: number;
  }>;
  const [activePin, setActivePin] = useState<number | null>(null);
  const [activeBom, setActiveBom] = useState<number | null>(null);

  const usedPins = useMemo(
    () => new Set(operations.map((o) => o.calloutNumber || 0).filter((n) => n > 0)),
    [operations],
  );
  const usedBomIndexes = useMemo(
    () => new Set(operations.map((o) => o.bomItemIndex ?? -1).filter((i) => i >= 0)),
    [operations],
  );

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedMedia]);

  return (
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
        <Section title='materials (BOM)'>
          <ConstructionBom
            activeBom={activeBom}
            onActiveBomChange={setActiveBom}
            usedBomIndexes={usedBomIndexes}
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
  );
}
