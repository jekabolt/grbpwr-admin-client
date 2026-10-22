import { useCallback, useState } from 'react';
import {
  ChecklistEditor,
  CheckboxCommon,
  Combobox,
  type ComboboxGroup,
  DatePicker,
  DateRangePicker,
  Input,
  Select,
  Textarea,
  ToggleSwitch,
} from 'ui';
import { KitDemo, KitMatrix } from './kit-entry';

const STATES = ['empty', 'filled', 'error', 'disabled'];
// Fixed, never `new Date()`: the page is screenshot-tested.
const SAMPLE_DATE = new Date(2026, 9, 19);
const SIZES = [
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
];

function InputDemo() {
  return (
    <KitMatrix
      cols={STATES}
      rows={[
        {
          label: 'Input',
          cells: [
            <Input name='kit-input-empty' placeholder='name' />,
            <Input name='kit-input-filled' defaultValue='wool coat' />,
            <Input name='kit-input-error' defaultValue='-3' aria-invalid />,
            <Input name='kit-input-disabled' defaultValue='locked' disabled />,
          ],
        },
      ]}
    />
  );
}

function TextareaDemo() {
  return (
    <KitMatrix
      cols={STATES}
      rows={[
        {
          label: 'default',
          cells: [
            <Textarea name='kit-ta-empty' placeholder='note' />,
            <Textarea name='kit-ta-filled' defaultValue='double-face wool, raw edge' />,
            <Textarea name='kit-ta-error' defaultValue='' aria-invalid />,
            <Textarea name='kit-ta-disabled' defaultValue='locked' disabled />,
          ],
        },
        {
          label: 'secondary',
          cells: [
            <Textarea name='kit-ta2-empty' variant='secondary' placeholder='note' />,
            <Textarea
              name='kit-ta2-fixed'
              variant='secondary'
              autoGrow={false}
              defaultValue='fixed'
            />,
          ],
        },
      ]}
    />
  );
}

function SelectDemo() {
  const [value, setValue] = useState('M');
  return (
    <KitMatrix
      cols={STATES}
      rows={[
        {
          label: 'Select',
          cells: [
            <Select name='kit-select-empty' items={SIZES} placeholder='size' />,
            <Select
              name='kit-select-filled'
              items={SIZES}
              placeholder='size'
              value={value}
              onValueChange={setValue}
            />,
            <Select name='kit-select-error' items={SIZES} placeholder='size' invalid />,
            <Select
              name='kit-select-disabled'
              items={SIZES}
              placeholder='size'
              value='M'
              disabled
            />,
          ],
        },
      ]}
    />
  );
}

function ComboboxDemo() {
  const [picked, setPicked] = useState<string | undefined>('wool 420');
  const filter = useCallback((q: string): ComboboxGroup[] => {
    const all = ['wool 420', 'cupro', 'cotton poplin'];
    return [
      {
        key: 'fabric',
        label: 'fabric',
        options: all
          .filter((o) => o.includes(q.toLowerCase()))
          .map((o) => ({ value: o, label: o })),
      },
    ].filter((g) => g.options.length > 0);
  }, []);
  return (
    <KitMatrix
      cols={STATES}
      rows={[
        {
          label: 'Combobox',
          cells: [
            <Combobox
              name='kit-cb-empty'
              placeholder='fabric'
              filter={filter}
              onSelect={setPicked}
            />,
            <Combobox
              name='kit-cb-filled'
              placeholder='fabric'
              valueLabel={picked}
              filter={filter}
              onSelect={setPicked}
            />,
            <Combobox
              name='kit-cb-error'
              placeholder='fabric'
              invalid
              filter={filter}
              onSelect={setPicked}
            />,
            <Combobox
              name='kit-cb-disabled'
              placeholder='fabric'
              valueLabel='cupro'
              readOnly
              filter={filter}
              onSelect={setPicked}
            />,
          ],
        },
      ]}
    />
  );
}

function DatePickerDemo() {
  const [date, setDate] = useState<Date | undefined>(SAMPLE_DATE);
  return (
    <KitMatrix
      cols={['empty', 'filled', 'disabled']}
      rows={[
        {
          label: 'default',
          cells: [
            <DatePicker onChange={() => undefined} />,
            <DatePicker value={date} onChange={setDate} />,
            <DatePicker value={SAMPLE_DATE} onChange={() => undefined} disabled />,
          ],
        },
        {
          label: 'boxed',
          cells: [
            <DatePicker boxed onChange={() => undefined} />,
            <DatePicker boxed value={date} onChange={setDate} />,
            <DatePicker boxed value={SAMPLE_DATE} onChange={() => undefined} disabled />,
          ],
        },
      ]}
    />
  );
}

function DateRangePickerDemo() {
  const [range, setRange] = useState({ from: '2026-09-28', to: '2026-10-02' });
  return (
    <KitMatrix
      cols={['empty', 'filled']}
      rows={[
        {
          label: 'DateRangePicker',
          cells: [
            <DateRangePicker onChange={() => undefined} />,
            <DateRangePicker
              from={range.from}
              to={range.to}
              onChange={(from, to) => setRange({ from, to })}
            />,
          ],
        },
      ]}
    />
  );
}

function CheckboxDemo() {
  return (
    <KitMatrix
      cols={['off', 'on', 'disabled']}
      rows={[
        {
          label: 'CheckboxCommon',
          cells: [
            <CheckboxCommon name='kit-cbx-off' />,
            <CheckboxCommon name='kit-cbx-on' defaultChecked />,
            <CheckboxCommon name='kit-cbx-disabled' defaultChecked disabled />,
          ],
        },
      ]}
      labelWidth={150}
    />
  );
}

function ToggleSwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <KitMatrix
      cols={['off', 'on', 'disabled', 'error']}
      rows={[
        {
          label: 'ToggleSwitch',
          cells: [
            <ToggleSwitch label='lined' />,
            <ToggleSwitch label='active' checked={on} onCheckedChange={setOn} />,
            <ToggleSwitch label='locked' checked disabled />,
            <ToggleSwitch label='fused' invalid />,
          ],
        },
      ]}
    />
  );
}

function ChecklistDemo() {
  const [items, setItems] = useState([
    { id: 1, content: 'cut shell', isDone: true },
    { id: 2, content: 'fuse facing', isDone: false },
  ]);
  return (
    <div className='grid grid-cols-1 gap-gutter lg:grid-cols-2'>
      <ChecklistEditor
        label='steps'
        items={items}
        canWrite
        onToggle={(id, isDone) => setItems(items.map((i) => (i.id === id ? { ...i, isDone } : i)))}
        onDelete={(id) => setItems(items.filter((i) => i.id !== id))}
        onAdd={(content) => setItems([...items, { id: items.length + 1, content, isDone: false }])}
      />
      <ChecklistEditor
        label='read-only'
        items={items}
        canWrite={false}
        onToggle={() => undefined}
        onDelete={() => undefined}
        onAdd={() => undefined}
      />
    </div>
  );
}

export const inputDemos: KitDemo[] = [
  { names: ['Input'], Demo: InputDemo },
  { names: ['Textarea'], Demo: TextareaDemo },
  { names: ['Select', 'SelectTrigger', 'SelectContent', 'SelectItem'], Demo: SelectDemo },
  { names: ['Combobox'], Demo: ComboboxDemo },
  { names: ['DatePicker'], Demo: DatePickerDemo },
  { names: ['DateRangePicker'], Demo: DateRangePickerDemo },
  { names: ['CheckboxCommon'], Demo: CheckboxDemo },
  { names: ['ToggleSwitch'], Demo: ToggleSwitchDemo },
  { names: ['ChecklistEditor'], Demo: ChecklistDemo },
];
