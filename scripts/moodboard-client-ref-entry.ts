// Мерная часть пробы «мудбордная выноска не уносит client_ref на провод».
// Собирается scripts/moodboard-client-ref-probe.mjs.
//
// ЗАЧЕМ ВООБЩЕ. `MintCalloutNumbers` на бете (`internal/dto/techcard.go:440-442`) минтит номер
// ЛЮБОЙ выноске с `number == 0 && client_ref != ""` — предиката по медиа там нет. Значит
// мудбордная заметка, уехавшая с `client_ref`, съедает номер ЛИСТА, и нумерация листа поедет
// дырами на живых карточках. Откат клиента этого не чинит: испорчены данные, а не экран.
//
// Здесь наружу выставлены ровно две вещи: сам фильтр (чистая функция) и НАСТОЯЩИЙ сборщик
// payload из `schema.ts`. Вторая — главная: проверять фильтр в одиночку значит проверять сторожа,
// а не дверь.
export {
  MOODBOARD_CALLOUTS_CARRY_CLIENT_REF,
  gateMoodboardClientRefs,
} from 'components/managers/tech-card/components/design/mood-callouts';
export {
  mapFormToTechCardInsert,
  techCardDefaultData,
} from 'components/managers/tech-card/components/schema';
