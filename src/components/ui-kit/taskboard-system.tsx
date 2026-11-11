import { useState } from 'react';
import {
  AddInline,
  CascadeList,
  FilterFaces,
  FilterItem,
  FilterRow,
  Fold,
  LiquidTabs,
  MetaWord,
  PeopleUnfold,
  SelectWords,
  SortCount,
  Text,
  TileShell,
  TileTitle,
  useStepScroll,
  WheelDatePicker,
} from 'ui';
import { KitDemo } from './kit-entry';

/** The Taskboard system (Tasks screen → Models). Fixed sample values: the page is screenshot-tested. */

const DEPARTMENTS = ['Any', 'Development', 'Design', 'Sourcing'];
const PEOPLE = ['Modelka', 'Designer', 'Manager'];

function FilterRowDemo() {
  const [open, setOpen] = useState<string | null>(null);
  const [department, setDepartment] = useState('Any');
  const [who, setWho] = useState<string | undefined>(undefined);
  const rows = open === 'department' ? DEPARTMENTS.length : open === 'people' ? PEOPLE.length : 0;
  return (
    <div className='max-w-2xl'>
      <FilterRow open={open} onOpenChange={setOpen}>
        <FilterItem id='department' label='Department' value={department}>
          <CascadeList
            label='department'
            size='compact'
            open={open === 'department'}
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
            value={department}
            onChange={(v) => {
              setDepartment(v);
              setOpen(null);
            }}
          />
        </FilterItem>
        <FilterItem
          id='people'
          value={who ?? 'Assignees'}
          after={<FilterFaces id='people' names={PEOPLE} value={who} onChange={setWho} />}
        >
          <CascadeList
            label='people'
            size='compact'
            open={open === 'people'}
            options={PEOPLE.map((p) => ({ value: p, label: p }))}
            value={who}
            onChange={(v) => {
              setWho(v);
              setOpen(null);
            }}
          />
        </FilterItem>
      </FilterRow>
      <div
        className='transition-[height] duration-700 ease-soft'
        style={{ height: FilterRow.room(rows) }}
      />
      <Text className='text-placeholder'>Content under the row</Text>
    </div>
  );
}

const VIEWS = [
  { value: 'task', label: 'Task' },
  { value: 'description', label: 'Description' },
  { value: 'history', label: 'History' },
];

function SampleTile({
  title,
  quiet,
  minimal,
  selected,
  onClick,
}: {
  title: string;
  quiet?: boolean;
  minimal?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const [view, setView] = useState('task');
  const [editor, setEditor] = useState(false);
  const [priority, setPriority] = useState('High');
  const tabs = !!selected && !minimal;
  return (
    <div onClick={onClick} className='cursor-pointer'>
      <TileShell
        selected={selected}
        minimal={minimal}
        words={[
          { key: 'edit', label: 'Edit', onClick: () => undefined },
          { key: 'archive', label: 'Archive', onClick: () => undefined },
          { key: 'delete', label: 'Delete', onClick: () => undefined },
        ]}
      >
        <div className='flex min-h-5 items-center justify-between gap-2 px-1'>
          <MetaWord
            label='Priority'
            value={priority}
            active={editor}
            onClick={() => setEditor((v) => !v)}
          />
          <MetaWord label='Deadline' value='Nov 17, 2026' bracket={false} tone='alert' />
        </div>
        <div className='px-1'>
          <CascadeList
            label='priority'
            size='compact'
            open={editor}
            options={['Low', 'Medium', 'High', 'Urgent'].map((p) => ({ value: p, label: p }))}
            value={priority}
            onChange={(v) => {
              setPriority(v);
              setEditor(false);
            }}
          />
          <Fold open={!editor} className={minimal ? 'mt-1' : 'mt-3'}>
            <TileTitle minimal={minimal} quiet={quiet && !selected}>
              {title}
            </TileTitle>
          </Fold>
          <Fold open={tabs}>
            <div className='pt-2'>
              <LiquidTabs label='tile view' items={VIEWS} value={view} onChange={setView} />
            </div>
          </Fold>
          <Fold open={!tabs}>
            <div className={minimal ? 'h-1.5' : 'h-4'} />
          </Fold>
        </div>
      </TileShell>
    </div>
  );
}

function TileShellDemo() {
  const [selected, setSelected] = useState<number | null>(1);
  const titles = ['Far deadline: grey title', 'Selected: words, tabs at the bottom edge'];
  return (
    <div className='grid max-w-2xl grid-cols-1 gap-x-4 sm:grid-cols-2'>
      {titles.map((title, i) => (
        <SampleTile
          key={title}
          title={title}
          quiet={i === 0}
          selected={selected === i}
          onClick={() => setSelected((s) => (s === i ? null : i))}
        />
      ))}
      <SampleTile title='Minimal: 16px title, header kept' minimal />
    </div>
  );
}

function SelectWordsDemo() {
  const [shown, setShown] = useState(true);
  return (
    <div className='max-w-xs'>
      <SelectWords
        shown={shown}
        items={[
          { key: 'edit', label: 'Edit', onClick: () => setShown(false) },
          { key: 'archive', label: 'Archive', onClick: () => setShown(false) },
          { key: 'delete', label: 'Delete', onClick: () => setShown(false) },
        ]}
      />
      <SortCount count='show' label='show the words' onClick={() => setShown(true)} />
    </div>
  );
}

function MetaWordDemo() {
  return (
    <div className='flex flex-wrap items-baseline gap-x-6 gap-y-2'>
      <MetaWord label='Department' value='Development' />
      <MetaWord label='Priority' value='High' onClick={() => undefined} />
      <MetaWord label='Priority' value='High' active onClick={() => undefined} />
      <MetaWord label='Deadline' value='Nov 17, 2026' bracket={false} tone='alert' />
      <MetaWord
        label='Deadline'
        value='Set a Date'
        bracket={false}
        tone='quiet'
        onClick={() => undefined}
      />
      <MetaWord label='Status' value='To Do' dim />
    </div>
  );
}

function HeaderEditorsDemo() {
  const [date, setDate] = useState(new Date(2026, 10, 17));
  const [open, setOpen] = useState(false);
  return (
    <div className='grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2'>
      <div>
        <Text className='mb-2 text-placeholder'>compact</Text>
        <WheelDatePicker size='compact' open value={date} onChange={setDate} />
      </div>
      <div style={{ minHeight: 30 + PeopleUnfold.height(PEOPLE.length, 20) }}>
        <Text className='mb-2 text-placeholder'>people</Text>
        <PeopleUnfold names={PEOPLE} open={open} onOpenChange={setOpen} />
      </div>
    </div>
  );
}

function StepScrollDemo() {
  const rows = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const { list, at, free } = useStepScroll(rows.length);
  return (
    <div
      ref={list}
      className={
        free
          ? 'h-56 max-w-xs overflow-y-auto overscroll-contain px-1'
          : 'h-56 max-w-xs overflow-hidden px-1'
      }
    >
      {rows.map((row, i) => (
        <SampleTile key={row} title={`${row} — wheel over the column`} minimal={i < at} />
      ))}
    </div>
  );
}

function SortCountDemo() {
  const [state, setState] = useState<'asc' | 'desc' | null>(null);
  const [late, setLate] = useState(false);
  return (
    <div className='flex items-center gap-2 text-textBaseSize'>
      <Text className='text-ink'>To Do</Text>
      <SortCount
        tone='alert'
        count={4}
        state={late ? 'on' : null}
        label='4 overdue — sort'
        onClick={() => setLate((v) => !v)}
      />
      <SortCount
        count={8}
        state={state}
        label='8 tasks — sort'
        onClick={() => setState((s) => (s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc'))}
      />
    </div>
  );
}

function BoardTabsDemo() {
  const [tab, setTab] = useState('all');
  return (
    <div className='max-w-xl'>
      <LiquidTabs
        label='boards'
        items={[
          { value: 'all', label: 'All' },
          { value: 'mine', label: 'My Tasks' },
          { value: 'archived', label: 'Archived' },
        ]}
        value={tab}
        onChange={setTab}
        end={<AddInline label='Add New Board' onSubmit={() => undefined} />}
      />
    </div>
  );
}

export const taskboardDemos: KitDemo[] = [
  { names: ['FilterRow', 'FilterItem', 'FilterFaces'], Demo: FilterRowDemo },
  { names: ['TileShell', 'TileTitle', 'Fold'], Demo: TileShellDemo },
  { names: ['SelectWords'], Demo: SelectWordsDemo },
  { names: ['MetaWord'], Demo: MetaWordDemo },
  {
    names: ['HeaderEditors'],
    Demo: HeaderEditorsDemo,
    title: 'Header editors',
    question: 'CascadeList / WheelDatePicker / PeopleUnfold in a tile header',
  },
  {
    names: ['useStepScroll'],
    Demo: StepScrollDemo,
    title: 'Step scroll',
    question: "import { useStepScroll, useStepWheel, usePressHold } from 'ui'",
  },
  { names: ['SortCount'], Demo: SortCountDemo },
  {
    names: ['BoardTabs'],
    Demo: BoardTabsDemo,
    title: 'Board tabs + Add',
    question: 'LiquidTabs with AddInline at its end',
  },
];
