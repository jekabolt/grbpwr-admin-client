// Точка входа пробы переименования узла: esbuild бандлит только с файла, а модуль чистый —
// одного реэкспорта хватает.
export {
  UNIT_KEY_MAX_BYTES,
  planUnitRename,
  renamePicked,
  renamePosEdits,
  unitKeyBytes,
  unitKeyLengthRefusal,
  unitRenameAct,
} from '../src/components/managers/tech-card/components/assembly-rename';
