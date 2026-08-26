// СТЕНД РЯДА ЛИЦ: настоящий `FiltersBar` раздела задач и настоящий `AvatarPicker` из кита.
// Люди приходят из настоящего `assigneePiles` по настоящей доске — то есть проверяется вся
// цепочка «карточки → кучки → ряд → сужение», а не одна её половина.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyFilters,
  assigneePiles,
  emptyFilters,
  FiltersBar,
} from '../src/components/managers/tasks/components/filters-bar';

const card = (id: number, assignees: string[]) =>
  ({
    id,
    task: { assignees, assignee: assignees[0] ?? '', priority: 'TASK_PRIORITY_UNKNOWN' },
  }) as any;

// «Я» — x. Карточка 5 держит меня ВТОРЫМ: витрина показывает y.
const BOARD = [card(1, ['x']), card(2, ['x', 'y']), card(3, ['y']), card(4, []), card(5, ['y', 'x'])];

function Harness() {
  const [filters, setFilters] = useState(emptyFilters);
  const people = assigneePiles(BOARD);
  const visible = applyFilters(BOARD, filters, 'x');
  return (
    <div style={{ padding: 24 }}>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        showMine
        people={people}
        showArchived={false}
        onToggleArchived={() => {}}
        onClear={() => setFilters(emptyFilters)}
      />
      <div id='visible'>{visible.map((t) => t.id).join(',')}</div>
      <div id='filters'>{JSON.stringify(filters)}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
