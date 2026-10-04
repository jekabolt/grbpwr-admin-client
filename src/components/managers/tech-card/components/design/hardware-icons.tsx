import type { JSX } from 'react';

/** Hardware part keys shared with the design-quiz resolver (40-HARDWARE). */
export const HARDWARE_KINDS = [
  'hw_button',
  'hw_shank_button',
  'hw_jeans_button',
  'hw_snap',
  'hw_hook_eye',
  'hw_hook_loop',
  'hw_zip',
  'hw_invisible_zip',
  'hw_zip_puller',
  'hw_eyelet',
  'hw_rivet',
  'hw_buckle',
  'hw_d_ring',
  'hw_slider',
  'hw_toggle',
  'hw_cord_stopper',
  'hw_aglet',
  'hw_snap_hook',
  'hw_magnet',
  'hw_lace_hook',
] as const;

export type HardwareKind = (typeof HARDWARE_KINDS)[number];

export const HARDWARE_LABEL: Record<HardwareKind, string> = {
  hw_button: '4-hole button',
  hw_shank_button: 'shank button',
  hw_jeans_button: 'jeans tack button',
  hw_snap: 'snap fastener',
  hw_hook_eye: 'hook and eye',
  hw_hook_loop: 'hook and loop',
  hw_zip: 'coil zip',
  hw_invisible_zip: 'invisible zip',
  hw_zip_puller: 'zip puller',
  hw_eyelet: 'eyelet',
  hw_rivet: 'rivet',
  hw_buckle: 'buckle',
  hw_d_ring: 'D-ring',
  hw_slider: 'strap slider',
  hw_toggle: 'toggle',
  hw_cord_stopper: 'cord stopper',
  hw_aglet: 'aglet',
  hw_snap_hook: 'swivel snap hook',
  hw_magnet: 'magnetic snap',
  hw_lace_hook: 'lace hook',
};

/** Label part keys shared with the design-quiz resolver (40-HARDWARE, Labels). */
export const LABEL_KINDS = [
  'lbl_brand',
  'lbl_care',
  'lbl_size',
  'lbl_flag',
  'lbl_patch',
  'lbl_hang_tag',
] as const;

export type LabelKind = (typeof LABEL_KINDS)[number];

export const LABEL_LABEL: Record<LabelKind, string> = {
  lbl_brand: 'woven brand label',
  lbl_care: 'care label',
  lbl_size: 'size tab',
  lbl_flag: 'flag label',
  lbl_patch: 'patch',
  lbl_hang_tag: 'hang tag',
};

export function isHardwareKind(value: string): value is HardwareKind {
  return (HARDWARE_KINDS as readonly string[]).includes(value);
}

export function isLabelKind(value: string): value is LabelKind {
  return (LABEL_KINDS as readonly string[]).includes(value);
}

const HARDWARE_ALIASES: ReadonlyArray<readonly [HardwareKind, readonly string[]]> = [
  ['hw_shank_button', ['shank button', 'shank buttons', 'shank']],
  ['hw_jeans_button', ['jeans button', 'jeans buttons', 'tack button', 'tack buttons']],
  ['hw_invisible_zip', ['invisible zip', 'invisible zipper', 'concealed zip', 'concealed zipper']],
  ['hw_zip_puller', ['zip puller', 'zip pullers', 'pull tab', 'pull tabs', 'puller', 'pullers']],
  ['hw_snap_hook', ['snap hook', 'snap hooks', 'swivel hook', 'swivel hooks', 'swivel', 'lobster']],
  ['hw_magnet', ['magnetic snap', 'magnetic snaps', 'magnet', 'magnets', 'magnetic']],
  ['hw_hook_eye', ['hook and eye', 'hooks and eyes']],
  ['hw_hook_loop', ['hook and loop', 'hooks and loops', 'velcro']],
  ['hw_lace_hook', ['lace hook', 'lace hooks', 'speed hook', 'speed hooks']],
  [
    'hw_cord_stopper',
    ['cord stopper', 'cord stoppers', 'cord lock', 'cord locks', 'stopper', 'stoppers'],
  ],
  ['hw_aglet', ['tip of drawcord', 'tips of drawcord', 'cord end', 'cord ends', 'aglet', 'aglets']],
  ['hw_button', ['button', 'buttons']],
  ['hw_snap', ['press stud', 'press studs', 'popper', 'poppers', 'snap', 'snaps']],
  ['hw_zip', ['zip fastener', 'zip fasteners', 'zipper', 'zippers', 'zip', 'zips']],
  ['hw_eyelet', ['eyelet', 'eyelets', 'grommet', 'grommets']],
  ['hw_rivet', ['rivet', 'rivets']],
  ['hw_buckle', ['buckle', 'buckles']],
  ['hw_d_ring', ['d ring', 'd rings']],
  ['hw_slider', ['strap slider', 'strap sliders', 'slider', 'sliders', 'adjuster', 'adjusters']],
  ['hw_toggle', ['toggle', 'toggles']],
];

const LABEL_ALIASES: ReadonlyArray<readonly [LabelKind, readonly string[]]> = [
  [
    'lbl_brand',
    [
      'brand label',
      'brand labels',
      'main label',
      'main labels',
      'neck label',
      'neck labels',
      'logo label',
      'logo labels',
      'woven label',
      'woven labels',
    ],
  ],
  [
    'lbl_care',
    [
      'care label',
      'care labels',
      'composition label',
      'composition labels',
      'wash label',
      'wash labels',
    ],
  ],
  ['lbl_size', ['size label', 'size labels', 'size tab', 'size tabs']],
  [
    'lbl_flag',
    ['flag label', 'flag labels', 'side label', 'side labels', 'seam label', 'seam labels'],
  ],
  ['lbl_hang_tag', ['hang tag', 'hang tags', 'swing tag', 'swing tags', 'price tag', 'price tags']],
  [
    'lbl_patch',
    [
      'leather patch',
      'leather patches',
      'rubber patch',
      'rubber patches',
      'patch',
      'patches',
      'badge',
      'badges',
    ],
  ],
  ['lbl_brand', ['label', 'labels']],
];

const words = (value: string) =>
  ` ${value
    .trim()
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')} `;

/** Resolve only complete hardware words/phrases (`corduroy` and `snapshot` do not match). */
export function hardwareOf(label: string): HardwareKind | null {
  const haystack = words(label);
  for (const [kind, aliases] of HARDWARE_ALIASES) {
    if (aliases.some((alias) => haystack.includes(words(alias)))) return kind;
  }
  return null;
}

/** Resolve complete label words/phrases, with bare `label` meaning the main brand label. */
export function labelOf(label: string): LabelKind | null {
  const haystack = words(label);
  for (const [kind, aliases] of LABEL_ALIASES) {
    if (aliases.some((alias) => haystack.includes(words(alias)))) return kind;
  }
  return null;
}

const stroke = { vectorEffect: 'non-scaling-stroke' as const };
const accent = { ...stroke, fill: 'currentColor', fillOpacity: 0.14 };

function HardwareGlyph({ kind }: { kind: HardwareKind }): JSX.Element {
  switch (kind) {
    case 'hw_button':
      return (
        <>
          <circle {...accent} cx='32' cy='32' r='20' />
          <circle {...stroke} cx='32' cy='32' r='15.5' />
          <circle {...stroke} cx='27' cy='27' r='2.2' />
          <circle {...stroke} cx='37' cy='27' r='2.2' />
          <circle {...stroke} cx='27' cy='37' r='2.2' />
          <circle {...stroke} cx='37' cy='37' r='2.2' />
        </>
      );
    case 'hw_shank_button':
      return (
        <>
          <path {...accent} d='M13 21 Q32 15 51 21 L49 29 Q32 34 15 29 Z' />
          <path {...stroke} d='M16 24 Q32 20 48 24' />
          <path {...stroke} d='M32 31 L32 37' />
          <path {...accent} d='M32 36 C23 36 22 50 32 50 C42 50 41 36 32 36 Z' />
          <path {...stroke} d='M28 44 Q32 39 36 44' />
        </>
      );
    case 'hw_jeans_button':
      return (
        <>
          <circle {...accent} cx='25' cy='31' r='16' />
          <circle {...stroke} cx='25' cy='31' r='11.5' />
          <path {...stroke} d='M19 25 L31 37 M31 25 L19 37' />
          <path {...stroke} d='M41 28 L51 28 L51 35 L41 35' />
          <path {...accent} d='M51 25 L56 25 L56 38 L51 38 Z' />
        </>
      );
    case 'hw_snap':
      return (
        <>
          <circle {...accent} cx='19' cy='32' r='13' />
          <circle {...stroke} cx='19' cy='32' r='8.5' />
          <circle {...accent} cx='19' cy='32' r='3.5' />
          <circle {...accent} cx='45' cy='32' r='13' />
          <circle {...stroke} cx='45' cy='32' r='6' />
          <circle {...stroke} cx='45' cy='32' r='3' />
        </>
      );
    case 'hw_hook_eye':
      return (
        <>
          <path {...accent} d='M7 25 L18 25 Q25 25 25 32 Q25 39 18 39 L7 39 Z' />
          <path {...stroke} d='M7 29 L15 29 Q20 29 20 32 Q20 35 15 35 L7 35' />
          <circle {...stroke} cx='10' cy='32' r='1.8' />
          <path
            {...accent}
            d='M37 23 L48 23 Q57 23 57 32 Q57 41 48 41 L40 41 Q35 41 35 36 Q35 31 41 31 L49 31'
          />
          <circle {...stroke} cx='41' cy='27' r='2' />
          <circle {...stroke} cx='48' cy='27' r='2' />
        </>
      );
    case 'hw_hook_loop':
      return (
        <>
          <rect {...accent} x='8' y='12' width='48' height='16' />
          <path
            {...stroke}
            d='M15 23 V17 Q15 14 18 15 M25 23 V17 Q25 14 28 15 M35 23 V17 Q35 14 38 15 M45 23 V17 Q45 14 48 15'
          />
          <rect {...accent} x='8' y='36' width='48' height='16' />
          <path
            {...stroke}
            d='M14 44 C14 39 21 39 21 44 C21 49 14 49 14 44 M28 44 C28 39 35 39 35 44 C35 49 28 49 28 44 M42 44 C42 39 49 39 49 44 C49 49 42 49 42 44'
          />
        </>
      );
    case 'hw_zip':
      return (
        <>
          <path {...accent} d='M13 7 H27 V57 H13 Z M37 7 H51 V57 H37 Z' />
          <path {...stroke} d='M27 7 V57 M37 7 V57' />
          <path
            {...stroke}
            d='M27 12 H32 V16 H37 M37 19 H32 V23 H27 M27 26 H32 V30 H37 M37 33 H32 V37 H27 M27 40 H32 V44 H37 M37 47 H32 V51 H27'
          />
          <path {...accent} d='M25 20 L39 20 L36 34 L28 34 Z' />
          <path {...stroke} d='M35 32 Q43 38 40 48 Q37 55 33 47 Q30 40 35 32 Z' />
        </>
      );
    case 'hw_invisible_zip':
      return (
        <>
          <path {...accent} d='M14 8 H30 V56 H14 Z M34 8 H50 V56 H34 Z' />
          <path {...stroke} d='M30 8 V56 M34 8 V56 M32 8 V43' />
          <path
            {...stroke}
            d='M27 13 L30 15 M37 13 L34 15 M27 19 L30 21 M37 19 L34 21 M27 25 L30 27 M37 25 L34 27 M27 31 L30 33 M37 31 L34 33'
          />
          <path {...accent} d='M27 40 L37 40 L35 49 L29 49 Z' />
          <path {...stroke} d='M35 47 Q40 51 36 56 Q32 58 32 53 Q32 49 35 47 Z' />
        </>
      );
    case 'hw_zip_puller':
      return (
        <>
          <path {...accent} d='M21 9 H43 L39 27 H25 Z' />
          <path {...stroke} d='M27 14 H37 M28 21 H36' />
          <path {...stroke} d='M32 27 V33' />
          <path {...accent} d='M25 32 Q32 28 39 32 L42 48 Q43 56 32 57 Q21 56 22 48 Z' />
          <path {...stroke} d='M28 39 H36 L37 49 Q32 53 27 49 Z' />
        </>
      );
    case 'hw_eyelet':
      return (
        <>
          <path
            {...accent}
            fillRule='evenodd'
            d='M32 10 A22 22 0 1 1 32 54 A22 22 0 1 1 32 10 Z M32 23 A9 9 0 1 0 32 41 A9 9 0 1 0 32 23 Z'
          />
          <circle {...stroke} cx='32' cy='32' r='17' />
          <circle {...stroke} cx='32' cy='32' r='9' />
          <path {...stroke} d='M18 19 Q32 13 46 19 M18 45 Q32 51 46 45' />
        </>
      );
    case 'hw_rivet':
      return (
        <>
          <circle {...accent} cx='21' cy='32' r='13' />
          <circle {...stroke} cx='21' cy='32' r='8' />
          <circle {...accent} cx='21' cy='32' r='2.5' />
          <path {...stroke} d='M34 29 H49 M34 35 H49' />
          <path {...accent} d='M49 25 Q57 25 57 32 Q57 39 49 39 Z' />
          <path {...stroke} d='M51 28 Q55 32 51 36' />
        </>
      );
    case 'hw_buckle':
      return (
        <>
          <path {...accent} fillRule='evenodd' d='M9 15 H55 V49 H9 Z M15 21 V43 H49 V21 Z' />
          <rect {...stroke} x='9' y='15' width='46' height='34' />
          <path {...stroke} d='M32 17 V47 M32 32 L48 25 M48 25 L45 24' />
        </>
      );
    case 'hw_d_ring':
      return (
        <>
          <path
            {...accent}
            fillRule='evenodd'
            d='M18 9 H31 Q55 9 55 32 Q55 55 31 55 H18 Z M24 16 V48 H31 Q48 48 48 32 Q48 16 31 16 Z'
          />
          <path
            {...stroke}
            d='M18 9 H31 Q55 9 55 32 Q55 55 31 55 H18 Z M24 16 V48 H31 Q48 48 48 32 Q48 16 31 16 Z'
          />
          <path {...stroke} d='M18 9 V55 M24 16 V48' />
        </>
      );
    case 'hw_slider':
      return (
        <>
          <path {...accent} d='M5 25 H59 V39 H5 Z' />
          <path {...accent} fillRule='evenodd' d='M10 15 H54 V49 H10 Z M16 21 V43 H48 V21 Z' />
          <rect {...stroke} x='10' y='15' width='44' height='34' />
          <path {...stroke} d='M32 17 V47 M5 25 H59 M5 39 H59' />
        </>
      );
    case 'hw_toggle':
      return (
        <>
          <path {...stroke} d='M25 29 C12 34 11 50 23 54 C35 58 48 50 42 36' />
          <path
            {...accent}
            d='M11 20 Q12 15 18 16 L52 24 Q57 25 55 31 L53 37 Q51 42 46 40 L13 32 Q8 31 9 26 Z'
          />
          <circle {...stroke} cx='27' cy='27' r='2.5' />
          <circle {...stroke} cx='39' cy='30' r='2.5' />
          <path {...stroke} d='M27 29 L25 38 M39 32 L42 38' />
        </>
      );
    case 'hw_cord_stopper':
      return (
        <>
          <path {...stroke} d='M24 5 C20 19 20 45 24 59 M40 5 C44 19 44 45 40 59' />
          <rect {...accent} x='15' y='18' width='34' height='34' rx='7' />
          <path {...accent} d='M24 18 V13 Q24 8 32 8 Q40 8 40 13 V18 Z' />
          <path {...stroke} d='M24 18 H40 M27 29 H37 M27 37 H37' />
          <circle {...stroke} cx='24' cy='33' r='3' />
          <circle {...stroke} cx='40' cy='33' r='3' />
        </>
      );
    case 'hw_aglet':
      return (
        <>
          <path {...stroke} d='M6 13 C18 13 15 31 29 32 L36 35' />
          <path {...stroke} d='M7 18 C15 18 13 36 28 37 L34 40' />
          <path {...accent} d='M31 29 L57 43 L51 54 L25 39 Z' />
          <path {...stroke} d='M35 32 L29 42 M51 40 L45 50 M52 48 L48 51' />
        </>
      );
    case 'hw_snap_hook':
      return (
        <>
          <circle {...accent} cx='32' cy='12' r='7' />
          <circle {...stroke} cx='32' cy='12' r='3' />
          <path {...accent} d='M27 18 L27 25 Q32 29 37 25 V18 M29 24 V29 M35 24 V29' />
          <path
            {...stroke}
            d='M31 27 Q47 25 53 37 Q59 49 48 57 Q38 64 27 58 Q16 53 16 43 Q16 37 20 33'
          />
          <path
            {...stroke}
            d='M32 35 Q40 32 46 39 Q50 46 43 51 Q37 55 30 51 Q24 48 24 42 Q24 39 27 37'
          />
          <path {...accent} d='M19 31 L23 29 L42 46 L38 50 Z' />
          <path {...stroke} d='M19 31 L42 46 M23 29 L38 50 M19 31 L16 36' />
        </>
      );
    case 'hw_magnet':
      return (
        <>
          <circle {...accent} cx='21' cy='32' r='14' />
          <circle {...stroke} cx='21' cy='32' r='9' />
          <path {...stroke} d='M12 32 H30 M21 23 V41' />
          <circle {...accent} cx='47' cy='32' r='11' />
          <circle {...stroke} cx='47' cy='32' r='5' />
          <path {...stroke} d='M45 18 V9 M49 18 V9 M45 55 V46 M49 55 V46' />
        </>
      );
    case 'hw_lace_hook':
      return (
        <>
          <path {...accent} d='M10 16 Q22 10 32 17 L30 50 Q21 56 11 50 Z' />
          <circle {...stroke} cx='20' cy='28' r='3' />
          <circle {...stroke} cx='20' cy='42' r='3' />
          <path
            {...stroke}
            d='M29 18 Q45 14 52 25 Q59 37 50 47 Q43 55 34 50 Q27 47 29 40 Q30 34 37 33 Q42 32 45 36'
          />
          <path {...stroke} d='M32 21 Q43 19 48 27' />
        </>
      );
  }
}

function LabelGlyph({ kind }: { kind: LabelKind }): JSX.Element {
  switch (kind) {
    case 'lbl_brand':
      return (
        <>
          <rect {...accent} x='7' y='16' width='50' height='32' />
          <rect {...stroke} x='11' y='20' width='42' height='24' strokeDasharray='2 2' />
          <path {...stroke} d='M17 28 H47 M19 33 Q25 25 31 33 Q37 41 45 31 M20 39 H44' />
          <path
            {...stroke}
            d='M7 20 H11 M7 28 H11 M7 36 H11 M7 44 H11 M53 20 H57 M53 28 H57 M53 36 H57 M53 44 H57'
          />
        </>
      );
    case 'lbl_care':
      return (
        <>
          <path {...accent} d='M17 6 H47 V58 H17 Z' />
          <path {...stroke} strokeDasharray='2 2' d='M20 11 H44' />
          <path {...stroke} d='M21 21 L23 31 H31 L33 21 Q27 25 21 21 Z' />
          <path {...stroke} d='M35 31 L40 21 L45 31 Z' />
          <circle {...stroke} cx='27' cy='39' r='4' />
          <rect {...stroke} x='36' y='35' width='9' height='8' />
          <path {...stroke} d='M22 49 H42 M22 53 H38' />
        </>
      );
    case 'lbl_size':
      return (
        <>
          <path {...accent} d='M19 12 H45 V52 H19 Z' />
          <path {...stroke} strokeDasharray='2 2' d='M22 17 H42 M22 47 H42' />
          <path {...stroke} d='M25 40 V25 L32 34 L39 25 V40' />
        </>
      );
    case 'lbl_flag':
      return (
        <>
          <path {...stroke} d='M13 7 V57 M18 7 V57' />
          <path {...stroke} strokeDasharray='2 2' d='M15.5 9 V55' />
          <path {...accent} d='M18 20 H49 L54 32 L49 44 H18 Z' />
          <path {...stroke} d='M36 20 L42 32 L36 44 M23 27 H36 M23 32 H39 M23 37 H36' />
        </>
      );
    case 'lbl_patch':
      return (
        <>
          <path {...accent} d='M10 14 H51 L56 19 V45 L51 50 H10 L6 46 V18 Z' />
          <path
            {...stroke}
            strokeDasharray='2 2'
            d='M13 19 H49 L51 22 V42 L48 45 H13 L11 43 V21 Z'
          />
          <path {...stroke} d='M18 37 L25 26 L31 34 L37 23 L46 37 Z M19 41 H45' />
        </>
      );
    case 'lbl_hang_tag':
      return (
        <>
          <path {...stroke} d='M32 18 C32 8 21 11 21 4 C21 0 27 1 27 5' />
          <path {...accent} d='M25 12 H39 L48 23 V57 H16 V23 Z' />
          <circle {...stroke} cx='32' cy='21' r='4' />
          <circle {...stroke} cx='32' cy='21' r='1.5' />
          <path {...stroke} d='M22 36 H42 M22 41 H38 M22 47 H40' />
        </>
      );
  }
}

/** Close-up line drawing for one hardware object. */
export function HardwareIcon({
  kind,
  className,
  size = 64,
}: {
  kind: HardwareKind;
  className?: string;
  size?: number;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      focusable='false'
      data-hardware-kind={kind}
      viewBox='0 0 64 64'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <HardwareGlyph kind={kind} />
    </svg>
  );
}

/** Close-up line drawing for one garment label or tag. */
export function LabelIcon({
  kind,
  className,
  size = 64,
}: {
  kind: LabelKind;
  className?: string;
  size?: number;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      focusable='false'
      data-label-kind={kind}
      viewBox='0 0 64 64'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <LabelGlyph kind={kind} />
    </svg>
  );
}
