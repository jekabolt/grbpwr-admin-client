function atRuleBody(css, name) {
  const source = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const start = source.search(new RegExp(`@${name}\\b`, 'u'));
  if (start === -1) return '';

  const openingBrace = source.indexOf('{', start);
  if (openingBrace === -1) return '';

  let depth = 1;
  let quote;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return '';
}

function declarations(body, namespace) {
  const values = [];
  const pattern = new RegExp(`--${namespace}-([\\w-]+)\\s*:\\s*([^;]+);`, 'gu');
  for (const match of body.matchAll(pattern)) {
    // Tailwind companion variables such as --text-body--line-height do not create utilities.
    if (!match[1].includes('--')) values.push({ name: match[1], value: match[2].trim() });
  }
  return values;
}

/** Parse the source of truth used by Tailwind 4. Called by design-lint.config.mjs at load time. */
export function parseThemeTokens(css) {
  const theme = atRuleBody(css, 'theme');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const customClasses = new Set();

  for (const match of withoutComments.matchAll(/@utility\s+([^\s{;]+)/gu)) {
    customClasses.add(match[1].replace(/^\./u, ''));
  }
  for (const match of withoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)(?=[\s:[.#>{,+~])/gu)) {
    customClasses.add(match[1]);
  }

  return {
    colors: declarations(theme, 'color').map(({ name }) => name),
    fontSizes: declarations(theme, 'text'),
    customClasses: [...customClasses].sort(),
  };
}
