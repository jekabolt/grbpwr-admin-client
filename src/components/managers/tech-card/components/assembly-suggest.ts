// Автопредложение кода узла по зоне операции.
//
// Вынуто из `ProducesBlock` в общий хелпер, потому что теперь предлагать код надо в ДВУХ местах:
// в открытом шаге («▣ сделать узлом») и в диалоге создания из схемы. Диалог знает зону РАНЬШЕ, чем
// шаг существует, — и предлагает уже осмысленный код, а не UNIT-3.

/**
 * Свободный код узла: токен зоны, при занятости — с числовым хвостом.
 *
 * `taken` — ЕДИНОЕ пространство имён: ключи узлов И ключи деталей (правило 6). Предлагать код,
 * совпавший с деталью, значит предлагать заведомый отказ.
 */
export function suggestUnitCode(zone: string, taken: Set<string>): string {
  // UNKNOWN и OTHER — не имена зон, а их отсутствие: узел «UNKNOWN» уехал бы на печать и в QR.
  const token = (zone ?? '').replace(/^TECH_CARD_GARMENT_ZONE_/, '');
  const base =
    token === 'UNKNOWN' || token === 'OTHER' || !token
      ? 'UNIT'
      : token.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UNIT';
  // Колонка сервера — VARCHAR(64), и режет она БАЙТЫ. Код собран из ASCII-токена зоны, но
  // подрезать всё равно надо здесь: отказ по длине на сохранении был бы отказом за то, чего
  // автор не набирал.
  const fit = (v: string) => (new TextEncoder().encode(v).length <= 64 ? v : v.slice(0, 48));
  if (!taken.has(base)) return fit(base);
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return fit(candidate);
  }
}
