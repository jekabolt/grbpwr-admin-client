import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import design from '../eslint-rules/design/index.js';

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
  },
});

const filename = 'src/components/design-lint-probe.tsx';

tester.run('design/no-raw-control', design.rules['no-raw-control'], {
  valid: [
    { filename, code: "const view = <Button type='button'>save</Button>;" },
    { filename, code: "const picker = <input type='file' hidden />;" },
  ],
  invalid: [
    {
      filename,
      code: "const view = <><button>save</button><input type='checkbox' /><input type='checkbox' role='switch' /><select /><textarea /></>;",
      errors: [
        { message: 'Use Button from src/ui/components/button instead of raw <button>.' },
        {
          message: 'Use Checkbox from src/ui/components/checkbox instead of raw checkbox input.',
        },
        {
          message:
            'Use ToggleSwitch from src/ui/components/toggle-switch instead of raw checkbox switch.',
        },
        {
          message:
            'Use Select, Selector, or Combobox from src/ui/components instead of raw <select>.',
        },
        {
          message: 'Use Textarea from src/ui/components/text-area instead of raw <textarea>.',
        },
      ],
    },
  ],
});

tester.run('design/no-hex-color', design.rules['no-hex-color'], {
  valid: [
    { filename, code: "const view = <div className='bg-bgColor text-textColor' />;" },
    { filename, code: "const view = <input placeholder='for example invoice #123' />;" },
  ],
  invalid: [
    {
      filename,
      code: "const view = <div className={`bg-[#333] ${ok ? 'text-[#ffffff]' : ''}`} />;",
      errors: 2,
    },
  ],
});

tester.run('design/no-arbitrary-px', design.rules['no-arbitrary-px'], {
  valid: [
    { filename, code: "const view = <div className={cn('gap-stack', wide && 'p-block')} />;" },
  ],
  invalid: [
    {
      filename,
      code: "const view = <div className={clsx('w-[13px]', ok ? 'text-[11px]' : 'gap-[3px]')} />;",
      errors: 3,
    },
  ],
});

tester.run('design/no-radius-shadow', design.rules['no-radius-shadow'], {
  valid: [{ filename, code: "const view = <div className='rounded-none shadow-none' />;" }],
  invalid: [
    {
      filename,
      code: "const view = <div className={classNames('rounded', { 'hover:shadow-md': raised })} />;",
      errors: 2,
    },
  ],
});

tester.run('design/no-style-design', design.rules['no-style-design'], {
  valid: [
    {
      filename,
      code: 'const view = <div style={{ backgroundColor: colourway.hex, left: 12, width }} />;',
    },
  ],
  invalid: [
    {
      filename,
      code: "const view = <div style={{ color: '#fff', padding: dense ? 4 : 8 }} />;",
      errors: 2,
    },
  ],
});

tester.run('design/no-local-primitive', design.rules['no-local-primitive'], {
  valid: [
    { filename, code: "function ReportPanel() { return 'report'; }" },
    { filename, code: 'const renderPanel = () => <div />;' },
  ],
  invalid: [
    {
      filename,
      code: 'function FooPanel() { return <div />; } export const StatusBadge = () => <span />;',
      errors: 2,
    },
  ],
});

console.log('design lint probe: all 6 rules passed');
