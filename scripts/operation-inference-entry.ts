// Точка входа функциональной половины пробы выводимости: НАСТОЯЩИЙ модуль вывода, целиком.
//
// Здесь не переписано ничего из проверяемого — ни спуск по графу сборки, ни арбитр, ни словарь
// областей. Стенд только реэкспортирует чистые функции модуля и даёт пустую карточку, чтобы
// фикстура дописывала ровно то, о чём говорит, и ни байтом больше.
export {
  arbitrate,
  inferPress,
  inferStep,
  inferThread,
  inferZone,
  isBrokenPieceName,
  pieceNameTokens,
  smvHint,
  stepPieceLeaves,
  zonesFromPieceName,
  zoneIsUnset,
  KIND_ZONE_DRAFT,
  PIECE_NAME_ZONE_DRAFT,
  PURPOSE_ZONE_DRAFT,
} from 'components/managers/tech-card/components/operation-inference';

// Селект зоны — та граница, о которую разбилась бы правка словаря: зона, которой нет в пикере,
// подставилась бы значением, которое человек не может ни увидеть подписью, ни выбрать сам.
export { zoneOptions } from 'components/managers/tech-card/components/operation-options';

import type { InferenceCard } from 'components/managers/tech-card/components/operation-inference';

export const emptyCard: InferenceCard = {
  pieces: [],
  bomLines: [],
  aliases: [],
  presses: [],
  steps: [],
};
