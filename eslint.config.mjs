import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

// eslint-plugin-react 7.34 still uses the RuleContext token helpers that ESLint 9 moved to
// SourceCode. Keep the legacy recommended rules intact while adapting that API boundary.
const reactRules = Object.fromEntries(
  Object.entries(reactPlugin.rules).map(([name, rule]) => [
    name,
    {
      ...rule,
      create(context) {
        let currentNode;
        const sourceCode = context.sourceCode;
        const compatibleContext = new Proxy(context, {
          get(target, property, receiver) {
            if (property === 'getAncestors') return () => sourceCode.getAncestors(currentNode);
            if (property === 'getScope') return () => sourceCode.getScope(currentNode);
            if (property === 'markVariableAsUsed')
              return (name) => sourceCode.markVariableAsUsed(name, currentNode);

            const contextValue = Reflect.get(target, property, receiver);
            if (contextValue !== undefined) return contextValue;
            const sourceCodeValue = sourceCode[property];
            return typeof sourceCodeValue === 'function'
              ? sourceCodeValue.bind(sourceCode)
              : sourceCodeValue;
          },
        });
        const listeners = rule.create(compatibleContext);
        return Object.fromEntries(
          Object.entries(listeners).map(([selector, listener]) => [
            selector,
            (...args) => {
              [currentNode] = args;
              return listener(...args);
            },
          ]),
        );
      },
    },
  ]),
);
const compatibleReactPlugin = { ...reactPlugin, rules: reactRules };
const legacyDirectivePlugin = {
  rules: {
    'no-autofocus': {
      meta: { schema: [] },
      create: () => ({}),
    },
  },
};

export default [
  {
    files: ['src/**/*.{js,ts,tsx,json}'],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      react: compatibleReactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': legacyDirectivePlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
      react: { version: 'detect' },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      ...prettierPlugin.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-control-regex': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-fallthrough': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-redeclare': 'warn',
      'no-regex-spaces': 'warn',
      'no-undef': 'warn',
      'no-unsafe-finally': 'warn',
      'no-useless-escape': 'warn',
      'prettier/prettier': 'warn',
      'react/jsx-key': 'warn',
      'react/no-children-prop': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/no-unknown-property': 'warn',
      'react/prop-types': 'warn',
      'react/react-in-jsx-scope': 'off',
    },
  },
];
