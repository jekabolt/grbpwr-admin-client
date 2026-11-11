// Warning texts both engines emit (nest/index.ts — the old one, sparrow/ — the current one).
// One copy, so the operator reads the same sentence whichever engine ran.
import type { FabricDirection } from '../types';

// Имена деталей для предупреждения. Ключ у карты — id, потому что две РАЗНЫЕ детали кроя
// законно называются одинаково (полочка верха и полочка подклада приходят из градалки под одним
// именем). Одинаковые имена поэтому не схлопываются, а пересчитываются: «ПОЛОЧКА ×2» — это две
// детали, а не одна, и оператор, пересчитывающий комплект кроя, обязан это видеть.
export function namesWithCount(byId: ReadonlyMap<number, string>): string {
  const n = new Map<string, number>();
  for (const name of byId.values()) n.set(name, (n.get(name) ?? 0) + 1);
  return [...n.entries()].map(([name, c]) => (c > 1 ? `${name} ×${c}` : name)).join(', ');
}

// Причина названа ТОЧНО, а не одним словом на два разных случая. Переворот запрещают два
// разных факта: ворс (ответ есть, и он «нельзя») и ОТСУТСТВИЕ ответа (направление у строки
// BOM не проставлено — тогда сервер не примет норму с переворотом, потому что не может
// отличить безобидные 180° от испорченного ворса). Чинятся они по-разному: первый — кроем в
// два слоя, второй — одним полем на вкладке BOM. Сказать «ворс» про второй значит послать
// раскройщика решать проблему, которой нет.
export function mirrorRefusedWarning(
  direction: FabricDirection,
  refused: ReadonlyMap<number, string>,
): string {
  const why =
    direction === 'one_way'
      ? 'the fabric is directional (nap)'
      : 'the fabric direction is not set on the BOM line, and without an answer flipping is forbidden (the norm could not be saved otherwise)';
  return (
    `${why} — the mirrored instances are not placed: ${namesWithCount(refused)}. ` +
    'a flip on such a fabric lays the piece against the nap, and so does a half-turn, and a ' +
    'marker with it cannot be saved. mirrored pieces on a napped fabric are cut in two plies ' +
    'face to face — that is a different marker.'
  );
}
