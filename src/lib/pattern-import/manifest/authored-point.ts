import type { AuthoredPointMark } from '../types';

export const AUTHORED_POINT_LAYERS = {
  'draft-point': 'GRBPWR_DRAFT_POINT',
  'point-only': 'GRBPWR_POINT_ONLY',
} as const satisfies Record<AuthoredPointMark['kind'], string>;

export function authoredPointKind(layer: string | null): AuthoredPointMark['kind'] | undefined {
  if (layer === AUTHORED_POINT_LAYERS['draft-point']) return 'draft-point';
  if (layer === AUTHORED_POINT_LAYERS['point-only']) return 'point-only';
}
