/**
 * Shared form primitives of the PLAYGROUND tab (C-02). Tiles (C-04, C-07…) compose their panels
 * from these; none of them knows a wire shape.
 */
export { FoldSection, type FoldSectionProps } from './fold-section';
export {
  EXTEND_FORMAT_RATIOS,
  FORMAT_RATIOS,
  FormatGrid,
  IMAGE_FORMAT_RATIOS,
  snapRatio,
  type FormatGridProps,
  type FormatRatio,
} from './format-grid';
export { FieldGlyph, InfoTip, type FieldGlyphName } from './glyphs';
export {
  ImageSlots,
  slotCounter,
  slotMediaIds,
  type FixedImageSlotsProps,
  type GrowImageSlotsProps,
  type ImageSlotDef,
  type ImageSlotsProps,
} from './image-slots';
export { OptionRow, type OptionRowOption, type OptionRowProps } from './option-row';
export {
  NO_PANTONE,
  PantoneField,
  PantoneValue,
  pantoneColour,
  type PantoneColour,
  type PantoneFieldProps,
} from './pantone-field';
export { PromptField, type PromptFieldProps } from './prompt-field';
export { REUSE_SOURCES, ReuseDoor, type ReuseDoorProps, type ReuseSource } from './reuse';
export { BOOST_STEPS, Slider, stepLabel, type SliderProps, type SliderStep } from './slider';
export { ToggleRow, type ToggleRowProps } from './toggle-row';
