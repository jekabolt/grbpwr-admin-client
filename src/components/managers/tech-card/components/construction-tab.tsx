import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { techCardBomSectionOptions, techCardMediaKindOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { ConstructionField } from './construction-field';
import { OperationsField } from './operations-field';
import { PieceLegend } from './piece-legend';
import { TechCardFormData } from './schema';

const mediaKindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

const bomSectionLabels: Record<string, string> = Object.fromEntries(
  techCardBomSectionOptions.map((o) => [o.value, o.label]),
);

// normalize a part name the same way the backend join does (trim + lower)
const norm = (s?: string) => (s ?? '').trim().toLowerCase();

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

type FormUsage = {
  bomLineKey?: string;
  placement?: string;
  color?: string;
  pantone?: string;
  consumption?: string;
  quantity?: string;
  sizeConsumptions?: Array<{ sizeId?: number; consumption?: string }>;
};
type FormOperation = {
  node?: string;
  placement?: string;
  bomLineKey?: string;
  operationNumber?: number;
};

// Materials of the SELECTED colourway: for each filled usage show its article, the part it
// sits on, the colour it takes here, the consumption, and which operations work that part
// (placement match) or link the article directly. Usages with no article chosen yet are
// skipped (they aren't a real material yet). Client-side mirror of the backend resolve.
function ColorwayMaterialsPanel({
  usages,
  bomItems,
  operations,
  activeBom,
  onActiveBomChange,
  onAddOperation,
}: {
  usages: FormUsage[];
  bomItems: Array<{ name?: string; section?: string; lineKey?: string }>;
  operations: FormOperation[];
  activeBom: string | null;
  onActiveBomChange: (k: string | null) => void;
  onAddOperation: (placement: string) => void;
}) {
  // only usages with a chosen article are real materials
  const filled = usages
    .map((u, ui) => ({ u, ui, bomLineKey: u.bomLineKey ?? '' }))
    .filter(({ bomLineKey }) => !!bomLineKey);

  if (filled.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        в этом колорвее нет заполненных материалов — выберите артикулы в карточке колорвея (вкладка
        colorways)
      </Text>
    );
  }

  const consumptionLabel = (u: FormUsage): string => {
    if ((u.sizeConsumptions ?? []).some((sc) => sc.consumption?.trim())) return 'по размерам';
    if (u.consumption?.trim()) return `${u.consumption} на изделие`;
    if (u.quantity?.trim()) return `${u.quantity} шт`;
    return '—';
  };

  return (
    <ul className='max-h-96 space-y-1 overflow-auto'>
      {filled.map(({ u, ui, bomLineKey }) => {
        const article = bomItems.find((b) => b.lineKey === bomLineKey);
        const colour = u.color?.trim() || u.pantone?.trim();
        const matchedOps = operations
          .map((o, oi) => ({ o, oi }))
          .filter(
            ({ o }) =>
              (norm(o.placement) && norm(o.placement) === norm(u.placement)) ||
              (o.bomLineKey && o.bomLineKey === bomLineKey),
          );
        const active = activeBom === bomLineKey;
        return (
          <li
            key={ui}
            onMouseEnter={() => onActiveBomChange(bomLineKey)}
            onMouseLeave={() => onActiveBomChange(null)}
            className={cn(
              'flex flex-col gap-0.5 border px-2 py-1 text-textBaseSize transition-colors',
              active ? 'border-textColor bg-textColor text-bgColor' : 'border-textInactiveColor',
            )}
          >
            <span className='flex items-center justify-between gap-2'>
              <span className='truncate'>
                <span className='font-semibold uppercase'>
                  {u.placement?.trim() || 'без части'}
                </span>
                {' · '}
                {article?.name?.trim() || 'артикул'}
              </span>
              <span className='shrink-0 text-textBaseSize uppercase opacity-70'>
                {bomSectionLabels[article?.section ?? ''] ?? ''}
              </span>
            </span>
            <span className='text-textBaseSize opacity-80'>
              цвет: {colour || '—'} · расход: {consumptionLabel(u)}
            </span>
            {matchedOps.length > 0 ? (
              <span className='text-textBaseSize opacity-70'>
                операции:{' '}
                {matchedOps
                  .map(({ o, oi }) => `оп.${o.operationNumber || (oi + 1) * 10}`)
                  .join(', ')}
              </span>
            ) : u.placement?.trim() ? (
              <button
                type='button'
                onClick={() => onAddOperation(u.placement!.trim())}
                className='text-left text-textBaseSize text-warning underline hover:opacity-70'
              >
                нет операций на часть «{u.placement.trim()}» — добавить операцию?
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// Construction workspace: the sketch (assembly map) and the selected colourway's materials on
// the left, the general defaults and the ordered operations on the right — so a step, its
// place on the drawing, and the real material it uses (for the chosen colourway + size) are
// visible together, without switching tabs.
export function ConstructionTab({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as Array<
    FormOperation & { calloutNumber?: number }
  >;
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    code?: string;
    name?: string;
    hex?: string;
    usages?: FormUsage[];
  }>;
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    name?: string;
    section?: string;
    lineKey?: string;
  }>;

  const [activePin, setActivePin] = useState<number | null>(null);
  const [activeBom, setActiveBom] = useState<string | null>(null);
  const [colorwayIdx, setColorwayIdx] = useState(0);
  const [addPart, setAddPart] = useState<string | null>(null);
  // Signal OperationsField to append (it owns the operations field array — a separate
  // useFieldArray here would not sync with its rendered list). The nonce makes repeated adds
  // of the same part distinct.
  const [addRequest, setAddRequest] = useState<{ placement: string; nonce: number } | null>(null);
  const confirmAddOperation = () => {
    if (addPart) setAddRequest((r) => ({ placement: addPart, nonce: (r?.nonce ?? 0) + 1 }));
    setAddPart(null);
  };

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

  const cwIdx = colorwayIdx < colorways.length ? colorwayIdx : 0;
  const selectedUsages = colorways[cwIdx]?.usages ?? [];

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
        <Section title='materials — selected colourway'>
          {colorways.length === 0 ? (
            <Text variant='inactive' size='small'>
              добавьте колорвеи и их материалы на вкладке colorways — здесь покажется реальная
              ткань/цвет/расход каждой операции
            </Text>
          ) : (
            <div className='space-y-3'>
              <Text variant='inactive' size='small'>
                предпросмотр (не редактируется) — выберите колорвей, чтобы увидеть его материалы и
                какие операции их шьют
              </Text>
              {/* colourway picker = swatch + name chips */}
              <div className='flex flex-wrap gap-2'>
                {colorways.map((c, i) => {
                  const valid = /^#?[0-9a-fA-F]{3,8}$/.test((c.hex ?? '').trim());
                  const hexCss = (c.hex ?? '').trim().startsWith('#')
                    ? (c.hex ?? '').trim()
                    : `#${(c.hex ?? '').trim()}`;
                  return (
                    <button
                      key={i}
                      type='button'
                      onClick={() => setColorwayIdx(i)}
                      className={cn(
                        'flex items-center gap-2 border px-2 py-1 text-textBaseSize transition-colors',
                        i === cwIdx
                          ? 'border-textInactiveColor ring-1 ring-textColor'
                          : 'border-textInactiveColor hover:border-textInactiveColor',
                      )}
                    >
                      <span
                        className='size-4 shrink-0 border border-textInactiveColor'
                        style={valid ? { backgroundColor: hexCss } : undefined}
                      />
                      <span className='uppercase'>
                        {c.name?.trim() || c.code?.trim() || `#${i + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <ColorwayMaterialsPanel
                usages={selectedUsages}
                bomItems={bomItems}
                operations={operations}
                activeBom={activeBom}
                onActiveBomChange={setActiveBom}
                onAddOperation={setAddPart}
              />
            </div>
          )}
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
            addRequest={addRequest}
            onAdded={() => setAddRequest(null)}
          />
        </Section>
      </div>

      <ConfirmationModal
        open={addPart != null}
        onOpenChange={(o) => {
          if (!o) setAddPart(null);
        }}
        onConfirm={confirmAddOperation}
        title='добавить операцию?'
        confirmLabel='добавить'
        cancelLabel='отмена'
      >
        <Text size='small'>
          Создать операцию для части «{addPart}»? Она появится в списке операций — заполните тип,
          машину и остальное.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
