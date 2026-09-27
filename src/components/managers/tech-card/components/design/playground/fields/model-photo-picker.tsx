import type { common_MediaFull } from 'api/proto-http/admin';
import type { JSX } from 'react';

/**
 * ═══ TILE 1 · THE MODEL PROFILE AND ONE PHOTOGRAPH OF IT (C-09 draws it) ════════════════════════
 *
 * THE CONTRACT IS C-08's, THE PICTURE IS C-09's. The shared panel (`../workflow-panel.tsx`) already
 * routes a `model-profile` field here and writes the draft (`choices[key]` = profile id,
 * `images[photoKey]` = `[photo]`), so C-09 fills this body and touches no shared file. Until then
 * it draws nothing — no tile uses the field before C-09 lands.
 */
export type ModelPhotoPickerProps = {
  /** The chosen profile, 0 = none. */
  modelId: number;
  /** The chosen photograph of that profile. */
  photo: common_MediaFull | null;
  onChange: (next: { modelId: number; photo: common_MediaFull | null }) => void;
  disabled?: boolean;
};

export function ModelPhotoPicker(props: ModelPhotoPickerProps): JSX.Element | null {
  void props;
  return null;
}
