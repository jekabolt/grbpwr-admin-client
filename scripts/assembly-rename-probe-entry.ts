// Точка входа пробы переименования узла: esbuild бандлит только с файла, а модуль чистый —
// одного реэкспорта хватает.
export {
  planUnitRename,
  renamePosEdits,
  unitRenameAct,
} from '../src/components/managers/tech-card/components/assembly-rename';
