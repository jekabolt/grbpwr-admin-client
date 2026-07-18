import { cn } from 'lib/utility';
import Tooltip from 'ui/components/tooltip';
import Text from 'ui/components/text';

// Placement / attachment pictograms for the LABELS & PKG tab, mirroring
// model/measurement-pictograms.tsx: ONE clean garment silhouette drawn faint, plus a single bold
// marker at the spot a label sits (from its `placement`) and a small geometric glyph for HOW it is
// attached (sewn into a seam, topstitched, heat-transferred, hung as a swing-tag, stickered, or
// pinned). Everything is `currentColor` + geometric primitives — no hand-drawn scenes, no sketch
// filters — so the set stays consistent and follows the surrounding text colour.
//
// Matching is deliberately tolerant: placement/attachment are guided-but-open ComboFields
// (Russian defaults, English aliases), so a normalised string is substring-matched to a region /
// method and falls back to a neutral "not pinned" mark rather than throwing on an unknown value.

type PlacementRegion =
  | 'neck'
  | 'sideLeft'
  | 'sideRight'
  | 'waistband'
  | 'pocket'
  | 'lining'
  | 'hem'
  | 'sleeve'
  | 'chest';

type AttachmentMethod = 'seam' | 'topstitch' | 'heat' | 'hangtag' | 'sticker' | 'pinned';

// A simple crew-neck top, one closed outline in a 0..64 (w) / 0..72 (h) box — the same "one faint
// base body + one bold highlight" idea the measurement pictograms use, but a garment instead of a
// mannequin since labels live ON the garment.
const GARMENT_D =
  'M26,9 L23,11 L11,16 L14,26 L22,23 L20,61 L44,61 L42,23 L50,26 L53,16 L41,11 L38,9 Q32,13 26,9 Z';

type DotMark = { kind: 'dot'; cx: number; cy: number };
type BandMark = { kind: 'band'; y: number; x1: number; x2: number };
type RingMark = { kind: 'ring'; cx: number; cy: number; r: number };
type Mark = DotMark | BandMark | RingMark;

// Where each region's marker lands on the silhouette above. Side seams are mirrored L/R; the
// waistband and hem are horizontal bands; the lining is a dashed ring (an inside layer, not a
// point on the shell).
const PLACEMENT_MARKS: Record<PlacementRegion, Mark> = {
  neck: { kind: 'dot', cx: 32, cy: 12.5 },
  sideLeft: { kind: 'dot', cx: 20, cy: 40 },
  sideRight: { kind: 'dot', cx: 44, cy: 40 },
  waistband: { kind: 'band', y: 50, x1: 21, x2: 43 },
  pocket: { kind: 'dot', cx: 25, cy: 46 },
  lining: { kind: 'ring', cx: 32, cy: 35, r: 6 },
  hem: { kind: 'band', y: 59, x1: 21, x2: 43 },
  sleeve: { kind: 'dot', cx: 12.5, cy: 20 },
  chest: { kind: 'dot', cx: 32, cy: 29 },
};

const includesAny = (s: string, subs: string[]) => subs.some((x) => s.includes(x));

// Free-text placement -> region. null = empty or unrecognised (a valid custom placement we don't
// have a spot for) -> the component renders a neutral "not pinned" mark instead.
export function resolvePlacementRegion(placement?: string): PlacementRegion | null {
  const s = (placement ?? '').toLowerCase();
  if (!s.trim()) return null;
  if (includesAny(s, ['подклад', 'lining'])) return 'lining';
  if (includesAny(s, ['карман', 'pocket'])) return 'pocket';
  if (includesAny(s, ['пояс', 'waist'])) return 'waistband';
  if (includesAny(s, ['подгиб', 'подол', 'низ издел', 'hem'])) return 'hem';
  if (includesAny(s, ['рукав', 'манжет', 'sleeve', 'cuff'])) return 'sleeve';
  if (includesAny(s, ['горлов', 'ворот', 'neck', 'collar'])) return 'neck';
  if (includesAny(s, ['бок', 'шов', 'side', 'seam'])) {
    if (includesAny(s, ['лев', 'left'])) return 'sideLeft';
    if (includesAny(s, ['прав', 'right'])) return 'sideRight';
    return 'sideRight';
  }
  return null;
}

// Free-text attachment -> method. null = empty or unrecognised -> a dashed "?" glyph.
export function resolveAttachment(attachment?: string): AttachmentMethod | null {
  const s = (attachment ?? '').toLowerCase();
  if (!s.trim()) return null;
  if (includesAny(s, ['подвес', 'обвес', 'навесн', 'hangtag', 'swing', 'loop'])) return 'hangtag';
  if (includesAny(s, ['термо', 'heat', 'transfer', 'печат', 'fus'])) return 'heat';
  if (includesAny(s, ['стикер', 'наклей', 'sticker', 'label sticker'])) return 'sticker';
  if (includesAny(s, ['булав', 'пришпил', 'приколот', 'pin'])) return 'pinned';
  if (includesAny(s, ['настроч', 'пристроч', 'topstitch'])) return 'topstitch';
  if (includesAny(s, ['втача', 'вшит', 'пришит', 'шов', 'seam', 'sewn', 'stitch'])) return 'seam';
  return null;
}

const hangPoint = (mark: Mark | null): [number, number] => {
  if (!mark) return [32, 12.5];
  if (mark.kind === 'band') return [(mark.x1 + mark.x2) / 2, mark.y];
  return [mark.cx, mark.cy];
};

// A swing-tag hanging from (x, y): the attach dot, a short string, and a pointed tag with a hole.
function HangingTag({ x, y }: { x: number; y: number }) {
  return (
    <g stroke='currentColor' strokeWidth={1.6} strokeLinejoin='round' strokeLinecap='round'>
      <circle cx={x} cy={y} r={2} fill='currentColor' stroke='none' />
      <line x1={x} y1={y} x2={x} y2={y + 5} />
      <path
        d={`M${x},${y + 5} L${x + 4},${y + 9} L${x + 4},${y + 18} L${x - 4},${y + 18} L${x - 4},${y + 9} Z`}
        fill='none'
      />
      <circle cx={x} cy={y + 9.5} r={1} fill='currentColor' stroke='none' />
    </g>
  );
}

// The bold highlight for the resolved placement, drawn over the faint garment. If the label is
// hung (a swing-tag / обвес) we draw the tag at the placement point so the picture literally shows
// it hanging there; otherwise a filled dot (point), a ticked band (waistband / hem), a dashed ring
// (lining), or a dashed "not pinned" ring for an unknown/empty placement.
function PlacementMark({
  region,
  method,
}: {
  region: PlacementRegion | null;
  method: AttachmentMethod | null;
}) {
  const mark = region ? PLACEMENT_MARKS[region] : null;

  if (method === 'hangtag') {
    const [hx, hy] = hangPoint(mark);
    return <HangingTag x={hx} y={hy} />;
  }

  if (!mark) {
    return (
      <ellipse
        cx={32}
        cy={33}
        rx={6}
        ry={6}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.6}
        strokeDasharray='3 2'
        opacity={0.7}
      />
    );
  }

  switch (mark.kind) {
    case 'dot':
      return <circle cx={mark.cx} cy={mark.cy} r={3.4} fill='currentColor' />;
    case 'band':
      return (
        <g stroke='currentColor' strokeWidth={2.4} strokeLinecap='round'>
          <line x1={mark.x1} y1={mark.y} x2={mark.x2} y2={mark.y} />
          <line x1={mark.x1} y1={mark.y - 2.5} x2={mark.x1} y2={mark.y + 2.5} />
          <line x1={mark.x2} y1={mark.y - 2.5} x2={mark.x2} y2={mark.y + 2.5} />
        </g>
      );
    case 'ring':
      return (
        <ellipse
          cx={mark.cx}
          cy={mark.cy}
          rx={mark.r}
          ry={mark.r - 1}
          fill='none'
          stroke='currentColor'
          strokeWidth={1.8}
          strokeDasharray='3 2'
        />
      );
  }
}

// The full garment pictogram: faint silhouette + one bold placement/attachment highlight.
export function LabelPlacementPictogram({
  placement,
  attachment,
  className,
}: {
  placement?: string;
  attachment?: string;
  className?: string;
}) {
  const region = resolvePlacementRegion(placement);
  const method = resolveAttachment(attachment);
  return (
    <svg
      viewBox='0 0 64 72'
      className={cn('h-14 w-11', className)}
      aria-hidden='true'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d={GARMENT_D}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.4}
        strokeLinejoin='round'
        strokeLinecap='round'
        opacity={0.35}
      />
      <PlacementMark region={region} method={method} />
    </svg>
  );
}

// A small monochrome glyph for the attachment method — used as the badge's corner chip and again,
// larger, in the tooltip so the method reads without decoding the silhouette.
export function AttachmentGlyph({
  attachment,
  className,
}: {
  attachment?: string;
  className?: string;
}) {
  const method = resolveAttachment(attachment);
  return (
    <svg
      viewBox='0 0 24 24'
      className={cn('h-5 w-5', className)}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.7}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      xmlns='http://www.w3.org/2000/svg'
    >
      {method === 'seam' && (
        <>
          <line x1={12} y1={4} x2={12} y2={20} />
          <path d='M9,7 L15,9 M9,11 L15,13 M9,15 L15,17' />
        </>
      )}
      {method === 'topstitch' && (
        <rect x={5} y={5} width={14} height={14} rx={1} strokeDasharray='2.4 2' />
      )}
      {method === 'heat' && (
        <>
          <rect x={6} y={10} width={12} height={9} rx={1} fill='currentColor' stroke='none' />
          <path d='M9,7 C9,5 11,5 11,3 M13,7 C13,5 15,5 15,3' />
        </>
      )}
      {method === 'hangtag' && (
        <>
          <circle cx={12} cy={5} r={2} />
          <line x1={12} y1={7} x2={12} y2={9} />
          <path d='M12,9 L16,12 L16,20 L8,20 L8,12 Z' />
          <circle cx={12} cy={12.5} r={1} fill='currentColor' stroke='none' />
        </>
      )}
      {method === 'sticker' && (
        <>
          <path d='M5,5 L15,5 L19,9 L19,19 L5,19 Z' />
          <path d='M15,5 L15,9 L19,9' />
        </>
      )}
      {method === 'pinned' && (
        <>
          <line x1={7} y1={17} x2={16} y2={8} />
          <line x1={7} y1={17} x2={6} y2={18} />
          <circle cx={17} cy={7} r={2} fill='currentColor' stroke='none' />
        </>
      )}
      {method === null && <circle cx={12} cy={12} r={6} strokeDasharray='3 2' opacity={0.6} />}
    </svg>
  );
}

// Inline badge shown beside a label's placement field (the trigger), with a hover/focus tooltip
// that enlarges the pictogram and spells out the placement + attachment text — mirroring how the
// measurement pictograms surface on the model editor. Wrap the list in a <TooltipProvider>.
export function LabelPlacementBadge({
  placement,
  attachment,
}: {
  placement?: string;
  attachment?: string;
}) {
  const placementText = placement?.trim() || 'placement not set';
  const attachmentText = attachment?.trim() || 'attachment not set';
  return (
    <Tooltip
      side='left'
      trigger={
        <button
          type='button'
          aria-label={`placement: ${placementText}; attachment: ${attachmentText}`}
          className='relative flex h-14 w-12 shrink-0 items-center justify-center border border-textInactiveColor bg-textColor/5 text-textColor focus:outline-none focus-visible:border-textColor'
        >
          <LabelPlacementPictogram
            placement={placement}
            attachment={attachment}
            className='h-12 w-9'
          />
          <span className='absolute -bottom-px -right-px flex h-4 w-4 items-center justify-center border border-textInactiveColor bg-bgColor text-textColor'>
            <AttachmentGlyph attachment={attachment} className='h-3 w-3' />
          </span>
        </button>
      }
    >
      <div className='flex w-44 flex-col items-center gap-2'>
        <LabelPlacementPictogram
          placement={placement}
          attachment={attachment}
          className='h-24 w-[4.5rem]'
        />
        <div className='flex items-center gap-1.5'>
          <AttachmentGlyph attachment={attachment} className='h-4 w-4' />
          <Text size='small'>{attachmentText}</Text>
        </div>
        <Text variant='inactive' size='small' className='text-center leading-tight'>
          {placementText}
        </Text>
      </div>
    </Tooltip>
  );
}

// Small "where it goes" glyphs for the completeness checklist tiles: a sewn-in fabric label, a
// swing-tag, a polybag, a greeting card dropped in an open box, and a drawstring dust bag. Clean
// geometric icons (currentColor), consistent with the attachment glyphs above.
export type SpecGlyphKind = 'label' | 'hangtag' | 'polybag' | 'greetingCard' | 'dustBag';

export function SpecGlyph({ kind, className }: { kind: SpecGlyphKind; className?: string }) {
  return (
    <svg
      viewBox='0 0 28 24'
      className={cn('h-5 w-6', className)}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.6}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      xmlns='http://www.w3.org/2000/svg'
    >
      {kind === 'label' && (
        <>
          <rect x={7} y={6} width={14} height={12} rx={1} />
          <line x1={9} y1={9} x2={19} y2={9} strokeDasharray='2 1.6' />
          <line x1={14} y1={6} x2={14} y2={18} opacity={0.4} />
        </>
      )}
      {kind === 'hangtag' && (
        <>
          <circle cx={14} cy={4} r={2} />
          <line x1={14} y1={6} x2={14} y2={8} />
          <path d='M14,8 L18,11 L18,19 L10,19 L10,11 Z' />
          <circle cx={14} cy={11.5} r={1} fill='currentColor' stroke='none' />
        </>
      )}
      {kind === 'polybag' && (
        <>
          <rect x={6} y={4} width={16} height={16} rx={1.5} />
          <line x1={8} y1={7} x2={20} y2={7} strokeDasharray='2 1.6' />
          <path d='M11,10 L17,10 L17,17 L11,17 Z' />
          <path d='M12.5,10 L14,12 L15.5,10' />
        </>
      )}
      {kind === 'greetingCard' && (
        <>
          <path d='M5,13 L23,13 L23,21 L5,21 Z' />
          <path d='M5,13 L2,9 M23,13 L26,9' />
          <rect x={10} y={3} width={8} height={11} rx={0.5} />
          <line x1={12} y1={7} x2={16} y2={7} />
          <line x1={12} y1={9.5} x2={16} y2={9.5} />
        </>
      )}
      {kind === 'dustBag' && (
        <>
          <path d='M9,11 L9,17 Q9,21 13,21 L15,21 Q19,21 19,17 L19,11 Z' />
          <line x1={9} y1={11} x2={19} y2={11} />
          <path d='M11,11 C10,8 8,8 8,6 M17,11 C18,8 20,8 20,6' />
          <circle cx={8} cy={6} r={1} fill='currentColor' stroke='none' />
          <circle cx={20} cy={6} r={1} fill='currentColor' stroke='none' />
        </>
      )}
    </svg>
  );
}
