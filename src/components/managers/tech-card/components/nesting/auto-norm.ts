// НОРМА НАЗНАЧАЕТСЯ САМА — кнопки «set as norm» больше нет.
//
// Скоуп — ровно серверный (markerNormScopePredicate): карточка × строка BOM. Колорвей в скоуп НЕ
// входит: одна норма на ткань. Раскладка без ткани (bomLineKey '') живёт в своём скоупе «без ткани»,
// и его автоматика не трогает — гейт готовности спрашивает о ткани, такая норма ничего не значит.
//
// ПРАВИЛО: норма скоупа = самая свежая (updated_at, затем id — тот же тайбрейк, что SelectNorm на
// сервере) ГОДНАЯ раскладка: карточная, не черновик, без отказа скалярной нормы (смешанный состав,
// нечитаемый состав). Действуем, когда:
//   (а) в скоупе нормы нет вовсе (удалили норму, или карточка до автоматики) — ставим свежайшую
//       годную;
//   (б) свежайшая годная СТРОГО новее действующей нормы — её сохранили (или пересняли) после
//       назначения нормы.
//
// ПОЧЕМУ ЭТО НЕ ЗАЦИКЛИВАЕТСЯ. updated_at — ON UPDATE CURRENT_TIMESTAMP, поэтому назначение бампает и
// новую норму, и снятую прежнюю. Но сервер СНАЧАЛА снимает, ПОТОМ ставит (одна транзакция), так что
// снятая никогда не бывает строго новее новой нормы: (б) после нашей же записи ложно. А (а) после
// записи ложно по определению. Плюс вызывающий помнит попытки по ключу id@updated_at и не повторяет
// одну и ту же (отказ сервера не превращается в бесконечный ретрай).
//
// КОНФЛИКТ (две нормы в скоупе) сам по себе не разрешается: действующей считается свежайшая из них
// (как у читателей сервера), и автоматика сработает только по (б) — на настоящем новом сохранении,
// которое заодно снимет ВСЕ прежние нормы скоупа. До того конфликт висит пилюлей и плашкой.
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { scalarNormRefusal } from './marker-io';

type M = common_TechCardMarkerSummary;

const ts = (m: M) => {
  const t = Date.parse(m.updatedAt ?? '');
  return Number.isFinite(t) ? t : 0;
};
// «a свежее b» — тайбрейк SelectNorm: updated_at, затем больший id.
const newer = (a: M, b: M) =>
  ts(a) > ts(b) || (ts(a) === ts(b) && Number(a.id ?? 0) > Number(b.id ?? 0));

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
      if (m.isNorm && (!current || newer(m, current))) current = m;
      if (!normIneligibility(m) && (!candidate || newer(m, candidate))) candidate = m;
    }
    if (!candidate) continue;
    if (current && Number(current.id) === Number(candidate.id)) continue;
    // (б) строго новее — по времени, а не по тайбрейку id: равные метки бывают ровно у пары
    // «снятая прежняя + новая норма» одной транзакции, и это не сохранение.
    if (current && ts(candidate) <= ts(current)) continue;
    steps.push({
      scope,
      marker: candidate,
      current,
      key: `${Number(candidate.id ?? 0)}@${candidate.updatedAt ?? ''}`,
    });
  }
  return steps;
}
