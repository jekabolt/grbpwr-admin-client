import { classTokens, classValueVisitors } from './class-values.js';

const DEFAULT_PALETTES = new Set([
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]);
const DEFAULT_FONT_SIZES = new Map([
  ['xs', 12],
  ['sm', 14],
  ['base', 16],
  ['lg', 18],
  ['xl', 20],
  ['2xl', 24],
  ['3xl', 30],
  ['4xl', 36],
  ['5xl', 48],
  ['6xl', 60],
  ['7xl', 72],
  ['8xl', 96],
  ['9xl', 128],
]);
const COLOR_PREFIXES = [
  'placeholder',
  'decoration',
  'outline',
  'border',
  'divide',
  'stroke',
  'accent',
  'caret',
  'fill',
  'ring',
  'from',
  'text',
  'via',
  'bg',
  'to',
];
const SYSTEM_COLORS = new Set(['transparent', 'current', 'inherit']);

// These are Tailwind namespaces overloaded with layout/behaviour utilities. Keep this list
// explicit: an uncertain utility should pass rather than turn the design ratchet into a CSS linter.
const STANDARD_NON_COLOR = {
  text: [
    /^(?:left|center|right|justify|start|end)$/u,
    /^(?:wrap|nowrap|balance|pretty)$/u,
    /^(?:ellipsis|clip)$/u,
    /^opacity-(?:\d+|\[.+\])$/u,
    /^shadow(?:-.+)?$/u,
  ],
  bg: [
    /^(?:auto|cover|contain)$/u,
    /^(?:bottom|center|left|left-bottom|left-top|right|right-bottom|right-top|top)$/u,
    /^(?:fixed|local|scroll)$/u,
    /^(?:repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space)$/u,
    /^(?:clip|origin)-(?:border|padding|content|text)$/u,
    /^blend-.+$/u,
    /^(?:none|radial|conic)$/u,
    /^(?:gradient|linear)-to-(?:t|tr|r|br|b|bl|l|tl)$/u,
    /^opacity-(?:\d+|\[.+\])$/u,
    /^size-.+$/u,
  ],
  border: [
    /^(?:(?:x|y|s|e|t|r|b|l)(?:-(?:0|2|4|8))?|0|2|4|8)$/u,
    /^(?:solid|dashed|dotted|double|hidden|none)$/u,
    /^(?:collapse|separate)$/u,
    /^spacing(?:-[xy])?-.+$/u,
    /^opacity-(?:\d+|\[.+\])$/u,
  ],
};

function baseUtility(token) {
  let squareDepth = 0;
  let roundDepth = 0;
  let lastColon = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === '[') squareDepth += 1;
    else if (character === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (character === '(') roundDepth += 1;
    else if (character === ')') roundDepth = Math.max(0, roundDepth - 1);
    else if (character === ':' && squareDepth === 0 && roundDepth === 0) lastColon = index;
  }
  return token
    .slice(lastColon + 1)
    .replace(/^!/u, '')
    .replace(/!$/u, '');
}

function withoutModifier(value) {
  if (value.startsWith('[') || value.startsWith('(')) return value;
  return value.split('/')[0];
}

function utilityParts(utility) {
  for (const prefix of COLOR_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) {
      return { prefix, suffix: utility.slice(prefix.length + 1) };
    }
  }
  return undefined;
}

function colorCandidate(prefix, suffix) {
  let value = withoutModifier(suffix);
  let direction = '';
  if (prefix === 'border') {
    const directional = /^(x|y|s|e|t|r|b|l)-(.+)$/u.exec(value);
    if (directional) {
      direction = `${directional[1]}-`;
      value = directional[2];
    }
  } else if (prefix === 'ring' && value.startsWith('offset-')) {
    direction = 'offset-';
    value = value.slice('offset-'.length);
  }
  return { name: value, direction };
}

function isDefaultPalette(name) {
  const match = /^([a-z]+)-(\d{2,3})$/u.exec(name);
  return Boolean(match && DEFAULT_PALETTES.has(match[1]));
}

function normalized(value) {
  return value.toLowerCase().replace(/(?:text|color|size)/gu, '');
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function nearestName(query, names) {
  if (names.length === 0) return undefined;
  if (/link/iu.test(query) && names.includes('highlightColor')) return 'highlightColor';
  const queryNormalized = normalized(query) || query.toLowerCase();
  return [...names].sort((left, right) => {
    const queryLower = query.toLowerCase();
    const leftLower = left.toLowerCase();
    const rightLower = right.toLowerCase();
    const leftNormalized = normalized(left) || left.toLowerCase();
    const rightNormalized = normalized(right) || right.toLowerCase();
    const leftScore =
      editDistance(queryNormalized, leftNormalized) -
      (leftNormalized.includes(queryNormalized) || queryNormalized.includes(leftNormalized)
        ? 2
        : 0) -
      (leftLower.includes(queryLower) || queryLower.includes(leftLower) ? 4 : 0);
    const rightScore =
      editDistance(queryNormalized, rightNormalized) -
      (rightNormalized.includes(queryNormalized) || queryNormalized.includes(rightNormalized)
        ? 2
        : 0) -
      (rightLower.includes(queryLower) || queryLower.includes(rightLower) ? 4 : 0);
    return leftScore - rightScore || left.localeCompare(right);
  })[0];
}

function pixelValue(value) {
  const match = /^(-?(?:\d+\.)?\d+)px$/u.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function nearestFontSizes(defaultName, fontSizes) {
  const target = DEFAULT_FONT_SIZES.get(defaultName);
  const numeric = fontSizes
    .map(({ name, value }) => ({ name, pixels: pixelValue(value) }))
    .filter(({ pixels }) => pixels !== undefined)
    .sort(
      (left, right) =>
        Math.abs(left.pixels - target) - Math.abs(right.pixels - target) ||
        left.name.localeCompare(right.name),
    );
  return numeric.slice(0, 2).map(({ name }) => `text-${name}`);
}

function isArbitrary(value) {
  return value.startsWith('[') || value.startsWith('(') || value.includes('${');
}

function missingUtility(prefix, suffix, colorTokens, fontSizeTokens) {
  if (!['text', 'bg', 'border'].includes(prefix) || !suffix || isArbitrary(suffix)) return false;
  const core = withoutModifier(suffix);
  if (SYSTEM_COLORS.has(core)) return false;
  if (STANDARD_NON_COLOR[prefix].some((pattern) => pattern.test(core))) return false;
  if (prefix === 'text' && fontSizeTokens.has(core)) return false;

  const candidate = colorCandidate(prefix, suffix).name;
  if (SYSTEM_COLORS.has(candidate) || isArbitrary(candidate)) return false;
  return !colorTokens.has(candidate);
}

function paletteMessage(utility, prefix, candidate, colorTokens) {
  if (candidate.name === 'white' || candidate.name === 'black') {
    const replacementName = candidate.name === 'white' ? 'bgColor' : 'textColor';
    const replacement = `${prefix}-${candidate.direction}${replacementName}`;
    return `"${utility}" is not backed by a --color-* token. Use "${replacement}" (the nearest @theme colour token).`;
  }
  const status = ['green', 'emerald'].some((name) => candidate.name.startsWith(`${name}-`))
    ? 'success'
    : ['red', 'rose'].some((name) => candidate.name.startsWith(`${name}-`))
      ? 'error'
      : ['blue', 'sky', 'cyan', 'amber', 'orange', 'yellow'].some((name) =>
            candidate.name.startsWith(`${name}-`),
          )
        ? 'warning'
        : nearestName(candidate.name.replace(/-\d+$/u, ''), [...colorTokens]);
  const replacement = status ? `${prefix}-${candidate.direction}${status}` : 'a named status token';
  const fillGuidance = prefix === 'bg' ? ' No pastel fills; colour goes on text/borders only.' : '';
  return `"${utility}" uses Tailwind's default palette, not an @theme colour token.${fillGuidance} Use ${replacement} for a semantic state (DESIGN.md colour semantics).`;
}

function missingMessage(utility, prefix, suffix, colorTokens, fontSizeTokens) {
  if (prefix === 'border' && /^\d+$/u.test(suffix)) {
    return `"${utility}" does not resolve to a standard border width. Use border, border-2, border-4, border-8, or an explicit arbitrary value.`;
  }
  const fontLike =
    prefix === 'text' && /(?:size|giant|small|large|heading|headline|body)/iu.test(suffix);
  const names = fontLike ? [...fontSizeTokens] : [...colorTokens];
  const nearest = nearestName(suffix, names);
  const replacement = nearest ? `${prefix}-${nearest}` : undefined;
  return `"${utility}" does not resolve to an @theme token or a custom class.${
    replacement ? ` Use "${replacement}" (the nearest named token).` : ''
  }`;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require Tailwind colour and type utilities to resolve to design tokens.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          colors: { type: 'array', items: { type: 'string' } },
          fontSizes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, value: { type: 'string' } },
              required: ['name', 'value'],
              additionalProperties: false,
            },
          },
          customClasses: { type: 'array', items: { type: 'string' } },
        },
        required: ['colors', 'fontSizes', 'customClasses'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? { colors: [], fontSizes: [], customClasses: [] };
    const colorTokens = new Set(options.colors);
    const fontSizes = options.fontSizes;
    const fontSizeTokens = new Set(fontSizes.map(({ name }) => name));
    const customClasses = new Set(options.customClasses);

    return classValueVisitors((value, node, reportOnce) => {
      for (const token of classTokens(value)) {
        const utility = baseUtility(token);
        if (!utility || customClasses.has(utility)) continue;

        const parts = utilityParts(utility);
        if (parts) {
          const candidate = colorCandidate(parts.prefix, parts.suffix);
          const isDefinedColor = colorTokens.has(candidate.name);
          const isDefinedFontSize =
            parts.prefix === 'text' && fontSizeTokens.has(withoutModifier(parts.suffix));
          if (isDefinedColor || isDefinedFontSize) continue;

          if (
            isDefaultPalette(candidate.name) ||
            (['white', 'black'].includes(candidate.name) && !colorTokens.has(candidate.name))
          ) {
            reportOnce(token, () => {
              context.report({
                node,
                message: paletteMessage(utility, parts.prefix, candidate, colorTokens),
              });
            });
            continue;
          }

          const fontSizeName = withoutModifier(parts.suffix);
          if (parts.prefix === 'text' && DEFAULT_FONT_SIZES.has(fontSizeName)) {
            const nearest = nearestFontSizes(fontSizeName, fontSizes);
            reportOnce(token, () => {
              context.report({
                node,
                message: `"${utility}" uses Tailwind's default type scale. Use ${
                  nearest.join(' or ') || 'a named typography token'
                } (DESIGN.md typography).`,
              });
            });
            continue;
          }

          if (missingUtility(parts.prefix, parts.suffix, colorTokens, fontSizeTokens)) {
            reportOnce(token, () => {
              context.report({
                node,
                message: missingMessage(
                  utility,
                  parts.prefix,
                  parts.suffix,
                  colorTokens,
                  fontSizeTokens,
                ),
              });
            });
          }
          continue;
        }

        if (/(?:Color|Size)$/u.test(utility)) {
          reportOnce(token, () => {
            const fontLike = utility.endsWith('Size');
            const names = fontLike ? [...fontSizeTokens] : [...colorTokens];
            const nearest = nearestName(utility, names);
            const replacement = nearest ? `text-${nearest}` : undefined;
            context.report({
              node,
              message: `"${utility}" does not resolve to an @theme utility or a custom class.${
                replacement ? ` Use "${replacement}" (the nearest named token).` : ''
              }`,
            });
          });
        }
      }
    });
  },
};
