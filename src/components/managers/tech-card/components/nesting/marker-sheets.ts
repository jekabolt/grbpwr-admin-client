// РАСКЛАДКА СНЯТА ДО ПОСЛЕДНЕЙ ЗАЛИВКИ ВЫКРОЕК СВОЕЙ ТКАНИ (L5 п.7).
//
// Серверный отпечаток набора (`piece_set_status`) — это ключи деталей × кратности: перекрой детали
// по месту (тот же ключ, та же кратность, другая форма) его не трогает, и раскладка, снятая на
// старой геометрии, читалась бы годной молча. Признак здесь — время: DXF-лист ткани раскладки
// (тот же резолв слота, что у выкроек: назначение, иначе строка BOM) загружен ПОЗЖЕ, чем раскладка
// последний раз писалась. Пересъёмка замещает раскладку по id и двигает updated_at — признак
// снимается сам. Ничего не пересчитывает и не отменяет: только причина «перепроверить».
// Время берётся только с привязанного листа (первый лист слота или заменённый), не с чужого
// дополнительного (L5 fix 5).
import type { common_TechCard, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { isDxfUrl } from 'utils/pattern';
import { scopeKeyOfBinding } from '../bom-purpose';
import { rollGoodsScopes } from '../piece-block-refs';

const ms = (ts?: string): number | null => {
  if (!ts || ts.startsWith('0001-01-01')) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * По сохранённой карточке: id раскладки → её ткань перезалита после съёмки. Неизвестность (нет
 * времени у раскладки или у листа, раскладка без ткани) — НЕ протухание.
 */
export function markersBehindSheets(card: common_TechCard | undefined): Set<number> {
  const out = new Set<number>();
  const body = card?.techCard;
  if (!body) return out;
  const scopes = rollGoodsScopes(body.bomItems ?? []);
  // Время двигает только лист, чья геометрия стоит за деталями слота: заменённый (перезалив,
  // восстановление — у строки есть история) или первый DXF-лист слота. Чужой файл, отказанный
  // сверкой, ложится в слот ДОПОЛНИТЕЛЬНЫМ листом без истории — деталей карточки он не менял и
  // годные раскладки не старит.
  const lastBySlot = new Map<string, number>();
  const seenSlot = new Set<string>();
  for (const p of body.patterns ?? []) {
    if (!isDxfUrl(p.url)) continue;
    const k = scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, scopes);
    if (!k) continue;
    const first = !seenSlot.has(k);
    seenSlot.add(k);
    if (!first && !(p.history ?? []).length) continue;
    const t = ms(p.uploadedAt);
    if (t != null) lastBySlot.set(k, Math.max(lastBySlot.get(k) ?? 0, t));
  }
  if (lastBySlot.size === 0) return out;
  for (const m of card?.markers ?? []) {
    const k = scopeKeyOfBinding('', m.bomLineKey, scopes);
    const sheet = k ? lastBySlot.get(k) : undefined;
    const at = ms(m.updatedAt) ?? ms(m.createdAt);
    if (sheet != null && at != null && sheet > at) out.add(Number(m.id ?? 0));
  }
  return out;
}

export const markerBehind = (behind: ReadonlySet<number>, m?: common_TechCardMarkerSummary) =>
  !!m && behind.has(Number(m.id ?? 0));
