// Точка входа ЧИСТОЙ половины пробы «единственный писатель»: сама вынесенная функция и ровно те
// органы, которыми проба перепроверяет её ответ НЕЗАВИСИМО — разбор каталога и карта «работа →
// пункт». Ни одной копии проверяемых правил здесь нет: `workApplication` спрашивается ЦЕЛИКОМ.
//
// Этот файл собирается ТОЛЬКО из рабочего дерева: до экстракции такой функции не существовало
// вовсе, и базовый бандл (см. `operation-work-apply-dom-entry.tsx`) её не знает.
export {
  parseWorkCatalog,
  workApplication,
  type WorkCatalog,
} from 'components/managers/tech-card/components/operation-work';

export { KIND_BY_WORK_TOKEN } from 'components/managers/tech-card/components/operation-kinds';
