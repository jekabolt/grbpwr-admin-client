import path from 'node:path';

// Outside src/ui, primitives come from the barrel only: `import { Button } from 'ui'`.
// Any other path that lands in src/ui (`ui/components/x`, `ui/form/...`, `@/ui/...`,
// `../../ui/...`) is a deep import. Asset reads (`ui/icons/x.tsx?raw`) are not module imports.

function srcRootOf(filename) {
  const file = filename.split(path.sep).join('/');
  if (file.startsWith('src/')) return '';
  const at = file.lastIndexOf('/src/');
  return at === -1 ? null : file.slice(0, at + 1);
}

function isDeepUiImport(filename, spec) {
  if (typeof spec !== 'string' || spec.includes('?')) return false;
  if (spec === 'ui') return false;
  if (spec.startsWith('ui/') || spec === '@/ui' || spec.startsWith('@/ui/')) return true;
  if (!spec.startsWith('./') && !spec.startsWith('../')) return false;
  const root = srcRootOf(filename);
  if (root === null) return false;
  const file = filename.split(path.sep).join('/');
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  const ui = path.posix.normalize(`${root}src/ui`);
  return target === ui || target.startsWith(`${ui}/`);
}

function insideUi(filename) {
  const file = filename.split(path.sep).join('/');
  return file.startsWith('src/ui/') || file.includes('/src/ui/');
}

export default {
  meta: {
    type: 'problem',
    docs: { description: "Import UI primitives from the 'ui' barrel, never by deep path." },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (insideUi(filename)) return {};
    const check = (node, source) => {
      if (!source || source.type !== 'Literal') return;
      if (!isDeepUiImport(filename, source.value)) return;
      context.report({ node: source, message: `import from 'ui', not ${source.value}` });
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};
