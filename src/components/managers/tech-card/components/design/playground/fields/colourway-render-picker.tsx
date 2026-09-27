import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import type { JSX } from 'react';

/**
 * ═══ TILE 1 · THE PRODUCTS — RENDERS OF THIS CARD'S COLOURWAYS (C-09 draws it) ══════════════════
 *
 * THE CONTRACT IS C-08's, THE PICTURE IS C-09's. The shared panel (`../workflow-panel.tsx`) already
 * routes a `colourway-render` field here and writes the draft (`images[key]` = the renders in
 * order, `choices[colorwayKey]` = the colourway of the first, `'0'` when it has none), so C-09
 * fills this body and touches no shared file. Until then it draws nothing — no tile uses the field
 * before C-09 lands.
 */
export type ColourwayRenderPickerProps = {
  band: GetDesignBandResponse;
  techCardId: number;
  value: readonly common_MediaFull[];
  colorwayId: number;
  max: number;
  onChange: (next: { renders: readonly common_MediaFull[]; colorwayId: number }) => void;
  disabled?: boolean;
};

export function ColourwayRenderPicker(props: ColourwayRenderPickerProps): JSX.Element | null {
  void props;
  return null;
}
