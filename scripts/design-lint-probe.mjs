import fs from 'node:fs';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import design from '../eslint-rules/design/index.js';
import { parseThemeTokens } from '../eslint-rules/design/theme-tokens.js';

const themeTokens = parseThemeTokens(
  fs.readFileSync(new URL('../src/global.css', import.meta.url), 'utf8'),
);

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
        { message: "Use Button from 'ui' instead of raw <button>." },
        { message: "Use CheckboxCommon from 'ui' instead of raw checkbox input." },
        { message: "Use ToggleSwitch from 'ui' instead of raw checkbox switch." },
        { message: "Use Select, Selector, or Combobox from 'ui' instead of raw <select>." },
        { message: "Use Textarea from 'ui' instead of raw <textarea>." },
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

tester.run('design/no-non-token-class', design.rules['no-non-token-class'], {
  valid: [
    {
      filename,
      options: [themeTokens],
      code: "const view = <div className='text-center border-b bg-bgColor text-lg' />;",
    },
    {
      filename,
      options: [themeTokens],
      code: "const view = <div className={cn('bg-cover text-ellipsis', ok && 'border-dashed')} />;",
    },
  ],
  invalid: [
    {
      filename,
      options: [themeTokens],
      code: "const view = <div className={`text-2xl ${ok ? 'hover:bg-sky-200' : 'text-text'}`} />;",
      errors: [
        { message: /"text-2xl" uses Tailwind's default type scale/u },
        { message: /"bg-sky-200" uses Tailwind's default palette/u },
        { message: /"text-text" does not resolve to an @theme token/u },
      ],
    },
    {
      filename,
      options: [themeTokens],
      code: "const view = <div className={classNames('visitedLinkColor', { textGiantSmallSize: big })} />;",
      errors: [
        { message: /"visitedLinkColor" does not resolve/u },
        { message: /"textGiantSmallSize" does not resolve/u },
      ],
    },
  ],
});

tester.run('design/no-deep-ui-import', design.rules['no-deep-ui-import'], {
  valid: [
    { filename, code: "import { Button, Text } from 'ui';" },
    { filename, code: "import type { InputProps } from 'ui';" },
    { filename, code: "import markTsx from 'ui/icons/grbpwr-mark.tsx?raw';" },
    { filename, code: "import { Section } from 'components/managers/ui-kit/section';" },
    { filename, code: "import { x } from './ui/helpers';" },
    // inside src/ui files import each other by relative path
    { filename: 'src/ui/components/section.tsx', code: "import Text from './text';" },
    {
      filename: '/repo/src/ui/form/fields/input-field.tsx',
      code: "import Input from '../../components/input';",
    },
  ],
  invalid: [
    {
      filename,
      code: "import Text from 'ui/components/text';",
      errors: [{ message: "import from 'ui', not ui/components/text" }],
    },
    {
      filename,
      code: "import InputField from 'ui/form/fields/input-field'; import { Arrow } from 'ui/icons/arrow';",
      errors: 2,
    },
    {
      filename: '/repo/src/components/managers/hero/components/picker.tsx',
      code: "import { Button } from '../../../../ui/components/button'; export { default } from '@/ui/components/media';",
      errors: [
        { message: "import from 'ui', not ../../../../ui/components/button" },
        { message: "import from 'ui', not @/ui/components/media" },
      ],
    },
    {
      filename,
      code: "const m = import('ui/components/media');",
      errors: 1,
    },
  ],
});

tester.run('design/no-hand-back-link', design.rules['no-hand-back-link'], {
  valid: [
    { filename, code: 'const view = <BackLink to={ROUTES.orders}>orders</BackLink>;' },
    {
      filename,
      code: "const view = <button aria-label='previous page' onClick={prev}>←</button>;",
    },
    { filename, code: 'const view = <Chip onClick={go}>← step 10</Chip>;' },
    { filename, code: 'const view = <Text>money in ← bank</Text>;' },
  ],
  invalid: [
    {
      filename,
      code: "const view = <Button asChild variant='secondary'><Link to={ROUTES.models}>← models</Link></Button>;",
      errors: [{ message: /Use BackLink from 'ui'/u }],
    },
    {
      filename,
      code: "const view = <><Link to={ROUTES.orders} aria-label='back to orders'>←</Link><Button aria-label='back' onClick={up}>←</Button></>;",
      errors: 2,
    },
    {
      filename,
      code: "const view = <button onClick={() => setStep(1)}><Text size='small'>← back to all cases</Text></button>;",
      errors: 1,
    },
  ],
});

tester.run('design/no-hand-add-door', design.rules['no-hand-add-door'], {
  valid: [
    { filename, code: 'const view = <AddDoor afterRows onClick={add}>colour</AddDoor>;' },
    {
      filename,
      code: "const view = <select className={cn(addDoorClass(), 'block')}><option>+ slot</option></select>;",
    },
    { filename, code: "const view = <Button variant='underline' onClick={add}>+ add</Button>;" },
    {
      filename,
      code: "const view = <button className='border border-dashed'><span aria-hidden>+</span><Cap label='+ artwork' /></button>;",
    },
    {
      filename,
      code: "const view = <button className={cn('border', empty && 'border-dashed')}>{empty ? <Pictogram /> : <img />}</button>;",
    },
  ],
  invalid: [
    {
      filename,
      code: "const view = <button className='flex w-full border border-dashed border-borderColor px-2 py-3'>+ aspect</button>;",
      errors: [{ message: /Use AddDoor from 'ui'/u }],
    },
    {
      filename,
      code: "const view = <><button className={cn('border border-dashed', rows && 'mt-4')}><Text>+ operation</Text></button><select className='border border-dashed'><option value=''>+ add a slot</option></select></>;",
      errors: 2,
    },
  ],
});

tester.run('design/no-hand-empty-cell', design.rules['no-hand-empty-cell'], {
  valid: [
    { filename, code: "import { EmptyCell } from 'ui'; const v = <td>{x ?? <EmptyCell />}</td>;" },
    // string contexts and punctuation stay plain
    {
      filename,
      code: "const t = `${a ?? '—'} cm`; const v = <span title={x ?? '—'}>{a} — {b}</span>;",
    },
    {
      filename,
      code: "const v = <>{neg ? '-' : ''}{i > 0 ? ' — ' : null}<option>{x || '—'}</option></>;",
    },
  ],
  invalid: [
    {
      filename,
      code: "import { Text } from 'ui';\nconst v = <td>{x ?? '—'}</td>;",
      output: "import { Text, EmptyCell } from 'ui';\nconst v = <td>{x ?? <EmptyCell />}</td>;",
      errors: 1,
    },
    {
      filename,
      code: "import { Row } from 'ui';\nconst v = <Row label='a' value={ok ? n : 'n/a'} />;",
      output:
        "import { Row, EmptyCell } from 'ui';\nconst v = <Row label='a' value={ok ? n : <EmptyCell />} />;",
      errors: 1,
    },
    {
      filename,
      code: "const v = <span className='text-labelColor'>—</span>;",
      errors: 1,
    },
  ],
});

tester.run('design/no-hand-header-warnings', design.rules['no-hand-header-warnings'], {
  valid: [
    { filename, code: 'const v = <HeaderWarnings items={warnings} />;' },
    { filename, code: "const v = <button className='text-error'>!</button>;" },
    { filename, code: "const v = <Text className='text-error'>{n} failed</Text>;" },
  ],
  invalid: [
    {
      filename,
      code: "const v = <span className={cn(HEADER_TEXT, 'x')}><span className='text-warning'>!</span> {n} waiting</span>;",
      errors: 1,
    },
    { filename, code: 'const label = `! ${n} blocking`;', errors: 1 },
    {
      filename,
      code: "const v = <Text variant='errorLabel'>{n} blocking holes</Text>;",
      errors: 1,
    },
    {
      filename,
      code: "const v = <button className={cn(HEADER_TEXT, 'text-error underline')}>{n} open</button>;",
      errors: 2,
    },
  ],
});

console.log(`design lint probe: all ${Object.keys(design.rules).length} rules passed`);
