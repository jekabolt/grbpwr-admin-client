import { useState } from 'react';
import { Dropdown, Text } from 'ui';
import { KitDemo } from './kit-entry';

/** The main dropdown of the fill system. Fixed sample values: the page is screenshot-tested. */

const STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'current', label: 'Current' },
  { value: 'review', label: 'In Review' },
  { value: 'done', label: 'Completed' },
];
const PEOPLE = ['Modelka', 'Designer', 'Manager', 'Jeka'].map((n) => ({ value: n, label: n }));
const TASKS = [
  { value: '1', label: 'Task Task', meta: 'To Do' },
  { value: '2', label: 'Task No224', meta: 'Current' },
  { value: '3', label: 'Untitled', meta: 'Current' },
];

function DropdownDemo() {
  const [status, setStatus] = useState<string | null>('todo');
  const [people, setPeople] = useState<string[]>(['Modelka']);
  const [task, setTask] = useState<string | null>('2');
  const [last, setLast] = useState('');
  return (
    <div className='grid max-w-xl grid-cols-2 items-start gap-x-2.5 gap-y-6 bg-bgColor'>
      <Dropdown
        label='Status'
        defaultOpen
        options={STATUSES}
        value={status}
        onChange={setStatus}
        addLabel='Add Custom Board'
        onAdd={() => setLast('add')}
      />
      <Dropdown label='Category' options={[]} emptyLabel='No Boards' />
      <Dropdown
        label='Assignees'
        multiple
        options={PEOPLE}
        values={people}
        onValuesChange={setPeople}
      />
      <Dropdown
        label='Make Subtask of'
        searchable
        deselectable
        options={TASKS}
        value={task}
        onChange={setTask}
      />
      <Text className='text-placeholder'>{last}</Text>
    </div>
  );
}

export const dropdownDemos: KitDemo[] = [{ names: ['Dropdown'], Demo: DropdownDemo }];
