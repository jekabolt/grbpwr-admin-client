// One-off codemod (T2, design-strict): every import of a primitive goes through the `ui` barrel.
//
//   node scripts/codemod-ui-barrel.mjs [--dry]
//
// Outside src/ui: each import whose path resolves into src/ui (`ui/components/x`, `ui/form/...`,
// `ui/icons/x`, `@/ui/...`, relative `../ui/...`) becomes `import { … } from 'ui'`. Default imports
// become the barrel's named export (`import Text from 'ui/components/text'` → `import { Text }`);
// a default bound under another local name is renamed in the file to the canonical name, or kept as
// `{ Canonical as Local }` when the canonical name is already taken there. `import type` stays type-
// only; all ui imports of a file merge into one value + one type declaration at the first one's spot.
// Inside src/ui: `ui/...` alias imports become relative paths (the barrel is never imported there).
// Asset reads (`ui/icons/x.tsx?raw`) are left alone. Kept for the record; re-running it on a converted tree is a no-op.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const UI_DIR = path.join(ROOT, 'src/ui');
const BARREL = path.join(UI_DIR, 'index.ts');
const ALIASES = [
  'components',
  'constants',
  'context',
  'hooks',
  'lib',
  'types',
  'ui',
  'utils',
  'styles',
  'api',
];
const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const posix = (p) => p.split(path.sep).join('/');

function resolveSpec(fromFile, spec) {
  const bare = spec.split('?')[0];
  let base;
  if (bare.startsWith('./') || bare.startsWith('../'))
    base = path.resolve(path.dirname(fromFile), bare);
  else if (bare.startsWith('@/')) base = path.join(ROOT, 'src', bare.slice(2));
  else if (ALIASES.includes(bare.split('/')[0])) base = path.join(ROOT, 'src', bare);
  else return null;
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const parse = (file, text = fs.readFileSync(file, 'utf8')) =>
  ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

// Barrel map: module file → { default: canonical name, names: Set of re-exported names }.
const barrelMap = new Map();
for (const st of parse(BARREL).statements) {
  if (!ts.isExportDeclaration(st) || !st.moduleSpecifier || !st.exportClause) continue;
  const mod = resolveSpec(BARREL, st.moduleSpecifier.text);
  const entry = barrelMap.get(mod) ?? { default: null, names: new Set() };
  for (const el of st.exportClause.elements) {
    if (el.propertyName?.text === 'default') entry.default = el.name.text;
    else entry.names.add(el.name.text);
  }
  barrelMap.set(mod, entry);
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

const insideUi = (f) => f.startsWith(UI_DIR + path.sep);
const intoUi = (p) => p && (p === UI_DIR || p.startsWith(UI_DIR + path.sep));

function identifierTexts(sf) {
  const set = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) set.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return set;
}

// Rename every identifier `from` → `to` that is not a property name / member access name.
function renameEdits(sf, from, to, skipNodes) {
  const edits = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && n.text === from && !skipNodes.has(n)) {
      const p = n.parent;
      const isMemberName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isJsxAttribute(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n);
      if (isMemberName) return;
      if (ts.isShorthandPropertyAssignment(p))
        edits.push({ start: n.getStart(), end: n.end, text: `${from}: ${to}` });
      else edits.push({ start: n.getStart(), end: n.end, text: to });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return edits;
}

function formatImport(kind, specs) {
  const head = kind === 'type' ? 'import type ' : 'import ';
  const one = `${head}{ ${specs.join(', ')} } from 'ui';`;
  if (one.length <= 100) return one;
  return `${head}{\n${specs.map((s) => `  ${s},`).join('\n')}\n} from 'ui';`;
}

const stats = { files: 0, declarations: 0, renamed: {}, aliased: [], intraUi: 0 };

for (const file of walk(path.join(ROOT, 'src'))) {
  if (file === BARREL) continue;
  const text = fs.readFileSync(file, 'utf8');
  const sf = parse(file, text);
  const edits = [];

  if (insideUi(file)) {
    for (const st of sf.statements) {
      if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) || !st.moduleSpecifier)
        continue;
      const spec = st.moduleSpecifier.text;
      if (!/^(ui|@\/ui)(\/|$)/.test(spec)) continue;
      const target = resolveSpec(file, spec);
      if (!target || target === BARREL)
        throw new Error(`${posix(path.relative(ROOT, file))}: imports the barrel`);
      let rel = posix(path.relative(path.dirname(file), target)).replace(/(\/index)?\.tsx?$/, '');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      edits.push({
        start: st.moduleSpecifier.getStart(),
        end: st.moduleSpecifier.end,
        text: `'${rel}'`,
      });
      stats.intraUi++;
    }
  } else {
    const valueSpecs = [];
    const typeSpecs = [];
    const decls = [];
    const taken = identifierTexts(sf);
    const skip = new Set();
    for (const st of sf.statements) {
      if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
        const target = resolveSpec(file, st.moduleSpecifier.text);
        if (intoUi(target) && st.moduleSpecifier.text !== 'ui') {
          // `export { default } from 'ui/...'` → `export { Canonical as default } from 'ui'`
          const entry = barrelMap.get(target);
          if (!entry)
            throw new Error(
              `${file}: re-export of ${st.moduleSpecifier.text} is not in the barrel`,
            );
          const els = st.exportClause.elements.map((el) => {
            const imported = el.propertyName?.text ?? el.name.text;
            const name = imported === 'default' ? entry.default : imported;
            return name === el.name.text ? name : `${name} as ${el.name.text}`;
          });
          edits.push({
            start: st.getStart(),
            end: st.end,
            text: `export { ${els.join(', ')} } from 'ui';`,
          });
          stats.declarations++;
        }
        continue;
      }
      if (!ts.isImportDeclaration(st)) continue;
      const spec = st.moduleSpecifier.text;
      // `?raw` / `?url` read a file as an asset (text, URL), not as a module — not a primitive.
      if (spec.includes('?')) continue;
      const target = resolveSpec(file, spec);
      if (!intoUi(target)) continue;
      const clause = st.importClause;
      if (!clause) throw new Error(`${file}: side-effect import of ${spec}`);
      if (spec !== 'ui') {
        const entry = barrelMap.get(target);
        if (!entry)
          throw new Error(`${posix(path.relative(ROOT, file))}: ${spec} is not in the barrel`);
      }
      const entry = barrelMap.get(target);
      const bucket = clause.isTypeOnly ? typeSpecs : valueSpecs;
      decls.push(st);
      if (clause.name) {
        const local = clause.name.text;
        const canonical = entry.default;
        if (!canonical)
          throw new Error(`${file}: default import of ${spec}, barrel has no default`);
        if (local === canonical) bucket.push(canonical);
        else if (!taken.has(canonical)) {
          skip.add(clause.name);
          edits.push(...renameEdits(sf, local, canonical, skip));
          bucket.push(canonical);
          stats.renamed[`${local}→${canonical}`] =
            (stats.renamed[`${local}→${canonical}`] ?? 0) + 1;
        } else {
          bucket.push(`${canonical} as ${local}`);
          stats.aliased.push(`${posix(path.relative(ROOT, file))}: ${canonical} as ${local}`);
        }
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings))
          throw new Error(`${file}: namespace import of ${spec}`);
        for (const el of clause.namedBindings.elements) {
          const imported = el.propertyName?.text ?? el.name.text;
          if (spec !== 'ui' && !entry.names.has(imported) && imported !== 'default')
            throw new Error(
              `${posix(path.relative(ROOT, file))}: ${imported} from ${spec} is not in the barrel`,
            );
          const name = imported === 'default' ? entry.default : imported;
          const s =
            (el.isTypeOnly ? 'type ' : '') +
            (name === el.name.text ? name : `${name} as ${el.name.text}`);
          bucket.push(s);
        }
      }
    }
    if (
      decls.length === 0 ||
      (decls.length === 1 && decls[0].moduleSpecifier.text === 'ui' && edits.length === 0)
    ) {
      if (edits.length === 0) continue;
    }
    const uniq = (a) => [...new Set(a)];
    const lines = [];
    if (valueSpecs.length) lines.push(formatImport('value', uniq(valueSpecs)));
    if (typeSpecs.length) lines.push(formatImport('type', uniq(typeSpecs)));
    decls.forEach((d, i) => {
      // remove the whole line(s) of later declarations; the first one is replaced in place
      let end = d.end;
      if (i > 0 && text[end] === '\n') end++;
      edits.push({ start: d.getStart(), end, text: i === 0 ? lines.join('\n') : '' });
    });
    stats.declarations += decls.length;
  }

  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (out === text) continue;
  stats.files++;
  if (!DRY) fs.writeFileSync(file, out);
}

console.log(JSON.stringify({ ...stats, aliasedCount: stats.aliased.length }, null, 1));
