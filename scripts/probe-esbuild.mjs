// esbuild `build` for probes, plus what Vite gives the app for free: `import x from '<file>?url'`
// (and `?raw`). Without it a probe whose bundle reaches such an import does not build at all —
// e.g. care-labels/text-outline.ts imports its fonts with `?url`.
//   import { build } from './probe-esbuild.mjs';   // drop-in for `from 'esbuild'`
// `?url` loads as a data: URL of the real file (fetch() of it works in Chromium and Node), `?raw`
// as its text. '@/x' resolves to src/x, like the app's alias. A probe's own plugins still run; this
// one goes first and only claims `?url` / `?raw` specifiers.
import { build as esbuildBuild } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

export const viteQueryPlugin = {
  name: 'probe-vite-query',
  setup(b) {
    b.onResolve({ filter: /\?(url|raw)$/ }, (args) => {
      const [spec, query] = args.path.split('?');
      const file = spec.startsWith('@/')
        ? resolve(SRC, spec.slice(2))
        : resolve(args.resolveDir || SRC, spec);
      return { path: file, namespace: 'probe-vite-query', pluginData: { query } };
    });
    b.onLoad({ filter: /.*/, namespace: 'probe-vite-query' }, (args) => {
      if (!existsSync(args.path)) return { contents: 'export default "";', loader: 'js' };
      const bytes = readFileSync(args.path);
      if (args.pluginData?.query === 'raw')
        return { contents: `export default ${JSON.stringify(bytes.toString('utf8'))};`, loader: 'js' };
      const mime = MIME[extname(args.path).toLowerCase()] ?? 'application/octet-stream';
      const url = `data:${mime};base64,${bytes.toString('base64')}`;
      return { contents: `export default ${JSON.stringify(url)};`, loader: 'js' };
    });
  },
};

export function build(options) {
  return esbuildBuild({ ...options, plugins: [viteQueryPlugin, ...(options.plugins ?? [])] });
}
