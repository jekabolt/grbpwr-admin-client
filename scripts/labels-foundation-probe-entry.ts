// Точка входа пробы фундамента переделки лейблов (I-08 / I-09).
export { createFormControl } from 'react-hook-form';
export {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
} from '../src/components/managers/tech-card/components/schema';
export {
  removeGarmentLabel,
  removePackagingItem,
  setCareLabel,
  setCareLabelColorway,
  upsertGarmentLabel,
  upsertPackagingItem,
} from '../src/components/managers/tech-card/components/form-writers';
export {
  isSvgInput,
  isSvgMedia,
  uploadMediaInput,
} from '../src/components/managers/media/utils/useUploadMedia';
export { acceptOf, filesOfKind, refusalOf } from '../src/components/managers/media/utils/usePasteFiles';
