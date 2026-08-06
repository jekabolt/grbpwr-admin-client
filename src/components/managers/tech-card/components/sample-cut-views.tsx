import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import { Row, RowTotal } from 'ui/components/row';
import Text from 'ui/components/text';
import { grainlineArrow } from './piece-codes';
import { TechCardFormData } from './schema';

// ---------------------------------------------------------------------------
// Три проекции одного и того же соединения: КАКАЯ ДЕТАЛЬ ИЗ КАКОЙ ТКАНИ.
//
// Everything here is derived from data the card already stores — cut pieces, their per-colourway
// fabric mapping, the BOM lines those point at, and the colourway recipe's consumption norms. The
// sample contributes exactly one thing: WHICH colourway, so a piece resolves to the one fabric it
// was actually cut from rather than a list of "per colourway: …".
//
// Read off the FORM, not the server copy, so an unsaved piece or a just-changed fabric mapping is
// already reflected — these are read-only views of an editable card, and a cut sheet that lags the
// pieces tab by one save is a cut sheet that gets somebody's fabric wrong.
// ---------------------------------------------------------------------------

/**
 * Fabric keys are GREYSCALE + hatch, never hue. Two reasons, both load-bearing: this admin is a
 * black-on-white console (colour carries meaning — red is loss — and is never decorative), and a
 * cut sheet is printed, usually on a mono laser at the cutting table. A key that only works on a
 * screen is not a key.
 */
const FABRIC_KEYS = [
  { fill: '#000', text: '#fff' },
  { fill: 'repeating-linear-gradient(45deg,#fff,#fff 2px,#000 2px,#000 4px)', text: '#000' },
  { fill: '#8a8a8a', text: '#fff' },
  { fill: 'repeating-linear-gradient(-45deg,#fff,#fff 3px,#000 3px,#000 4px)', text: '#000' },
  { fill: 'repeating-linear-gradient(0deg,#fff,#fff 2px,#000 2px,#000 3px)', text: '#000' },
  { fill: '#d0d0d0', text: '#000' },
] as const;

const keyStyle = (i: number) => {
  const k = FABRIC_KEYS[i % FABRIC_KEYS.length];
  return { background: k.fill, color: k.text };
};

/** The swatch itself — a bordered square carrying one fabric's key. */
export function FabricSwatch({ index, className }: { index: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={keyStyle(index)}
      className={`inline-block size-3 shrink-0 border border-textColor ${className ?? ''}`}
    />
  );
}

type FormPiece = {
  name?: string;
  piecesPerGarment?: number;
  grainline?: string;
  fused?: boolean;
  calloutNumber?: number;
  note?: string;
  lineKey?: string;
  // NOTE: `colorwayIndex` carries a colourway ID, not an index — the proto field was renamed to
  // colorwayId and the form key was deliberately left alone (see mapTechCardToForm in schema.ts).
  materials?: Array<{ colorwayIndex?: number; bomLineKey?: string; fusingBomLineKey?: string }>;
};

type FormBom = { id?: number; lineKey?: string; name?: string; unit?: string; section?: string };
type FormCallout = { number?: number; mediaId?: number; posX?: string; posY?: string };

export type CutPiece = {
  key: string;
  name: string;
  /** pieces_per_garment. The mirror flag that used to double this is gone — see GetStyleCutList. */
  total: number;
  perGarment: number;
  grainline: string;
  fused: boolean;
  calloutNumber: number;
  note: string;
  /** Index into `fabrics`; -1 when this piece has no fabric for the sample's colourway. */
  fabricIndex: number;
  fusingName: string;
};

export type CutFabric = {
  key: string;
  name: string;
  unit: string;
  /** Per-garment norm from the colourway recipe; '' when the recipe has none. */
  consumption: string;
  pieces: CutPiece[];
  cut: number;
};

export type SampleCutView = {
  ready: boolean;
  pieces: CutPiece[];
  fabrics: CutFabric[];
  /** Pieces the sample's colourway has no fabric mapping for — a real, reportable hole. */
  unmapped: CutPiece[];
  totalCut: number;
  fusedCut: number;
};

/**
 * Resolve the card's cut pieces against ONE colourway — the sample's.
 *
 * A piece with no mapping for that colourway is not dropped: it lands in `unmapped`, because
 * "this piece is cut from nothing" is exactly the defect these views exist to surface, and a
 * silently shorter list reads as a complete one.
 */
export function useSampleCutView(techCard: common_TechCard | undefined, colorwayId: number) {
  const { control } = useFormContext<TechCardFormData>();
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as FormBom[];
  const usages = useMemo(
    () => techCard?.colorways?.find((c) => c.colorwayId === colorwayId)?.usages ?? [],
    [techCard?.colorways, colorwayId],
  );

  return useMemo<SampleCutView>(() => {
    const bomByKey = new Map<string, FormBom>();
    for (const b of bomItems) if (b.lineKey) bomByKey.set(b.lineKey, b);

    const consumptionByKey = new Map<string, string>();
    for (const u of usages) {
      if (u.bomLineKey) consumptionByKey.set(u.bomLineKey, u.consumption?.value ?? '');
    }

    const fabrics: CutFabric[] = [];
    const fabricIndexByKey = new Map<string, number>();
    const out: CutPiece[] = [];

    pieces.forEach((p, i) => {
      const name = p.name?.trim();
      if (!name) return; // a blank row the operator has not filled in yet is not a cut piece
      const perGarment = p.piecesPerGarment ?? 1;
      const mine = (p.materials ?? []).find((m) => (m.colorwayIndex ?? 0) === colorwayId);
      const bomKey = mine?.bomLineKey || '';
      const bom = bomKey ? bomByKey.get(bomKey) : undefined;
      const fusing = mine?.fusingBomLineKey ? bomByKey.get(mine.fusingBomLineKey) : undefined;

      let fabricIndex = -1;
      if (bomKey && bom) {
        const existing = fabricIndexByKey.get(bomKey);
        if (existing != null) {
          fabricIndex = existing;
        } else {
          fabricIndex = fabrics.length;
          fabricIndexByKey.set(bomKey, fabricIndex);
          fabrics.push({
            key: bomKey,
            name: bom.name?.trim() || `BOM #${bom.id ?? '?'}`,
            unit: bom.unit?.trim() || '',
            consumption: consumptionByKey.get(bomKey) ?? '',
            pieces: [],
            cut: 0,
          });
        }
      }

      const piece: CutPiece = {
        key: p.lineKey || `${name}-${i}`,
        name,
        perGarment,
        total: perGarment,
        grainline: p.grainline?.trim() || '',
        fused: !!p.fused,
        calloutNumber: p.calloutNumber ?? 0,
        note: p.note?.trim() || '',
        fabricIndex,
        fusingName: fusing?.name?.trim() || '',
      };
      out.push(piece);
      if (fabricIndex >= 0) {
        fabrics[fabricIndex].pieces.push(piece);
        fabrics[fabricIndex].cut += piece.total;
      }
    });

    return {
      ready: out.length > 0,
      pieces: out,
      fabrics,
      unmapped: out.filter((p) => p.fabricIndex < 0),
      totalCut: out.reduce((s, p) => s + p.total, 0),
      fusedCut: out.reduce((s, p) => s + (p.fused ? p.total : 0), 0),
    };
  }, [pieces, bomItems, usages, colorwayId]);
}

function NoPieces({ what }: { what: string }) {
  return (
    <CalloutBox tone='note'>
      <Text size='micro'>
        this card has no cut pieces yet — add them on the colorways tab and {what} fills in on its
        own
      </Text>
    </CalloutBox>
  );
}

function NoColourway() {
  return (
    <CalloutBox tone='warning'>
      <Text size='micro'>
        this sample has no colourway, so its pieces cannot be resolved to a fabric — set one in the
        facts above
      </Text>
    </CalloutBox>
  );
}

// ---------------------------------------------------------------------------
// ДЕТАЛИ КРОЯ — one card per piece.
// ---------------------------------------------------------------------------

/**
 * The four facts that matter at the cutting table — cloth, grain, fusing, how many — one card per
 * piece, at a size you read rather than scan. A piece with no fabric for this colourway keeps its
 * card and says so instead of disappearing.
 */
export function SampleCutPieces({
  techCard,
  colorwayId,
}: {
  techCard?: common_TechCard;
  colorwayId: number;
}) {
  const view = useSampleCutView(techCard, colorwayId);

  if (!colorwayId) return <NoColourway />;
  if (!view.ready) return <NoPieces what='детали кроя' />;

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Pill tone='mut'>
          {view.pieces.length} pattern{view.pieces.length === 1 ? '' : 's'}
        </Pill>
        <Pill tone='mut'>{view.totalCut} cut</Pill>
        {view.fusedCut > 0 && <Pill tone='mut'>{view.fusedCut} fused</Pill>}
        {view.unmapped.length > 0 && (
          <Pill tone='attention'>{view.unmapped.length} without fabric</Pill>
        )}
      </div>

      <div className='flex flex-col gap-1'>
        {view.pieces.map((p) => {
          const fabric = p.fabricIndex >= 0 ? view.fabrics[p.fabricIndex] : undefined;
          const arrow = grainlineArrow(p.grainline);
          return (
            <div
              key={p.key}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border p-1.5 ${
                fabric ? 'border-borderColor' : 'border-dashed border-textInactiveColor'
              }`}
            >
              <Text component='span' size='micro' className='w-14 shrink-0 font-bold uppercase'>
                {p.name}
              </Text>
              <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
                {fabric ? (
                  <>
                    <FabricSwatch index={p.fabricIndex} />
                    <Text size='micro' variant='label' component='span' className='truncate'>
                      {fabric.name}
                    </Text>
                  </>
                ) : (
                  <Text size='micro' variant='error' component='span'>
                    no fabric mapped for this colourway
                  </Text>
                )}
                {p.grainline && (
                  <Text size='nano' variant='label' component='span' className='uppercase'>
                    · {arrow ? `${arrow} ` : ''}
                    {p.grainline}
                  </Text>
                )}
                {p.fused && (
                  <Text size='nano' variant='label' component='span' className='uppercase'>
                    · fused{p.fusingName ? ` (${p.fusingName})` : ''}
                  </Text>
                )}
                {p.calloutNumber > 0 && (
                  <Text size='nano' variant='label' component='span' className='uppercase'>
                    · callout {p.calloutNumber}
                  </Text>
                )}
              </span>
              <span className='shrink-0 text-right'>
                <Text component='span' size='micro' className='tabular-nums'>
                  ×{p.total}
                </Text>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CUT LIST — the ticket that goes to the table and comes back.
// ---------------------------------------------------------------------------

/**
 * The one view here that leaves the building. Grouped by cloth, because that is how cutting is
 * actually batched — lay one fabric, cut everything that comes out of it, move on — and closed with
 * a return leg: blanks for what was really laid, which is the number the write-off sheet otherwise
 * asks an operator to invent.
 *
 * `print` opens the browser's own dialog: this is a document, and the browser already owns the
 * paper size, the margins and the printer.
 */
export function SampleCutTicket({
  techCard,
  colorwayId,
  sampleNumber,
  sampleLabel,
  sizeName,
  colorwayName,
}: {
  techCard?: common_TechCard;
  colorwayId: number;
  sampleNumber?: number;
  sampleLabel: string;
  sizeName: string;
  colorwayName: string;
}) {
  const view = useSampleCutView(techCard, colorwayId);
  const styleNumber = techCard?.techCard?.styleNumber?.trim() || '';
  const styleName = techCard?.techCard?.name?.trim() || '';

  if (!colorwayId) return <NoColourway />;
  if (!view.ready) return <NoPieces what='the cut list' />;

  return (
    <div className='flex flex-col gap-2'>
      <div className='border border-textColor p-2.5' data-print-region='cut-ticket'>
        <div className='grid grid-cols-2 gap-2.5 border-b border-textColor pb-2 sm:grid-cols-4'>
          <TicketFact
            label='tech card'
            value={[styleNumber, styleName].filter(Boolean).join(' · ')}
          />
          <TicketFact label='sample' value={`#${sampleNumber ?? '?'} · ${sampleLabel}`} />
          <TicketFact label='size / colourway' value={`${sizeName} · ${colorwayName}`} />
          <TicketFact label='pieces to cut' value={`${view.totalCut}`} />
        </div>

        <div className='mt-2 flex flex-col gap-2.5'>
          {view.fabrics.map((f, fi) => (
            <div key={f.key}>
              <div className='flex items-center gap-1.5 border-b border-textColor pb-0.5'>
                <FabricSwatch index={fi} />
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='group'
                  component='span'
                  className='font-bold'
                >
                  {f.name}
                </Text>
                <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
                  {f.cut} cut
                </Text>
              </div>
              {f.pieces.map((p) => (
                <Row
                  key={p.key}
                  label={
                    <span>
                      <b>{p.name}</b>
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        {' '}
                        {[
                          p.grainline ? `${grainlineArrow(p.grainline)} ${p.grainline}` : '',
                          p.fused ? 'fused' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </span>
                  }
                  value={`×${p.total}`}
                />
              ))}
            </div>
          ))}

          {view.unmapped.length > 0 && (
            <div>
              <div className='border-b border-error pb-0.5'>
                <Text size='micro' variant='error' component='span' className='font-bold uppercase'>
                  no fabric mapped — do not cut
                </Text>
              </div>
              {view.unmapped.map((p) => (
                <Row key={p.key} label={p.name} value='—' tone='error' />
              ))}
            </div>
          )}

          <RowTotal
            label={`${view.pieces.length} patterns · ${view.fusedCut} fused`}
            value={`${view.totalCut} to cut`}
          />
        </div>

        {/* The return leg. The norm on the left is what the recipe says; the blank on the right is
            what the cutter writes down, and it is the number the write-off sheet then asks for. */}
        <div className='mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2'>
          <div>
            <GroupLabel>cloth to lay — from the recipe</GroupLabel>
            {view.fabrics.map((f, fi) => (
              <Row
                key={f.key}
                label={
                  <span className='flex items-center gap-1.5'>
                    <FabricSwatch index={fi} />
                    {f.name}
                  </span>
                }
                value={
                  f.consumption ? `${f.consumption}${f.unit ? ` ${f.unit}` : ''}` : <EmptyCell />
                }
              />
            ))}
          </div>
          <div>
            <GroupLabel>actually used — fill in</GroupLabel>
            {view.fabrics.map((f) => (
              <Row key={f.key} label={f.name} value='__________' />
            ))}
            <div className='mt-6 border-t border-textColor pt-1'>
              <Text size='nano' variant='label' className='uppercase'>
                cut by / date
              </Text>
            </div>
          </div>
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => window.print()}
          className='cursor-pointer border border-borderColor px-2.5 py-1 text-micro uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor'
        >
          print
        </button>
        <Text size='nano' variant='label' component='span' className='uppercase'>
          norms are per garment, from this colourway’s recipe
        </Text>
      </div>
    </div>
  );
}

function TicketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <Text size='nano' variant='label' tracking='group' className='uppercase'>
        {label}
      </Text>
      <Text size='micro' className='truncate'>
        {value || '—'}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FABRIC MAP — the sketch, keyed by cloth.
// ---------------------------------------------------------------------------

const decimalNum = (v?: string): number => {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Frame the sketch to the MEDIA's own ratio, never a fixed one. Callout positions are normalised
 * against the picture, so a letterboxed or cropped frame moves every marker off the thing it
 * points at — the same reason the sketch grid sizes its tiles this way.
 */
export function mediaAspect(full: common_MediaFull | undefined, fallback = '3/4'): string {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : fallback;
}

/**
 * Which cloth goes where, drawn on the card's own technical sketch.
 *
 * The anatomy is NOT invented: a piece is placed only where it is pinned to a sketch callout
 * (piece.callout_number → callout.pos_x/pos_y), which is real stored geometry. Pieces with no
 * callout are listed beside the drawing as unplaced rather than scattered onto it at made-up
 * coordinates — a map that guesses where a piece is, is worse than one that admits it doesn't know.
 */
export function SampleFabricMap({
  techCard,
  colorwayId,
}: {
  techCard?: common_TechCard;
  colorwayId: number;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const view = useSampleCutView(techCard, colorwayId);

  const { sketch, placed } = useMemo(() => {
    const byNumber = new Map<number, FormCallout>();
    for (const c of callouts) if (c.number) byNumber.set(c.number, c);

    const marks = view.pieces
      .map((p) => ({ p, c: p.calloutNumber ? byNumber.get(p.calloutNumber) : undefined }))
      .filter((m): m is { p: CutPiece; c: FormCallout } => !!m.c && !!m.c.mediaId);

    // Draw the sketch that carries the most placed pieces — with several views (front / back /
    // detail) that is the one the map is actually about.
    const countByMedia = new Map<number, number>();
    for (const m of marks) {
      const id = m.c.mediaId as number;
      countByMedia.set(id, (countByMedia.get(id) ?? 0) + 1);
    }
    let bestId = 0;
    let best = 0;
    for (const [id, n] of countByMedia) {
      if (n > best) {
        best = n;
        bestId = id;
      }
    }

    const resolved = (techCard?.resolvedTechnicalMedia ?? [])
      .map((rm) => rm.media)
      .filter((m): m is common_MediaFull => !!m?.id);
    const chosen = bestId ? resolved.find((m) => m.id === bestId) : resolved[0];

    return {
      sketch: chosen,
      placed: marks.filter((m) => m.c.mediaId === (chosen?.id ?? 0)),
    };
  }, [callouts, view.pieces, techCard?.resolvedTechnicalMedia]);

  if (!colorwayId) return <NoColourway />;
  if (!view.ready) return <NoPieces what='the fabric map' />;

  const url = sketch?.media?.fullSize?.mediaUrl || sketch?.media?.thumbnail?.mediaUrl || '';
  const unplaced = view.pieces.filter((p) => !placed.some((m) => m.p.key === p.key));

  return (
    <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]'>
      <div>
        {url ? (
          <div className='relative border border-borderColor'>
            <Media src={url} alt='technical sketch' aspectRatio={mediaAspect(sketch)} fit='cover' />
            {placed.map(({ p, c }) => {
              const x = decimalNum(c.posX);
              const y = decimalNum(c.posY);
              if (Number.isNaN(x) || Number.isNaN(y)) return null;
              return (
                <span
                  key={p.key}
                  title={`${p.name} — ${
                    p.fabricIndex >= 0 ? view.fabrics[p.fabricIndex].name : 'no fabric'
                  }`}
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    ...(p.fabricIndex >= 0
                      ? keyStyle(p.fabricIndex)
                      : { background: '#fff', color: '#000' }),
                  }}
                  className='absolute -translate-x-1/2 -translate-y-1/2 border border-textColor px-1 py-px text-nano uppercase leading-none'
                >
                  {p.name}
                </span>
              );
            })}
          </div>
        ) : (
          <Placeholder aspect='3/4' label='no technical sketch' />
        )}
        <Text size='nano' variant='label' className='mt-1 uppercase'>
          {placed.length} of {view.pieces.length} pieces pinned to a callout
        </Text>
      </div>

      <div>
        <GroupLabel>fabrics on this sample</GroupLabel>
        {view.fabrics.map((f, fi) => (
          <div
            key={f.key}
            className='flex items-start justify-between gap-2.5 border-b border-hairline py-1'
          >
            <span className='flex min-w-0 items-start gap-1.5'>
              <FabricSwatch index={fi} className='mt-0.5' />
              <span className='min-w-0'>
                <Text size='micro' component='span'>
                  {f.name}
                </Text>
                <Text size='nano' variant='label' className='uppercase'>
                  {f.pieces.map((p) => `${p.name}×${p.total}`).join(' · ')}
                </Text>
              </span>
            </span>
            <span className='shrink-0 text-right tabular-nums'>
              <Text size='micro' component='span'>
                {f.consumption ? `${f.consumption}${f.unit ? ` ${f.unit}` : ''}` : '—'}
              </Text>
              <Text size='nano' variant='label' className='uppercase'>
                per garment
              </Text>
            </span>
          </div>
        ))}

        {view.unmapped.length > 0 && (
          <div className='mt-1.5'>
            <CalloutBox tone='warning'>
              <Text size='micro'>
                {view.unmapped.map((p) => p.name).join(', ')} — no fabric on this colourway. Map
                them on the colourways tab, or they cannot be cut.
              </Text>
            </CalloutBox>
          </div>
        )}

        {unplaced.length > 0 && (
          <Text size='nano' variant='label' className='mt-1.5 uppercase'>
            not on the drawing: {unplaced.map((p) => p.name).join(' · ')} — pin a sketch callout to
            a piece to place it
          </Text>
        )}
      </div>
    </div>
  );
}
