export type ThemeDeclaration = { name: string; value: string };

export function parseThemeTokens(css: string): {
  colors: string[];
  fontSizes: ThemeDeclaration[];
  customClasses: string[];
};

export function themeDeclarations(css: string, namespace: string): ThemeDeclaration[];
