import { useState } from 'react';
import {
  AddInline,
  BracketOptions,
  ButtonRow,
  CascadeList,
  Iconoir,
  Category,
  LineField,
  LiquidTabs,
  NoteBlock,
  PeopleUnfold,
  PinToggle,
  Segmented,
  StepRow,
  Text,
  WheelDatePicker,
} from 'ui';
import { KitDemo } from './kit-entry';

/** The Lekalo fill system (models panel). Fixed sample values: the page is screenshot-tested. */

const GENDERS = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
];
const TOPS = ['OS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => ({ value: s, label: s }));
const BOTTOMS = [26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46].map((n, i) => ({
  value: String(n),
  label: `${['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'][i]} / ${n}`,
}));
const UNITS = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'in', label: 'inch' },
];

function CategoryDemo() {
  const [active, setActive] = useState('a');
  return (
    <div className='flex max-w-xl flex-col gap-10 bg-bgColor'>
      <Category
        title='Required Info'
        active={active === 'a'}
        onActivate={() => setActive('a')}
        pin={{ pinned: true, onToggle: () => undefined }}
      >
        <Text className='text-placeholder'>body</Text>
      </Category>
      <Category
        title='Measurements'
        active={active === 'b'}
        onActivate={() => setActive('b')}
        action={
          <BracketOptions
            options={UNITS}
            value='mm'
            onChange={() => undefined}
            ariaLabel='units'
            overflow={false}
          />
        }
      >
        <Text className='text-placeholder'>body</Text>
      </Category>
    </div>
  );
}

function LineFieldDemo() {
  const [pinned, setPinned] = useState(true);
  return (
    <div className='grid max-w-xl grid-cols-2 gap-x-6.5 gap-y-4'>
      <LineField name='kit-line-empty' placeholder='Model Name' />
      <LineField name='kit-line-filled' defaultValue='German' />
      <LineField
        name='kit-line-label'
        label='Chest'
        defaultValue='1040'
        pin={{ pinned, onToggle: () => setPinned(!pinned) }}
      />
      <LineField name='kit-line-error' placeholder='Model Name' error />
    </div>
  );
}

function PinToggleDemo() {
  const [on, setOn] = useState(true);
  return (
    <div className='flex items-center gap-6'>
      <PinToggle pinned={on} onToggle={() => setOn(!on)} label='pin' />
      <PinToggle pinned={false} onToggle={() => undefined} label='pin off' />
    </div>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState('male');
  return (
    <div className='grid max-w-xl grid-cols-2 gap-6.5'>
      <Segmented items={GENDERS} value={value} onChange={setValue} label='gender' />
      <Segmented items={GENDERS} value='' onChange={() => undefined} label='gender' error />
    </div>
  );
}

function BracketOptionsDemo() {
  const [top, setTop] = useState<string | null>('OS');
  const [bottom, setBottom] = useState<string | null>('32');
  const [unit, setUnit] = useState('mm');
  return (
    <div className='flex max-w-xl flex-col gap-4'>
      <BracketOptions
        ruled
        deselectable
        label='Tops:'
        options={TOPS}
        value={top}
        onChange={setTop}
        ariaLabel='tops'
        end={<PinToggle pinned={false} onToggle={() => undefined} />}
      />
      <BracketOptions
        ruled
        deselectable
        label='Bottoms:'
        options={BOTTOMS}
        value={bottom}
        onChange={setBottom}
        ariaLabel='bottoms'
        end={<PinToggle pinned onToggle={() => undefined} />}
      />
      <BracketOptions
        options={UNITS}
        value={unit}
        onChange={(v) => v && setUnit(v)}
        ariaLabel='units'
        overflow={false}
      />
    </div>
  );
}

function NoteBlockDemo() {
  const [text, setText] = useState('');
  return (
    <div className='max-w-xl'>
      <NoteBlock
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Add a Comment...'
        aria-label='comment'
        uploadLabel='Upload a Text File'
        onUploadText={setText}
        openLabel='Open Full Note'
        onOpen={() => undefined}
      />
    </div>
  );
}

export const fillDemos: KitDemo[] = [
  { names: ['Category'], Demo: CategoryDemo },
  { names: ['LineField'], Demo: LineFieldDemo },
  { names: ['PinToggle'], Demo: PinToggleDemo },
  { names: ['Segmented'], Demo: SegmentedDemo },
  { names: ['BracketOptions'], Demo: BracketOptionsDemo },
  { names: ['NoteBlock'], Demo: NoteBlockDemo },
];

function StepRowDemo() {
  const [index, setIndex] = useState(0);
  return (
    <div className='max-w-xl'>
      <StepRow index={index} onIndexChange={setIndex} label='sample row' trackClassName='gap-2'>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className='grid h-24 w-32 shrink-0 place-items-center bg-fieldFill text-titleMuted'
          >
            {i + 1}
          </div>
        ))}
      </StepRow>
      <Text className='mt-2 text-placeholder'>{index + 1} / 8</Text>
    </div>
  );
}

fillDemos.push({ names: ['StepRow'], Demo: StepRowDemo });

function ButtonRowDemo() {
  const [last, setLast] = useState('');
  return (
    <div className='flex max-w-xl flex-col gap-2'>
      <ButtonRow
        label='save or cancel'
        items={[
          { key: 'cancel', label: 'Cancel', onClick: () => setLast('cancel') },
          { key: 'save', label: 'Save', onClick: () => setLast('save') },
        ]}
      />
      <ButtonRow
        label='save disabled'
        items={[
          { key: 'cancel', label: 'Cancel', onClick: () => undefined },
          { key: 'save', label: 'Save', onClick: () => undefined, disabled: true },
        ]}
      />
      <Text className='text-placeholder'>{last}</Text>
    </div>
  );
}

function MultipleOptionsDemo() {
  const [chosen, setChosen] = useState<string[]>(['S', 'M']);
  return (
    <div className='max-w-xl'>
      <BracketOptions
        ruled
        multiple
        label='Tops:'
        options={TOPS}
        values={chosen}
        onValuesChange={setChosen}
        ariaLabel='tops'
      />
    </div>
  );
}

function IconoirDemo() {
  return (
    <div className='flex items-center gap-4 text-ink'>
      {(
        [
          'pin',
          'edit-pencil',
          'plus',
          'search',
          'arrow-left',
          'nav-arrow-left',
          'nav-arrow-right',
        ] as const
      ).map((name) => (
        <span key={name} title={name}>
          <Iconoir name={name} className='size-5' />
        </span>
      ))}
    </div>
  );
}

fillDemos.push(
  { names: ['ButtonRow'], Demo: ButtonRowDemo },
  { names: ['Iconoir'], Demo: IconoirDemo },
  {
    names: ['BracketOptionsMultiple'],
    Demo: MultipleOptionsDemo,
    title: 'BracketOptions multiple',
    question: 'BracketOptions with multiple',
  },
);

/** The task tile's in-place pieces (Tasks spec 2). Fixed sample values. */

function LiquidTabsDemo() {
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
        end={<AddInline label='Add Category' onSubmit={() => undefined} />}
      />
    </div>
  );
}

function CascadeListDemo() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('sourcing');
  return (
    <div className='flex max-w-xl flex-col gap-2'>
      <ButtonRow
        label='cascade'
        items={[{ key: 'toggle', label: open ? 'Close' : 'Open', onClick: () => setOpen(!open) }]}
      />
      <CascadeList
        label='department'
        open={open}
        options={['Development', 'Design', 'Sourcing', 'Marketing'].map((l) => ({
          value: l.toLowerCase(),
          label: l,
        }))}
        value={value}
        onChange={setValue}
        addLabel='Add'
        onAdd={() => undefined}
      />
      <CascadeList
        label='priority'
        size='compact'
        open={open}
        options={['Low', 'Medium', 'High', 'Urgent'].map((l) => ({ value: l, label: l }))}
        value='High'
        onChange={() => undefined}
      />
    </div>
  );
}

function WheelDatePickerDemo() {
  const [date, setDate] = useState(new Date(2026, 10, 17));
  return (
    <div className='max-w-2xl'>
      <WheelDatePicker open value={date} onChange={setDate} />
      <div className='mt-6 max-w-xs'>
        <WheelDatePicker size='compact' open value={date} onChange={setDate} />
      </div>
    </div>
  );
}

function PeopleUnfoldDemo() {
  const [open, setOpen] = useState(false);
  const names = ['Modelka', 'Designer', 'Manager'];
  return (
    <div
      className='transition-[padding] duration-700 ease-soft'
      style={{ minHeight: 30 + PeopleUnfold.height(names.length, 30) }}
    >
      <PeopleUnfold names={names} size={30} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AddInlineDemo() {
  return (
    <div className='max-w-xl'>
      <AddInline label='Add Category' onSubmit={() => undefined} />
    </div>
  );
}

fillDemos.push(
  { names: ['LiquidTabs'], Demo: LiquidTabsDemo },
  { names: ['CascadeList'], Demo: CascadeListDemo },
  { names: ['WheelDatePicker'], Demo: WheelDatePickerDemo },
  { names: ['PeopleUnfold'], Demo: PeopleUnfoldDemo },
  { names: ['AddInline'], Demo: AddInlineDemo },
);
