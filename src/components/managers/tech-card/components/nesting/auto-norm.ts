// НОРМА НАЗНАЧАЕТСЯ САМА — кнопки «set as norm» больше нет.
//
// Скоуп — ровно серверный (markerNormScopePredicate): карточка × строка BOM. Колорвей в скоуп НЕ
// входит: одна норма на ткань. Раскладка без ткани (bomLineKey '') живёт в своём скоупе «без ткани»,
// и его автоматика не трогает — гейт готовности спрашивает о ткани, такая норма ничего не значит.
//
// ПРАВИЛО: норма скоупа = самая НОВАЯ ПО СОЗДАНИЮ (наибольший id — AUTO_INCREMENT строки
// tech_card_marker, монотонен по INSERT) ГОДНАЯ раскладка: карточная, не черновик, без отказа
// скалярной нормы (смешанный состав, нечитаемый состав). Действуем, когда она ещё не норма.
//
// ПОЧЕМУ НЕ updated_at. Назначение нормы само бампает updated_at (ON UPDATE CURRENT_TIMESTAMP), а
// список, по которому решаем, — кэш без контроля конкурентности. Ошибочный выбор по устаревшему
// кэшу (старая A назначена поверх параллельно сохранённой новой B) после записи сам становится
// «свежайшим» и закрепляется. id не меняется ни от назначения, ни от пересохранения, поэтому
// решение сходится: после нашей записи план пуст, неверный выбор исправляется следующим проходом.
// Цена: пересохранение СТАРОЙ раскладки на месте (тот же id) нормой её не делает — нормой
// становится только новая раскладка.
//
// Плюс вызывающий (markers-section) перед записью перечитывает карточку и пересчитывает план
// (пишем, только если свежий план тот же), держит одну запись за раз и помнит попытки по ключу
// id@updated_at (отказ сервера не превращается в бесконечный ретрай).
//
// КОНФЛИКТ (две нормы в скоупе): если свежайшая годная — одна из них, автоматика её не трогает
// (конфликт висит пилюлей и плашкой до настоящего нового сохранения, которое снимет все прежние
// нормы скоупа). Иначе назначение свежайшей годной снимает все прежние.
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { scalarNormRefusal } from './marker-io';

type M = common_TechCardMarkerSummary;

// Порядок создания: id — AUTO_INCREMENT, назначением и пересохранением не меняется.
const idOf = (m: M) => Number(m.id ?? 0);
const createdLater = (a: M, b: M) => idOf(a) > idOf(b);

/** Может ли раскладка нести норму. '' = может; иначе — причина (она же на пилюле строки). */
export function normIneligibility(m: M): string {
  if (!(m.bomLineKey ?? '').trim()) return 'not linked to a fabric';
  return scalarNormRefusal(m);
}

export type AutoNormStep = {
  /** Строка BOM — скоуп. */
  scope: string;
  /** Кого назначить. */
  marker: M;
  /** Действующая норма скоупа до назначения (может отсутствовать). */
  current?: M;
  /** Ключ попытки: та же раскладка в той же версии не назначается дважды. */
  key: string;
};

/**
 * Что назначить. Принимает ТОЛЬКО карточные раскладки (cardMarkers): прогонные нормой не бывают.
 * Чистая функция: решает по списку, ничего не пишет.
 */
export function planAutoNorm(markers: readonly M[]): AutoNormStep[] {
  const byScope = new Map<string, M[]>();
  for (const m of markers) {
    const scope = (m.bomLineKey ?? '').trim();
    if (!scope) continue;
    const list = byScope.get(scope);
    if (list) list.push(m);
    else byScope.set(scope, [m]);
  }
  const steps: AutoNormStep[] = [];
  for (const [scope, list] of byScope) {
    let candidate: M | undefined;
    let current: M | undefined;
    for (const m of list) {
      if (m.isNorm && (!current || createdLater(m, current))) current = m;
      if (!normIneligibility(m) && (!candidate || createdLater(m, candidate))) candidate = m;
    }
    if (!candidate) continue;
    // Уже норма (в т. ч. одна из конфликтующих) — писать нечего.
    if (candidate.isNorm) continue;
    steps.push({
      scope,
      marker: candidate,
      current,
      key: `${idOf(candidate)}@${candidate.updatedAt ?? ''}`,
    });
  }
  return steps;
}
