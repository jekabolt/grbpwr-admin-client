import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

// ОДНОПРАВИЛЬНЫЙ линт для печатного модуля: ловит чтение const из немедленно вызванной функции
// ДО его объявления. Ровно этот класс прошёл мимо tsc (TS2448 не смотрит внутрь замыканий) и
// уронил бы печать на каждой карте. Штатный `yarn lint` в этом репозитории сломан (eslint 9
// против legacy .eslintrc), поэтому проверка живёт отдельным конфигом и запускается точечно.
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: {
      'no-use-before-define': ['error', { variables: true, functions: false, classes: false }],
    },
  },
];
