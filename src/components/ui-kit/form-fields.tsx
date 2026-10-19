import { useEffect } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import {
  CheckboxField,
  ComboField,
  DecimalField,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputField,
  RichTextField,
  SelectField,
  TextareaField,
  ToggleField,
  ToggleGroupField,
} from 'ui';
import { KitDemo, KitLines } from './kit-entry';

type Sample = {
  name: string;
  code: string;
  qty: string;
  weight: string;
  fabric: string;
  size: string;
  note: string;
  lined: boolean;
  active: boolean;
  seasons: string[];
  body: string;
};

const DEFAULTS: Sample = {
  name: 'wool coat',
  code: 'S-0142',
  qty: '-3',
  weight: '420',
  fabric: 'wool 420',
  size: 'M',
  note: 'double-face wool, raw edge',
  lined: true,
  active: false,
  seasons: ['fw'],
  body: '<p>raw edge, no lining</p>',
};

/**
 * Every form-bound field needs a react-hook-form context, so the whole group sits under one local
 * `useForm` with fixed sample values. `qty` carries a preset error so FormMessage is visible.
 */
export function SampleForm({ children }: { children: React.ReactNode }) {
  const form = useForm<Sample>({ defaultValues: DEFAULTS });
  const { setError } = form;
  useEffect(() => {
    setError('qty', { type: 'min', message: 'must be ≥ 0' });
  }, [setError]);
  return <Form {...form}>{children}</Form>;
}

const SIZES = [
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
];

function FormDemo() {
  const { control } = useFormContext<Sample>();
  return (
    <div className='grid grid-cols-1 gap-gutter lg:grid-cols-3'>
      <FormField
        control={control}
        name='code'
        render={({ field }) => (
          <FormItem>
            <FormLabel>code</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>style code</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='qty'
        render={({ field }) => (
          <FormItem>
            <FormLabel>qty</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function grid(children: React.ReactNode) {
  return <div className='grid grid-cols-1 gap-gutter lg:grid-cols-3'>{children}</div>;
}

export const formDemos: KitDemo[] = [
  {
    names: [
      'Form',
      'FormField',
      'FormItem',
      'FormLabel',
      'FormControl',
      'FormDescription',
      'FormMessage',
    ],
    Demo: FormDemo,
  },
  {
    names: ['InputField'],
    Demo: () =>
      grid(
        <>
          <InputField name='name' label='name' />
          <InputField name='qty' label='qty' />
          <InputField name='code' label='code' disabled />
        </>,
      ),
  },
  { names: ['DecimalField'], Demo: () => grid(<DecimalField name='weight' label='weight' />) },
  {
    names: ['ComboField'],
    Demo: () => grid(<ComboField name='fabric' label='fabric' options={['wool 420', 'cupro']} />),
  },
  {
    names: ['SelectField'],
    Demo: () => grid(<SelectField name='size' label='size' items={SIZES} />),
  },
  {
    names: ['TextareaField'],
    Demo: () => grid(<TextareaField name='note' label='note' showCharCount maxLength={200} />),
  },
  {
    names: ['CheckboxField'],
    Demo: () =>
      grid(
        <KitLines
          lines={[
            { label: 'on', content: <CheckboxField name='lined' label='lined' /> },
            { label: 'read-only', content: <CheckboxField name='lined' label='lined' readOnly /> },
          ]}
        />,
      ),
  },
  {
    names: ['ToggleField'],
    Demo: () =>
      grid(
        <>
          <ToggleField name='active' label='active' />
          <ToggleField name='lined' label='lined' disabled />
        </>,
      ),
  },
  {
    names: ['ToggleGroupField'],
    Demo: () =>
      grid(
        <ToggleGroupField
          name='seasons'
          label='seasons'
          items={[
            { value: 'ss', label: 'ss' },
            { value: 'fw', label: 'fw' },
          ]}
        />,
      ),
  },
  { names: ['RichTextField'], Demo: () => <RichTextField name='body' label='body' /> },
];
