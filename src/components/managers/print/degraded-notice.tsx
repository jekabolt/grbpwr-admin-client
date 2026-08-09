// Плашка «часть данных не пришла» — печатается НА БУМАГЕ, первым, что видно на листе.
//
// Смысл: гейт готовности (use-print-ready.ts) по таймауту всё равно отпускает кнопку, потому что
// запертая печать хуже неполной. Но неполная печать обязана назвать себя: без этой плашки лист с
// пустой размерной таблицей выглядит ровно как лист стиля, у которого таблицы нет.
export function PrintDegradedNotice({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className='mb-4 break-inside-avoid border-2 border-black px-2 py-1.5 text-control font-semibold uppercase'>
      warning: some data had not arrived when this was printed — {items.join(', ')}. Those
      sections are incomplete on paper.
    </p>
  );
}
