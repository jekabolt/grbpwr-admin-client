import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import ts from 'typescript';
import { parseThemeTokenGroups } from '../eslint-rules/design/theme-tokens.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designPath = path.join(root, 'DESIGN.md');
const themePath = path.join(root, 'src/global.css');
const barrelPath = path.join(root, 'src/ui/index.ts');
const check = process.argv.includes('--check');

if (process.argv.some((argument) => argument.startsWith('--') && argument !== '--check')) {
  throw new Error('Usage: node scripts/design-sync.mjs [--check]');
}

const GENERATED_GROUPS = ['colors', 'typography', 'spacing', 'rounded'];
const STANDARD_VARIANT_PROPS = new Set(['variant', 'size', 'tone', 'kind']);

function frontmatterOf(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) throw new Error('DESIGN.md must begin with YAML frontmatter');
  return { body: match[1], end: match[0].length };
}

function topLevelBlock(frontmatter, key) {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) throw new Error(`DESIGN.md frontmatter is missing ${key}`);

  let end = start + 1;
  while (end < lines.length && !/^[A-Za-z][\w-]*:/u.test(lines[end])) end += 1;
  return { lines, start, end };
}

function replaceTopLevelBlock(frontmatter, key, replacement) {
  const { lines, start, end } = topLevelBlock(frontmatter, key);
  lines.splice(start, end - start, ...replacement.split('\n'));
  return lines.join('\n');
}

function colorDisplayValue(value) {
  const shortHex = value.match(/^#([\da-f])([\da-f])([\da-f])$/iu);
  if (shortHex) {
    return `#${shortHex
      .slice(1)
      .map((part) => part.repeat(2))
      .join('')}`.toLowerCase();
  }
  const shortHexWithAlpha = value.match(/^#([\da-f])([\da-f])([\da-f])([\da-f])$/iu);
  if (shortHexWithAlpha) {
    return `#${shortHexWithAlpha
      .slice(1)
      .map((part) => part.repeat(2))
      .join('')}`.toLowerCase();
  }
  return value;
}

function comparableColor(value) {
  return colorDisplayValue(value).replace(/\s+/gu, '').toLowerCase();
}

function existingColorEntries(frontmatter) {
  const { lines, start, end } = topLevelBlock(frontmatter, 'colors');
  const entries = [];
  for (const line of lines.slice(start + 1, end)) {
    const match = line.match(/^  ([\w-]+):\s+(?:"([^"]*)"|'([^']*)'|(\S+?))(?:\s+#\s*(.+))?$/u);
    if (!match) continue;
    entries.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4],
      alias: match[5]?.trim(),
    });
  }
  return entries;
}

function colorAliases(frontmatter, colors) {
  const existing = existingColorEntries(frontmatter);
  const consumed = new Set();
  const aliases = new Map();

  for (const color of colors) {
    const exactIndex = existing.findIndex((entry) => entry.name === color.name);
    if (exactIndex === -1) continue;
    consumed.add(exactIndex);
    if (existing[exactIndex].alias) aliases.set(color.name, existing[exactIndex].alias);
  }

  for (const color of colors) {
    if (existing.some((entry) => entry.name === color.name)) continue;
    const aliasIndex = existing.findIndex(
      (entry, index) =>
        !consumed.has(index) && comparableColor(entry.value) === comparableColor(color.value),
    );
    if (aliasIndex === -1) continue;
    consumed.add(aliasIndex);
    const entry = existing[aliasIndex];
    if (entry.name !== color.name) aliases.set(color.name, entry.alias ?? entry.name);
  }

  return aliases;
}

function yamlValue(value) {
  return value.includes("'") ? JSON.stringify(value) : `'${value}'`;
}

function yamlMap(name, entries, indent = '') {
  if (entries.length === 0) return `${indent}${name}: {}`;
  return [
    `${indent}${name}:`,
    ...entries.map(({ name: tokenName, value }) => `${indent}  ${tokenName}: ${yamlValue(value)}`),
  ].join('\n');
}

function renderFrontmatterGroups(groups, aliases) {
  const colors = [
    'colors:',
    ...groups.colors.map(({ name, value }) => {
      const alias = aliases.get(name);
      return `  ${name}: ${yamlValue(colorDisplayValue(value))}${alias ? ` # ${alias}` : ''}`;
    }),
  ].join('\n');

  const typography = [
    'typography:',
    yamlMap('fontSizes', groups.fontSizes, '  '),
    yamlMap('fontFamilies', groups.fontFamilies, '  '),
    yamlMap('fontWeights', groups.fontWeights, '  '),
    yamlMap('letterSpacing', groups.letterSpacing, '  '),
    yamlMap('lineHeights', groups.lineHeights, '  '),
  ].join('\n');

  return {
    colors,
    typography,
    spacing: yamlMap('spacing', groups.spacing),
    rounded: yamlMap('rounded', groups.rounded),
  };
}

function resolveSourceFile(moduleSpecifier) {
  const unresolved = path.resolve(path.dirname(barrelPath), moduleSpecifier);
  const candidates = [
    `${unresolved}.tsx`,
    `${unresolved}.ts`,
    path.join(unresolved, 'index.tsx'),
    path.join(unresolved, 'index.ts'),
  ];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) throw new Error(`Cannot resolve barrel source ${moduleSpecifier}`);
  return sourcePath;
}

function primitiveExports() {
  const source = fs.readFileSync(barrelPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    barrelPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const primitives = [];
  const missingDocs = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    const valueExports = statement.exportClause.elements.filter((element) => !element.isTypeOnly);
    if (valueExports.length === 0) continue;

    const primitiveDoc = ts.getJSDocTags(statement).find((tag) => tag.tagName.text === 'primitive');
    const jsdocText = primitiveDoc?.parent.getText(sourceFile);
    const description =
      typeof primitiveDoc?.comment === 'string' ? primitiveDoc.comment.trim() : undefined;
    const hasOneLineDoc =
      description && jsdocText && /^\/\*\* @primitive [^\r\n*]+ \*\/$/u.test(jsdocText);

    if (!hasOneLineDoc) {
      missingDocs.push(...valueExports.map((element) => element.name.text));
      continue;
    }

    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
      throw new Error(`Primitive export ${valueExports[0].name.text} needs a module source`);
    }
    const sourcePath = resolveSourceFile(statement.moduleSpecifier.text);

    for (const element of valueExports) {
      primitives.push({
        name: element.name.text,
        localName: element.propertyName?.text ?? element.name.text,
        description,
        sourcePath,
      });
    }
  }

  if (missingDocs.length > 0) {
    throw new Error(
      `Missing one-line @primitive JSDoc for barrel export: ${missingDocs.join(', ')}`,
    );
  }

  return primitives.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function cvaVariants(sourceFile) {
  const variants = new Map();

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'cva'
    ) {
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        const variantsProperty = argument.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) && propertyName(property.name) === 'variants',
        );
        if (!variantsProperty || !ts.isPropertyAssignment(variantsProperty)) continue;
        if (!ts.isObjectLiteralExpression(variantsProperty.initializer)) continue;

        for (const variantProperty of variantsProperty.initializer.properties) {
          if (!ts.isPropertyAssignment(variantProperty)) continue;
          const name = propertyName(variantProperty.name);
          if (!name || !ts.isObjectLiteralExpression(variantProperty.initializer)) continue;
          const values = variantProperty.initializer.properties
            .map((valueProperty) => propertyName(valueProperty.name))
            .filter(Boolean);
          if (values.length > 0) variants.set(name, values);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return variants;
}

function literalUnionValues(checker, type) {
  const values = [];
  const members = type.isUnion() ? type.types : [type];
  for (const member of members) {
    if (member.flags & ts.TypeFlags.StringLiteral) values.push(member.value);
    else if (member.flags & ts.TypeFlags.BooleanLiteral) {
      values.push(member.intrinsicName);
    } else if (member.flags & ts.TypeFlags.Boolean) {
      values.push('true', 'false');
    }
  }
  return [...new Set(values)];
}

function callableProps(checker, symbol, sourceFile) {
  const location = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? sourceFile;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  const signature = signatures[0];
  const parameter = signature?.getParameters()[0];
  if (!parameter) return undefined;
  const parameterLocation = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? sourceFile;
  return checker.getNonNullableType(
    checker.getTypeOfSymbolAtLocation(parameter, parameterLocation),
  );
}

function declaredProps(checker, sourceFile, exportedName) {
  let localName = exportedName;
  if (exportedName === 'default') {
    const assignment = sourceFile.statements.find(
      (statement) =>
        ts.isExportAssignment(statement) &&
        !statement.isExportEquals &&
        ts.isIdentifier(statement.expression),
    );
    if (assignment && ts.isIdentifier(assignment.expression))
      localName = assignment.expression.text;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const isNamed = statement.name?.text === localName;
      const isAnonymousDefault =
        exportedName === 'default' &&
        !statement.name &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (!isNamed && !isAnonymousDefault) continue;
      const typeNode = statement.parameters[0]?.type;
      if (typeNode) return checker.getTypeFromTypeNode(typeNode);
    }

    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== localName) continue;
      const initializer = declaration.initializer;
      if (!initializer) continue;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        const typeNode = initializer.parameters[0]?.type;
        if (typeNode) return checker.getTypeFromTypeNode(typeNode);
      }
      if (ts.isCallExpression(initializer) && initializer.typeArguments?.length) {
        // forwardRef<Element, Props> wraps Props in Omit<Props, 'ref'>. When Props has a string
        // index signature, that mapped type loses the named keys, so inspect the explicit Props
        // argument to retain unions such as Textarea.variant.
        return checker.getTypeFromTypeNode(
          initializer.typeArguments[initializer.typeArguments.length - 1],
        );
      }
    }
  }
  return undefined;
}

function addVariants(primitives) {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const checker = program.getTypeChecker();
  const modules = new Map();

  for (const primitive of primitives) {
    let moduleInfo = modules.get(primitive.sourcePath);
    if (!moduleInfo) {
      const sourceFile = program.getSourceFile(primitive.sourcePath);
      if (!sourceFile) throw new Error(`TypeScript did not load ${primitive.sourcePath}`);
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      if (!moduleSymbol) throw new Error(`Cannot inspect exports from ${primitive.sourcePath}`);
      moduleInfo = {
        checkerExports: new Map(
          checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.name, symbol]),
        ),
        cva: cvaVariants(sourceFile),
        sourceFile,
      };
      modules.set(primitive.sourcePath, moduleInfo);
    }

    const symbol = moduleInfo.checkerExports.get(primitive.localName);
    if (!symbol) throw new Error(`Cannot inspect exported symbol ${primitive.name}`);
    const props = callableProps(checker, symbol, moduleInfo.sourceFile);
    const sourceProps = declaredProps(checker, moduleInfo.sourceFile, primitive.localName);
    if (!props && !sourceProps) {
      primitive.variants = [];
      continue;
    }

    const propSymbols = new Map();
    for (const propSource of [props, sourceProps]) {
      for (const property of propSource?.getProperties() ?? []) {
        if (!propSymbols.has(property.name)) propSymbols.set(property.name, property);
      }
    }
    const candidateNames = [
      ...moduleInfo.cva.keys(),
      ...[...STANDARD_VARIANT_PROPS].filter((name) => !moduleInfo.cva.has(name)),
    ];
    primitive.variants = [];

    for (const name of candidateNames) {
      const prop = propSymbols.get(name);
      if (!prop) continue;
      const valuesFromCva = moduleInfo.cva.get(name);
      if (valuesFromCva) {
        primitive.variants.push({ name, values: valuesFromCva });
        continue;
      }
      const propLocation = prop.valueDeclaration ?? prop.declarations?.[0] ?? moduleInfo.sourceFile;
      const values = literalUnionValues(
        checker,
        checker.getTypeOfSymbolAtLocation(prop, propLocation),
      );
      if (values.length > 0) primitive.variants.push({ name, values });
    }
  }

  return primitives;
}

function markdownCell(value) {
  return value.replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}

async function formatGeneratedMarkdown(markdown) {
  return (await prettier.format(markdown, { parser: 'markdown', printWidth: 100 })).trim();
}

async function primitiveSection(primitives) {
  const rows = primitives.map((primitive) => {
    const source = path.relative(root, primitive.sourcePath).split(path.sep).join('/');
    const variants =
      primitive.variants.length === 0
        ? '—'
        : primitive.variants.map(({ name, values }) => `${name}: ${values.join('|')}`).join(' · ');
    return `| ${markdownCell(primitive.name)} | ${markdownCell(primitive.description)} | \`${source}\` | ${markdownCell(variants)} | [view](/ui-kit#${encodeURIComponent(primitive.name)}) |`;
  });
  return formatGeneratedMarkdown(`<!-- design-sync:start primitives -->

## Primitives

| Export | Primitive | Source | Variants | UI kit |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

<!-- design-sync:end primitives -->`);
}

function tokenRows(groups) {
  const rows = [];
  const add = (category, prefix, entries, className, display = (value) => value) => {
    for (const entry of entries) {
      rows.push({
        category,
        token: `--${prefix}-${entry.name}`,
        value: display(entry.value),
        className: className(entry.name),
      });
    }
  };

  add(
    'color',
    'color',
    groups.colors,
    (name) => {
      if (/border/iu.test(name) || name === 'hairline') return `border-${name}`;
      if (/bg/iu.test(name) || ['pageBg', 'hairline', 'overlay'].includes(name)) {
        return `bg-${name}`;
      }
      return `text-${name}`;
    },
    colorDisplayValue,
  );
  add('font size', 'text', groups.fontSizes, (name) => `text-${name}`);
  add('font family', 'font-family', groups.fontFamilies, (name) => `font-family-${name}`);
  add('font weight', 'font-weight', groups.fontWeights, (name) => `font-${name}`);
  add('letter spacing', 'tracking', groups.letterSpacing, (name) => `tracking-${name}`);
  add('line height', 'leading', groups.lineHeights, (name) => `leading-${name}`);
  add('spacing', 'spacing', groups.spacing, (name) => `gap-${name}`);
  add('rounded', 'radius', groups.rounded, (name) => `rounded-${name}`);
  return rows;
}

async function tokensSection(groups) {
  const rows = tokenRows(groups).map(
    ({ category, token, value, className }) =>
      `| ${category} | \`${token}\` | \`${value}\` | \`${className}\` |`,
  );
  return formatGeneratedMarkdown(`<!-- design-sync:start tokens -->

## Tokens

| Kind | Token | Value | Class |
| --- | --- | --- | --- |
${rows.join('\n')}

<!-- design-sync:end tokens -->`);
}

function replaceMarkedSection(markdown, name, section) {
  const startMarker = `<!-- design-sync:start ${name} -->`;
  const endMarker = `<!-- design-sync:end ${name} -->`;
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);
  if (start === -1 && end === -1) return undefined;
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`DESIGN.md has incomplete design-sync markers for ${name}`);
  }
  const afterEnd = end + endMarker.length;
  return `${markdown.slice(0, start)}${section}${markdown.slice(afterEnd)}`;
}

function insertAfterFirstHeading(markdown, sections) {
  const frontmatter = frontmatterOf(markdown);
  const prose = markdown.slice(frontmatter.end);
  const headingMatch = prose.match(/^#{1,6} .+$/mu);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error('DESIGN.md needs a prose heading after its frontmatter');
  }
  const headingEnd = frontmatter.end + headingMatch.index + headingMatch[0].length;
  return `${markdown.slice(0, headingEnd)}\n\n${sections.join('\n\n')}\n${markdown.slice(headingEnd)}`;
}

function shortDiff(actual, expected) {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  let start = 0;
  while (start < actualLines.length && actualLines[start] === expectedLines[start]) start += 1;
  let actualEnd = actualLines.length - 1;
  let expectedEnd = expectedLines.length - 1;
  while (
    actualEnd >= start &&
    expectedEnd >= start &&
    actualLines[actualEnd] === expectedLines[expectedEnd]
  ) {
    actualEnd -= 1;
    expectedEnd -= 1;
  }
  const removed = actualLines
    .slice(start, actualEnd + 1)
    .slice(0, 6)
    .map((line) => `- ${line}`);
  const added = expectedLines
    .slice(start, expectedEnd + 1)
    .slice(0, 6)
    .map((line) => `+ ${line}`);
  return [...removed, ...added].join('\n');
}

async function generatedDesign(markdown) {
  const theme = fs.readFileSync(themePath, 'utf8');
  const groups = parseThemeTokenGroups(theme);
  const currentFrontmatter = frontmatterOf(markdown);
  const aliases = colorAliases(currentFrontmatter.body, groups.colors);
  const generatedGroups = renderFrontmatterGroups(groups, aliases);
  let nextFrontmatter = currentFrontmatter.body;
  for (const name of GENERATED_GROUPS) {
    nextFrontmatter = replaceTopLevelBlock(nextFrontmatter, name, generatedGroups[name]);
  }
  let generated = `---\n${nextFrontmatter}\n---\n${markdown.slice(currentFrontmatter.end)}`;

  const primitives = addVariants(primitiveExports());
  const sections = {
    primitives: await primitiveSection(primitives),
    tokens: await tokensSection(groups),
  };
  const missingSections = [];
  for (const name of ['primitives', 'tokens']) {
    const replaced = replaceMarkedSection(generated, name, sections[name]);
    if (replaced === undefined) missingSections.push(sections[name]);
    else generated = replaced;
  }
  if (missingSections.length > 0) generated = insertAfterFirstHeading(generated, missingSections);

  const withoutVariants = primitives.filter((primitive) => primitive.variants.length === 0).length;
  return { generated, primitiveCount: primitives.length, withoutVariants };
}

try {
  const current = fs.readFileSync(designPath, 'utf8');
  const { generated, primitiveCount, withoutVariants } = await generatedDesign(current);
  const summary = `${primitiveCount} primitives; ${withoutVariants} without variants`;

  if (check) {
    if (current !== generated) {
      console.error('DESIGN.md is stale: run yarn design:sync');
      console.error(shortDiff(current, generated));
      process.exitCode = 1;
    } else {
      console.log(`DESIGN.md is in sync (${summary}).`);
    }
  } else if (current === generated) {
    console.log(`DESIGN.md is already in sync (${summary}).`);
  } else {
    fs.writeFileSync(designPath, generated);
    console.log(`Updated DESIGN.md (${summary}).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
