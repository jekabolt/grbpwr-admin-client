import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { techCardMediaKindOptions } from 'constants/filter';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Canvas, Pin } from 'ui/components/canvas';
import { Chip, ChipRow } from 'ui/components/chip';
import { SectionHeader } from 'ui/components/section-header';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { ConstructionField } from './construction-field';
import { OperationsField } from './operations-field';
import { PieceLegend } from './piece-legend';
import { TechCardFormData } from './schema';
import { useCrossHighlight } from './useCrossHighlight';

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

// The four real construction zones (UNKNOWN is the untagged default, not a zone to cover).
const TOTAL_CONSTRUCTION_ZONES = 4;

export type SummaryOp = { calloutNumber?: number; timeNorm?: string; smv?: string; zone?: string };

// The minutes ONE operation contributes to total SAM, exactly as the server computes it
// (dto.operationMinutes: SMV when the operation carries one, else the time norm). This summary
// used to sum `timeNorm` alone, so every operation with a measured SMV was counted at its estimate
// — or, with only an SMV entered, at nothing at all — and the implied €/min derived from it was
// wrong in the direction that flatters the rate.
//
// parseDecimalNumber, not parseFloat: these fields are typed through DecimalField, which accepts a
// comma decimal separator. parseFloat('1,8') is 1, so a card entered in the Russian layout lost
// ~44% of every such operation's minutes here while the operations editor's own total (which
// already used parseDecimalNumber) showed 1.8. Two totals for one column, one of them silently low.
export function operationMinutes(o: SummaryOp): number {
  // "Set" means parseable, exactly as SMV.Valid means non-NULL server-side — an explicit 0 SMV
  // counts as zero minutes there and here, it does not fall back to the estimate.
  const smv = parseDecimalNumber(o.smv);
  if (Number.isFinite(smv)) return smv;
  const sam = parseDecimalNumber(o.timeNorm);
  return Number.isFinite(sam) ? sam : 0;
}

// Summary lead (config pick: Summary B) — the at-a-glance overview the tab lacked: how many
// operations, total SAM (feeds costing), how many assembly zones are tagged, and how many steps
// still have no place on the sketch. Sits above the assembly workspace.
//
// The SAM → money line underneath connects the minutes to the only rate the card actually holds:
// costing.cmt_cost is a per-GARMENT CMT figure, so the derived number is the implied €/min rather
// than a stored rate. Read-only, and rendered only when that cost exists (it is nulled on read for
// an account without costing:read, so this line simply does not appear for them).
//
// It subscribes to the whole `operations` array ITSELF rather than taking it as a prop: that array
// changes on every keystroke in the assembly editor, and holding the subscription in the tab
// re-rendered the sketch, the legend and the entire operations rail along with it.
function ConstructionSummary() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];

  const opCount = operations.length;
  const totalSam = operations.reduce((s, o) => s + operationMinutes(o), 0);
  const zonesCovered = new Set(
    operations.map((o) => o.zone).filter((z) => z && z !== 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN'),
  ).size;
  const unpinned = operations.filter((o) => !(o.calloutNumber && o.calloutNumber > 0)).length;

  // The SAM → money readout (implied ₽/min from cmt_cost) moved to the costing tab's labour band
  // (Phase 3, plan 11): money reads next to the CMT input it derives from, minutes stay here.
  return (
    <div>
      <StatGrid min={130}>
        <Stat label='operations' value={opCount} />
        {/* The sub names the rule, because the operations rail below closes with a plain sum of the
            SAM column and the two figures legitimately differ on any card with measured SMVs. */}
        <Stat
          label='total SAM'
          value={`${totalSam.toFixed(1)} мин`}
          sub='smv else sam · feeds costing'
        />
        <Stat label='zones covered' value={`${zonesCovered} / ${TOTAL_CONSTRUCTION_ZONES}`} />
        <Stat
          label='unpinned ops'
          value={unpinned}
          sub='no sketch pin'
          tone={unpinned > 0 ? 'down' : 'default'}
        />
      </StatGrid>
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
// map and the steps live on one screen. Pins are positioned against the IMAGE's own box, not a
// fixed-aspect frame: callout posX/posY are fractions of the image, so letterboxing would slide
// every pin off the detail it names.
function ConstructionSketch({
  mediaById,
  activePin,
  onActivePinChange,
}: {
  mediaById: Map<number, common_MediaFull>;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  // Which pins an operation actually claims — computed here, for the same reason the summary
  // watches its own array: this subscription must not sit in the tab above the operations editor.
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];
  const usedPins = useMemo(
    () => new Set(operations.map((o) => o.calloutNumber || 0).filter((n) => n > 0)),
    [operations],
  );
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
      <div className='flex flex-col gap-1'>
        <Canvas aspect='3/4' className='flex items-center justify-center'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='px-2 text-center uppercase'
          >
            нет тех. эскиза
          </Text>
        </Canvas>
        <Text size='micro' variant='label'>
          добавьте технический эскиз на вкладке sketch и расставьте на нём пины — здесь он покажется
          рядом с операциями
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1.5'>
      {views.length > 1 && (
        <ChipRow>
          {views.map((v) => (
            <Chip
              key={v.mediaId}
              selected={v.mediaId === activeViewId}
              pressed={v.mediaId === activeViewId}
              onClick={() => setViewId(v.mediaId)}
            >
              {mediaKindLabels[v.kind ?? ''] ?? 'view'}
            </Chip>
          ))}
        </ChipRow>
      )}

      <div className='relative w-full border border-borderColor'>
        <img src={url} alt='sketch' draggable={false} className='block w-full select-none' />
        {callouts.map((c, idx) => {
          if (c.mediaId !== activeViewId) return null;
          const x = parseFloat(c.posX ?? '');
          const y = parseFloat(c.posY ?? '');
          if (Number.isNaN(x) || Number.isNaN(y)) return null;
          const num = c.number || 0;
          const used = num > 0 && usedPins.has(num);
          return (
            <Pin
              key={idx}
              x={x * 100}
              y={y * 100}
              label={num || idx + 1}
              highlighted={!!activePin && num === activePin && num > 0}
              title={`#${num || idx + 1}${c.part?.trim() ? ` · ${c.part.trim()}` : ''}${
                used ? '' : ' · не привязан к операции'
              }`}
              onMouseEnter={() => num > 0 && onActivePinChange(num)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>

      <Text size='micro' variant='label'>
        наведите на операцию — её пин подсветится (и наоборот)
      </Text>
    </div>
  );
}

// Construction workspace: the sketch (assembly map) on the left, the general finishing defaults
// and the ordered operations on the right — so a step and its place on the drawing are visible
// together, without switching tabs. Colourway / material selection lives on the colorways tab;
// this tab is about HOW the garment goes together, not which fabric or colour.
export function ConstructionTab({ techCard }: { techCard?: common_TechCard }) {
  // Deliberately NOT watching `operations` here. The summary and the sketch each hold their own
  // subscription, so a keystroke in the assembly editor re-renders those two leaves instead of
  // this whole workspace (and with it every row of the sequence rail).

  // Sketch pin ↔ operation and BOM line ↔ operation are the same mechanism, so both come from the
  // shared hook the pieces tab reuses for its mini-diagram.
  const pin = useCrossHighlight<number>();
  const bom = useCrossHighlight<string>();

  // The assembly map pins onto the technical sketches (callouts live there).
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  return (
    <div className='flex flex-col gap-3.5'>
      <ConstructionSummary />

      {/* The sketch is a reference, not the work: a fixed 320px column reads it fine and leaves the
          assembly sequence the rest of the screen. At 2/5 the drawing was 640px wide on a 1600px
          display with ~3000px of empty ground under it, while the operations were squeezed. */}
      <div className='flex flex-col gap-3.5 lg:flex-row lg:items-start'>
        <div className='w-full space-y-2.5 lg:sticky lg:top-36 lg:w-[320px] lg:shrink-0'>
          <section className='border border-borderColor bg-bgColor p-4'>
            <SectionHeader
              title='sketch — assembly map'
              question='— hovering an operation lights its pin, and the other way round'
            />
            <ConstructionSketch
              mediaById={mediaById}
              activePin={pin.active}
              onActivePinChange={pin.setActive}
            />
          </section>
          <PieceLegend />
        </div>

        <div className='flex w-full min-w-0 flex-col gap-2.5 lg:flex-1'>
          <ConstructionField />
          <section className='border border-borderColor bg-bgColor p-4'>
            <SectionHeader
              title='operations — assembly order'
              question='— zone, seam type, allowance, stitch density, needle, thread, SAM'
            />
            <OperationsField
              activePin={pin.active}
              onActivePinChange={pin.setActive}
              activeBom={bom.active}
              onActiveBomChange={bom.setActive}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
