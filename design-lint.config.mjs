import fs from 'node:fs';
import tsParser from '@typescript-eslint/parser';
import design from './eslint-rules/design/index.js';
import { parseThemeTokens } from './eslint-rules/design/theme-tokens.js';

const themeTokens = parseThemeTokens(
  fs.readFileSync(new URL('./src/global.css', import.meta.url), 'utf8'),
);

const designRules = Object.fromEntries(
  Object.keys(design.rules).map((name) => [`design/${name}`, 'error']),
);
designRules['design/no-non-token-class'] = ['error', themeTokens];

const printDocuments = [
  'src/components/managers/print/**/*.{ts,tsx}',
  'src/components/managers/tech-card/components/tech-pack-document.tsx',
  'src/components/managers/tech-card/print-page.tsx',
  'src/components/managers/production-runs/components/run-pack-document.tsx',
  'src/components/managers/production-runs/print-page.tsx',
];

export default [
  { ignores: ['src/ui/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { design },
    // This is an independent policy pass. Legacy eslint-disable comments must neither suppress
    // these rules nor require loading the broken legacy plugin configuration.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: designRules,
  },
  {
    // Paper output has its own physical grammar: millimetre widths, print-only point sizes,
    // absolute callout geometry, swatch colours, and a preview shadow. Keep primitive ownership
    // enforced, but do not make the application-token rules rewrite the printable document.
    files: printDocuments,
    rules: {
      'design/no-arbitrary-px': 'off',
      'design/no-hex-color': 'off',
      'design/no-non-token-class': 'off',
      'design/no-radius-shadow': 'off',
      'design/no-style-design': 'off',
    },
  },
  {
    // Paper prints its own dash: sheet.tsx and the invoice read '—' as «empty» to size a cell.
    files: [...printDocuments, 'src/components/managers/order/components/invoice-document.tsx'],
    rules: { 'design/no-hand-empty-cell': 'off' },
  },
];
