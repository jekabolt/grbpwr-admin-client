import { type ReactNode } from 'react';

// Примитивы ПЕЧАТНОЙ вёрстки — единственная копия на всю кодовую базу.
//
// До этого модуля Sheet/KV/TD/TH жили двумя дословными копиями (тех-пак и наряд на партию), и
// копия была НАМЕРЕННОЙ: импорт из tech-pack-document утащил бы в чанк печатного роута наряда
// весь тех-пак с его медиа, моделями, словарём ухода и раскладками — ради двух элементов
// вёрстки по восемь строк. Поэтому правило этого файла: он обязан остаться ЛЁГКИМ standalone —
// импортирует только react, никаких `api/`, словарей, хуков и реэкспортов из документов. Как
// только сюда придёт что-то тяжёлое, вернётся ровно та причина, по которой копий было две.
//
// ПРАВИЛО ИЗОЛЯЦИИ ПЕЧАТИ. В кодовой базе живут три несовместимые механики:
//   A — «голый маршрут»: страница рендерится вне Layout под ProtectedBare, документ лежит в
//       обычном потоке, инлайн PRINT_CSS прячет тулбар (инвойс, тех-пак, наряд на партию);
//   B — data-print-region: глобальный :has()-селектор в global.css прячет всё, что не предок и
//       не потомок региона (кат-талон) — уже давал полностью пустые страницы из-за забытого :not();
//   C — рассыпанные print:hidden: печатается вся страница минус то, что помечено (pick list) —
//       любой новый блок на такой странице молча попадает на бумагу.
// Всё НОВОЕ живёт только в механике A. Кроме прочего, от этого зависят @page margin boxes
// (см. page-furniture.tsx): они глобальны на документ и работают лишь потому, что печатный
// маршрут на странице ровно один.

export const TD = 'border border-black px-1.5 py-1 align-top';
export const TH =
  'border border-black px-1.5 py-1 text-left font-semibold bg-neutral-100 uppercase';

// Лист документа: чёрная плашка заголовка + содержимое. Заголовок не отрывается от своего листа
// (break-after-avoid), иначе на бумаге остаётся шапка без таблицы.
export function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='mb-5'>
      <h2 className='mb-2 break-after-avoid bg-black px-2 py-1 text-control font-bold uppercase tracking-[0.12em] text-white'>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function KV({ k, v }: { k: string; v?: ReactNode }) {
  const empty = v == null || v === '' || v === '—';
  return (
    <div className='flex gap-2 break-inside-avoid border-b border-textInactiveColor py-0.5 text-control leading-tight'>
      <span className='w-36 shrink-0 uppercase tracking-wide text-labelColor'>{k}</span>
      <span className='font-medium'>{empty ? '—' : v}</span>
    </div>
  );
}

// Пустое место листа. Говорит ПОЧЕМУ пусто: молчаливая пустая таблица читается как «здесь ничего
// не требуется», а это ровно противоположно правде в большинстве случаев, из-за которых она пуста.
export function Nothing({ children }: { children: ReactNode }) {
  return <p className='border border-black px-2 py-1.5 text-micro'>{children}</p>;
}
