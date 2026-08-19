// Чтение int64 С ПРОВОДА — вынесено из schema.ts БЕЗ ИЗМЕНЕНИЙ.
//
// Причина выноса — та же, что у bom-purpose-labels.ts и piece-layer-role.ts: чистым модулям
// (piece-cloth.ts и всё, что за ним последует на публичные страницы /p/:token и /r/:token) нужна
// ровно эта трёхстрочная функция, а schema.ts тянет за собой zod, react-hook-form и весь словарь
// тех-карты. Лист не зависит ни от чего. Сама schema.ts реэкспортирует wireInt отсюда, так что
// второй орфографии чтения id не появляется и существующие импортёры не тронуты.

// Reads a numeric id off the WIRE. grpc-gateway serialises proto int64 as a JSON STRING while the
// generated TS type declares it `number`, so the compiler cannot catch the mismatch and a bare
// z.number() rejects the real payload with "Invalid input" on a field the operator cannot see or
// fix. That broke every card with a linked BOM line (int64 material_id). int64 fields in the
// tech-card contract today: material_id, bom_item_id, colorway_id, fusing_bom_item_id, piece_id,
// id, size_bytes. Route EVERY wire-read id through this rather than trusting the declared type --
// coercing a value that is already a number costs nothing, and the next int64 added upstream then
// cannot reintroduce the bug.
export function wireInt(value: unknown): number {
  return Number(value) || 0;
}
