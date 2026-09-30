// Точка входа пробы составника (I-12..I-16, I-18): ядро печати + правила блока + форма.
export * from './composition-label-probe-core';
export { createFormControl } from 'react-hook-form';
export {
  mapTechCardToForm,
  techCardSchema,
} from '../src/components/managers/tech-card/components/schema';
export { careLabelOut } from '../src/components/managers/tech-card/components/labels-schema';
export {
  setCareLabel,
  setCareLabelColorway,
} from '../src/components/managers/tech-card/components/form-writers';
export {
  colourNameOverride,
  linesOverride,
  writeComposition,
} from '../src/components/managers/tech-card/components/composition-label/label-lines';
export {
  countryStagingKey,
  stageCountryWrites,
} from '../src/components/managers/tech-card/components/composition-label/made-in';
export { COMMIT_ORDER } from '../src/components/managers/tech-card/components/useTechCardStaging';
export { parseLogoSvg } from '../src/components/managers/tech-card/care-labels/logo-svg';
export { logoPrims } from '../src/components/managers/tech-card/care-labels/artwork';
export {
  labelMediaFullUrl,
  logoSvgState,
} from '../src/components/managers/tech-card/care-labels/label-media';
