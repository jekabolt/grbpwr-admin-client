import { BACKDROP_OPACITY, DASH, LINE } from 'components/shared/icon-line';
import type { JSX } from 'react';

type PictogramSlot = {
  family: 'fabric' | 'hardware';
  kind: string;
  section: string;
  name: string;
};

export type TrimPictogramKind =
  | 'fabric'
  | 'button'
  | 'zipper'
  | 'zipper-pull'
  | 'label'
  | 'snap'
  | 'buckle'
  | 'eyelet'
  | 'cord'
  | 'velcro'
  | 'rivet'
  | 'packaging'
  | 'artwork'
  | 'generic';

const has = (words: string, pattern: RegExp): boolean => pattern.test(words);

/** BOM vocabulary first, human-entered name second, with a generic trim as the honest fallback. */
export function trimPictogramKind(slot: PictogramSlot): TrimPictogramKind {
  if (slot.family === 'fabric') return 'fabric';
  // Artwork (round 7) is keyed by its BOM section, as the slot itself is (`isArtworkSlot`).
  if (slot.section === 'TECH_CARD_BOM_SECTION_DECORATION') return 'artwork';
  const words = `${slot.kind} ${slot.section} ${slot.name}`.toLowerCase();
  if (has(words, /zipper[_\s-]*(slider|pull)|zip[_\s-]*pull/)) return 'zipper-pull';
  if (has(words, /zipper|\bzip\b/)) return 'zipper';
  if (has(words, /button/)) return 'button';
  if (has(words, /rivet/)) return 'rivet';
  if (has(words, /eyelet|grommet|d-ring|\bring\b/)) return 'eyelet';
  if (has(words, /buckle|adjuster/)) return 'buckle';
  if (has(words, /snap|press[_\s-]*stud|\bpress\b|\bstud\b/)) return 'snap';
  if (has(words, /hook[_\s-]*loop|velcro|hook and loop/)) return 'velcro';
  if (has(words, /drawcord|cord|elastic|webbing|piping|binding|\btape\b/)) return 'cord';
  if (has(words, /label|hangtag|hang tag|\btag\b|sticker/)) return 'label';
  if (has(words, /packaging|polybag|poly bag|carton|\bbox\b|\bbag\b|garment case|tissue/)) {
    return 'packaging';
  }
  return 'generic';
}

function Picture({ kind }: { kind: TrimPictogramKind }): JSX.Element {
  switch (kind) {
    case 'fabric':
      return (
        <>
          <path {...LINE} d='M14 18h27c5 0 9 4 9 9s-4 9-9 9H18c-4 0-7 3-7 7s3 7 7 7h27' />
          <circle {...LINE} cx='41' cy='27' r='4' />
          <path {...LINE} d='M18 36v14M45 36v14' />
        </>
      );
    case 'button':
      return (
        <>
          <circle {...LINE} cx='32' cy='32' r='18' />
          <circle {...LINE} cx='26' cy='26' r='2' />
          <circle {...LINE} cx='38' cy='26' r='2' />
          <circle {...LINE} cx='26' cy='38' r='2' />
          <circle {...LINE} cx='38' cy='38' r='2' />
        </>
      );
    case 'zipper':
      return (
        <>
          <path {...LINE} d='M19 10v44M45 10v44' />
          <path {...LINE} d='M25 12v5h7v5h-7v5h7v5h-7v5h7v5h-7v5h7v5h-7' />
          <path {...LINE} d='M39 12v5h-7v5h7v5h-7v5h7v5h-7v5h7v5h-7' />
        </>
      );
    case 'zipper-pull':
      return (
        <>
          <rect {...LINE} x='21' y='10' width='22' height='16' />
          <path {...LINE} d='M27 26v8l-7 16h24l-7-16v-8' />
          <path {...LINE} d='M27 43h10' />
        </>
      );
    case 'label':
      return (
        <>
          <path {...LINE} d='M13 18h38v28H13z' />
          <path {...LINE} d='M20 25h24M20 32h18M20 39h21' />
          <path {...LINE} d='M13 18l5-5M51 18l-5-5' />
        </>
      );
    case 'snap':
      return (
        <>
          <circle {...LINE} cx='25' cy='32' r='13' />
          <circle {...LINE} cx='25' cy='32' r='5' />
          <circle {...LINE} cx='45' cy='32' r='8' />
          <path {...LINE} d='M42 29l6 6M48 29l-6 6' />
        </>
      );
    case 'buckle':
      return (
        <>
          <rect {...LINE} x='10' y='18' width='44' height='28' />
          <rect {...LINE} x='17' y='24' width='30' height='16' />
          <path {...LINE} d='M32 18v28M32 32h11' />
        </>
      );
    case 'eyelet':
      return (
        <>
          <circle {...LINE} cx='32' cy='32' r='20' />
          <circle {...LINE} cx='32' cy='32' r='10' />
          <path {...LINE} d='M18 18l7 7M46 18l-7 7M18 46l7-7M46 46l-7-7' />
        </>
      );
    case 'cord':
      return (
        <>
          <path {...LINE} d='M13 20c11 0 8 24 19 24s8-24 19-24' />
          <path {...LINE} d='M13 15v10M51 15v10' />
          <rect {...LINE} x='9' y='11' width='8' height='5' />
          <rect {...LINE} x='47' y='24' width='8' height='5' />
        </>
      );
    case 'velcro':
      return (
        <>
          <rect {...LINE} x='11' y='18' width='42' height='28' />
          <path {...LINE} d='M17 25l5 5-5 5 5 5M27 25l5 5-5 5 5 5M37 25l5 5-5 5 5 5' />
        </>
      );
    case 'rivet':
      return (
        <>
          <circle {...LINE} cx='25' cy='28' r='13' />
          <circle {...LINE} cx='25' cy='28' r='4' />
          <path {...LINE} d='M38 28h10v8H31M48 28v-6h-8' />
        </>
      );
    case 'packaging':
      return (
        <>
          <path {...LINE} d='M12 22l20-10 20 10-20 10z' />
          <path {...LINE} d='M12 22v24l20 9 20-9V22M32 32v23' />
          <path {...LINE} d='M22 17l20 10' />
        </>
      );
    case 'artwork':
      // The callout `artwork` glyph (dashed square + triangle), at the bench's 64 grid.
      return (
        <>
          <rect {...LINE} x='11' y='11' width='42' height='42' strokeDasharray={DASH} />
          <path {...LINE} d='M22 42l10-18 10 18z' />
        </>
      );
    default:
      return (
        <>
          <path {...LINE} d='M20 13h24l8 19-8 19H20l-8-19z' />
          <circle {...LINE} cx='32' cy='32' r='7' />
          <path {...LINE} d='M12 32h13M39 32h13' />
        </>
      );
  }
}

export function TrimPictogram({
  kind,
  className,
}: {
  kind: TrimPictogramKind;
  className?: string;
}): JSX.Element {
  return (
    <svg aria-hidden data-trim-pictogram={kind} viewBox='0 0 64 64' className={className}>
      <Picture kind={kind} />
    </svg>
  );
}

/** Faint, pointer-transparent line art on the same striped surface as the FLAT slot silhouettes. */
export function TrimPictogramBackdrop({ slot }: { slot: PictogramSlot }): JSX.Element {
  const kind = trimPictogramKind(slot);
  return (
    <span
      aria-hidden
      data-trim-backdrop={kind}
      className='text-textColor'
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        opacity: BACKDROP_OPACITY,
        pointerEvents: 'none',
      }}
    >
      <TrimPictogram kind={kind} className='h-full w-full' />
    </span>
  );
}
