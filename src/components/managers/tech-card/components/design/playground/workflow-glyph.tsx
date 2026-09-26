import type { JSX } from 'react';

import type { WorkflowKey } from './registry/types';

/**
 * ═══ ONE LINE DRAWING PER WORKFLOW (C-03) ═══════════════════════════════════════════════════════
 *
 * The owner's grid shows a before/after photograph per tile; this admin has no stock photographs,
 * so each tile carries a line drawing of what the workflow does instead. One family, drawn here
 * once: a 48-unit square, 1.5 stroke in the current colour, square caps and mitred joins, no fill
 * but the one «after» accent some drawings need — and that accent is ink, never a colour
 * (DESIGN.md: colour carries state, nothing else). `aria-hidden`: the title beside it says it.
 */

/** The garment every drawing that needs one reuses: a plain tee, centred. */
const TEE = 'M18 9 11 13 7 21l6 3 2-3v19h18V21l2 3 6-3-4-8-7-4c-1.5 3-10.5 3-12 0Z';

const DRAWINGS: Record<WorkflowKey, JSX.Element> = {
  virtual_try_on: (
    <>
      <circle cx='24' cy='9' r='4' />
      <path d='M16 44V24l-4 8M32 44V24l4 8' />
      <path d='M17 16h14l3 8H14Z' />
      <path d='M21 44V30h6v14' />
    </>
  ),
  fabric_to_image: (
    <>
      <rect x='5' y='8' width='26' height='32' />
      <path d='M11 16h14M11 22h14M11 28h14' strokeDasharray='2 2' />
      <path d='M31 24h6' />
      <path d='m34 21 3 3-3 3' />
      <rect x='37' y='17' width='8' height='14' />
    </>
  ),
  ghost_mannequin: (
    <>
      <path d={TEE} />
      <path d='M20 10c1 4 7 4 8 0' strokeDasharray='2 2' />
    </>
  ),
  change_color: (
    <>
      <path d={TEE} />
      <path d='M15 24h18M15 29h18M15 34h18M15 39h18' strokeWidth={1} />
    </>
  ),
  swap_fabrics: (
    <>
      <rect x='6' y='6' width='20' height='20' />
      <path d='M6 12h20M6 18h20M6 24h20' strokeWidth={1} />
      <rect x='22' y='22' width='20' height='20' />
      <path d='m26 26 12 12M32 26l6 6M26 32l6 6' strokeWidth={1} />
    </>
  ),
  add_logo: (
    <>
      <path d={TEE} />
      <rect x='26' y='21' width='5' height='5' />
    </>
  ),
  design_variations: (
    <>
      <rect x='4' y='14' width='12' height='20' />
      <rect x='18' y='10' width='12' height='28' />
      <rect x='32' y='14' width='12' height='16' />
    </>
  ),
  remove_background: (
    <>
      <rect x='6' y='6' width='36' height='36' strokeDasharray='3 3' />
      <circle cx='24' cy='17' r='4' />
      <path d='M15 36c0-7 4-11 9-11s9 4 9 11Z' />
    </>
  ),
  extend_image: (
    <>
      <rect x='16' y='12' width='16' height='24' />
      <rect x='4' y='12' width='40' height='24' strokeDasharray='3 3' />
      <path d='M12 24H7m2-2-2 2 2 2M36 24h5m-2-2 2 2-2 2' />
    </>
  ),
  retouch_zone: (
    <>
      <rect x='6' y='6' width='36' height='36' />
      <circle cx='22' cy='22' r='8' strokeDasharray='2 2' />
      <path d='m28 28 12 12' />
    </>
  ),
  create_edit: (
    <>
      <rect x='6' y='10' width='28' height='28' />
      <path d='m36 6 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z' />
      <path d='m10 34 7-9 5 6 4-4 6 7' />
    </>
  ),
  image_to_3d: (
    <>
      <path d='M24 6 40 15v18l-16 9-16-9V15Z' />
      <path d='m8 15 16 9 16-9M24 24v18' />
    </>
  ),
};

export function WorkflowGlyph({
  workflow,
  size = 48,
  className,
}: {
  workflow: WorkflowKey;
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      viewBox='0 0 48 48'
      width={size}
      height={size}
      aria-hidden='true'
      focusable='false'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='square'
      strokeLinejoin='miter'
      className={className}
    >
      {DRAWINGS[workflow]}
    </svg>
  );
}
