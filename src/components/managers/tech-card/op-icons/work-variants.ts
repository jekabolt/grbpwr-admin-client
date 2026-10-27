import type { IconKey } from './icons.gen';
import { WORK_VARIANT_ICON } from './op-icon';

/**
 * Client mirror of the backend's closed variant map (`entity.WorkVariants`,
 * grbpwr-products-manager internal/entity/techcard_seam_kind.go). A variant is legal only for its
 * own work; a variant without a work is refused (`needs_work`), one the work does not declare is
 * refused (`not_for_work`). The map only grows on the server, so the order here is the backend's.
 */
export const WORK_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  set_zip: ['open_end', 'two_way', 'magnetic', 'faced'],
  snap_press_stud: ['ring', 'spring_s'],
  eyelet_grommet: ['small', 'washer'],
  attach_elastic: ['casing', 'exposed', 'gripper', 'picot', 'buttonhole', 'loop'],
  fuse: ['full', 'partial', 'edge_tape', 'tack'],
  attach_hook: ['eye', 'trouser_bar'],
  attach_hook_loop: ['tape', 'dot'],
  enclose_magnet: ['pocket', 'hem'],
  insert_cord: ['round', 'flat'],
  pleat: ['knife', 'box'],
  pocket_welt: ['single', 'double'],
  attach_patch: ['plain', 'embroidered'],
};

export function workVariantsOf(work: string | null | undefined): readonly string[] {
  return WORK_VARIANTS[(work ?? '').trim()] ?? [];
}

export function isWorkVariant(work: string | null | undefined, variant: string): boolean {
  return workVariantsOf(work).includes(variant);
}

/** Short English tile labels. The base (no variant) tile is labelled «standard». */
const WORK_VARIANT_LABEL: Readonly<Record<string, string>> = {
  open_end: 'open-end',
  two_way: 'two-way',
  magnetic: 'magnetic',
  faced: 'faced',
  ring: 'ring',
  spring_s: 'spring S',
  small: 'small',
  washer: 'washer',
  casing: 'casing',
  exposed: 'exposed',
  gripper: 'gripper',
  picot: 'picot',
  buttonhole: 'buttonhole',
  loop: 'loop',
  full: 'full',
  partial: 'partial',
  edge_tape: 'edge tape',
  tack: 'tack',
  eye: 'eye',
  trouser_bar: 'trouser bar',
  tape: 'tape',
  dot: 'dot',
  pocket: 'pocket',
  hem: 'hem',
  round: 'round',
  flat: 'flat',
  knife: 'knife',
  box: 'box',
  single: 'single',
  double: 'double',
  plain: 'plain',
  embroidered: 'embroidered',
};

/** A token newer than this bundle is shown as itself, never hidden. */
export function workVariantLabel(variant: string): string {
  return WORK_VARIANT_LABEL[variant] ?? variant.replace(/_/g, ' ');
}

/** Icon of a declared variant; undefined for a pair the icon sheet does not draw. */
export function workVariantIconKey(work: string, variant: string): IconKey | undefined {
  const variants = WORK_VARIANT_ICON[work as keyof typeof WORK_VARIANT_ICON] as
    | Readonly<Record<string, IconKey>>
    | undefined;
  return variants?.[variant];
}
