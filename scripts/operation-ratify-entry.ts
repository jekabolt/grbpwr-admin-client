// Точка входа пробы ратификации: НАСТОЯЩИЙ классификатор целиком, и ни одной строки, переписанной
// ради стенда.
//
// Сверх него реэкспортированы ровно те органы, которыми проба перепроверяет ответы НЕЗАВИСИМО:
// двоекодье имени (`workNaming` внутри классификатора против `kindOf` + `kindLabelOf` снаружи),
// словарь классов шва и оба каталога — серверный разбор и снимок бандла. Проба, спрашивающая имя у
// того же выражения, которым его считает классификатор, зеленела бы при любом расхождении.
export {
  printedName,
  ratifyCard,
  ratifyStep,
  worksForMachine,
} from 'components/managers/tech-card/components/operation-ratify';

export {
  KIND_WORK_TOKEN,
  OPERATION_KIND_BY_ID,
  kindLabelOf,
  kindOf,
} from 'components/managers/tech-card/components/operation-kinds';

export { seamClassLabel } from 'components/managers/tech-card/components/operation-options';

export {
  BUNDLED_WORK_CATALOG,
  parseWorkCatalog,
} from 'components/managers/tech-card/components/operation-work';
